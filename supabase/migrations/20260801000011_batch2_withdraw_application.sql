-- Batch 2.3 — a freelancer can withdraw an application, and apply again later.
--
-- Withdrawing must not destroy the row: the employer may already have read it,
-- and "they pulled out" is a fact worth keeping. It also must not leave the
-- freelancer stuck — re-applying to the same job has to work, and the
-- (job_id, freelancer_id) unique constraint from 20260801000000 stands
-- directly in the way of a second INSERT.
--
-- How the constraint is handled: it is kept, untouched. Withdrawing does not
-- create a row and re-applying does not either — the single row is reactivated
-- in place. There is therefore never a second row to collide, and no partial
-- unique index or soft-delete tombstone to remember to filter on in every
-- future query. The cost is that only the most recent attempt is retained;
-- keeping a per-attempt history would mean dropping the constraint and
-- teaching every reader about it, which is a bigger change than this earns.

-- ---------------------------------------------------------------------------
-- 2.3a — withdrawn_at
--
-- A timestamp rather than a new value on public.application_status, for the
-- same reason first_viewed_at is one: that enum ('submitted','shortlisted',
-- 'rejected','hired') is the employer's vocabulary, and "the applicant pulled
-- out" is orthogonal to where the employer had got to. Adding an enum value
-- would also force this migration into two files — Postgres refuses to use a
-- newly added enum label in the same transaction that added it.
-- ---------------------------------------------------------------------------

alter table public.applications
  add column withdrawn_at timestamptz;

comment on column public.applications.withdrawn_at is
  'When the applicant withdrew. Null = active. A withdrawn application is '
  'hidden from the employer and can be reactivated by re-applying.';

-- The employer's list filters on this, so it is worth an index once a job has
-- a long applicant list.
create index applications_active_by_job_idx
  on public.applications (job_id)
  where withdrawn_at is null;

-- ---------------------------------------------------------------------------
-- 2.3b — who may write what
--
-- Ownership is enforced by RLS, and *which column* by a column-level grant —
-- because RLS is row-level and cannot say "you may set this one field". The
-- pair is what makes "only the applicant can withdraw" true against a direct
-- PostgREST call, not just in the UI.
--
-- The table-level UPDATE grant goes. Nothing in the app used it: the employer's
-- view-stamp already goes through mark_applicants_viewed() (security definer),
-- and applying is an INSERT. What it did do was leave every column of an
-- application writable by the employer whose job it is — including the
-- applicant's own message and credits. That ends here.
-- ---------------------------------------------------------------------------

revoke update on public.applications from authenticated;

grant update (withdrawn_at) on public.applications to authenticated;

-- With the column grant above, this policy would let an employer withdraw an
-- applicant *for* them. It has no remaining purpose — nothing performs a
-- client-side update as an employer — so it goes rather than being narrowed.
drop policy "employers update application status on their jobs" on public.applications;

create policy "freelancers withdraw their own applications"
  on public.applications for update
  to authenticated
  using (auth.uid() = freelancer_id)
  -- The WITH CHECK is doing real work in both halves. `withdrawn_at is not
  -- null` means this policy can only ever move a row INTO the withdrawn state:
  -- clearing it — reactivating without going through re-apply, which is what
  -- re-checks that the account is still allowed to participate — is refused.
  -- And re-asserting freelancer_id stops the row being handed to someone else.
  with check (auth.uid() = freelancer_id and withdrawn_at is not null);

-- ---------------------------------------------------------------------------
-- 2.3c — re-applying
--
-- The apply action INSERTs first, exactly as before, so a first-time
-- application is still gated by the normal INSERT policy (including Group 9's
-- participation check). Only when that hits the unique violation — i.e. a row
-- already exists — does it call this.
--
-- Security definer because reactivating has to write columns the client
-- deliberately cannot: it clears withdrawn_at, replaces the message and
-- credits, and resets first_viewed_at so the employer sees a genuinely new
-- application rather than one still marked Viewed from the previous round.
-- The ownership filter and the participation check are what make that safe.
--
-- Returns the number of rows reactivated: 0 means the existing application was
-- not withdrawn, i.e. they have simply already applied.
-- ---------------------------------------------------------------------------

