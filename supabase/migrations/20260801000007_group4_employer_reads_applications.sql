-- Group 4.2 — the employer reads each applicant's message and credits.
--
-- job_applicants() already returned the message (cover_note); this adds the
-- styled credits that 4.1 started storing, so the employer sees both without
-- a second query per applicant.
--
-- Postgres cannot change a function's OUT columns via CREATE OR REPLACE, so
-- the function is dropped and recreated. Everything else is carried over
-- unchanged: security definer, the employer-ownership filter, and the
-- proximity ordering with remote roles last.
--
-- Dropping a function also drops its grants, so EXECUTE is re-granted below.

drop function if exists public.job_applicants(uuid);

create function public.job_applicants(p_job_id uuid)
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
    -- The ownership check is what makes security definer safe here: a caller
    -- only ever sees applicants for jobs they own.
    and j.employer_id = auth.uid()
  order by distance_miles asc nulls last, a.created_at asc;
$$;

grant execute on function public.job_applicants(uuid) to authenticated;
