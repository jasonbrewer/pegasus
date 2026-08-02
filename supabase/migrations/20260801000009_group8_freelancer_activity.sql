-- Group 8 — freelancer activity dashboard.
--
-- 8.1  "My applications": the freelancer sees every job they applied to, with
--      a status of either Applied or Viewed.
-- 8.2  "Saved jobs": a freelancer bookmarks a posting from the job detail page
--      and sees the list on their dashboard.
--
-- Two statuses only, and neither is a new enum value:
--
--   Applied  the application row exists and no employer has opened it yet.
--   Viewed   an employer with access to that job opened their applicant view.
--
-- public.application_status already exists as ('submitted','shortlisted',
-- 'rejected','hired'). That enum is the vocabulary for the employer-side
-- status-management UI that is deliberately NOT being built yet, and its values
-- are mutually exclusive: writing 'viewed' into it would mean an application
-- could not be both viewed and shortlisted. "Has the employer seen this?" is an
-- orthogonal fact, so it gets its own column and the enum is left untouched.

-- ---------------------------------------------------------------------------
-- 8.1 — first_viewed_at
--
-- Null means Applied, non-null means Viewed. A timestamp rather than a boolean
-- because it costs nothing now and answers "how long did they sit unopened?"
-- later. It is set once and never cleared, so a status cannot regress from
-- Viewed back to Applied.
-- ---------------------------------------------------------------------------

alter table public.applications
  add column first_viewed_at timestamptz;

comment on column public.applications.first_viewed_at is
  'When an employer first opened this application in their applicant view. '
  'Null = Applied, non-null = Viewed. Set once, never cleared. Written only by '
  'public.mark_applicants_viewed().';

-- ---------------------------------------------------------------------------
-- mark_applicants_viewed()
--
-- The employer's applicant page calls this when it renders. It could instead
-- update public.applications directly — the existing policy "employers update
-- application status on their jobs" would allow it — but that policy permits
-- updating ANY column of an application on the employer's own job, including
-- the applicant's own message and credits. Routing the stamp through a
-- narrow security-definer function means the view-tracking feature grants no
-- write reach beyond this one column, whatever that policy allows.
--
-- Security definer is safe here for the same reason job_applicants() is: the
-- statement filters to jobs owned by auth.uid(), so a caller can only ever
-- touch applications to their own postings. An unauthenticated caller has a
-- null auth.uid() and matches no rows.
--
-- `first_viewed_at is null` in the WHERE clause is what makes this idempotent
-- and keeps the first-view timestamp honest across repeat page loads.
-- ---------------------------------------------------------------------------

create function public.mark_applicants_viewed(p_job_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_marked integer;
begin
  update public.applications a
     set first_viewed_at = now()
   where a.job_id = p_job_id
     and a.first_viewed_at is null
     and exists (
       select 1
       from public.jobs j
       where j.id = a.job_id
         and j.employer_id = auth.uid()
     );

  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

comment on function public.mark_applicants_viewed(uuid) is
  'Stamps first_viewed_at on not-yet-viewed applications to a job owned by the '
  'caller. Returns how many rows were stamped. Idempotent.';

grant execute on function public.mark_applicants_viewed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8.2 — saved_jobs
--
-- Owner-only in every direction: a row is readable, insertable and deletable
-- only by the freelancer it belongs to. Nobody else — not the employer whose
-- job was saved, not another freelancer — can read it or count it. Saving a
-- job is private to the person who saved it, so there is no "readable by
-- authenticated users" policy here at all.
--
-- freelancer_id references freelancer_profiles rather than profiles, matching
-- public.applications: the foreign key is what stops an employer account from
-- ever holding a row, so that rule lives in the schema too.
--
-- There is no UPDATE policy and no UPDATE grant. The table has no mutable
-- column — saving and unsaving are INSERT and DELETE — so granting update
-- would widen the surface for no behaviour.
-- ---------------------------------------------------------------------------

create table public.saved_jobs (
  freelancer_id uuid not null references public.freelancer_profiles (profile_id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (freelancer_id, job_id)
);

comment on table public.saved_jobs is
  'A freelancer''s private bookmarks. Visible only to the freelancer who saved '
  'the job; employers cannot see who saved their posting.';

-- The primary key covers lookups by freelancer. This one covers the other
-- direction, which is what the ON DELETE CASCADE from jobs walks.
create index saved_jobs_job_id_idx on public.saved_jobs (job_id);

alter table public.saved_jobs enable row level security;

create policy "freelancers view their own saved jobs"
  on public.saved_jobs for select
  to authenticated
  using (auth.uid() = freelancer_id);

create policy "freelancers save jobs for themselves"
  on public.saved_jobs for insert
  to authenticated
  with check (auth.uid() = freelancer_id);

create policy "freelancers unsave their own saved jobs"
  on public.saved_jobs for delete
  to authenticated
  using (auth.uid() = freelancer_id);

-- RLS narrows privileges; it never grants them. Without this every read raises
-- "permission denied for table". Deliberately no UPDATE — see above.
grant select, insert, delete on public.saved_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- Post-conditions
--
-- Migration 20260801000005 was once recorded as applied while almost none of
-- it had run, so anything that must be true afterwards is asserted here rather
-- than assumed. A silent partial apply fails loudly instead.
-- ---------------------------------------------------------------------------

do $$
declare
  v_policies text;
  v_missing text;
begin
  -- Column and function landed.
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.applications'::regclass
      and attname = 'first_viewed_at'
      and not attisdropped
  ) then
    raise exception 'applications.first_viewed_at was not created';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mark_applicants_viewed'
  ) then
    raise exception 'public.mark_applicants_viewed() was not created';
  end if;

  if not has_function_privilege('authenticated', 'public.mark_applicants_viewed(uuid)', 'execute') then
    raise exception 'authenticated cannot execute mark_applicants_viewed()';
  end if;

  -- saved_jobs is RLS-protected.
  if not exists (
    select 1 from pg_class
    where oid = 'public.saved_jobs'::regclass and relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.saved_jobs';
  end if;

  -- ...and every policy on it is owner-only. Any policy whose expression does
  -- not pin the row to auth.uid() would make saves readable or writable by
  -- someone else, so the check is on the expression text, not just the count.
  select string_agg(policyname, ', ')
  into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'saved_jobs'
    and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%';

  if v_policies is not null then
    raise exception 'saved_jobs policies are not owner-only: %', v_policies;
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'saved_jobs') <> 3 then
    raise exception 'Expected exactly 3 policies on saved_jobs (select, insert, delete)';
  end if;

  -- Grants match the policies, no wider.
  select string_agg(priv, ', ')
  into v_missing
  from unnest(array['select', 'insert', 'delete']) as priv
  where not has_table_privilege('authenticated', 'public.saved_jobs', priv);

  if v_missing is not null then
    raise exception 'authenticated is missing % on saved_jobs', v_missing;
  end if;

  if has_table_privilege('authenticated', 'public.saved_jobs', 'update') then
    raise exception 'saved_jobs has an UPDATE grant it does not need';
  end if;

  -- Deleting a job must still work now that another table points at it
  -- (the 5.2 guarantee, extended).
  if not exists (
    select 1
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    where c.contype = 'f'
      and child.relname = 'saved_jobs'
      and parent.relname = 'jobs'
      and c.confdeltype = 'c'   -- 'c' = ON DELETE CASCADE
  ) then
    raise exception 'saved_jobs.job_id does not cascade — deleting a job would fail';
  end if;
end $$;
