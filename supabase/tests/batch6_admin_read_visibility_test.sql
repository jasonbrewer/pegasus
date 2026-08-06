-- Batch 6 — proves admins gain READ visibility and NOTHING changes for anyone
-- else. Run against a database with every migration applied, as postgres.
--
-- Setup: supabase/tests/run.sh, or by hand — create an empty database with
-- postgis + pgcrypto, apply supabase/tests/00_harness.sql, then every file in
-- supabase/migrations/ in order, then this.
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE ADDING AN ASSERTION ABOUT WRITE PROTECTION.
--
-- Do NOT assert it with has_table_privilege() or has_column_privilege().
--
-- On Supabase, `authenticated` holds SELECT, INSERT, UPDATE and DELETE on
-- every table in `public` by default. RLS is the gate; the grant is inert
-- wherever no policy lets a row through. A check like
--     has_table_privilege('authenticated', 'public.applications', 'DELETE')
-- is therefore TRUE on a perfectly healthy production database.
--
-- This is not theoretical. Migration 20260801000014 shipped with exactly that
-- assertion. It passed against a bare-Postgres harness and then failed a live
-- `supabase db push`, rolling the whole migration back. 00_harness.sql now
-- applies Supabase's default grants precisely so that a check written that way
-- fails HERE, where it costs a rerun, instead of there.
--
-- Assert write protection as RLS + policy shape instead:
--     * pg_class.relrowsecurity is true for the table, AND
--     * no permissive UPDATE/DELETE/ALL policy that a non-owner could satisfy.
--
-- A grant check is only sound when some migration explicitly REVOKEd the
-- privilege first — currently only two do: 000010 (profiles UPDATE) and
-- 000011 (applications UPDATE).
--
-- Note that Part 3 below is unaffected by any of this. It does not inspect
-- privileges at all: it becomes the admin and tries the writes, and accepts
-- either outcome that leaves the data alone — refused outright, or zero rows
-- touched. That style of test stays true on both databases.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Cast
--   admin      an employer account with is_admin = true (set by hand, as designed)
--   employerA  posted a job; freelancerX applied to it
--   employerB  unrelated to everybody
--   freelancerX applied to employerA's job
--   freelancerY applied to nothing
-- ---------------------------------------------------------------------------

insert into public.zip_codes (zip, lat, lng, city, state) values
  ('23220', 37.55, -77.46, 'Richmond', 'VA')
on conflict (zip) do nothing;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@example.com',
   '{"role":"employer","full_name":"Mod Erator","company_name":"Production Circles"}'),
  ('e0000000-0000-4000-8000-00000000000a', 'employera@example.com',
   '{"role":"employer","full_name":"Employer Ay","company_name":"Alpha Films"}'),
  ('e0000000-0000-4000-8000-00000000000b', 'employerb@example.com',
   '{"role":"employer","full_name":"Employer Bee","company_name":"Bravo Media"}'),
  ('f0000000-0000-4000-8000-0000000000f1', 'freelancerx@example.com',
   '{"role":"freelancer","full_name":"Freelancer Ex","home_zip":"23220"}'),
  ('f0000000-0000-4000-8000-0000000000f2', 'freelancery@example.com',
   '{"role":"freelancer","full_name":"Freelancer Why","home_zip":"23220"}');

\set admin '''a0000000-0000-4000-8000-000000000001'''
\set empA  '''e0000000-0000-4000-8000-00000000000a'''
\set empB  '''e0000000-0000-4000-8000-00000000000b'''
\set frX   '''f0000000-0000-4000-8000-0000000000f1'''
\set frY   '''f0000000-0000-4000-8000-0000000000f2'''

-- The admin flag is set directly in the database. No UI grants it, by design.
update public.profiles set is_admin = true where id = :admin;
-- Both freelancers approved, so a zero result below is the contact gate and
-- not merely an unapproved account being invisible.
update public.profiles set status = 'approved' where role = 'freelancer';

-- Contact details for everyone (signup already seeded the emails; add phones).
update public.freelancer_contacts set phone = '8045550001' where profile_id = :frX;
update public.freelancer_contacts set phone = '8045550002' where profile_id = :frY;
update public.employer_contacts   set contact_phone = '8045551001' where profile_id = :empA;
update public.employer_contacts   set contact_phone = '8045551002' where profile_id = :empB;

