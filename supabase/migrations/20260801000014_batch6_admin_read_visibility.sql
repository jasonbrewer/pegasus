-- Batch 6 — moderator/admin "see everything".
--
-- 6.1  An admin reads every freelancer's and every employer's phone and email,
--      past the normal contact gating.
-- 6.2  Which is what puts employer contact on the moderation page.
-- 6.4  An admin reads every application, including its message and credits.
--
-- (6.3, the overview dashboard, needs no new policy: profiles, employer_profiles
-- and freelancer_profiles already carry admin SELECT carve-outs from
-- 20260801000010, and the emails it searches come from the contact tables this
-- migration opens.)
--
-- ===========================================================================
-- THIS MIGRATION IS READ-ONLY. EVERY POLICY BELOW IS `for select`.
--
-- Nothing here grants an admin INSERT, UPDATE or DELETE on anyone's content.
-- The single admin write path in this product remains where 20260801000010 put
-- it: public.admin_set_account_status(), which sets profiles.status and
-- nothing else. No new grants are issued at all — `authenticated` already
-- holds SELECT on all three tables, and RLS is what decides which rows come
-- back. A post-condition at the bottom re-checks all of this and raises if it
-- ever stops being true.
-- ===========================================================================
--
-- MECHANISM: separate, additively-named SELECT policies — NOT an edit to the
-- existing ones.
--
-- Postgres OR's permissive policies together, so
--     (owner or applied-to employer)  OR  (caller is an admin)
-- is the same effective rule either way. The difference is what happens to
-- the non-admin path while writing it. Adding `or current_user_is_admin()`
-- inside the existing policy means retyping the rule that protects everyone
-- else, in a migration whose whole purpose is to widen access — one slip in
-- that EXISTS clause and the gate is gone for the entire membership, silently.
--
-- Leaving the existing policies untouched means:
--   * the normal rule is unchanged, provably — the post-conditions assert its
--     text still contains the applied-to-employer EXISTS and the owner check;
--   * each carve-out is a separate named object that can be audited with one
--     catalogue query, and revoked with a single DROP POLICY if this turns out
--     to be a mistake, without disturbing anything else;
--   * "which policies give admins extra sight?" has an exact answer:
--         select * from pg_policies where policyname like 'admins read%';
--
-- WHY NOT a SECURITY DEFINER function or an admin view: both would move the
-- rule out of RLS into a second place that has to be kept honest, and a
-- definer function bypasses RLS by construction — so the admin check inside it
-- becomes the only thing standing between any caller and the whole table. A
-- policy cannot be called with the check omitted. There is no read here that
-- needs to escape RLS, so nothing needs that power.

-- ---------------------------------------------------------------------------
-- 6.1 — freelancer contact info
--
-- The normal rule stays exactly as 20260801000004 wrote it: the seeker
-- themselves, or an employer they have actually applied to. This adds a third
-- way in, for admins only, so a moderator can verify a person before approving
-- them. Read only — the insert/update/delete policies on this table are still
-- owner-only and are not touched.
-- ---------------------------------------------------------------------------

create policy "admins read all freelancer contacts"
  on public.freelancer_contacts for select
  to authenticated
  using (public.current_user_is_admin());

-- ---------------------------------------------------------------------------
-- 6.1 / 6.2 — employer contact info
--
-- 20260801000013 made this owner-only and said the moderator's read would come
-- as its own reviewed change. This is that change.
-- ---------------------------------------------------------------------------

create policy "admins read all employer contacts"
  on public.employer_contacts for select
  to authenticated
  using (public.current_user_is_admin());

-- ---------------------------------------------------------------------------
-- 6.4 — applications
--
-- A moderator can see what someone applied to and read what they sent. The
-- freelancer's and the employer's own SELECT policies are unchanged, and no
-- admin UPDATE policy is created: applications.status stays writable by nobody
-- from the client, and withdrawn_at stays writable only by the applicant
-- (20260801000011). An admin cannot edit, withdraw or delete an application.
--
-- Withdrawn applications are deliberately NOT filtered out here. job_applicants()
-- hides them from the employer because they are no longer a live candidate;
-- a moderator investigating an account needs the whole record.
-- ---------------------------------------------------------------------------

create policy "admins read all applications"
  on public.applications for select
  to authenticated
  using (public.current_user_is_admin());

-- No grants are issued by this migration. `authenticated` already holds SELECT
-- on freelancer_contacts (000004), applications (000004) and employer_contacts
-- (000013); RLS is what narrows those to the rows a caller may see. Adding a
-- grant here would be the mistake — grants are role-wide, policies are not.

