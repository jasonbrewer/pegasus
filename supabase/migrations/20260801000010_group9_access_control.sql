-- Group 9 — access control: account status, admin capability, curated gating.
--
-- 9.1  public.account_status ('pending','approved','blocked') on profiles.
-- 9.2  Invited signups land pending but carry invited_by, for the admin queue.
-- 9.3  profiles.is_admin, set by hand in the DB. No UI grants it.
-- 9.4  Every marketplace-visibility policy now asks "is this account
--      participating?" instead of "is anyone logged in?".
-- 9.5  Admin writes go through one narrow security-definer function that can
--      change status and nothing else.
--
-- The rule this whole migration exists to enforce:
--
--   A pending or blocked account is invisible and inert AT THE DATABASE. Not
--   filtered in a page component, not hidden behind an `if` in a server
--   action — absent from the result set for anyone but themselves and an
--   admin. A direct PostgREST call with a valid token must not be able to see
--   or reach what the UI declines to show.

-- ---------------------------------------------------------------------------
-- 9.1 — the status column
--
-- Added with default 'approved' so every account that already exists stays
-- exactly as it is (this migration must not black out a live marketplace),
-- then the default is flipped to 'pending' for everyone created afterwards.
-- The per-role default is applied by handle_new_user() further down: a column
-- default cannot branch on the role being inserted.
-- ---------------------------------------------------------------------------

create type public.account_status as enum ('pending', 'approved', 'blocked');

alter table public.profiles
  add column status public.account_status not null default 'approved';

alter table public.profiles
  alter column status set default 'pending';

comment on column public.profiles.status is
  'pending = signed up, not yet let into the marketplace. approved = full '
  'participant. blocked = shut out. Freelancers start pending, employers start '
  'approved. Changed only by public.admin_set_account_status().';

-- ---------------------------------------------------------------------------
-- 9.2 — invited_by
--
-- Group 7 already parks the inviter's id in the signup metadata. This lifts it
-- into a real column so the admin queue can say "invited by X" and so the
-- reference survives a metadata rewrite. An invite is a fast-tracked
-- application, NOT an auto-approval: an invited freelancer still lands pending.
--
-- ON DELETE SET NULL, because losing the inviter must never take the invitee's
-- account with it.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column invited_by uuid references public.profiles (id) on delete set null;

comment on column public.profiles.invited_by is
  'Who invited this account, when they signed up through an invite link. '
  'Surfaces in the admin queue. Confers no privilege and no auto-approval.';

create index profiles_invited_by_idx on public.profiles (invited_by);

-- Backfill from the metadata Group 7 has been writing. Guarded by a UUID shape
-- test and an existence test so a malformed or dangling value is dropped rather
-- than failing the migration or breaking the foreign key.
update public.profiles p
set invited_by = (u.raw_user_meta_data ->> 'invited_by')::uuid
from auth.users u
where u.id = p.id
  and u.raw_user_meta_data ->> 'invited_by'
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.profiles q
    where q.id = (u.raw_user_meta_data ->> 'invited_by')::uuid
  );

-- ---------------------------------------------------------------------------
-- 9.3 — the admin flag
--
-- Deliberately a plain boolean set by hand:
--
--   update public.profiles set is_admin = true where id = '<uuid>';
--
-- There is no UI, no self-service, and no policy anywhere that lets a user set
-- this column — see the column-level UPDATE grant below, which is what makes
-- that true rather than merely intended.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Grants the moderation panel. Set manually in the database only — no code '
  'path writes this column.';

-- ---------------------------------------------------------------------------
-- Policy helpers
--
-- Both are SECURITY DEFINER on purpose. A policy expression is evaluated as
-- the querying user, so a policy on table A that reads table B is filtered by
-- B's own policies. Reading profiles from inside a profiles policy that way
-- would recurse; reading it from inside the jobs policy would silently return
-- "not participating" for any profile the caller cannot see. Running these as
-- the owner sidesteps both: they answer from the real table, every time.
--
-- Each returns a single boolean about one account and nothing else, so the
-- elevated read leaks nothing a caller could not already infer.
-- ---------------------------------------------------------------------------

