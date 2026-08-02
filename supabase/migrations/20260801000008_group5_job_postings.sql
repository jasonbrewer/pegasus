-- Group 5 — job postings.
--
-- 5.1  Company/network (required, always shown), project title (required, one
--      hide toggle), contact info (required to post, one share toggle).
-- 5.2  Owner-only hard delete that cascades cleanly.
-- 5.3  No schema change (applicant cards link to profiles).
--
-- The two toggles are the ONLY per-post privacy switches. Every other detail
-- field is always shown to logged-in users, so nothing else here carries a
-- visibility flag.
--
-- Both toggles are enforced in the database, not in the app. RLS is row-level:
-- a policy cannot hide one column of a row you are allowed to read. So a field
-- that must sometimes be invisible has to live in its own table with its own
-- policy — the same shape already used for job_contacts in
-- 20260801000004_group1_data_foundation.sql. Leaving the title on jobs and
-- masking it in TypeScript would leave the raw value readable through a direct
-- PostgREST call, which is exactly the drift this avoids.

-- ---------------------------------------------------------------------------
-- 5.1a — Company / network
--
-- Always shown to logged-in users, so it lives on jobs alongside the other
-- always-visible fields. Per job rather than per employer: a production company
-- often posts on behalf of a client or network, and that is what the applicant
-- needs to see.
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column company_network text;

-- Backfill existing rows from the posting employer before the NOT NULL lands.
update public.jobs j
set company_network = nullif(trim(ep.company_name), '')
from public.employer_profiles ep
where ep.profile_id = j.employer_id;

update public.jobs
set company_network = 'Unspecified'
where company_network is null;

alter table public.jobs
  alter column company_network set not null;

comment on column public.jobs.company_network is
  'Who the applicant would be working for. Always visible to logged-in users; '
  'inaccurate values are grounds for deleting the post.';

-- ---------------------------------------------------------------------------
-- 5.1b — Project title, with the hide toggle
--
-- Required, so title is NOT NULL here. Public by default; when is_private is
-- set, only the owning employer can read the row and everyone else gets no
-- row back at all.
-- ---------------------------------------------------------------------------

create table public.job_titles (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  title text not null,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger job_titles_set_updated_at
  before update on public.job_titles
  for each row execute function public.set_updated_at();

-- Carry the existing titles across before the column is dropped.
insert into public.job_titles (job_id, title)
select id, title from public.jobs;

alter table public.jobs
  drop column title;

alter table public.job_titles enable row level security;

create policy "job titles are readable unless the poster hid them"
  on public.job_titles for select
  to authenticated
  using (
    not is_private
    or exists (
      select 1 from public.jobs j
      where j.id = job_titles.job_id
        and j.employer_id = auth.uid()
    )
  );

create policy "employers insert titles for their own jobs"
  on public.job_titles for insert
  to authenticated
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_titles.job_id
        and j.employer_id = auth.uid()
    )
  );

create policy "employers update titles for their own jobs"
  on public.job_titles for update
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_titles.job_id
        and j.employer_id = auth.uid()
    )
  );

create policy "employers delete titles for their own jobs"
  on public.job_titles for delete
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_titles.job_id
        and j.employer_id = auth.uid()
    )
  );

-- RLS narrows privileges; it never grants them. Without this every read raises
-- "permission denied for table".
grant select, insert, update, delete on public.job_titles to authenticated;

-- ---------------------------------------------------------------------------
-- 5.2 — Owner-only hard delete, cascading cleanly
--
-- Already satisfied by existing DDL; asserted here so a regression fails the
-- migration rather than surfacing as a foreign-key error at delete time:
--   applications.job_id -> jobs(id) ON DELETE CASCADE  (20260801000000)
--   job_contacts.job_id -> jobs(id) ON DELETE CASCADE  (20260801000004)
--   job_titles.job_id   -> jobs(id) ON DELETE CASCADE  (above)
-- and the owner-only delete policy "employers delete their own jobs"
-- (20260801000000) with using (auth.uid() = employer_id).
-- ---------------------------------------------------------------------------

do $$
declare
  missing text;
begin
  select string_agg(t.name, ', ')
  into missing
  from (values
    ('applications'), ('job_contacts'), ('job_titles')
  ) as t(name)
  where not exists (
    select 1
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    where c.contype = 'f'
      and child.relname = t.name
      and parent.relname = 'jobs'
      and c.confdeltype = 'c'   -- 'c' = ON DELETE CASCADE
  );

  if missing is not null then
    raise exception 'Deleting a job would fail: no ON DELETE CASCADE to jobs from: %', missing;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and cmd = 'DELETE'
  ) then
    raise exception 'No DELETE policy on public.jobs — delete would be owner-unrestricted or blocked';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- job_feed() — title moved, company_network added
--
-- The function is SECURITY INVOKER, so the LEFT JOIN below is filtered by the
-- caller's own RLS: a hidden title simply comes back NULL. That is what keeps
-- the toggle honest without any check in application code.
--
-- OUT columns changed, so the function must be dropped rather than replaced,
-- and its EXECUTE grant re-issued.
-- ---------------------------------------------------------------------------

drop function if exists public.job_feed(double precision, double precision, double precision, text);

create function public.job_feed(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision default null,
  p_role_slug text default null
)
returns table (
  id uuid,
  employer_id uuid,
  role_slug text,
  role_category public.role_category,
  title text,
  company_network text,
  description text,
  location_zip text,
  travel_expected boolean,
  start_date date,
  end_date date,
  rate_cents integer,
  rate_type public.rate_type,
  status public.job_status,
  distance_miles double precision,
  created_at timestamptz
)
language sql
stable
as $$
  select
    j.id,
    j.employer_id,
    j.role_slug,
    r.category as role_category,
    jt.title,
    j.company_network,
    j.description,
    j.location_zip,
    j.travel_expected,
    j.start_date,
    j.end_date,
    j.rate_cents,
    j.rate_type,
    j.status,
    case
      when r.category = 'remote' then null
      else st_distance(j.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1609.344
    end as distance_miles,
    j.created_at
  from public.jobs j
  join public.roles r on r.slug = j.role_slug
  left join public.job_titles jt on jt.job_id = j.id
  where j.status = 'open'
    and (p_role_slug is null or j.role_slug = p_role_slug)
    and (
      r.category = 'remote'
      or p_radius_miles is null
      or st_dwithin(j.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_miles * 1609.344)
    )
  order by
    (r.category = 'remote') asc,
    distance_miles asc nulls last,
    j.created_at desc;
$$;

grant execute on function public.job_feed(double precision, double precision, double precision, text) to authenticated, anon;
