-- Group 1 — data foundation.
--
-- 1.1  Add "3D Motion / Blender Artist" to the role taxonomy.
-- 1.2  RLS pass so every table matches THE PRIVACY MODEL:
--        * everything behind login; "public" means "any logged-in user"
--        * poster contact info private by default, shareable per job
--        * seeker contact info visible to the seeker, and to an employer
--          only once the seeker has applied to one of that employer's jobs
--        * applications readable only by the applicant and the job's employer
--
-- Postgres RLS is row-level, not column-level: a policy cannot hide one column
-- of an otherwise-readable row. Contact information therefore lives in its own
-- tables, one row per parent, so that "who may read these fields" is expressible
-- as a row policy. That is the only way to make the model actually hold against
-- a direct PostgREST call rather than merely hiding fields in the UI.

-- ---------------------------------------------------------------------------
-- 1.1 — Role taxonomy addition
--
-- NOTE: the app renders role pickers from src/lib/roles.ts, not from this
-- table, so this insert alone does NOT make the role appear in dropdowns.
-- The mirrored constant is updated in the same commit.
-- ---------------------------------------------------------------------------

insert into public.roles (slug, label, category, role_group, sort_order) values
  ('3d-motion-blender-artist', '3D Motion / Blender Artist', 'remote', 'Post-Production', 195)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 1.2a — roles: public reference data (verify + make the grant explicit)
--
-- The existing policy was created without a `to` clause, which grants it to
-- PUBLIC. That already covers anon and authenticated; recreating it names the
-- roles explicitly so the intent is legible next to every other policy here.
-- ---------------------------------------------------------------------------

drop policy if exists "roles are publicly readable" on public.roles;

create policy "roles are readable by anon and authenticated"
  on public.roles for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 1.2b — jobs: verified, no change required.
--
-- Already in place from 20260801000003:
--   select  to authenticated  using (status = 'open' or auth.uid() = employer_id)
--   insert  to authenticated  with check (auth.uid() = employer_id)
--   update  to authenticated  using (auth.uid() = employer_id)
--   delete  to authenticated  using (auth.uid() = employer_id)
--
-- This satisfies "read for authenticated only; write restricted to the owning
-- employer", and additionally keeps draft/closed jobs owner-only. Task 5.2
-- (owner-only delete) is already enforced by the delete policy above.

-- ---------------------------------------------------------------------------
-- 1.2c — applications: verified, no change required.
--
-- Already in place from 20260801000000:
--   select  applicant  (auth.uid() = freelancer_id)
--   select  employer   (job belongs to auth.uid())
--   insert  applicant  (auth.uid() = freelancer_id)
--   update  employer   (job belongs to auth.uid())
--
-- Matches "readable only by the applicant who made it and the employer who
-- owns the job. No one else."

-- ---------------------------------------------------------------------------
-- 1.2d — Freelancer contact info
--
-- freelancer_profiles keeps the PUBLIC fields (bio, rates, roles, city/state
-- via ZIP, reel links) readable by any logged-in user, unchanged. Contact
-- details move here so they can carry a stricter policy.
-- ---------------------------------------------------------------------------

create table public.freelancer_contacts (
  profile_id uuid primary key references public.freelancer_profiles (profile_id) on delete cascade,
  phone text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger freelancer_contacts_set_updated_at
  before update on public.freelancer_contacts
  for each row execute function public.set_updated_at();

alter table public.freelancer_contacts enable row level security;

-- Visible to the seeker themselves, and to an employer only once the seeker
-- has applied to one of that employer's jobs. Never browsable otherwise.
create policy "freelancer contacts visible to owner and applied-to employers"
  on public.freelancer_contacts for select
  to authenticated
  using (
    auth.uid() = profile_id
    or exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.freelancer_id = freelancer_contacts.profile_id
        and j.employer_id = auth.uid()
    )
  );

create policy "freelancers insert their own contact info"
  on public.freelancer_contacts for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "freelancers update their own contact info"
  on public.freelancer_contacts for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "freelancers delete their own contact info"
  on public.freelancer_contacts for delete
  to authenticated
  using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 1.2e — Job poster contact info
--
-- Private by default; the poster may toggle sharing per job. The toggle lives
-- on this row, so a non-sharing job simply yields no row to an applicant.
--
-- "Contact info is REQUIRED to post" is enforced in the post-a-job form
-- (task 5.1), not here: existing jobs predate this table, so a NOT NULL
-- requirement at the job level would invalidate them. contact_name is NOT NULL
-- within this table, so a contact row can never be half-populated.
-- ---------------------------------------------------------------------------

create table public.job_contacts (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  share_with_applicants boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger job_contacts_set_updated_at
  before update on public.job_contacts
  for each row execute function public.set_updated_at();

alter table public.job_contacts enable row level security;

-- The owning employer always sees their own contact row. A logged-in
-- freelancer sees it only when sharing is toggled on AND they have actually
-- applied to that job.
create policy "job contacts visible to owner and, when shared, to applicants"
  on public.job_contacts for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_contacts.job_id
        and j.employer_id = auth.uid()
    )
    or (
      share_with_applicants
      and exists (
        select 1 from public.applications a
        where a.job_id = job_contacts.job_id
          and a.freelancer_id = auth.uid()
      )
    )
  );

create policy "employers insert contact info for their own jobs"
  on public.job_contacts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_contacts.job_id
        and j.employer_id = auth.uid()
    )
  );

create policy "employers update contact info for their own jobs"
  on public.job_contacts for update
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_contacts.job_id
        and j.employer_id = auth.uid()
    )
  );

create policy "employers delete contact info for their own jobs"
  on public.job_contacts for delete
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_contacts.job_id
        and j.employer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 1.2f — Employer billing/contact fields currently leak
--
-- employer_profiles is readable by every logged-in user, and it carries
-- billing_email and stripe_customer_id. Under the privacy model the poster's
-- contact details are private by default, so those two columns are moved to an
-- owner-only table. Company name, description, website and location stay on
-- employer_profiles and remain visible to all logged-in users — the model
-- requires the company/network to always be shown.
-- ---------------------------------------------------------------------------

create table public.employer_billing (
  profile_id uuid primary key references public.employer_profiles (profile_id) on delete cascade,
  billing_email text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger employer_billing_set_updated_at
  before update on public.employer_billing
  for each row execute function public.set_updated_at();

insert into public.employer_billing (profile_id, billing_email, stripe_customer_id)
select profile_id, billing_email, stripe_customer_id
from public.employer_profiles;

alter table public.employer_profiles
  drop column billing_email,
  drop column stripe_customer_id;

alter table public.employer_billing enable row level security;

create policy "employer billing is owner-only"
  on public.employer_billing for select
  to authenticated
  using (auth.uid() = profile_id);

create policy "employers insert their own billing row"
  on public.employer_billing for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "employers update their own billing row"
  on public.employer_billing for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Keep the signup trigger's contract intact now that the columns have moved:
-- every new employer gets an (empty) billing row alongside their profile.
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

    insert into public.freelancer_contacts (profile_id)
    values (new.id);
  else
    insert into public.employer_profiles (profile_id, company_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'company_name', ''));

    insert into public.employer_billing (profile_id)
    values (new.id);
  end if;

  return new;
end;
$$;