create function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

comment on function public.current_user_is_admin() is
  'True when the caller holds the admin flag. Used by the admin read carve-outs.';

create function public.is_participating(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.status = 'approved' from public.profiles p where p.id = p_profile_id), false);
$$;

comment on function public.is_participating(uuid) is
  'True when the account is approved — i.e. visible in the marketplace and '
  'allowed to act. False for pending, blocked, and accounts that do not exist.';

grant execute on function public.current_user_is_admin() to anon, authenticated;
grant execute on function public.is_participating(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9.4a — profiles: who can be seen at all
--
-- Replaces the blanket "any logged-in user can read any profile". Now: your
-- own row, an admin's view of everything, or an account that is actually
-- participating. A pending freelancer's row is not merely hidden from a list —
-- it does not come back from `select * from profiles` for anyone else.
--
-- `status = 'approved'` reads the row's own column, so no helper is needed
-- here and there is no recursion to worry about.
-- ---------------------------------------------------------------------------

drop policy "profiles are readable by authenticated users" on public.profiles;

create policy "profiles are readable when participating, plus self and admins"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or status = 'approved'
    or public.current_user_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 9.4b — profiles: what the owner may write
--
-- The existing "users can update their own profile" policy is row-level, so it
-- happily allows a user to update ANY column of their own row — including
-- status, is_admin and role. With PostgREST in front of the database that is a
-- one-request privilege escalation, and no amount of care in the server
-- actions would prevent it.
--
-- RLS cannot express "these columns only". Column-level privileges can, so the
-- table-level UPDATE grant is withdrawn and replaced by a grant on exactly the
-- two columns the profile editor writes. Anything else raises "permission
-- denied for column". The row-level policy still applies on top, so a user can
-- write those two columns on their own row and nobody else's.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from authenticated;

grant update (full_name, avatar_path) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 9.4c — the rest of a freelancer's public surface
--
-- Same rule applied everywhere a freelancer can be discovered: profile,
-- selected roles (this is what "searchable" means today), and videos. A
-- pending or blocked freelancer disappears from all three.
-- ---------------------------------------------------------------------------

drop policy "freelancer profiles are readable by authenticated users" on public.freelancer_profiles;

create policy "freelancer profiles are readable when participating"
  on public.freelancer_profiles for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_participating(profile_id)
    or public.current_user_is_admin()
  );

drop policy "freelancer roles are readable by authenticated users" on public.freelancer_roles;

create policy "freelancer roles are readable when participating"
  on public.freelancer_roles for select
  to authenticated
  using (
    freelancer_id = auth.uid()
    or public.is_participating(freelancer_id)
    or public.current_user_is_admin()
  );

drop policy "freelancer videos are readable by authenticated users" on public.freelancer_videos;