insert into public.jobs (id, employer_id, role_slug, company_network, description,
                         location_zip, location_lat, location_lng) values
  ('11111111-1111-4111-8111-111111111111', :empA, 'gaffer', 'Discovery',
   'Employer A job.', '23220', 37.55, -77.46),
  ('11111111-1111-4111-8111-222222222222', :empA, 'grip', 'Discovery',
   'Employer A second job.', '23220', 37.55, -77.46);
insert into public.job_titles (job_id, title) values
  ('11111111-1111-4111-8111-111111111111', 'Employer A shoot'),
  ('11111111-1111-4111-8111-222222222222', 'Employer A second shoot');

-- freelancerX applied to both of employerA's jobs and withdrew one of them, so
-- the admin view can be checked against the FULL record rather than the live
-- subset. freelancerY applied to nothing at all — they are the control for
-- "an employer cannot see a freelancer who never applied to them".
--
-- NOTE on the fixture: freelancerY deliberately has no application anywhere.
-- An earlier draft gave them a withdrawn application to employerA's job and
-- assertion 2b failed — because the freelancer_contacts policy's EXISTS does
-- not filter on withdrawn_at, so withdrawing does not take an employer's
-- contact visibility back. That is pre-existing behaviour from Batch 2, not
-- something Batch 6 changes, and it is left exactly as it is.
insert into public.applications (id, job_id, freelancer_id, cover_note, credits_html) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', :frX,
   'I am available for these dates.', '<p>Ten years of gaffing.</p>');
insert into public.applications (id, job_id, freelancer_id, cover_note, credits_html, withdrawn_at) values
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-222222222222', :frX,
   'Withdrew this one.', '<p>Grip work.</p>', now());

\echo ''
\echo '==================== PART 1 — NON-ADMINS ARE UNAFFECTED ===================='

set role authenticated;

