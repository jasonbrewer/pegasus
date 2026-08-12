-- Which build a scope session came from.
--
-- The scoping tool now ships in two places: the route this product serves, and
-- a self-contained static bundle (npm run build:scope) hosted on a separate
-- site. Both write their leads through public.record_scope_session(), into the
-- same table, and until now nothing in the row said which door the visitor came
-- through. `source` is that column, and it is what makes the two filterable
-- apart in admin.
--
-- ===========================================================================
-- THE SHAPE OF THIS CHANGE, AND THE ONE RISK IN IT.
--
-- Adding a parameter to an existing function is a DROP and a CREATE, not a
-- CREATE OR REPLACE — a different argument list is a different function, and
-- `create or replace` would leave TWO record_scope_session()s installed. Every
-- existing caller uses named parameters (see src/lib/scoping/session.ts and
-- supabase/tests/batch7_public_scope_sessions_test.sql), and a named call that
-- omits p_source would then be ambiguous between the two overloads and fail at
-- runtime. So: drop, then create the 13-parameter version.
--
-- What a drop-and-recreate silently loses, and what the post-conditions at the
-- foot of this file therefore re-assert:
--
--   * SECURITY DEFINER          — without it every anonymous write is refused,
--                                 because anon holds no privilege on the table;
--   * the pinned search_path    — a definer function without one is a hazard;
--   * the function's owner      — a definer function runs as its owner, so an
--                                 owner change is a privilege change;
--   * `revoke execute from public` and the explicit grants to anon and
--     authenticated — a fresh CREATE FUNCTION grants EXECUTE to PUBLIC by
--     default, which is exactly the thing migration 15 revoked.
--
-- None of those four is visible in a diff that only shows the new parameter,
-- which is why they are checked here rather than assumed.
--
-- WHAT DOES NOT CHANGE: anon still holds no privilege on the table, there is
-- still exactly one policy (the admin read), the function still returns void,
-- and user_id is still stamped from auth.uid() and never from a parameter.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The column
--
-- NOT NULL with a default, so every row already in the table becomes
-- 'productioncircles' — which is true: every session captured before this
-- migration came from that build and nowhere else.
--
-- The check constraint is the storage-layer half of the allow-list the
-- function enforces below. p_source is client-controlled — the static bundle
-- is a public HTML page and anyone can post to the RPC with any string — so
-- "the value is one of the two builds" is asserted in both places rather than
-- trusted from the caller. Adding a third build means touching this list and
-- the function's, together, in one migration.
-- ---------------------------------------------------------------------------

alter table public.scope_sessions
  add column source text not null default 'productioncircles';

alter table public.scope_sessions
  add constraint scope_sessions_known_source
  check (source in ('productioncircles', '8posts'));

comment on column public.scope_sessions.source is
  'Which build captured this session. Set on the first write and never '
  'rewritten. Clamped to a known value by record_scope_session(); an '
  'unrecognised or missing source falls back to the default.';

-- The admin filter this column exists for: one build's leads, newest first.
create index scope_sessions_source_idx
  on public.scope_sessions (source, created_at desc);

-- ---------------------------------------------------------------------------
-- The function, dropped and rebuilt with p_source on the end.
--
-- Byte-for-byte the migration 15 body apart from the three source-related
-- lines, on purpose: this migration is a parameter addition, and anything else
-- that moved would be a behaviour change hiding inside one.
-- ---------------------------------------------------------------------------

drop function public.record_scope_session(uuid, text, jsonb, text, text, integer,
                                          public.scope_cta, text, text, text, jsonb, text);

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
  p_last_step_reached text default null,
  p_source text default 'productioncircles'
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
  v_source text;
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

  -- CLAMPED, NOT TRUSTED. An unknown string — a typo, an older build, or
  -- somebody posting at the RPC by hand — becomes the default rather than a
  -- new bucket nobody is filtering on, and cannot tip one build's leads into
  -- the other's pile. The check constraint above would refuse anything else
  -- anyway; this makes the refusal a fallback instead of a failed capture.
  v_source := lower(btrim(coalesce(p_source, '')));
  if v_source not in ('productioncircles', '8posts') then
    v_source := 'productioncircles';
  end if;

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
    last_step_reached,
    source
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
    left(nullif(btrim(p_last_step_reached), ''), 80),
    v_source
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
    -- FIRST WRITE WINS, exactly like referral_source above: which build served
    -- this session is a fact about where it started. A later call that omits
    -- p_source (and so defaults it) must not relabel a session that began
    -- somewhere else.
    source            = s.source,
    updated_at        = now();
end;
$$;

comment on function public.record_scope_session(uuid, text, jsonb, text, text, integer,
                                                public.scope_cta, text, text, text, jsonb, text,
                                                text) is
  'The only write path to public.scope_sessions. Upserts the one row named by '
  'p_session_id. NULL parameters leave stored values alone. user_id is taken '
  'from auth.uid() and never from a parameter. p_source is clamped to a known '
  'build and set on the first write only. Returns void — it can never be used '
  'to read a row.';