create function public.reapply_to_job(
  p_job_id uuid,
  p_cover_note text,
  p_credits_html text
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if not public.is_participating(auth.uid()) then
    raise exception 'Your account cannot apply to jobs right now'
      using errcode = 'insufficient_privilege';
  end if;

  update public.applications a
     set withdrawn_at = null,
         first_viewed_at = null,
         cover_note = p_cover_note,
         credits_html = p_credits_html,
         created_at = now()
   where a.job_id = p_job_id
     and a.freelancer_id = auth.uid()
     and a.withdrawn_at is not null;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function public.reapply_to_job(uuid, text, text) is
  'Reactivates the caller''s own withdrawn application to a job, replacing its '
  'content and clearing the viewed stamp. Returns rows reactivated (0 if the '
  'existing application was not withdrawn).';

revoke execute on function public.reapply_to_job(uuid, text, text) from public;
grant execute on function public.reapply_to_job(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2.3d — the employer stops seeing withdrawn applicants
--
-- job_applicants() is SECURITY DEFINER, so it bypasses RLS and has to filter
-- for itself. OUT columns are unchanged, so CREATE OR REPLACE keeps the
-- existing EXECUTE grant. The Group 9 participation filter is carried over
-- unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.job_applicants(p_job_id uuid)
returns table (
  application_id uuid,
  freelancer_id uuid,
  full_name text,
  status public.application_status,
  distance_miles double precision,
  cover_note text,
  credits_html text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id as application_id,
    a.freelancer_id,
    p.full_name,
    a.status,
    case
      when r.category = 'remote' then null
      else st_distance(fp.home_location, j.location) / 1609.344
    end as distance_miles,
    a.cover_note,
    a.credits_html,
    a.created_at
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.roles r on r.slug = j.role_slug
  join public.freelancer_profiles fp on fp.profile_id = a.freelancer_id
  join public.profiles p on p.id = a.freelancer_id
  where a.job_id = p_job_id
    and j.employer_id = auth.uid()
    and p.status = 'approved'
    and a.withdrawn_at is null
  order by distance_miles asc nulls last, a.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Post-conditions
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.applications'::regclass
      and attname = 'withdrawn_at' and not attisdropped
  ) then
    raise exception 'applications.withdrawn_at was not created';
  end if;

  -- The unique constraint must SURVIVE — the whole re-apply design depends on
  -- there only ever being one row per (job, freelancer).
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.applications'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 2
  ) then
    raise exception 'the (job_id, freelancer_id) unique constraint is gone — re-apply would duplicate';
  end if;

  -- Withdraw is a client UPDATE, so the grant has to be exactly one column.
  if has_table_privilege('authenticated', 'public.applications', 'update') then
    raise exception 'table-level UPDATE on applications is still granted — every column is writable';
  end if;

  if not has_column_privilege('authenticated', 'public.applications', 'withdrawn_at', 'update') then
    raise exception 'authenticated cannot update applications.withdrawn_at — withdrawing is broken';
  end if;

  select string_agg(col, ', ')
  into v_missing
  from unnest(array['cover_note', 'credits_html', 'status', 'first_viewed_at', 'freelancer_id']) as col
  where has_column_privilege('authenticated', 'public.applications', col, 'update');

  if v_missing is not null then
    raise exception 'applications column(s) still client-writable: %', v_missing;
  end if;

  -- The withdraw policy exists, and is one-way.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'applications'
      and policyname = 'freelancers withdraw their own applications'
      and with_check like '%withdrawn_at IS NOT NULL%'
  ) then
    raise exception 'the withdraw policy is missing or no longer one-way';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'applications'
      and policyname = 'employers update application status on their jobs'
  ) then
    raise exception 'the employer UPDATE policy survived — an employer could withdraw for an applicant';
  end if;

  if to_regprocedure('public.reapply_to_job(uuid, text, text)') is null
     or not has_function_privilege('authenticated', 'public.reapply_to_job(uuid, text, text)', 'execute') then
    raise exception 'reapply_to_job() is missing or not executable';
  end if;

  if pg_get_functiondef(to_regprocedure('public.job_applicants(uuid)')) not like '%withdrawn_at is null%' then
    raise exception 'job_applicants() still returns withdrawn applicants';
  end if;

  -- Group 9's participation filter must not have been dropped on the way past.
  if pg_get_functiondef(to_regprocedure('public.job_applicants(uuid)')) not like '%p.status = ''approved''%' then
    raise exception 'job_applicants() lost the Group 9 participation filter';
  end if;
end $$;
