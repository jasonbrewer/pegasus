-- Read-only audit: does the live database actually contain everything
-- migrations 20260801000004 .. 20260801000008 claim to create?
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
    ('000008','jobs','company_network')
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
    ('000008','job_titles')
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
    ('000008','job_titles')
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
    ('000005','freelancer_videos','freelancer videos are readable by authenticated users'),
    ('000005','freelancer_videos','freelancers manage their own videos'),
    ('000008','job_titles','job titles are readable unless the poster hid them'),
    ('000008','job_titles','employers insert titles for their own jobs'),
    ('000008','job_titles','employers update titles for their own jobs'),
    ('000008','job_titles','employers delete titles for their own jobs')
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
    ('000008','authenticated','job_titles','DELETE')
  ) as m(migration, role_name, tbl, priv);

  -- ---- functions -----------------------------------------------------------
  insert into migration_audit
  select m.migration, 'function', m.sig,
         case when to_regprocedure(m.sig) is null then 'MISSING' else 'ok' end
  from (values
    ('000004','public.normalize_zip(text)'),
    ('000004','public.zip_centroid(text)'),
    ('000004','public.resolve_employer_home_zip()'),
    ('000007','public.job_applicants(uuid)'),
    ('000008','public.job_feed(double precision, double precision, double precision, text)')
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
    ('000008','public.job_feed(double precision, double precision, double precision, text)')
  ) as m(migration, sig);

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
    ('000008','job_titles','job_titles_set_updated_at')
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

