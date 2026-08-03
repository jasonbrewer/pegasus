-- Batch 3 — signup email lands on the profile, and approval is a visible event.
--
-- 3.1  The address someone signs up with becomes their profile contact email.
-- 3.3  Being approved is recorded, so the freelancer can be told about it.
--
-- Both need schema for the same underlying reason: the app cannot do either
-- from the client. auth.users is not readable by a normal session, and "this
-- account just moved from pending to approved" is a transition, not a state —
-- nothing on the row says it happened unless something writes it down.

-- ---------------------------------------------------------------------------
-- 3.1 — the signup email pre-fills the profile contact email
--
-- Written once, at signup, and never again. That is what "respect their edit"
-- means here: the trigger seeds the row, the profile form owns it afterwards,
-- and nothing re-asserts the auth address over the top. Someone whose work
-- email differs from their login email edits it once and it stays edited.
--
-- ON CONFLICT DO NOTHING on both inserts because the row may already exist for
-- an account created before this migration.
-- ---------------------------------------------------------------------------

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

    -- The employer side has no general contact email yet — billing_email is
    -- the only one that exists, and Batch 4 adds the real company contact
    -- fields. Seed what is here; 4.1 will want the same treatment.
    insert into public.employer_billing (profile_id, billing_email)
    values (new.id, nullif(new.email, ''))
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$$;

-- Backfill: everyone who signed up before this trigger existed. Deliberately
-- only fills a MISSING or EMPTY value — an address someone already typed is
-- never overwritten, in either the insert or the update below.
insert into public.freelancer_contacts (profile_id, contact_email)
select p.id, nullif(u.email, '')
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'freelancer'
on conflict (profile_id) do nothing;

update public.freelancer_contacts fc
set contact_email = nullif(u.email, '')
from auth.users u
where u.id = fc.profile_id
  and nullif(trim(coalesce(fc.contact_email, '')), '') is null;

insert into public.employer_billing (profile_id, billing_email)
select p.id, nullif(u.email, '')
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'employer'
on conflict (profile_id) do nothing;

update public.employer_billing eb
set billing_email = nullif(u.email, '')
from auth.users u
where u.id = eb.profile_id
  and nullif(trim(coalesce(eb.billing_email, '')), '') is null;

-- ---------------------------------------------------------------------------
-- 3.3 — approval is recorded, so it can be announced once
--
-- The banner must reach exactly one person: someone who was waiting and now
-- is not. A boolean "is approved" cannot express that — every employer is
-- approved from the moment they sign up, and every freelancer approved before
-- this migration is approved too. Neither of them just crossed the line.
--
-- So the column records the CROSSING, and is only ever set on the
-- pending -> approved transition. It stays null for:
--   - employers, who are approved at signup
--   - freelancers approved before this shipped (the backfill leaves it null)
--   - anyone unblocked (blocked -> approved is a restoration, not a welcome)
-- and every one of those sees nothing.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column approved_at timestamptz;

comment on column public.profiles.approved_at is
  'When this account crossed from pending to approved. Null for accounts that '
  'never waited. Drives the one-time "you have been approved" banner. Written '
  'only by public.admin_set_account_status().';

-- Not client-writable: the column-level UPDATE grant from 20260801000010 is
-- still (full_name, avatar_path) only, so this needs no further locking down.
-- Asserted below.

create or replace function public.admin_set_account_status(
  p_profile_id uuid,
  p_status public.account_status
)
returns public.account_status
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_role public.account_role;
  v_previous public.account_status;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'Admins cannot change their own account status'
      using errcode = 'check_violation';
  end if;

  select status into v_previous from public.profiles where id = p_profile_id;

  update public.profiles
     set status = p_status,
         -- Only the pending -> approved crossing. An unblock does not set it,
         -- and re-approving someone already approved does not re-set it.
         approved_at = case
           when p_status = 'approved' and v_previous = 'pending' then now()
           else approved_at
         end
   where id = p_profile_id
  returning role into v_role;

  if v_role is null then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;

  return p_status;
end;
$$;

comment on function public.admin_set_account_status(uuid, public.account_status) is
  'The only write path for profiles.status, and for approved_at. Admin-gated, '
  'refuses self-changes, and touches no other column.';

-- ---------------------------------------------------------------------------
-- Post-conditions
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'approved_at' and not attisdropped
  ) then
    raise exception 'profiles.approved_at was not created';
  end if;

  -- The banner would be a lie if a user could set this on themselves.
  if has_column_privilege('authenticated', 'public.profiles', 'approved_at', 'update') then
    raise exception 'authenticated can UPDATE profiles.approved_at — the approval banner is forgeable';
  end if;

  -- The trigger has to keep doing everything it did before, plus the seeding.
  select string_agg(needle, ', ')
  into v_missing
  from unnest(array['freelancer_contacts', 'employer_billing', 'signup_status', 'invited_by']) as needle
  where pg_get_functiondef(to_regprocedure('public.handle_new_user()')) not like '%' || needle || '%';

  if v_missing is not null then
    raise exception 'handle_new_user() no longer references: %', v_missing;
  end if;

  if pg_get_functiondef(to_regprocedure('public.admin_set_account_status(uuid, public.account_status)'))
     not like '%approved_at%' then
    raise exception 'admin_set_account_status() does not record approved_at';
  end if;

  -- The backfill must not have invented an approval for anyone.
  if exists (select 1 from public.profiles where approved_at is not null) then
    raise exception 'approved_at is set on an existing account — the banner would fire for someone who never waited';
  end if;

  -- ...and every account that has an email now has it on their profile.
  if exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.freelancer_contacts fc on fc.profile_id = p.id
    where p.role = 'freelancer'
      and nullif(u.email, '') is not null
      and nullif(trim(coalesce(fc.contact_email, '')), '') is null
  ) then
    raise exception 'a freelancer with a signup email still has no profile contact email';
  end if;

  if exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.employer_billing eb on eb.profile_id = p.id
    where p.role = 'employer'
      and nullif(u.email, '') is not null
      and nullif(trim(coalesce(eb.billing_email, '')), '') is null
  ) then
    raise exception 'an employer with a signup email still has no profile email';
  end if;
end $$;
