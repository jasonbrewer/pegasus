-- ZIP-centroid geocoding.
--
-- Replaces the 0,0 placeholder that the signup trigger previously wrote.
-- Every ZIP a user submits is resolved against this table; an unknown ZIP is
-- rejected rather than stored as 0,0, so job_feed() ranks on real distances.
--
-- Precision is ZIP-centroid level by design (see README) — good enough for
-- "who is near me" ranking, not for street-address accuracy.
--
-- Seed this table before signup will work: npm run seed:zips
-- (see scripts/seed-zip-codes.mjs and data/us-zip-centroids.csv)

create table public.zip_codes (
  zip text primary key,
  lat double precision not null,
  lng double precision not null,
  city text,
  state text,
  geog geography(Point, 4326)
    generated always as (
      st_setsrid(st_makepoint(lng, lat), 4326)::geography
    ) stored
);

create index zip_codes_geog_gix on public.zip_codes using gist (geog);
create index zip_codes_state_idx on public.zip_codes (state);

-- Public reference data: readable by anyone (signup needs to validate a ZIP
-- before the user has a session), writable only by the service role, which
-- bypasses RLS.
alter table public.zip_codes enable row level security;

create policy "zip codes are publicly readable"
  on public.zip_codes for select
  using (true);

-- ---------------------------------------------------------------------------
-- Centroid lookup. Normalizes ZIP+4 ("23220-1234") down to the 5-digit code.
-- Returns null when the ZIP is not a known US ZIP.
-- ---------------------------------------------------------------------------

create function public.normalize_zip(p_zip text)
returns text
language sql
immutable
as $$
  select nullif(substring(regexp_replace(coalesce(p_zip, ''), '[^0-9]', '', 'g') from 1 for 5), '');
$$;

create function public.zip_centroid(p_zip text)
returns public.zip_codes
language sql
stable
as $$
  select * from public.zip_codes where zip = public.normalize_zip(p_zip);
$$;

grant execute on function public.normalize_zip(text) to authenticated, anon;
grant execute on function public.zip_centroid(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Signup provisioning — now resolves the freelancer's home ZIP to a real
-- centroid instead of inserting 0,0, and rejects an unknown ZIP outright.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role public.account_role;
  v_zip text;
  v_centroid public.zip_codes;
begin
  signup_role := coalesce(new.raw_user_meta_data ->> 'role', 'freelancer')::public.account_role;

  insert into public.profiles (id, role, full_name)
  values (new.id, signup_role, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  if signup_role = 'freelancer' then
    v_zip := public.normalize_zip(new.raw_user_meta_data ->> 'home_zip');

    if v_zip is null then
      raise exception 'Enter a valid US ZIP code'
        using errcode = 'check_violation';
    end if;

    v_centroid := public.zip_centroid(v_zip);

    if v_centroid.zip is null then
      raise exception 'Enter a valid US ZIP code'
        using errcode = 'check_violation';
    end if;

    insert into public.freelancer_profiles (profile_id, home_zip, home_lat, home_lng)
    values (new.id, v_centroid.zip, v_centroid.lat, v_centroid.lng);
  else
    insert into public.employer_profiles (profile_id, company_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'company_name', ''));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keep lat/lng authoritative: whenever a ZIP is written or changed, the
-- coordinates are re-derived from zip_codes rather than trusted from the
-- client. An unknown ZIP raises instead of silently storing garbage.
-- ---------------------------------------------------------------------------

create function public.resolve_freelancer_home_zip()
returns trigger
language plpgsql
as $$
declare
  v_centroid public.zip_codes;
begin
  if tg_op = 'UPDATE' and new.home_zip is not distinct from old.home_zip then
    return new;
  end if;

  v_centroid := public.zip_centroid(new.home_zip);

  if v_centroid.zip is null then
    raise exception 'Enter a valid US ZIP code'
      using errcode = 'check_violation';
  end if;

  new.home_zip := v_centroid.zip;
  new.home_lat := v_centroid.lat;
  new.home_lng := v_centroid.lng;
  return new;
end;
$$;

create trigger freelancer_profiles_resolve_zip
  before insert or update of home_zip on public.freelancer_profiles
  for each row execute function public.resolve_freelancer_home_zip();

create function public.resolve_job_location_zip()
returns trigger
language plpgsql
as $$
declare
  v_centroid public.zip_codes;
begin
  if tg_op = 'UPDATE' and new.location_zip is not distinct from old.location_zip then
    return new;
  end if;

  v_centroid := public.zip_centroid(new.location_zip);

  if v_centroid.zip is null then
    raise exception 'Enter a valid US ZIP code'
      using errcode = 'check_violation';
  end if;

  new.location_zip := v_centroid.zip;
  new.location_lat := v_centroid.lat;
  new.location_lng := v_centroid.lng;
  return new;
end;
$$;

create trigger jobs_resolve_location_zip
  before insert or update of location_zip on public.jobs
  for each row execute function public.resolve_job_location_zip();
