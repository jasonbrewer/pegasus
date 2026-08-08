-- Batch 7 — lead capture for the public scope tool at /scope.
--
-- One table (public.scope_sessions), one enum, one function. A signed-out
-- visitor answers the scoping questions, the tool saves what they said as they
-- go, and a producer calls the warm ones back.
--
-- ===========================================================================
-- THE SECURITY SHAPE, UP FRONT — read this before the DDL.
--
-- This is the first table in the product that an ANONYMOUS caller writes to,
-- so the rule is stated plainly and then enforced three different ways:
--
--   * `anon` holds NO privilege on public.scope_sessions. Not SELECT, not
--     INSERT, not UPDATE, not DELETE. A leaked anon key plus PostgREST cannot
--     reach this table at all — there is nothing to reach it with.
--   * `authenticated` holds SELECT and nothing else, and the only SELECT
--     policy on the table is `current_user_is_admin()`. An ordinary logged-in
--     member reads zero rows. There is no public SELECT, and no route to one.
--   * The single write path, for anonymous and logged-in visitors alike, is
--     public.record_scope_session() — SECURITY DEFINER, `returns void`, and
--     able to touch exactly one row: the one whose session_id it was handed.
--
-- WHY A FUNCTION AND NOT AN ANON INSERT/UPDATE POLICY.
--
-- The obvious design is a pair of policies —
--     for insert to anon with check (session_id = <the caller's session>)
--     for update to anon using  (session_id = <the caller's session>)
-- — and no SELECT policy, so nobody anonymous can read. That design does not
-- work, and it fails silently rather than loudly, which is worse.
--
-- PostgREST turns "save my session" into `update scope_sessions set … where
-- session_id = $1`. Per CREATE POLICY's "Policies Applied by Command Type",
-- an UPDATE whose WHERE clause reads a column of the table needs read access
-- to the existing row, so the SELECT policies are applied on top of the UPDATE
-- policy. With no SELECT policy the row is invisible, the UPDATE matches
-- nothing, and PostgREST returns a cheerful 204. Verified on Postgres 16:
-- `UPDATE 0`, every time. The upsert spelling fails too — INSERT … ON CONFLICT
-- DO UPDATE needs table-level SELECT *and* sight of the conflicting row, and
-- raises "new row violates row-level security policy" without it.
--
-- So "anon may UPDATE its own row" and "anon may never SELECT" cannot both be
-- true of a policy-only design. Something has to hold the write privilege that
-- the visitor does not, and that something is this function. It is the same
-- guarantee expressed where it can actually hold: one row per call, named by
-- session_id, no row ever returned to the caller.
--
-- WHAT SCOPES A WRITE TO "YOUR OWN" ROW.
--
-- The session_id is a v4 uuid minted server-side when the session starts, kept
-- in an httpOnly cookie, and never rendered into the page, the URL or the DOM.
-- The browser cannot choose it and script cannot read it, so a visitor has no
-- way to name another visitor's row through the product. Guessing one is 122
-- bits of entropy, and a correct guess still buys nothing readable: the
-- function returns void, so it cannot be used as an oracle. It is a capability
-- token, and it is the only thing this table's write path trusts.
--
-- Two further narrowings inside the function, because a capability token is a
-- floor and not a ceiling:
--   * user_id is NEVER a parameter. It is auth.uid(), stamped once, and once
--     stamped it can never be re-pointed at a different account.
--   * once a session has been claimed by an account, only that account may
--     keep writing it. An anonymous caller holding the token is refused.
--
-- WHAT IS DELIBERATELY NOT HERE: any IP geolocation, any silent inference of
-- where the visitor is. shoot_location is populated from the question the tool
-- asks and from nothing else. That is a product promise, so it is worth saying
-- in the schema: there is no column here for a derived location, and no
-- migration should add one.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Which end CTA the visitor pressed. NULL is the third state — "neither", the
-- abandoner — so it is absent from the enum rather than spelled 'none'.
-- ---------------------------------------------------------------------------

create type public.scope_cta as enum ('call_me', 'signup');

comment on type public.scope_cta is
  'The end CTA of the public scope tool. NULL means neither was pressed.';

-- ---------------------------------------------------------------------------
-- The table
--
-- Every answer column is nullable, on purpose. The row is created the moment
-- the tool opens, with nothing in it but a session_id, and fills in as the
-- visitor answers. Someone who types a budget and then closes the tab has
-- still left the budget behind — which is the entire point of writing as we go
-- rather than on submit.
--
-- The length checks are not validation, they are a size ceiling: this table is
-- writable by the public, and without them it is free blob storage.
-- ---------------------------------------------------------------------------

create table public.scope_sessions (
  id uuid primary key default gen_random_uuid(),

  -- The capability token described above. Unique because a session is one row,
  -- which is what makes "save each answer as they go" an update and not a
  -- second row.
  session_id uuid not null unique,

  -- Set when the visitor is (or becomes) a member, so an anonymous scoping
  -- session links to the real account. ON DELETE SET NULL: losing the account
  -- must not take the lead with it.
  user_id uuid references public.profiles (id) on delete set null,

  making_type text,

  -- THE WHOLE INTAKE, exactly as the tool holds it, in the tool's own
  -- vocabulary:
  --
  --   {"making":"Brand video","onCamera":"conversation","destination":"website",
  --    "polish":"standard","count":"4","each":"3","filming":"two","hire":"local",
  --    "distance":"near","shootLocation":"Richmond, VA",
  --    "secondCam":"no","audio":"unsure","drone":"yes","graphics":"no"}
  --
  -- Not just the four judgment checkboxes. The point of this table is that a
  -- producer opens one row and has the whole briefing before they dial, and an
  -- abandoned session is the one thing that can never be backfilled — so
  -- everything the visitor told us is kept the first time.
  --
  -- jsonb rather than a column per question because the intake is the tool's
  -- to change: engine.ts adds an option or a question and this keeps working
  -- with no migration. The keys and values ARE engine.ts's — MAKING, QUESTIONS,
  -- POLISH, COUNT_OPTS, LEN_OPTS, CHECKLIST — so `answers->>'hire' = 'import'`
  -- groups cleanly and keeps meaning after the on-screen wording is reworded.
  -- Two keys are codes rather than prose: `count` and `each` are the buckets
  -- from COUNT_OPTS / LEN_OPTS ("4" = a handful, 4–6; "3" = a few minutes).
  --
  -- making and shootLocation are deliberately in here AS WELL as in their own
  -- columns. The columns are for querying; this is a faithful snapshot of what
  -- was on screen, and it should not need a second column to be legible.
  answers jsonb,
  -- The city / metro / zip they typed. NULL means they skipped it, or never
  -- got that far — last_step_reached tells the two apart.
  shoot_location text,
  budget_input text,
  computed_estimate integer,
  cta_clicked public.scope_cta,

  contact_name text,
  contact_email text,
  contact_phone text,

  -- {"referrer":"…","utm_source":"…",…}, as sent by the page. Marketing
  -- attribution for us; nothing here identifies the visitor.
  referral_source jsonb,

  -- The furthest step the visitor got to, so the ones who leave say where the
  -- tool lost them. Written zero-padded and sortable — "03/06 The shoot" — so
  -- the high-water rule below is a plain greatest() and a funnel is one
  -- group-by.
  last_step_reached text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint scope_sessions_sane_lengths check (
    length(coalesce(making_type, '')) <= 120
    and length(coalesce(shoot_location, '')) <= 160
    and length(coalesce(budget_input, '')) <= 40
    and length(coalesce(contact_name, '')) <= 120
    and length(coalesce(contact_email, '')) <= 200
    and length(coalesce(contact_phone, '')) <= 40
    and length(coalesce(last_step_reached, '')) <= 80
    and octet_length(coalesce(answers, '{}'::jsonb)::text) <= 4000
    and octet_length(coalesce(referral_source, '{}'::jsonb)::text) <= 2000
  ),

  constraint scope_sessions_sane_estimate check (
    computed_estimate is null
    or (computed_estimate >= 0 and computed_estimate <= 10000000)
  )
);

comment on table public.scope_sessions is
  'One row per visit to the public scope tool at /scope. Written only by '
  'public.record_scope_session(); read only by admins. No public SELECT.';

comment on column public.scope_sessions.session_id is
  'Anonymous capability token, minted server-side at session start and kept in '
  'an httpOnly cookie. Naming it is what authorises a write to this row.';

comment on column public.scope_sessions.user_id is
  'Stamped from auth.uid() when the visitor is or becomes a member. Set once, '
  'never re-pointed. Never accepted as a parameter.';

comment on column public.scope_sessions.answers is
  'The complete intake, in engine.ts''s own vocabulary — every question the '
  'tool asked, not only the judgment checklist. Keys and values come from '
  'MAKING / QUESTIONS / POLISH / COUNT_OPTS / LEN_OPTS / CHECKLIST, so they '
  'survive on-screen rewording. This is the pre-call briefing.';

comment on column public.scope_sessions.shoot_location is
  'Exactly what the visitor typed into "Where''s the shoot?". Never derived '
  'from an IP address or any other signal — see the header of this migration.';

comment on column public.scope_sessions.last_step_reached is
  'High-water mark, not the current step: going Back does not lower it. '
  'Format "NN/NN Step title", zero-padded so it sorts in step order.';

create index scope_sessions_created_at_idx
  on public.scope_sessions (created_at desc);

create index scope_sessions_user_id_idx
  on public.scope_sessions (user_id)
  where user_id is not null;

-- The call list: warm leads, newest first. Partial, because it is the only
-- query anyone runs against this table by hand.
create index scope_sessions_call_me_idx
  on public.scope_sessions (created_at desc)
  where cta_clicked = 'call_me';

create trigger scope_sessions_set_updated_at
  before update on public.scope_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Supabase's default privileges hand every new table in `public` to anon and
-- authenticated with ALL. So the revoke below is the load-bearing statement of
-- this migration, not a formality — without it the table ships world-writable
-- and world-readable, and the policies below would be the only thing between
-- a stranger and every lead's phone number.
--
-- 00_harness.sql applies those same default grants, so this revoke is exercised
-- by the test suite rather than passing by accident on bare Postgres.
--
-- service_role keeps its grants: that is the server-side key, it already
-- bypasses RLS, and nothing in this product hands it to a browser.
-- ---------------------------------------------------------------------------

revoke all on public.scope_sessions from public, anon, authenticated;

-- Admins read the leads. RLS decides which rows come back — which is all of
-- them for an admin and none of them for anyone else.
grant select on public.scope_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- ONE policy on this table. That is not an oversight:
--   * no SELECT policy for anon        → anonymous reads are impossible
--   * no INSERT/UPDATE/DELETE policy   → nobody writes through PostgREST
--   * no DELETE policy at all          → a lead cannot be deleted from a client
-- The write path is the function below, and it is the only one.
-- ---------------------------------------------------------------------------

alter table public.scope_sessions enable row level security;

create policy "admins read all scope sessions"
  on public.scope_sessions for select
  to authenticated
  using (public.current_user_is_admin());

comment on policy "admins read all scope sessions" on public.scope_sessions is
  'Batch 7. SELECT only, and the only policy on this table. Everyone else — '
  'including every ordinary logged-in member — reads zero rows.';

-- ---------------------------------------------------------------------------
-- The one write path
--
-- Upsert by session_id. Called on session start with nothing but the token,
-- then again on each answer, then again when a CTA is pressed.
--
-- NULL MEANS "LEAVE IT ALONE", NOT "CLEAR IT". Every parameter defaults to
-- null and a null never overwrites a stored value. Two reasons:
--   * a later call cannot erase something the visitor already told us — the
--     abandoned budget survives whatever happens next;
--   * the caller can send one field without having to restate the rest.
-- The cost is that clearing the budget field on screen does not clear the
-- captured value. That is the trade we want on a lead capture.
--
-- SECURITY DEFINER with search_path pinned, per the house pattern. It reads
-- one column of one row (user_id, to enforce the claim rule) and writes one
-- row. It returns void, so no amount of calling it reveals anything about a
-- row the caller does not already have.
-- ---------------------------------------------------------------------------

create function public.record_scope_session(
  p_session_id uuid,
  p_making_type text default null,
  p_answers jsonb default null,
  p_shoot_location text default null,
  p_budget_input text default null,
  p_computed_estimate integer default null,
  p_cta_clicked public.scope_cta default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_referral_source jsonb default null,
  p_last_step_reached text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_owned boolean;
  v_answers jsonb;
  v_referral jsonb;
begin
  if p_session_id is null then
    raise exception 'record_scope_session: a session id is required';
  end if;

  select user_id, true into v_owner, v_owned
  from public.scope_sessions
  where session_id = p_session_id;

  -- Once an account has claimed this session, only that account keeps writing
  -- it. Someone holding the token but signed out — or signed in as somebody
  -- else — is refused, so a stamped session cannot be edited out from under
  -- its owner.
  if v_owned and v_owner is not null and v_owner is distinct from v_caller then
    raise exception 'record_scope_session: that session belongs to another account'
      using errcode = 'insufficient_privilege';
  end if;

  -- Oversized json is dropped rather than raised on. The check constraint
  -- would refuse the row, and a failed capture must never be something the
  -- visitor sees — the estimate is the product, this is our bookkeeping.
  v_answers := case
    when octet_length(coalesce(p_answers, '{}'::jsonb)::text) <= 4000
      then p_answers
  end;
  v_referral := case
    when octet_length(coalesce(p_referral_source, '{}'::jsonb)::text) <= 2000
      then p_referral_source
  end;

  insert into public.scope_sessions as s (
    session_id,
    user_id,
    making_type,
    answers,
    shoot_location,
    budget_input,
    computed_estimate,
    cta_clicked,
    contact_name,
    contact_email,
    contact_phone,
    referral_source,
    last_step_reached
  )
  values (
    p_session_id,
    v_caller,
    left(nullif(btrim(p_making_type), ''), 120),
    v_answers,
    left(nullif(btrim(p_shoot_location), ''), 160),
    left(nullif(btrim(p_budget_input), ''), 40),
    -- Clamped, not coalesced: GREATEST/LEAST ignore nulls, so the null case
    -- has to be spelled out or "no estimate yet" would be stored as $0 and
    -- then overwrite a real estimate on the next save.
    case
      when p_computed_estimate is null then null
      else least(greatest(p_computed_estimate, 0), 10000000)
    end,
    p_cta_clicked,
    left(nullif(btrim(p_contact_name), ''), 120),
    lower(left(nullif(btrim(p_contact_email), ''), 200)),
    left(nullif(btrim(p_contact_phone), ''), 40),
    v_referral,
    left(nullif(btrim(p_last_step_reached), ''), 80)
  )
  on conflict (session_id) do update set
    -- Set once. coalesce keeps the existing owner, so this can only ever go
    -- null -> someone, never someone -> someone else.
    user_id           = coalesce(s.user_id, v_caller),
    making_type       = coalesce(excluded.making_type, s.making_type),
    -- MERGED, not replaced. The tool sends the whole intake every time, so in
    -- practice this is a full overwrite — but merging means the same
    -- "null leaves it alone" rule holds one level down: a caller that sends
    -- three keys updates three keys and cannot silently drop the other eleven.
    answers           = case
                          when excluded.answers is null then s.answers
                          else coalesce(s.answers, '{}'::jsonb) || excluded.answers
                        end,
    shoot_location    = coalesce(excluded.shoot_location, s.shoot_location),
    budget_input      = coalesce(excluded.budget_input, s.budget_input),
    computed_estimate = coalesce(excluded.computed_estimate, s.computed_estimate),
    -- The warm lead wins. Someone who asks for a call and then also clicks
    -- through to signup is still a call, not a signup.
    cta_clicked       = case
                          when s.cta_clicked = 'call_me' then s.cta_clicked
                          else coalesce(excluded.cta_clicked, s.cta_clicked)
                        end,
    contact_name      = coalesce(excluded.contact_name, s.contact_name),
    contact_email     = coalesce(excluded.contact_email, s.contact_email),
    contact_phone     = coalesce(excluded.contact_phone, s.contact_phone),
    -- Where they came from is a fact about the START of the session, so it is
    -- written once and never rewritten.
    referral_source   = coalesce(s.referral_source, excluded.referral_source),
    -- High-water mark: pressing Back must not un-report how far they got.
    last_step_reached = greatest(excluded.last_step_reached, s.last_step_reached),
    updated_at        = now();
end;
$$;

comment on function public.record_scope_session(uuid, text, jsonb, text, text, integer,
                                                public.scope_cta, text, text, text, jsonb, text) is
  'The only write path to public.scope_sessions. Upserts the one row named by '
  'p_session_id. NULL parameters leave stored values alone. user_id is taken '
  'from auth.uid() and never from a parameter. Returns void — it can never be '
  'used to read a row.';

revoke execute on function public.record_scope_session(uuid, text, jsonb, text, text, integer,
                                                       public.scope_cta, text, text, text, jsonb, text)
  from public;

grant execute on function public.record_scope_session(uuid, text, jsonb, text, text, integer,
                                                      public.scope_cta, text, text, text, jsonb, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Post-conditions
--
-- Split the way Batch 6 splits them: what this migration built, then the
-- properties that must be true of it for the table to be safe in public.
-- The second half is the one that matters.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn constant text :=
    'public.record_scope_session(uuid, text, jsonb, text, text, integer, '
    'public.scope_cta, text, text, text, jsonb, text)';
  v_missing text;
  v_count int;
begin
  -- ---- it exists, and it is locked down ----------------------------------
  if to_regclass('public.scope_sessions') is null then
    raise exception 'public.scope_sessions was not created';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.scope_sessions'::regclass) then
    raise exception 'RLS is DISABLED on scope_sessions — the default grants are live and unguarded';
  end if;

  -- ---- THE LOAD-BEARING ONE: anon cannot touch this table ----------------
  -- Not "cannot see rows" — cannot reach the table at all. This is the check
  -- that catches Supabase's default grants coming back, whether through a
  -- later `alter default privileges`, a restore, or a hand-run grant.
  select string_agg(priv, ', ')
  into v_missing
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER']) as priv
  where has_table_privilege('anon', 'public.scope_sessions', priv);

  if v_missing is not null then
    raise exception 'anon holds % on scope_sessions — the public can reach the lead table', v_missing;
  end if;

  -- authenticated reads (RLS narrows it to admins) and does nothing else.
  if not has_table_privilege('authenticated', 'public.scope_sessions', 'SELECT') then
    raise exception 'authenticated cannot SELECT scope_sessions — admins would read nothing';
  end if;

  select string_agg(priv, ', ')
  into v_missing
  from unnest(array['INSERT', 'UPDATE', 'DELETE']) as priv
  where has_table_privilege('authenticated', 'public.scope_sessions', priv);

  if v_missing is not null then
    raise exception 'authenticated holds % on scope_sessions — writes must go through the function', v_missing;
  end if;

  -- ---- exactly one policy, and it is the admin read ----------------------
  select count(*) into v_count
  from pg_policies where schemaname = 'public' and tablename = 'scope_sessions';
  if v_count <> 1 then
    raise exception 'expected exactly 1 policy on scope_sessions, found % — a write policy would '
                    'reopen the anon path this migration deliberately closed', v_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'scope_sessions'
      and policyname = 'admins read all scope sessions'
      and cmd = 'SELECT'
      and qual like '%current_user_is_admin%'
  ) then
    raise exception 'the admin read policy on scope_sessions is missing, is not SELECT, '
                    'or is not gated on the admin flag';
  end if;

  -- No policy on this table may mention anon. If one ever does, the "no
  -- anonymous reads" promise needs re-reviewing, not quietly extending.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'scope_sessions'
      and 'anon' = any(roles)
  ) then
    raise exception 'a policy on scope_sessions names anon — anonymous access must stay '
                    'inside record_scope_session()';
  end if;

  -- ---- the write path is the function, and the function is narrow --------
  if to_regprocedure(v_fn) is null then
    raise exception 'record_scope_session() is missing';
  end if;

  if not exists (select 1 from pg_proc where oid = to_regprocedure(v_fn) and prosecdef) then
    raise exception 'record_scope_session() is not SECURITY DEFINER — anon writes would be refused';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = to_regprocedure(v_fn)
      and proconfig @> array['search_path=public']
  ) then
    raise exception 'record_scope_session() does not pin its search_path';
  end if;

  -- `returns void` is what stops a definer function being a read oracle.
  if (select prorettype from pg_proc where oid = to_regprocedure(v_fn)) <> 'void'::regtype then
    raise exception 'record_scope_session() returns something — a SECURITY DEFINER function that '
                    'returns rows from this table is a public read path';
  end if;

  -- user_id must not be reachable from a parameter.
  if pg_get_functiondef(to_regprocedure(v_fn)) not like '%v_caller uuid := auth.uid()%' then
    raise exception 'record_scope_session() no longer stamps user_id from auth.uid()';
  end if;

  if not has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'record_scope_session() is not executable by visitors — the tool cannot save';
  end if;

  -- ---- the shape the app depends on --------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scope_sessions'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%session_id%'
  ) then
    raise exception 'session_id is not unique — "save as they go" would append rows instead of '
                    'updating one';
  end if;

  select string_agg(col, ', ')
  into v_missing
  from unnest(array['id', 'session_id', 'user_id', 'making_type', 'answers',
                    'shoot_location', 'budget_input', 'computed_estimate', 'cta_clicked',
                    'contact_name', 'contact_email', 'contact_phone', 'referral_source',
                    'last_step_reached', 'created_at', 'updated_at']) as col
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scope_sessions' and column_name = col
  );

  if v_missing is not null then
    raise exception 'scope_sessions is missing column(s): %', v_missing;
  end if;
end $$;