do $$
declare n int; v text;
begin
  -- ---- 1. an employer NOT applied to cannot see freelancer contact --------
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000b', false);
  select count(*) into n from public.freelancer_contacts;
  if n <> 0 then
    raise exception 'FAIL 1: employerB read % freelancer contact row(s) without being applied to', n;
  end if;
  raise notice 'PASS 1  employerB (never applied to) sees 0 freelancer contacts';

  -- ---- 2. ...but the employer who WAS applied to still can ---------------
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000a', false);
  select count(*) into n from public.freelancer_contacts where profile_id = 'f0000000-0000-4000-8000-0000000000f1';
  if n <> 1 then
    raise exception 'FAIL 2: the normal applied-to rule broke — employerA sees % rows, expected 1', n;
  end if;
  select phone into v from public.freelancer_contacts where profile_id = 'f0000000-0000-4000-8000-0000000000f1';
  if v <> '8045550001' then raise exception 'FAIL 2: employerA read the wrong phone (%)', v; end if;
  raise notice 'PASS 2  employerA (was applied to) still sees freelancerX''s phone — rule intact';

  -- employerA still cannot see the freelancer who did NOT apply to them.
  select count(*) into n from public.freelancer_contacts where profile_id = 'f0000000-0000-4000-8000-0000000000f2';
  if n <> 0 then raise exception 'FAIL 2b: employerA saw a non-applicant''s contact'; end if;
  raise notice 'PASS 2b employerA still sees 0 contacts for the freelancer who never applied';

  -- ---- 3. employer contact info stays owner-only for non-admins ----------
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000b', false);
  select count(*) into n from public.employer_contacts
  where profile_id = 'e0000000-0000-4000-8000-00000000000a';
  if n <> 0 then raise exception 'FAIL 3: employerA''s contact leaked to employerB'; end if;
  select count(*) into n from public.employer_contacts;
  if n <> 1 then raise exception 'FAIL 3b: employerB sees % employer contact rows, expected only their own', n; end if;
  raise notice 'PASS 3  employer contact info is still owner-only between employers';

  -- ---- 4. a freelancer sees no employer contact at all -------------------
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-0000000000f1', false);
  select count(*) into n from public.employer_contacts;
  if n <> 0 then raise exception 'FAIL 4: a freelancer read % employer contact row(s)', n; end if;
  raise notice 'PASS 4  freelancerX sees 0 employer contacts — even the one they applied to';

  -- ---- 5. a freelancer cannot read another freelancer's contact ----------
  select count(*) into n from public.freelancer_contacts
  where profile_id = 'f0000000-0000-4000-8000-0000000000f2';
  if n <> 0 then raise exception 'FAIL 5: freelancerX read freelancerY''s contact'; end if;
  raise notice 'PASS 5  freelancerX sees 0 contacts for another freelancer';

  -- ---- 6. applications stay private between users ------------------------
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-0000000000f2', false);
  select count(*) into n from public.applications;
  if n <> 0 then raise exception 'FAIL 6: freelancerY read % application(s) that are not theirs', n; end if;
  raise notice 'PASS 6  freelancerY sees 0 of freelancerX''s applications';

  perform set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000b', false);
  select count(*) into n from public.applications;
  if n <> 0 then raise exception 'FAIL 6b: employerB read % application(s) to someone else''s job', n; end if;
  raise notice 'PASS 6b employerB sees 0 applications to another employer''s job';

  -- ---- 7. ...while the employer who owns the job still sees theirs -------
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000a', false);
  select count(*) into n from public.applications;
  if n <> 2 then raise exception 'FAIL 7: employerA sees % applications to their own job, expected 2', n; end if;
  raise notice 'PASS 7  employerA still sees the applications to their own job — rule intact';

  -- ---- 8. no non-admin is an admin ---------------------------------------
  select string_agg(who, ', ') into v from (
    select u as who from unnest(array[
      'e0000000-0000-4000-8000-00000000000a',
      'e0000000-0000-4000-8000-00000000000b',
      'f0000000-0000-4000-8000-0000000000f1',
      'f0000000-0000-4000-8000-0000000000f2'
    ]) as u
  ) s where (select public.current_user_is_admin()
             from (select set_config('request.jwt.claim.sub', s.who, false)) _);
  if v is not null then raise exception 'FAIL 8: current_user_is_admin() is true for: %', v; end if;
  raise notice 'PASS 8  current_user_is_admin() is false for every non-admin (the /admin gate 404s them)';
end $$;

reset role;

\echo ''
\echo '==================== PART 2 — WHAT THE ADMIN GAINS (READ) ===================='

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);

\echo '-- 6.1 every freelancer phone + email --'
select p.full_name, c.phone, c.contact_email
from public.freelancer_contacts c join public.profiles p on p.id = c.profile_id
order by p.full_name;

\echo '-- 6.1 / 6.2 every employer phone + email --'
select p.full_name, c.contact_phone, c.contact_email
from public.employer_contacts c join public.profiles p on p.id = c.profile_id
order by p.full_name;

\echo '-- 6.4 every application, including the withdrawn one --'
select p.full_name, t.title, a.cover_note, a.credits_html,
       (a.withdrawn_at is not null) as withdrawn
from public.applications a
join public.profiles p on p.id = a.freelancer_id
join public.job_titles t on t.job_id = a.job_id
order by p.full_name;

reset role;

do $$
declare n int;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);

  select count(*) into n from public.freelancer_contacts;
  if n <> 2 then raise exception 'FAIL: admin sees % freelancer contacts, expected 2', n; end if;

  select count(*) into n from public.employer_contacts;
  if n <> 3 then raise exception 'FAIL: admin sees % employer contacts, expected 3', n; end if;

  select count(*) into n from public.applications;
  if n <> 2 then raise exception 'FAIL: admin sees % applications, expected 2', n; end if;

  select count(*) into n from public.applications where credits_html is not null;
  if n <> 2 then raise exception 'FAIL: admin cannot read application credits'; end if;

  -- 6.3 needs every account regardless of status.
  select count(*) into n from public.profiles;
  if n <> 5 then raise exception 'FAIL: admin sees % profiles, expected 5', n; end if;

  reset role;
  raise notice 'PASS  admin reads all contacts, all applications (incl. withdrawn), all profiles';