create policy "freelancer videos are readable when participating"
  on public.freelancer_videos for select
  to authenticated
  using (
    freelancer_id = auth.uid()
    or public.is_participating(freelancer_id)
    or public.current_user_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 9.4d — employers
-- ---------------------------------------------------------------------------

drop policy "employer profiles are readable by authenticated users" on public.employer_profiles;

create policy "employer profiles are readable when participating"
  on public.employer_profiles for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.is_participating(profile_id)
    or public.current_user_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 9.4e — jobs
--
-- A blocked employer's postings vanish from the marketplace. They stay visible
-- to the employer themselves, so their own dashboard is not a confusing blank
-- page, and to an admin reviewing them. Note this also covers job_feed(),
-- which is SECURITY INVOKER and therefore filtered by exactly this policy.
--
-- And they cannot post anything new: the INSERT check now requires the poster
-- to be participating, so a blocked employer's insert is refused by the
-- database whatever the UI does.
-- ---------------------------------------------------------------------------

drop policy "jobs are readable by authenticated users" on public.jobs;

create policy "jobs are readable when the employer is participating"
  on public.jobs for select
  to authenticated
  using (
    auth.uid() = employer_id
    or public.current_user_is_admin()
    or (status = 'open' and public.is_participating(employer_id))
  );

drop policy "employers create jobs for themselves" on public.jobs;

create policy "participating employers create jobs for themselves"
  on public.jobs for insert
  to authenticated
  with check (
    auth.uid() = employer_id
    and public.is_participating(auth.uid())
  );

-- job_titles hung off `not is_private` alone, which left a hidden employer's
-- title readable to anyone holding the job id. Anchoring the public branch to
-- an EXISTS on jobs inherits the policy above — the title is readable only
-- when the job itself is.
drop policy "job titles are readable unless the poster hid them" on public.job_titles;

create policy "job titles are readable when the job is, unless hidden"
  on public.job_titles for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_titles.job_id
        and j.employer_id = auth.uid()
    )
    or public.current_user_is_admin()
    or (
      not is_private
      and exists (select 1 from public.jobs j where j.id = job_titles.job_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 9.4f — applying is participation
--
-- A pending freelancer can sign in and finish their profile — that is the
-- point of the pending state — but applying is taking part in the marketplace,
-- so it waits for approval. Refusing at the database means a pending applicant
-- gets a clear "still under review" rather than silently posting applications
-- into a void that no employer can see.
-- ---------------------------------------------------------------------------

drop policy "freelancers apply to jobs" on public.applications;

create policy "participating freelancers apply to jobs"
  on public.applications for insert
  to authenticated
  with check (
    auth.uid() = freelancer_id
    and public.is_participating(auth.uid())
  );

-- Contact details are the last place a non-participating freelancer could
-- still be reached. The applicant list already drops them and their profile
-- page 404s, but the row itself was reachable through a direct PostgREST call
-- by an employer they had applied to. The owner branch is untouched — a
-- pending freelancer must always see and edit their own details.
drop policy "freelancer contacts visible to owner and applied-to employers" on public.freelancer_contacts;

create policy "freelancer contacts visible to owner and applied-to employers"
  on public.freelancer_contacts for select
  to authenticated
  using (
    auth.uid() = profile_id
    or (
      public.is_participating(profile_id)
      and exists (
        select 1
        from public.applications a
        join public.jobs j on j.id = a.job_id
        where a.freelancer_id = freelancer_contacts.profile_id
          and j.employer_id = auth.uid()
      )
    )
  );

-- job_applicants() is SECURITY DEFINER, so it bypasses every policy above and
-- has to filter for itself. This is what keeps an account that was approved
-- when it applied, and blocked afterwards, out of the employer's list.
-- OUT columns are unchanged, so CREATE OR REPLACE is safe and the EXECUTE
-- grant survives.
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
  order by distance_miles asc nulls last, a.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- 9.5 — the admin write path
--
-- Admins get read carve-outs through the policies above, and exactly one write:
-- this function. It sets status. It cannot touch is_admin, role, full_name or
-- anything else, so "admin" is a moderation capability rather than god-mode,
-- and that limit is a property of the schema rather than a promise about the
-- UI.
--
-- Note what is NOT here: there is no admin UPDATE policy on profiles. Without
-- one, an admin holding a valid token still cannot PATCH /profiles directly —
-- the column-level grant from 9.4b stops them at full_name and avatar_path,
-- same as everyone else.
--
-- Self-change is refused so an admin cannot block themselves out of the panel
-- with a misplaced click.
-- ---------------------------------------------------------------------------

create function public.admin_set_account_status(
  p_profile_id uuid,
  p_status public.account_status
)
returns public.account_status
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_role public.account_role;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'Admins cannot change their own account status'
      using errcode = 'check_violation';
  end if;

  update public.profiles
     set status = p_status
   where id = p_profile_id
  returning role into v_role;

  if v_role is null then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;

  return p_status;
end;
$$;

comment on function public.admin_set_account_status(uuid, public.account_status) is
  'The only write path for profiles.status. Admin-gated, refuses self-changes, '
  'and touches no other column.';

-- Functions are executable by PUBLIC unless told otherwise, and this one is
-- the sensitive one — take it back before granting it deliberately.
revoke execute on function public.admin_set_account_status(uuid, public.account_status) from public;
grant execute on function public.admin_set_account_status(uuid, public.account_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Signup: per-role starting status, and the invite reference
--
-- Freelancers start pending — they are applying to join a curated community.
-- Employers start approved — they are not gated up front, only blockable
-- afterwards. invited_by is lifted out of the signup metadata, validated
-- against a real profile so a junk or dangling value cannot break signup.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role public.account_role;
  signup_status public.account_status;
  raw_invited_by text;
  invited_by_id uuid;
begin
  signup_role := coalesce(new.raw_user_meta_data ->> 'role', 'freelancer')::public.account_role;

  signup_status := case
    when signup_role = 'employer' then 'approved'::public.account_status
    else 'pending'::public.account_status
  end;

  -- An invite is a fast-track into the review queue, not a way around it, so
  -- signup_status is deliberately not touched here.
  raw_invited_by := new.raw_user_meta_data ->> 'invited_by';

  if raw_invited_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from public.profiles where id = raw_invited_by::uuid)
  then
    invited_by_id := raw_invited_by::uuid;
  end if;

  insert into public.profiles (id, role, full_name, status, invited_by)
  values (
    new.id,
    signup_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    signup_status,
    invited_by_id
  );

  if signup_role = 'freelancer' then
    insert into public.freelancer_profiles (profile_id, home_zip, home_lat, home_lng)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'home_zip', ''), 0, 0);
  else
    insert into public.employer_profiles (profile_id, company_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'company_name', ''));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post-conditions
