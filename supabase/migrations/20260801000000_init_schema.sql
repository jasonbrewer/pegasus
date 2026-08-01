-- Project Pegasus — v1 schema
-- Two-sided marketplace: freelancer profiles + employer job posts, geo-aware matching.

create extension if not exists "postgis";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, holds the account-type discriminator
-- ---------------------------------------------------------------------------

create type public.account_role as enum ('freelancer', 'employer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.account_role not null,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- roles — the job-role taxonomy. Seeded below; category drives geo matching:
--   on-location : must be physically present, tight radius
--   regional    : worth traveling for, wider ring, travel flagged
--   remote      : ships as files, not geo-walled, platform-wide
-- ---------------------------------------------------------------------------

create type public.role_category as enum ('on-location', 'regional', 'remote');

create table public.roles (
  slug text primary key,
  label text not null,
  category public.role_category not null,
  sort_order int not null default 0
);

insert into public.roles (slug, label, category, sort_order) values
  ('director-of-photography', 'Director of Photography (DP)', 'regional', 10),
  ('camera-operator',         'Camera Operator',               'on-location', 20),
  ('gaffer',                  'Gaffer',                        'on-location', 30),
  ('grip',                    'Grip',                          'on-location', 40),
  ('audio-sound-mixer',       'Audio / Sound Mixer',           'on-location', 50),
  ('drone-aerial-operator',   'Drone / Aerial Operator',       'regional', 60),
  ('editor',                  'Editor',                        'remote', 70),
  ('colorist',                'Colorist',                      'remote', 80),
  ('motion-vfx',              'Motion / VFX',                  'remote', 90),
  ('producer',                'Producer',                      'regional', 100),
  ('production-assistant',    'Production Assistant (PA)',     'on-location', 110);

-- ---------------------------------------------------------------------------
-- freelancer_profiles — extends profiles for role = 'freelancer'
-- ---------------------------------------------------------------------------

create table public.freelancer_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  day_rate_cents integer,
  home_zip text not null,
  home_lat double precision not null,
  home_lng double precision not null,
  home_location geography(Point, 4326)
    generated always as (
      st_setsrid(st_makepoint(home_lng, home_lat), 4326)::geography
    ) stored,
  travel_radius_miles integer not null default 25,
  reel_url text,
  portfolio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index freelancer_profiles_home_location_gix
  on public.freelancer_profiles using gist (home_location);

create trigger freelancer_profiles_set_updated_at
  before update on public.freelancer_profiles
  for each row execute function public.set_updated_at();

-- A freelancer can hold multiple roles from the taxonomy.
create table public.freelancer_roles (
  freelancer_id uuid not null references public.freelancer_profiles (profile_id) on delete cascade,
  role_slug text not null references public.roles (slug) on delete restrict,
  primary key (freelancer_id, role_slug)
);

create index freelancer_roles_role_slug_idx on public.freelancer_roles (role_slug);

-- ---------------------------------------------------------------------------
-- employer_profiles — extends profiles for role = 'employer'
-- billing fields are present but unused until Stripe goes live (v1 stub).
-- ---------------------------------------------------------------------------

create table public.employer_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  company_name text not null,
  billing_email text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger employer_profiles_set_updated_at
  before update on public.employer_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs — posted by employers. payment_* columns are stubbed for v1
-- (Stripe wiring lands later without a schema change).
-- ---------------------------------------------------------------------------

create type public.job_status as enum ('draft', 'open', 'closed');
create type public.rate_type as enum ('hourly', 'day', 'flat');
create type public.payment_status as enum ('unpaid', 'paid', 'waived');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employer_profiles (profile_id) on delete cascade,
  role_slug text not null references public.roles (slug) on delete restrict,
  title text not null,
  description text not null,
  location_zip text not null,
  location_lat double precision not null,
  location_lng double precision not null,
  location geography(Point, 4326)
    generated always as (
      st_setsrid(st_makepoint(location_lng, location_lat), 4326)::geography
    ) stored,
  travel_expected boolean not null default false,
  start_date date,
  end_date date,
  rate_cents integer,
  rate_type public.rate_type not null default 'day',
  status public.job_status not null default 'open',
  payment_status public.payment_status not null default 'unpaid',
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_location_gix on public.jobs using gist (location);
create index jobs_role_slug_idx on public.jobs (role_slug);
create index jobs_status_idx on public.jobs (status);
create index jobs_employer_id_idx on public.jobs (employer_id);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- applications — a freelancer applying to a job. Unlimited & free.
-- ---------------------------------------------------------------------------

create type public.application_status as enum ('submitted', 'shortlisted', 'rejected', 'hired');

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles (profile_id) on delete cascade,
  status public.application_status not null default 'submitted',
  cover_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, freelancer_id)
);