comment on policy "admins read all freelancer contacts" on public.freelancer_contacts is
  'Batch 6.1. SELECT only. Lets a moderator verify a person before approving them.';
comment on policy "admins read all employer contacts" on public.employer_contacts is
  'Batch 6.1/6.2. SELECT only. Surfaces employer phone and email in moderation.';
comment on policy "admins read all applications" on public.applications is
  'Batch 6.4. SELECT only. An admin can read an application, never change one.';

-- ---------------------------------------------------------------------------
-- Post-conditions
--
-- Split in two: what this migration added, and what it must NOT have changed.
-- The second half is the important one for a batch that widens access.
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
  v_count int;
begin
  -- ---- the three carve-outs exist, and are SELECT ------------------------
  select string_agg(m.tbl || ' :: ' || m.pol, ', ')
  into v_missing
  from (values
    ('freelancer_contacts', 'admins read all freelancer contacts'),
    ('employer_contacts',   'admins read all employer contacts'),
    ('applications',        'admins read all applications')
  ) as m(tbl, pol)
  where not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = m.tbl and policyname = m.pol
  );

  if v_missing is not null then
    raise exception 'Batch 6 admin read policy missing: %', v_missing;
  end if;

  -- Each must be gated on the admin flag and on nothing else. A carve-out that
  -- forgot its using() clause would be readable by every logged-in user.
  select string_agg(tablename || ' :: ' || policyname, ', ')
  into v_missing
  from pg_policies
  where schemaname = 'public'
    and policyname like 'admins read%'
    and coalesce(qual, '') not like '%current_user_is_admin%';

  if v_missing is not null then
    raise exception 'admin read policy is not gated on the admin flag: %', v_missing;
  end if;

  -- ---- THE LOAD-BEARING ONE: no admin policy anywhere is a write ---------
  -- Schema-wide, not just the three tables above. If a later migration ever
  -- adds an admin INSERT/UPDATE/DELETE policy, this fails loudly.
  select string_agg(tablename || ' :: ' || policyname || ' (' || cmd || ')', ', ')
  into v_missing
  from pg_policies
  where schemaname = 'public'
    and coalesce(qual, '') || coalesce(with_check, '') like '%current_user_is_admin%'
    and cmd <> 'SELECT';

  if v_missing is not null then
    raise exception 'ADMIN WRITE POLICY FOUND — Batch 6 is read-only: %', v_missing;
  end if;

  -- ---- the normal, non-admin rules are untouched -------------------------
  -- freelancer_contacts still gates on ownership OR having been applied to.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'freelancer_contacts'
      and policyname = 'freelancer contacts visible to owner and applied-to employers'
      and qual like '%auth.uid()%'
      and qual like '%applications%'
      and qual like '%employer_id%'
  ) then
    raise exception 'the non-admin freelancer_contacts rule was altered or dropped';
  end if;

  -- employer_contacts is still owner-only for everyone who is not an admin.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'employer_contacts'
      and policyname = 'employer contacts are owner-only'
      and qual like '%auth.uid()%'
  ) then
    raise exception 'the non-admin employer_contacts rule was altered or dropped';
  end if;

  -- applications: a freelancer still sees only their own, an employer only
  -- those to their jobs.
  select string_agg(pol, ', ')
  into v_missing
  from unnest(array[
    'freelancers view their own applications',
    'employers view applications to their jobs'
  ]) as pol
  where not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'applications' and policyname = pol
  );

  if v_missing is not null then
    raise exception 'the non-admin applications rule was altered or dropped: %', v_missing;
  end if;

  -- Exactly one new policy per table, so nothing extra slipped in alongside.
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and policyname like 'admins read%';
  if v_count <> 3 then
    raise exception 'expected exactly 3 "admins read%%" policies, found %', v_count;
  end if;

  -- ---- no write access moved ---------------------------------------------
  --
  -- WHY THESE ARE POLICY-SHAPE CHECKS AND NOT GRANT CHECKS.
  --
  -- On Supabase, `authenticated` holds broad table privileges across the whole
  -- of `public` by default — including DELETE on every table, and including
  -- PostGIS's own tables. RLS is the actual gate; the grant is inert wherever
  -- no policy lets a row through. So `has_table_privilege(..., 'DELETE')` is
  -- true on a correctly-configured production database and says nothing about
  -- whether anybody can actually delete anything.
  --
  -- An earlier version of this block asserted that DELETE was NOT granted on
  -- applications and employer_contacts. That passed against a from-scratch
  -- Postgres harness, which never receives Supabase's default grants, and
  -- failed against the real database — a false positive that rolled the whole
  -- migration back. The property worth asserting is the one that actually
  -- protects the data: RLS is on, and no permissive write policy lets a
  -- non-owner through.
  --
  -- Scoped to these three tables BY NAME, deliberately. freelancer_contacts,
  -- freelancer_roles, freelancer_videos, job_contacts, job_titles, jobs and
  -- saved_jobs all carry legitimate owner-scoped DELETE policies — people are
  -- meant to be able to remove their own videos, roles and saved jobs. A
  -- schema-wide "no permissive write policy" check would wrongly condemn them.
  --
  -- The two grant checks that DO survive, further down, are the ones with an
  -- explicit REVOKE behind them in an earlier migration (000010 for profiles,
  -- 000011 for applications). Those migrations always run before this one, so
  -- the privilege is genuinely gone by the time this executes.

  -- RLS must be on. Without it every policy below is decoration.
  select string_agg(relname, ', ')
  into v_missing
  from pg_class
  where oid in ('public.applications'::regclass,
                'public.employer_contacts'::regclass,
                'public.profiles'::regclass)
    and not relrowsecurity;

  if v_missing is not null then
    raise exception 'RLS is DISABLED on: % — the default grants are live and unguarded', v_missing;
  end if;

  -- Every permissive write policy on these three must pin the row to its
  -- owner. `using (true)` on an UPDATE here would let any logged-in member
  -- rewrite anyone's application, contact details or profile, whatever the
  -- grants say.
  --
  -- INSERT is not checked: a permissive insert is how a freelancer applies to
  -- a job and how an employer creates their own contact row. Its with_check is
  -- owner-scoped anyway and is covered by the same test.
  select string_agg(tablename || ' :: ' || policyname || ' (' || cmd || ')', ', ')
  into v_missing
  from pg_policies
  where schemaname = 'public'
    and tablename in ('applications', 'employer_contacts', 'profiles')
    and permissive = 'PERMISSIVE'
    and cmd in ('UPDATE', 'DELETE', 'ALL')
    and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%';

  if v_missing is not null then
    raise exception 'a non-owner could satisfy this write policy: %', v_missing;
  end if;

  -- No DELETE policy at all on these three. Nothing in the product deletes an
  -- application, a company contact row or an account from the client, so a
  -- DELETE policy appearing here is a mistake even if it were owner-scoped.
  select string_agg(tablename || ' :: ' || policyname, ', ')
  into v_missing
  from pg_policies
  where schemaname = 'public'
    and tablename in ('applications', 'employer_contacts', 'profiles')
    and cmd in ('DELETE', 'ALL');

  if v_missing is not null then
    raise exception 'a DELETE policy exists where nothing should be deletable: %', v_missing;
  end if;

  -- ---- the grant checks with a REVOKE genuinely behind them ---------------
  -- 20260801000010 ran `revoke update on public.profiles from authenticated`
  -- and re-granted only full_name and avatar_path. 20260801000011 did the same
  -- for applications, re-granting only withdrawn_at. Both are earlier
  -- migrations, so both have run by the time this does — and unlike the DELETE
  -- checks above, these describe a privilege the schema actually took away.
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'table-level UPDATE on profiles is granted — 000010''s revoke did not hold';
  end if;

  select string_agg(col, ', ')
  into v_missing
  from unnest(array['status', 'is_admin', 'role']) as col
  where has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE');

  if v_missing is not null then
    raise exception 'privilege escalation: profiles.% became writable', v_missing;
  end if;

  if has_table_privilege('authenticated', 'public.applications', 'UPDATE') then
    raise exception 'table-level UPDATE on applications is granted — 000011''s revoke did not hold';
  end if;

  select string_agg(col, ', ')
  into v_missing
  from unnest(array['status', 'cover_note', 'credits_html', 'first_viewed_at']) as col
  where has_column_privilege('authenticated', 'public.applications', col, 'UPDATE');

  if v_missing is not null then
    raise exception 'application content became writable: %', v_missing;
  end if;

  -- ---- the admin write path is still the only one, and still narrow ------
  if to_regprocedure('public.admin_set_account_status(uuid, public.account_status)') is null then
    raise exception 'admin_set_account_status() is missing';
  end if;

  if pg_get_functiondef(to_regprocedure('public.admin_set_account_status(uuid, public.account_status)'))
     not like '%current_user_is_admin%' then
    raise exception 'admin_set_account_status() no longer checks the admin flag';
  end if;

  -- current_user_is_admin() must still answer from the real table.
  if not exists (
    select 1 from pg_proc
    where oid = to_regprocedure('public.current_user_is_admin()') and prosecdef
  ) then
    raise exception 'current_user_is_admin() is no longer SECURITY DEFINER';
  end if;
end $$;
