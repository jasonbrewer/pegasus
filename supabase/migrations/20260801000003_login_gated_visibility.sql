-- Login-gated marketplace.
--
-- 1. Adds employer location/description/website columns (additive only —
--    no existing column is altered or dropped).
-- 2. Tightens SELECT policies so nothing about freelancers, employers, or
--    jobs is visible to anonymous visitors.
--
-- public.roles and public.zip_codes intentionally stay anon-readable: the
-- role taxonomy is static reference data, and signup has to validate a ZIP
-- *before* the user has a session — locking zip_codes would break sign-up.

-- ---------------------------------------------------------------------------
-- 1. Employer profile: location, description, website
-- ---------------------------------------------------------------------------

alter table public.employer_profiles
  add column home_zip text,
  add column home_lat double precision,
  add column home_lng double precision,
  add column description text,
  add column website text;

-- Nullable by design: accounts created before this migration (and any created
-- by the signup trigger, which doesn't collect an employer ZIP) have no
-- location until the employer edits their profile. st_makepoint is STRICT, so
-- the generated column is null whenever the coordinates are.
alter table public.employer_profiles
  add column home_location geography(Point, 4326)
    generated always as (
      st_setsrid(st_makepoint(home_lng, home_lat), 4326)::geography
    ) stored;

create index employer_profiles_home_location_gix
  on public.employer_profiles using gist (home_location);

-- Same contract as freelancer_profiles / jobs: coordinates are re-derived
-- server-side from the ZIP and never accepted from the client. Clearing the
-- ZIP clears the coordinates; an unknown ZIP raises.
create function public.resolve_employer_home_zip()
returns trigger
language plpgsql
as $$
declare
  v_zip text;
  v_centroid public.zip_codes;
begin
  if tg_op = 'UPDATE' and new.home_zip is not distinct from old.home_zip then
    return new;
  end if;

  v_zip := public.normalize_zip(new.home_zip);

  if v_zip is null then
    -- Treat blank/absent as "no location set" rather than an error, since the
    -- column is optional for employers.
    if nullif(trim(coalesce(new.home_zip, '')), '') is not null then
      raise exception 'Enter a valid US ZIP code' using errcode = 'check_violation';
    end if;
    new.home_zip := null;
    new.home_lat := null;
    new.home_lng := null;
    return new;
  end if;

  v_centroid := public.zip_centroid(v_zip);

  if v_centroid.zip is null then
    raise exception 'Enter a valid US ZIP code' using errcode = 'check_violation';
  end if;

  new.home_zip := v_centroid.zip;
  new.home_lat := v_centroid.lat;
  new.home_lng := v_centroid.lng;
  return new;
end;
$$;

create trigger employer_profiles_resolve_zip
  before insert or update of home_zip on public.employer_profiles
  for each row execute function public.resolve_employer_home_zip();

-- ---------------------------------------------------------------------------
-- 2. Login-gate every read of freelancer, employer, and job data.
--
-- The policies replaced below were written with `using (true)` and no `to`
-- clause, which grants them to every role including anon. Recreating them
-- `to authenticated` is what actually closes the door.
-- ---------------------------------------------------------------------------

drop policy "freelancer profiles are publicly readable" on public.freelancer_profiles;

create policy "freelancer profiles are readable by authenticated users"
  on public.freelancer_profiles for select
  to authenticated
  using (true);

drop policy "freelancer roles are publicly readable" on public.freelancer_roles;

create policy "freelancer roles are readable by authenticated users"
  on public.freelancer_roles for select
  to authenticated
  using (true);

drop policy "open jobs are publicly readable" on public.jobs;

create policy "jobs are readable by authenticated users"
  on public.jobs for select
  to authenticated
  using (status = 'open' or auth.uid() = employer_id);

-- profiles and employer_profiles were already scoped `to authenticated`; the
-- owner-write policies and the application-privacy policies are untouched.
