-- Batch 4 — contact info on the employer company profile.
--
-- 4.1  Contact name, phone and email, required to complete the profile.
-- 4.2  LinkedIn, optional.
--
-- What already existed, and is therefore NOT duplicated here:
--
--   profiles.full_name           the person behind the account. Already
--                                required at signup and already displayed on
--                                the employer dashboard as "Hiring contact".
--                                That IS the contact name — a second name
--                                field would be the same fact twice.
--   employer_billing.billing_email   where invoices go. A different question
--                                from "who do we call", so it stays as it is
--                                and becomes optional in the form: blank means
--                                "same as the contact email".
--   job_contacts.*               the per-posting contact and its share toggle.
--                                Untouched — that is a different feature with
--                                a different privacy rule.
--
-- So the only genuinely missing facts are a phone number, a contact email
-- distinct from billing, and LinkedIn. Those are what this adds.
--
-- WHY A SEPARATE TABLE, not columns on employer_profiles:
--
-- employer_profiles is readable by every participating logged-in member — it
-- backs the public company page. RLS is row-level, so a policy cannot hide one
-- column of a row somebody may read. Putting a phone number there would
-- publish it to the whole membership, which is the opposite of the privacy
-- model's default. A field that must stay private needs its own table with its
-- own policy, exactly as freelancer_contacts and job_contacts already do.
--
-- ADDITIVE: every column is nullable and existing employers get a row seeded
-- from what is already known about them. "Required" is enforced by the profile
-- form, so nobody is locked out of an account that predates this.