end $$;

\echo ''
\echo '==================== PART 3 — THE ADMIN CANNOT WRITE ===================='

-- Each of these must either be refused outright (no grant) or touch 0 rows
-- (no policy). Both outcomes are a pass; silently succeeding is the failure.
do $$
declare n int; refused boolean;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);

  -- application content
  refused := false;
  begin
    update public.applications set cover_note = 'edited by admin'
    where id = 'aaaaaaaa-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin edited an application''s message'; end if;
  raise notice 'PASS  admin cannot edit application content (%)', case when refused then 'no grant' else '0 rows' end;

  -- application status
  refused := false;
  begin
    update public.applications set status = 'hired'
    where id = 'aaaaaaaa-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin changed an application''s status'; end if;
  raise notice 'PASS  admin cannot change application status (%)', case when refused then 'no grant' else '0 rows' end;

  -- deleting an application
  refused := false;
  begin
    delete from public.applications where id = 'aaaaaaaa-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin deleted an application'; end if;
  raise notice 'PASS  admin cannot delete an application (%)', case when refused then 'no grant' else '0 rows' end;

  -- somebody else's contact info
  refused := false;
  begin
    update public.freelancer_contacts set phone = '0000000000'
    where profile_id = 'f0000000-0000-4000-8000-0000000000f1';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin rewrote a freelancer''s phone number'; end if;
  raise notice 'PASS  admin cannot edit freelancer contact info (%)', case when refused then 'no grant' else '0 rows' end;

  refused := false;
  begin
    update public.employer_contacts set contact_phone = '0000000000'
    where profile_id = 'e0000000-0000-4000-8000-00000000000a';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin rewrote an employer''s phone number'; end if;
  raise notice 'PASS  admin cannot edit employer contact info (%)', case when refused then 'no grant' else '0 rows' end;

  -- somebody else's job posting
  refused := false;
  begin
    update public.jobs set description = 'edited by admin'
    where id = '11111111-1111-4111-8111-111111111111';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin edited a job posting'; end if;
  raise notice 'PASS  admin cannot edit a job posting (%)', case when refused then 'no grant' else '0 rows' end;

  refused := false;
  begin
    delete from public.jobs where id = '11111111-1111-4111-8111-111111111111';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin deleted a job posting'; end if;
  raise notice 'PASS  admin cannot delete a job posting (%)', case when refused then 'no grant' else '0 rows' end;

  -- somebody else's profile, and the admin flag itself
  refused := false;
  begin
    update public.profiles set full_name = 'renamed by admin'
    where id = 'f0000000-0000-4000-8000-0000000000f1';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin renamed another user'; end if;
  raise notice 'PASS  admin cannot rename another user (%)', case when refused then 'no grant' else '0 rows' end;

  refused := false;
  begin
    update public.profiles set is_admin = true
    where id = 'f0000000-0000-4000-8000-0000000000f2';
    get diagnostics n = row_count;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused and n > 0 then raise exception 'FAIL: admin granted admin to someone else'; end if;
  raise notice 'PASS  admin cannot grant the admin flag (%)', case when refused then 'no grant' else '0 rows' end;

  reset role;
end $$;

\echo ''
\echo '-- the one admin write path still works, and still only sets status --'
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
select public.admin_set_account_status('f0000000-0000-4000-8000-0000000000f2'::uuid, 'blocked') as new_status;
reset role;

\echo ''
\echo '-- and a NON-admin still cannot call it --'
do $$
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-00000000000b', false);
  begin
    perform public.admin_set_account_status('f0000000-0000-4000-8000-0000000000f1'::uuid, 'blocked');
    reset role;
    raise exception 'FAIL: a non-admin set an account status';
  exception when others then
    reset role;
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS  non-admin refused by admin_set_account_status(): %', sqlerrm;
  end;
end $$;

\echo ''
\echo '==================== PART 4 — CATALOGUE AUDIT ===================='
\echo '-- every policy mentioning the admin helper, with its command --'
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and coalesce(qual, '') || coalesce(with_check, '') like '%current_user_is_admin%'
order by cmd, tablename, policyname;
