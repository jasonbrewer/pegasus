-- Read-only audit: does the live database actually contain everything
-- migrations 20260801000004 .. 20260801000013 claim to create?
--
-- Run it in the Supabase SQL editor. It writes nothing and returns one row per
-- expected object, MISSING rows first.
--
-- Why this exists: a migration can be recorded as applied while parts of it
-- silently did nothing. The known instance was a guard using
-- information_schema.schemata, which is PRIVILEGE-FILTERED — it returns no row
-- for a schema the current role holds no privilege on, so a storage-bucket
-- block concluded "storage is absent" on a Supabase project where storage very
-- much exists, and skipped itself without error. Anything guarded by a
-- catalogue lookup can fail this way, so verify against the catalogue directly.

-- No ON COMMIT DROP: psql autocommits each statement, which would destroy the
-- table before the DO block ever ran.
drop table if exists migration_audit;
create temporary table migration_audit (
  migration text,
  kind text,
  object text,
  status text
);

do $audit$
declare
  has_storage boolean := exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage');
begin
  -- ---- columns that must EXIST -------------------------------------------
  insert into migration_audit
  select m.migration, 'column', m.tbl || '.' || m.col,
         case when exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = m.tbl and c.column_name = m.col
         ) then 'ok' else 'MISSING' end
  from (values
    ('000004','employer_profiles','home_zip'),
    ('000004','employer_profiles','home_lat'),
    ('000004','employer_profiles','home_lng'),
    ('000004','employer_profiles','home_location'),
    ('000004','employer_profiles','description'),
    ('000004','employer_profiles','website'),
    ('000005','profiles','avatar_path'),
    ('000005','freelancer_profiles','credits_html'),
    ('000006','applications','credits_html'),
    ('000008','jobs','company_network'),
    ('000009','applications','first_viewed_at'),
    ('000010','profiles','status'),
    ('000010','profiles','is_admin'),
    ('000010','profiles','invited_by'),
    ('000011','applications','withdrawn_at'),
    ('000012','profiles','approved_at'),
    ('000013','employer_contacts','contact_phone'),
    ('000013','employer_contacts','contact_email'),
    ('000013','employer_contacts','linkedin_url')
  ) as m(migration, tbl, col);

  -- ---- columns that must be GONE ------------------------------------------
  insert into migration_audit
  select m.migration, 'column dropped', m.tbl || '.' || m.col,
         case when exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = m.tbl and c.column_name = m.col
         ) then 'MISSING (still present)' else 'ok' end
  from (values
    ('000004','employer_profiles','billing_email'),
    ('000004','employer_profiles','stripe_customer_id'),
    ('000005','profiles','avatar_url'),
    ('000008','jobs','title')
  ) as m(migration, tbl, col);

  -- ---- tables --------------------------------------------------------------
  insert into migration_audit
  select m.migration, 'table', m.tbl,
         case when to_regclass('public.' || m.tbl) is null then 'MISSING' else 'ok' end
  from (values
    ('000004','freelancer_contacts'),
    ('000004','job_contacts'),
    ('000004','employer_billing'),
    ('000005','freelancer_videos'),
    ('000008','job_titles'),
    ('000009','saved_jobs'),
    ('000013','employer_contacts')
  ) as m(migration, tbl);

  -- ---- RLS enabled ---------------------------------------------------------
  insert into migration_audit
  select m.migration, 'rls enabled', m.tbl,
         case when coalesce((
           select c.relrowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = m.tbl
         ), false) then 'ok' else 'MISSING' end
  from (values
    ('000004','freelancer_contacts'),
    ('000004','job_contacts'),
    ('000004','employer_billing'),
    ('000005','freelancer_videos'),
    ('000008','job_titles'),
    ('000009','saved_jobs'),
    ('000013','employer_contacts')
  ) as m(migration, tbl);

  -- ---- policies ------------------------------------------------------------
  insert into migration_audit
  select m.migration, 'policy', m.tbl || ' :: ' || m.pol,
         case when exists (
           select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = m.tbl and p.policyname = m.pol
         ) then 'ok' else 'MISSING' end
  from (values
    ('000004','roles','roles are readable by anon and authenticated'),
    ('000004','freelancer_contacts','freelancer contacts visible to owner and applied-to employers'),
    ('000004','freelancer_contacts','freelancers insert their own contact info'),
    ('000004','freelancer_contacts','freelancers update their own contact info'),
    ('000004','freelancer_contacts','freelancers delete their own contact info'),
    ('000004','job_contacts','job contacts visible to owner and, when shared, to applicants'),
    ('000004','job_contacts','employers insert contact info for their own jobs'),
    ('000004','job_contacts','employers update contact info for their own jobs'),
    ('000004','job_contacts','employers delete contact info for their own jobs'),
    ('000004','employer_billing','employer billing is owner-only'),
    ('000004','employer_billing','employers insert their own billing row'),
    ('000004','employer_billing','employers update their own billing row'),
    -- 000005's read policy on freelancer_videos was replaced by 000010's
    -- participation-gated one, which is asserted in the 000010 block below.
    ('000005','freelancer_videos','freelancers manage their own videos'),
    -- 000008's read policy on job_titles was likewise replaced by 000010.
    ('000008','job_titles','employers insert titles for their own jobs'),
    ('000008','job_titles','employers update titles for their own jobs'),
    ('000008','job_titles','employers delete titles for their own jobs'),
    ('000009','saved_jobs','freelancers view their own saved jobs'),
    ('000009','saved_jobs','freelancers save jobs for themselves'),
    ('000009','saved_jobs','freelancers unsave their own saved jobs'),
    ('000010','profiles','profiles are readable when participating, plus self and admins'),
    ('000010','freelancer_profiles','freelancer profiles are readable when participating'),
    ('000010','freelancer_roles','freelancer roles are readable when participating'),
    ('000010','freelancer_videos','freelancer videos are readable when participating'),
    ('000010','employer_profiles','employer profiles are readable when participating'),
    ('000010','jobs','jobs are readable when the employer is participating'),
    ('000010','jobs','participating employers create jobs for themselves'),
    ('000010','job_titles','job titles are readable when the job is, unless hidden'),
    ('000010','applications','participating freelancers apply to jobs'),
    ('000011','applications','freelancers withdraw their own applications'),
    ('000013','employer_contacts','employer contacts are owner-only'),
    ('000013','employer_contacts','employers insert their own contact row'),
    ('000013','employer_contacts','employers update their own contact row')
  ) as m(migration, tbl, pol);

  -- ---- policies that must be GONE -----------------------------------------
  -- A leftover `using (true)` policy is permissive-OR'd with its replacement
  -- and would silently un-gate the marketplace.
  insert into migration_audit
  select m.migration, 'policy replaced', m.tbl || ' :: ' || m.pol,
         case when exists (
           select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = m.tbl and p.policyname = m.pol
         ) then 'MISSING (old permissive policy still present)' else 'ok' end
  from (values
    ('000010','profiles','profiles are readable by authenticated users'),
    ('000010','freelancer_profiles','freelancer profiles are readable by authenticated users'),
    ('000010','freelancer_roles','freelancer roles are readable by authenticated users'),
    ('000010','freelancer_videos','freelancer videos are readable by authenticated users'),
    ('000010','employer_profiles','employer profiles are readable by authenticated users'),
    ('000010','jobs','jobs are readable by authenticated users'),
    ('000010','jobs','employers create jobs for themselves'),
    ('000010','job_titles','job titles are readable unless the poster hid them'),
    ('000010','applications','freelancers apply to jobs'),
    ('000011','applications','employers update application status on their jobs')
  ) as m(migration, tbl, pol);

  -- ---- table privileges (RLS narrows; it never grants) ---------------------
  insert into migration_audit
  select m.migration, 'grant ' || m.priv, m.role_name || ' -> ' || m.tbl,
         case when to_regclass('public.' || m.tbl) is null then 'MISSING (no table)'
              when has_table_privilege(m.role_name, 'public.' || m.tbl, m.priv) then 'ok'
              else 'MISSING' end
  from (values
    ('000004','authenticated','freelancer_contacts','SELECT'),
    ('000004','authenticated','freelancer_contacts','INSERT'),
    ('000004','authenticated','freelancer_contacts','UPDATE'),
    ('000004','authenticated','freelancer_contacts','DELETE'),
    ('000004','authenticated','job_contacts','SELECT'),
    ('000004','authenticated','job_contacts','INSERT'),
    ('000004','authenticated','employer_billing','SELECT'),
    ('000004','authenticated','employer_billing','INSERT'),
    ('000004','authenticated','employer_billing','UPDATE'),
    ('000004','authenticated','profiles','SELECT'),
    ('000004','authenticated','jobs','SELECT'),
    ('000004','authenticated','applications','SELECT'),
    ('000004','anon','roles','SELECT'),
    ('000004','anon','zip_codes','SELECT'),
    ('000005','authenticated','freelancer_videos','SELECT'),
    ('000005','authenticated','freelancer_videos','INSERT'),
    ('000005','authenticated','freelancer_videos','UPDATE'),
    ('000005','authenticated','freelancer_videos','DELETE'),
    ('000008','authenticated','job_titles','SELECT'),
    ('000008','authenticated','job_titles','INSERT'),
    ('000008','authenticated','job_titles','UPDATE'),
    ('000008','authenticated','job_titles','DELETE'),
    ('000009','authenticated','saved_jobs','SELECT'),
    ('000009','authenticated','saved_jobs','INSERT'),
    ('000009','authenticated','saved_jobs','DELETE'),
    ('000013','authenticated','employer_contacts','SELECT'),
    ('000013','authenticated','employer_contacts','INSERT'),
    ('000013','authenticated','employer_contacts','UPDATE')
  ) as m(migration, role_name, tbl, priv);

  -- saved_jobs is deliberately UPDATE-less: the table has no mutable
  -- column, so an UPDATE grant here would be surface with no purpose.
  insert into migration_audit
  select '000009', 'grant absent', 'authenticated -> saved_jobs UPDATE',
         case when to_regclass('public.saved_jobs') is null then 'MISSING (no table)'
              when has_table_privilege('authenticated', 'public.saved_jobs', 'UPDATE')
                then 'MISSING (UPDATE granted but never intended)'
              else 'ok' end;

  -- ---- functions -----------------------------------------------------------
  insert into migration_audit
  select m.migration, 'function', m.sig,
         case when to_regprocedure(m.sig) is null then 'MISSING' else 'ok' end
  from (values
    ('000004','public.normalize_zip(text)'),
    ('000004','public.zip_centroid(text)'),
    ('000004','public.resolve_employer_home_zip()'),
    ('000007','public.job_applicants(uuid)'),
    ('000008','public.job_feed(double precision, double precision, double precision, text)'),
    ('000009','public.mark_applicants_viewed(uuid)'),
    ('000010','public.current_user_is_admin()'),
    ('000010','public.is_participating(uuid)'),
    ('000010','public.admin_set_account_status(uuid, public.account_status)'),
    ('000011','public.reapply_to_job(uuid, text, text)')
  ) as m(migration, sig);

  -- job_applicants must RETURN credits_html (000007's whole point), and
  -- job_feed must return company_network and no longer sit on jobs.title.
  insert into migration_audit
  select '000007', 'function returns', 'job_applicants -> credits_html',
         case when to_regprocedure('public.job_applicants(uuid)') is null then 'MISSING (no function)'
              when pg_get_function_result(to_regprocedure('public.job_applicants(uuid)')) like '%credits_html%'
              then 'ok' else 'MISSING' end;

  insert into migration_audit
  select '000008', 'function returns', 'job_feed -> company_network',
         case when to_regprocedure('public.job_feed(double precision, double precision, double precision, text)') is null
                then 'MISSING (no function)'
              when pg_get_function_result(to_regprocedure('public.job_feed(double precision, double precision, double precision, text)')) like '%company_network%'
              then 'ok' else 'MISSING' end;

  insert into migration_audit
  select m.migration, 'execute grant', m.sig,
         case when to_regprocedure(m.sig) is null then 'MISSING (no function)'
              when has_function_privilege('authenticated', to_regprocedure(m.sig), 'EXECUTE') then 'ok'
              else 'MISSING' end
  from (values
    ('000007','public.job_applicants(uuid)'),
    ('000008','public.job_feed(double precision, double precision, double precision, text)'),
    ('000009','public.mark_applicants_viewed(uuid)'),
    ('000010','public.current_user_is_admin()'),
    ('000010','public.is_participating(uuid)'),
    ('000010','public.admin_set_account_status(uuid, public.account_status)'),
    ('000011','public.reapply_to_job(uuid, text, text)')
  ) as m(migration, sig);

  -- ---- 000011: only withdrawn_at is client-writable on applications -------
  insert into migration_audit
  select '000011', 'grant absent', 'authenticated -> applications UPDATE (table-level)',
         case when has_table_privilege('authenticated', 'public.applications', 'UPDATE')
              then 'MISSING (table-level UPDATE still granted)' else 'ok' end;

  insert into migration_audit
  select '000011', 'grant absent', 'authenticated -> applications.' || m.col || ' UPDATE',
         case when has_column_privilege('authenticated', 'public.applications', m.col, 'UPDATE')
              then 'MISSING (column is writable)' else 'ok' end
  from (values ('cover_note'), ('credits_html'), ('status'), ('first_viewed_at')) as m(col);

  insert into migration_audit
  select '000011', 'grant UPDATE', 'authenticated -> applications.withdrawn_at',
         case when has_column_privilege('authenticated', 'public.applications', 'withdrawn_at', 'UPDATE')
              then 'ok' else 'MISSING (withdrawing is broken)' end;

  -- 000012: approved_at must not be forgeable, and the signup trigger must
  -- still seed the contact rows.
  insert into migration_audit
  select '000012', 'grant absent', 'authenticated -> profiles.approved_at UPDATE',
         case when has_column_privilege('authenticated', 'public.profiles', 'approved_at', 'UPDATE')
              then 'MISSING (the approval banner is forgeable)' else 'ok' end;

  insert into migration_audit
  select '000012', 'function body', 'handle_new_user -> seeds ' || m.needle,
         case when to_regprocedure('public.handle_new_user()') is null then 'MISSING (no function)'
              when pg_get_functiondef(to_regprocedure('public.handle_new_user()')) like '%' || m.needle || '%'
              then 'ok' else 'MISSING' end
  from (values ('freelancer_contacts'), ('employer_billing')) as m(needle);

  -- ---- 000013: employer contact info --------------------------------------
  -- Additive by design. A NOT NULL here would lock an employer who predates
  -- the migration out of saving their own profile.
  insert into migration_audit
  select '000013', 'column nullable', 'employer_contacts.' || m.col,
         case when to_regclass('public.employer_contacts') is null then 'MISSING (no table)'
              when exists (
                select 1 from pg_attribute
                where attrelid = 'public.employer_contacts'::regclass
                  and attname = m.col and not attisdropped and attnotnull
              ) then 'MISSING (NOT NULL — not additive)' else 'ok' end
  from (values ('contact_phone'), ('contact_email'), ('linkedin_url')) as m(col);

  -- The privacy claim, checked against the catalogue rather than trusted:
  -- every policy on the table pins the row to its owner, and there are
  -- exactly three of them. A stray permissive policy would publish employer
  -- phone numbers to the whole membership.
  insert into migration_audit
  select '000013', 'policy owner-only', 'employer_contacts :: all policies name auth.uid()',
         case when to_regclass('public.employer_contacts') is null then 'MISSING (no table)'
              when exists (
                select 1 from pg_policies
                where schemaname = 'public' and tablename = 'employer_contacts'
                  and coalesce(qual,'') || coalesce(with_check,'') not like '%auth.uid()%'
              ) then 'MISSING (a policy is not owner-scoped)' else 'ok' end;

  insert into migration_audit
  select '000013', 'policy count', 'employer_contacts :: exactly 3',
         case when to_regclass('public.employer_contacts') is null then 'MISSING (no table)'
              when (select count(*) from pg_policies
                    where schemaname = 'public' and tablename = 'employer_contacts') = 3
              then 'ok' else 'MISSING (unexpected policy count — an extra one may be permissive)' end;

  -- No DELETE: there is no policy or grant for it, so a contact row cannot be
  -- orphaned away from the employer_profiles row it hangs off.
  insert into migration_audit
  select '000013', 'grant absent', 'authenticated -> employer_contacts DELETE',
         case when to_regclass('public.employer_contacts') is null then 'MISSING (no table)'
              when has_table_privilege('authenticated', 'public.employer_contacts', 'DELETE')
                then 'MISSING (DELETE granted but never intended)' else 'ok' end;

  insert into migration_audit
  select '000013', 'grant absent', 'anon -> employer_contacts SELECT',
         case when to_regclass('public.employer_contacts') is null then 'MISSING (no table)'
              when has_table_privilege('anon', 'public.employer_contacts', 'SELECT')
                then 'MISSING (logged-out visitors can read contact info)' else 'ok' end;

  insert into migration_audit
  select '000013', 'function body', 'handle_new_user -> seeds employer_contacts',
         case when to_regprocedure('public.handle_new_user()') is null then 'MISSING (no function)'
              when pg_get_functiondef(to_regprocedure('public.handle_new_user()')) like '%employer_contacts%'
              then 'ok' else 'MISSING' end;

  -- Employers stay auto-approved. Batch 4 must not have introduced a gate.
  insert into migration_audit
  select '000013', 'function body', 'handle_new_user -> employers still auto-approved',
         case when to_regprocedure('public.handle_new_user()') is null then 'MISSING (no function)'
              when pg_get_functiondef(to_regprocedure('public.handle_new_user()'))
                   like '%when signup_role = ''employer'' then ''approved''%'
              then 'ok' else 'MISSING (employer approval gate introduced)' end;

  -- Backfill landed: nobody opens the profile form to a blank Contact card.
  insert into migration_audit
  select '000013', 'backfill', 'every employer_profiles row has a contact row',
         case when to_regclass('public.employer_contacts') is null then 'MISSING (no table)'
              when exists (
                select 1 from public.employer_profiles ep
                left join public.employer_contacts ec on ec.profile_id = ep.profile_id
                where ec.profile_id is null
              ) then 'MISSING (employers without a contact row)' else 'ok' end;

  insert into migration_audit
  select '000012', 'function body', 'admin_set_account_status -> records approved_at',
         case when to_regprocedure('public.admin_set_account_status(uuid, public.account_status)') is null
                then 'MISSING (no function)'
              when pg_get_functiondef(to_regprocedure('public.admin_set_account_status(uuid, public.account_status)'))
                   like '%approved_at%'
              then 'ok' else 'MISSING' end;

  insert into migration_audit
  select '000011', 'function returns', 'job_applicants -> hides withdrawn',
         case when to_regprocedure('public.job_applicants(uuid)') is null then 'MISSING (no function)'
              when pg_get_functiondef(to_regprocedure('public.job_applicants(uuid)')) like '%withdrawn_at is null%'
              then 'ok' else 'MISSING' end;

  -- ---- 000010: nobody can promote themselves ------------------------------
  -- profiles.status and profiles.is_admin must NOT be writable from the
  -- client. A table-level UPDATE grant here is a privilege escalation via a
  -- single PostgREST call, whatever the app code does.
  insert into migration_audit
  select '000010', 'grant absent', 'authenticated -> profiles.' || m.col || ' UPDATE',
         case when has_column_privilege('authenticated', 'public.profiles', m.col, 'UPDATE')
              then 'MISSING (column is writable)' else 'ok' end
  from (values ('status'), ('is_admin'), ('role')) as m(col);

  insert into migration_audit
  select '000010', 'grant absent', 'authenticated -> profiles UPDATE (table-level)',
         case when has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
              then 'MISSING (table-level UPDATE still granted)' else 'ok' end;

  insert into migration_audit
  select '000010', 'grant UPDATE', 'authenticated -> profiles.' || m.col,
         case when has_column_privilege('authenticated', 'public.profiles', m.col, 'UPDATE')
              then 'ok' else 'MISSING (profile editor is broken)' end
  from (values ('full_name'), ('avatar_path')) as m(col);

  -- Admin carve-outs are reads. A write policy naming the admin helper would
  -- be god-mode creeping back in.
  insert into migration_audit
  select '000010', 'no admin write policy', 'profiles',
         case when exists (
           select 1 from pg_policies
           where schemaname = 'public' and tablename = 'profiles' and cmd <> 'SELECT'
             and coalesce(qual,'') || coalesce(with_check,'') like '%current_user_is_admin%'
         ) then 'MISSING (an admin WRITE policy exists)' else 'ok' end;

  -- ---- triggers ------------------------------------------------------------
  insert into migration_audit
  select m.migration, 'trigger', m.tbl || ' :: ' || m.trg,
         case when exists (
           select 1 from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = m.tbl and t.tgname = m.trg and not t.tgisinternal
         ) then 'ok' else 'MISSING' end
  from (values
    ('000004','employer_profiles','employer_profiles_resolve_zip'),
    ('000008','job_titles','job_titles_set_updated_at'),
    ('000013','employer_contacts','employer_contacts_set_updated_at')
  ) as m(migration, tbl, trg);

  -- ---- seed data -----------------------------------------------------------
  insert into migration_audit
  select '000004', 'seed row', 'roles: 3d-motion-blender-artist',
         case when exists (select 1 from public.roles where slug = '3d-motion-blender-artist')
              then 'ok' else 'MISSING' end;

  -- ---- ON DELETE CASCADE into jobs ----------------------------------------
  insert into migration_audit
  select '000008', 'fk cascade', m.child || ' -> jobs',
         case when exists (
           select 1 from pg_constraint c
           join pg_class child on child.oid = c.conrelid
           join pg_class parent on parent.oid = c.confrelid
           where c.contype = 'f' and child.relname = m.child
             and parent.relname = 'jobs' and c.confdeltype = 'c'
         ) then 'ok' else 'MISSING' end
  from (values ('applications'), ('job_contacts'), ('job_titles')) as m(child);

  -- ---- storage (000005) ----------------------------------------------------
  if not has_storage then
    insert into migration_audit
    values ('000005', 'storage', 'storage schema', 'MISSING (schema absent — not a Supabase DB?)');
  else
    execute $q$
      insert into migration_audit
      select '000005', 'storage', 'avatars bucket (must be private)',
             case when exists (select 1 from storage.buckets where id='avatars' and public is false)
                    then 'ok'
                  when exists (select 1 from storage.buckets where id='avatars')
                    then 'MISSING (bucket is PUBLIC — privacy model violated)'
                  else 'MISSING' end
    $q$;

    insert into migration_audit
    select '000005', 'storage policy', m.pol,
           case when exists (
             select 1 from pg_policies p
             where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = m.pol
           ) then 'ok' else 'MISSING' end
    from (values
      ('avatars readable by authenticated users'),
      ('users upload their own avatar'),
      ('users update their own avatar'),
      ('users delete their own avatar')
    ) as m(pol);
  end if;
end
$audit$;

select
  count(*) filter (where status <> 'ok') as missing,
  count(*) filter (where status = 'ok')  as ok,
  count(*)                               as checked,
  case when count(*) filter (where status <> 'ok') = 0
       then 'All checked objects are present.'
       else 'Some objects are MISSING — see the rows above.' end as verdict
from migration_audit;

select
  case when status = 'ok' then '✅' else '❌' end as " ",
  migration,
  kind,
  object,
  status
from migration_audit
order by (status = 'ok'), migration, kind, object;

