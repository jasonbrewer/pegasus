-- Proximity-weighted job feed for a freelancer.
--
-- Role-aware geo behavior:
--   remote roles      -> always included, distance_miles is null, ranked last
--   on-location/regional roles -> ranked by distance from the freelancer's
--                                  home point; radius_miles widens the search,
--                                  it never hard-excludes (soft wall)
--
-- p_lat/p_lng: the searching freelancer's location (or any point picked in the UI)
-- p_radius_miles: how wide to search on-location/regional jobs; null = no cap
-- p_role_slug: optional filter to a single taxonomy role

create or replace function public.job_feed(
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
    j.title,
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

-- Proximity-ranked applicant list for an employer's job.
create or replace function public.job_applicants(p_job_id uuid)
returns table (
  application_id uuid,
  freelancer_id uuid,
  full_name text,
  status public.application_status,
  distance_miles double precision,
  cover_note text,
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
    a.created_at
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.roles r on r.slug = j.role_slug
  join public.freelancer_profiles fp on fp.profile_id = a.freelancer_id
  join public.profiles p on p.id = a.freelancer_id
  where a.job_id = p_job_id
    and j.employer_id = auth.uid()
  order by distance_miles asc nulls last, a.created_at asc;
$$;

grant execute on function public.job_applicants(uuid) to authenticated;