--
-- 20260801000005 was once recorded as applied while almost none of it had run.
-- Everything this migration must be true of the database afterwards is
-- asserted, so a partial apply fails loudly instead of leaving a marketplace
-- that looks gated and is not.
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  -- ---- enum ---------------------------------------------------------------
  if (
    select count(*) from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'account_status'
      and e.enumlabel in ('pending', 'approved', 'blocked')
  ) <> 3 then
    raise exception 'public.account_status is missing one of pending/approved/blocked';
  end if;

  -- ---- columns ------------------------------------------------------------
  select string_agg(col, ', ')
  into v_missing
  from unnest(array['status', 'is_admin', 'invited_by']) as col
  where not exists (
    select 1 from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = col
      and not attisdropped
  );

  if v_missing is not null then
    raise exception 'profiles is missing column(s): %', v_missing;
  end if;

  -- New accounts must default to pending; the per-role override lives in
  -- handle_new_user().
  if (
    select pg_get_expr(d.adbin, d.adrelid)
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.profiles'::regclass and a.attname = 'status'
  ) not like '%pending%' then
    raise exception 'profiles.status does not default to pending';
  end if;

  -- ---- functions ----------------------------------------------------------
  select string_agg(sig, ', ')
  into v_missing
  from unnest(array[
    'public.current_user_is_admin()',
    'public.is_participating(uuid)',
    'public.admin_set_account_status(uuid, public.account_status)',
    'public.handle_new_user()',
    'public.job_applicants(uuid)'
  ]) as sig
  where to_regprocedure(sig) is null;

  if v_missing is not null then
    raise exception 'missing function(s): %', v_missing;
  end if;

  if not has_function_privilege('authenticated', 'public.admin_set_account_status(uuid, public.account_status)', 'execute') then
    raise exception 'authenticated cannot execute admin_set_account_status()';
  end if;

  -- The policies below call these on every row; without EXECUTE, every read
  -- fails rather than merely returning nothing.
  if not has_function_privilege('authenticated', 'public.is_participating(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.current_user_is_admin()', 'execute') then
    raise exception 'authenticated cannot execute the policy helper functions';
  end if;

  -- job_applicants() must drop non-approved applicants, or a blocked account
  -- keeps showing up in employer lists.
  if pg_get_functiondef(to_regprocedure('public.job_applicants(uuid)')) not like '%p.status = ''approved''%' then
    raise exception 'job_applicants() does not filter out non-approved applicants';
  end if;

  -- handle_new_user() must still branch the starting status by role.
  if pg_get_functiondef(to_regprocedure('public.handle_new_user()')) not like '%signup_status%' then
    raise exception 'handle_new_user() no longer sets a per-role starting status';
  end if;

  -- ---- the gating policies exist -----------------------------------------
  select string_agg(t.tbl || ' :: ' || t.pol, ', ')
  into v_missing
  from (values
    ('profiles', 'profiles are readable when participating, plus self and admins'),
    ('freelancer_profiles', 'freelancer profiles are readable when participating'),
    ('freelancer_roles', 'freelancer roles are readable when participating'),
    ('freelancer_videos', 'freelancer videos are readable when participating'),
    ('employer_profiles', 'employer profiles are readable when participating'),
    ('jobs', 'jobs are readable when the employer is participating'),
    ('jobs', 'participating employers create jobs for themselves'),
    ('job_titles', 'job titles are readable when the job is, unless hidden'),
    ('applications', 'participating freelancers apply to jobs')
  ) as t(tbl, pol)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tbl and p.policyname = t.pol
  );

  if v_missing is not null then
    raise exception 'missing gating policy/policies: %', v_missing;
  end if;

  -- ...and the permissive ones they replaced are gone. A leftover
  -- `using (true)` policy is permissive-OR'd with the new one and would undo
  -- the whole migration silently.
  select string_agg(t.tbl || ' :: ' || t.pol, ', ')
  into v_missing
  from (values
    ('profiles', 'profiles are readable by authenticated users'),
    ('freelancer_profiles', 'freelancer profiles are readable by authenticated users'),
    ('freelancer_roles', 'freelancer roles are readable by authenticated users'),
    ('freelancer_videos', 'freelancer videos are readable by authenticated users'),
    ('employer_profiles', 'employer profiles are readable by authenticated users'),
    ('jobs', 'jobs are readable by authenticated users'),
    ('jobs', 'employers create jobs for themselves'),
    ('job_titles', 'job titles are readable unless the poster hid them'),
    ('applications', 'freelancers apply to jobs')
  ) as t(tbl, pol)
  where exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tbl and p.policyname = t.pol
  );

  if v_missing is not null then
    raise exception 'superseded permissive policy/policies still present: %', v_missing;
  end if;

  -- freelancer_contacts keeps its original policy name, so check the rule
  -- rather than the name: the employer branch must be participation-gated.
  if (
    select coalesce(qual, '') from pg_policies
    where schemaname = 'public'
      and tablename = 'freelancer_contacts'
      and policyname = 'freelancer contacts visible to owner and applied-to employers'
  ) not like '%is_participating%' then
    raise exception 'freelancer_contacts still exposes non-participating freelancers to applied-to employers';
  end if;

  -- ---- nobody can promote themselves -------------------------------------
  if has_table_privilege('authenticated', 'public.profiles', 'update') then
    raise exception 'table-level UPDATE on profiles is still granted — status/is_admin are writable';
  end if;

  select string_agg(col, ', ')
  into v_missing
  from unnest(array['status', 'is_admin', 'role', 'id']) as col
  where has_column_privilege('authenticated', 'public.profiles', col, 'update');

  if v_missing is not null then
    raise exception 'authenticated can still UPDATE privileged column(s): %', v_missing;
  end if;

  select string_agg(col, ', ')
  into v_missing
  from unnest(array['full_name', 'avatar_path']) as col
  where not has_column_privilege('authenticated', 'public.profiles', col, 'update');

  if v_missing is not null then
    raise exception 'the profile editor lost UPDATE on: %', v_missing;
  end if;

  -- ---- no admin god-mode --------------------------------------------------
  -- The carve-outs are reads. If a future edit adds an admin-flavoured write
  -- policy on profiles, this fails and forces the conversation.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd <> 'SELECT'
      and coalesce(qual, '') || coalesce(with_check, '') like '%current_user_is_admin%'
  ) then
    raise exception 'an admin WRITE policy exists on profiles — admin writes must go through admin_set_account_status()';
  end if;
end $$;