-- A fresh CREATE FUNCTION grants EXECUTE to PUBLIC. Migration 15 revoked that;
-- the drop above took the revoke with it, so it is re-stated here.
revoke execute on function public.record_scope_session(uuid, text, jsonb, text, text, integer,
                                                       public.scope_cta, text, text, text, jsonb,
                                                       text, text)
  from public;

grant execute on function public.record_scope_session(uuid, text, jsonb, text, text, integer,
                                                      public.scope_cta, text, text, text, jsonb,
                                                      text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Post-conditions
--
-- The first half is the new column. The second half is everything the drop
-- took away and this migration had to put back — the half that would fail
-- silently and stay failing, because a missing SECURITY DEFINER shows up as
-- "capture quietly stopped working" and a missing revoke shows up as nothing
-- at all until somebody goes looking.
-- ---------------------------------------------------------------------------

do $$
declare
  v_old constant text :=
    'public.record_scope_session(uuid, text, jsonb, text, text, integer, '
    'public.scope_cta, text, text, text, jsonb, text)';
  v_fn constant text :=
    'public.record_scope_session(uuid, text, jsonb, text, text, integer, '
    'public.scope_cta, text, text, text, jsonb, text, text)';
  v_owner name;
  v_reference_owner name;
  v_acl aclitem[];
begin
  -- ---- the column ---------------------------------------------------------
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scope_sessions' and column_name = 'source'
  ) then
    raise exception 'scope_sessions.source was not added';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scope_sessions'
      and column_name = 'source' and is_nullable = 'YES'
  ) then
    raise exception 'scope_sessions.source is nullable — a session with no build is not a thing';
  end if;

  if exists (select 1 from public.scope_sessions where source is null) then
    raise exception 'existing scope_sessions rows did not backfill to the default source';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scope_sessions'::regclass
      and conname = 'scope_sessions_known_source'
  ) then
    raise exception 'the source allow-list constraint is missing — any string could be stored';
  end if;

  -- ---- exactly one function, with the new signature -----------------------
  if to_regprocedure(v_old) is not null then
    raise exception 'the 12-parameter record_scope_session() is still installed — named-parameter '
                    'callers that omit p_source would be ambiguous between the two';
  end if;

  if to_regprocedure(v_fn) is null then
    raise exception 'the 13-parameter record_scope_session() is missing';
  end if;

  -- ---- THE FOUR THINGS THE DROP TOOK WITH IT ------------------------------
  if not exists (select 1 from pg_proc where oid = to_regprocedure(v_fn) and prosecdef) then
    raise exception 'record_scope_session() is not SECURITY DEFINER — every anonymous write '
                    'would be refused, because anon holds no privilege on the table';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = to_regprocedure(v_fn)
      and proconfig @> array['search_path=public']
  ) then
    raise exception 'record_scope_session() does not pin its search_path';
  end if;

  -- A SECURITY DEFINER function runs as its owner, so "who owns it" is part of
  -- what it can do. It must be owned by whoever owns the rest of this schema's
  -- definer functions, and current_user_is_admin() is the reference.
  select pg_get_userbyid(proowner) into v_owner
  from pg_proc where oid = to_regprocedure(v_fn);

  select pg_get_userbyid(proowner) into v_reference_owner
  from pg_proc where oid = to_regprocedure('public.current_user_is_admin()');

  if v_owner is distinct from v_reference_owner then
    raise exception 'record_scope_session() is owned by % but the schema''s other definer '
                    'functions are owned by % — a definer function runs as its owner',
                    v_owner, v_reference_owner;
  end if;

  -- PUBLIC is not a role has_function_privilege() will answer for, so this
  -- reads the ACL directly. A NULL proacl is the trap: it means "nobody has
  -- touched the grants", which for a function means PUBLIC still holds the
  -- default EXECUTE — the exact state the revoke above exists to leave behind.
  select proacl into v_acl from pg_proc where oid = to_regprocedure(v_fn);

  if v_acl is null
     or exists (
       select 1 from aclexplode(v_acl)
       where grantee = 0 and privilege_type = 'EXECUTE'
     ) then
    raise exception 'record_scope_session() is executable by PUBLIC — CREATE FUNCTION''s default '
                    'grant came back when the function was recreated';
  end if;

  if not has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'record_scope_session() is not executable by visitors — the tool cannot save';
  end if;

  -- ---- and the properties migration 15 relies on --------------------------
  if (select prorettype from pg_proc where oid = to_regprocedure(v_fn)) <> 'void'::regtype then
    raise exception 'record_scope_session() returns something — a SECURITY DEFINER function that '
                    'returns rows from this table is a public read path';
  end if;

  if pg_get_functiondef(to_regprocedure(v_fn)) not like '%v_caller uuid := auth.uid()%' then
    raise exception 'record_scope_session() no longer stamps user_id from auth.uid()';
  end if;

  -- The table's own guarantees are untouched by this migration, and this is
  -- the cheapest possible proof of that.
  if exists (
    select 1
    from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv
    where has_table_privilege('anon', 'public.scope_sessions', priv)
  ) then
    raise exception 'anon can reach scope_sessions directly — this migration must not have '
                    'changed that, and it did';
  end if;
end $$;