create index applications_job_id_idx on public.applications (job_id);
create index applications_freelancer_id_idx on public.applications (freelancer_id);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New-user provisioning — mirrors auth.users into profiles + role table
-- based on signup metadata: { role: 'freelancer' | 'employer', full_name }
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role public.account_role;
begin
  signup_role := coalesce(new.raw_user_meta_data ->> 'role', 'freelancer')::public.account_role;

  insert into public.profiles (id, role, full_name)
  values (new.id, signup_role, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.freelancer_profiles enable row level security;
alter table public.freelancer_roles enable row level security;
alter table public.employer_profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

-- roles: public reference data, read-only via API
create policy "roles are publicly readable"
  on public.roles for select
  using (true);

-- profiles: readable by any authenticated user (needed to show names on
-- job posts / applicant lists), writable only by the owner
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- freelancer_profiles: public directory (discoverability is the product),
-- mutations restricted to the owning freelancer
create policy "freelancer profiles are publicly readable"
  on public.freelancer_profiles for select
  using (true);

create policy "freelancers manage their own profile"
  on public.freelancer_profiles for update
  to authenticated
  using (auth.uid() = profile_id);

create policy "freelancers manage their own roles"
  on public.freelancer_roles for all
  to authenticated
  using (
    auth.uid() = freelancer_id
  )
  with check (
    auth.uid() = freelancer_id
  );

create policy "freelancer roles are publicly readable"
  on public.freelancer_roles for select
  using (true);

-- employer_profiles: readable by authenticated users (shown on job posts),
-- writable only by the owning employer
create policy "employer profiles are readable by authenticated users"
  on public.employer_profiles for select
  to authenticated
  using (true);

create policy "employers manage their own profile"
  on public.employer_profiles for update
  to authenticated
  using (auth.uid() = profile_id);

-- jobs: open jobs are publicly readable; employers manage their own,
-- including draft/closed ones
create policy "open jobs are publicly readable"
  on public.jobs for select
  using (status = 'open' or auth.uid() = employer_id);

create policy "employers create jobs for themselves"
  on public.jobs for insert
  to authenticated
  with check (auth.uid() = employer_id);

create policy "employers manage their own jobs"
  on public.jobs for update
  to authenticated
  using (auth.uid() = employer_id);

create policy "employers delete their own jobs"
  on public.jobs for delete
  to authenticated
  using (auth.uid() = employer_id);

-- applications: a freelancer sees/creates their own; an employer sees
-- applications to their own jobs and can update their status
create policy "freelancers view their own applications"
  on public.applications for select
  to authenticated
  using (auth.uid() = freelancer_id);

create policy "employers view applications to their jobs"
  on public.applications for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs
      where jobs.id = applications.job_id
      and jobs.employer_id = auth.uid()
    )
  );

create policy "freelancers apply to jobs"
  on public.applications for insert
  to authenticated
  with check (auth.uid() = freelancer_id);

create policy "employers update application status on their jobs"
  on public.applications for update
  to authenticated
  using (
    exists (
      select 1 from public.jobs
      where jobs.id = applications.job_id
      and jobs.employer_id = auth.uid()
    )
  );