create table public.employer_contacts (
  profile_id uuid primary key references public.employer_profiles (profile_id) on delete cascade,
  contact_phone text,
  contact_email text,
  linkedin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.employer_contacts is
  'Private company contact details. Owner-only: a freelancer reaches an '
  'employer through the per-job contact (job_contacts) and its share toggle, '
  'never through this. The contact NAME is profiles.full_name.';

comment on column public.employer_contacts.linkedin_url is
  'Optional. Shape is checked in the profile action rather than by a CHECK '
  'constraint, so a legitimate regional or vanity URL is never refused by the '
  'database.';

create trigger employer_contacts_set_updated_at
  before update on public.employer_contacts
  for each row execute function public.set_updated_at();

alter table public.employer_contacts enable row level security;

-- Owner-only, all three verbs. Deliberately no "readable by authenticated
-- users" policy: these details are not part of the public company page.
--
-- Batch 6.1/6.2 is where the moderator gets to read this, as its own reviewed
-- change. Until then nobody but the employer sees it.
create policy "employer contacts are owner-only"
  on public.employer_contacts for select
  to authenticated
  using (auth.uid() = profile_id);

create policy "employers insert their own contact row"
  on public.employer_contacts for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "employers update their own contact row"
  on public.employer_contacts for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- RLS narrows privileges; it never grants them. Without this every read raises
-- "permission denied for table".
grant select, insert, update on public.employer_contacts to authenticated;

-- ---------------------------------------------------------------------------
-- Seed and backfill
--
-- Same rule as 3.1: fill a MISSING or EMPTY value only. An address someone
-- typed is never overwritten, so this stays safe to re-run.
-- ---------------------------------------------------------------------------

insert into public.employer_contacts (profile_id, contact_email)
select ep.profile_id, nullif(u.email, '')
from public.employer_profiles ep
join auth.users u on u.id = ep.profile_id
on conflict (profile_id) do nothing;

update public.employer_contacts ec
set contact_email = nullif(u.email, '')
from auth.users u
where u.id = ec.profile_id
  and nullif(trim(coalesce(ec.contact_email, '')), '') is null;

-- New employers get the row at signup, so the profile form is never blank on
-- first visit. This is the treatment 20260801000012 flagged 4.1 would want.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role public.account_role;
  signup_status public.account_status;
  raw_invited_by text;
  invited_by_id uuid;
begin
  signup_role := coalesce(new.raw_user_meta_data ->> 'role', 'freelancer')::public.account_role;

  signup_status := case
    when signup_role = 'employer' then 'approved'::public.account_status
    else 'pending'::public.account_status
  end;

  -- An invite is a fast-track into the review queue, not a way around it, so
  -- signup_status is deliberately not touched here.
  raw_invited_by := new.raw_user_meta_data ->> 'invited_by';

  if raw_invited_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (select 1 from public.profiles where id = raw_invited_by::uuid)
  then
    invited_by_id := raw_invited_by::uuid;
  end if;

  insert into public.profiles (id, role, full_name, status, invited_by)
  values (
    new.id,
    signup_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    signup_status,
    invited_by_id
  );

  if signup_role = 'freelancer' then
    insert into public.freelancer_profiles (profile_id, home_zip, home_lat, home_lng)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'home_zip', ''), 0, 0);

    -- 3.1 — seed the contact row so the profile page has something to show
    -- from the first login, instead of an empty Contact card.
    insert into public.freelancer_contacts (profile_id, contact_email)
    values (new.id, nullif(new.email, ''))
    on conflict (profile_id) do nothing;
  else
    insert into public.employer_profiles (profile_id, company_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'company_name', ''));

    -- 4.1 — the company contact email, pre-filled from the address they signed
    -- up with. Editable afterwards; nothing re-asserts it.
    insert into public.employer_contacts (profile_id, contact_email)
    values (new.id, nullif(new.email, ''))
    on conflict (profile_id) do nothing;

    -- Where invoices go. Kept separate from the contact email above because
    -- they answer different questions.
    insert into public.employer_billing (profile_id, billing_email)
    values (new.id, nullif(new.email, ''))
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Post-conditions
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  if to_regclass('public.employer_contacts') is null then
    raise exception 'public.employer_contacts was not created';
  end if;

  select string_agg(col, ', ')
  into v_missing
  from unnest(array['contact_phone', 'contact_email', 'linkedin_url']) as col
  where not exists (
    select 1 from pg_attribute
    where attrelid = 'public.employer_contacts'::regclass
      and attname = col and not attisdropped
  );

  if v_missing is not null then
    raise exception 'employer_contacts is missing column(s): %', v_missing;
  end if;

  -- Additive: nothing may be NOT NULL, or an employer who predates this
  -- migration could not save their profile at all.
  select string_agg(attname, ', ')
  into v_missing
  from pg_attribute
  where attrelid = 'public.employer_contacts'::regclass
    and attnum > 0 and not attisdropped and attnotnull
    and attname <> 'profile_id'
    and attname not in ('created_at', 'updated_at');

  if v_missing is not null then
    raise exception 'employer_contacts column(s) are NOT NULL, which is not additive: %', v_missing;
  end if;

  if not exists (
    select 1 from pg_class where oid = 'public.employer_contacts'::regclass and relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.employer_contacts';
  end if;

  -- Every policy must pin the row to its owner. A stray permissive one would
  -- publish employer phone numbers to the whole membership.
  select string_agg(policyname, ', ')
  into v_missing
  from pg_policies
  where schemaname = 'public' and tablename = 'employer_contacts'
    and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%';

  if v_missing is not null then
    raise exception 'employer_contacts policies are not owner-only: %', v_missing;
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'employer_contacts') <> 3 then
    raise exception 'Expected exactly 3 policies on employer_contacts (select, insert, update)';
  end if;

  select string_agg(priv, ', ')
  into v_missing
  from unnest(array['select', 'insert', 'update']) as priv
  where not has_table_privilege('authenticated', 'public.employer_contacts', priv);

  if v_missing is not null then
    raise exception 'authenticated is missing % on employer_contacts', v_missing;
  end if;

  -- Employers stay auto-approved. This migration must not have introduced a
  -- gate: a fresh employer is still 'approved' the moment they sign up.
  if pg_get_functiondef(to_regprocedure('public.handle_new_user()'))
     not like '%when signup_role = ''employer'' then ''approved''%' then
    raise exception 'handle_new_user() no longer auto-approves employers';
  end if;

  -- ...and the trigger still seeds everything it did before, plus the new row.
  select string_agg(needle, ', ')
  into v_missing
  from unnest(array[
    'freelancer_contacts', 'employer_billing', 'employer_contacts', 'invited_by'
  ]) as needle
  where pg_get_functiondef(to_regprocedure('public.handle_new_user()')) not like '%' || needle || '%';

  if v_missing is not null then
    raise exception 'handle_new_user() no longer references: %', v_missing;
  end if;

  -- Every existing employer has a contact row, so nobody opens the profile
  -- form to a blank Contact section.
  if exists (
    select 1 from public.employer_profiles ep
    left join public.employer_contacts ec on ec.profile_id = ep.profile_id
    where ec.profile_id is null
  ) then
    raise exception 'an existing employer has no employer_contacts row';
  end if;
end $$;
