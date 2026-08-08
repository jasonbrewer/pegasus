-- Batch 7 — proves the public scope tool can WRITE its lead and can never READ
-- one. Run against a database with every migration applied, as postgres.
--
-- Setup: supabase/tests/run.sh, or by hand — create an empty database with
-- postgis + pgcrypto, apply supabase/tests/00_harness.sql, then every file in
-- supabase/migrations/ in order, then this.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE LEANS ON has_table_privilege() WHERE BATCH 6 SAYS NOT TO.
--
-- Batch 6's warning is that a grant check is meaningless UNLESS a migration
-- explicitly revoked the privilege — because Supabase grants ALL on every new
-- table by default. 20260801000015 is exactly such a migration: it revokes
-- everything from anon and grants back nothing. So on this table the grant is
-- the property under test, and 00_harness.sql applying Supabase's default
-- grants is what makes the assertion mean something. If someone deletes the
-- revoke, Part 1 fails here.
--
-- Part 1 checks the privilege is gone. Part 2 becomes anon and tries the
-- reads and writes anyway, which stays true on either database.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Cast
--   admin      an employer account with is_admin = true
--   member     an ordinary approved employer — the "logged in but not admin"
--              control, who must read nothing
--   visitorA   anonymous, holds session token SA
--   visitorB   anonymous, holds session token SB
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('b7000000-0000-4000-8000-0000000000a1', 'b7admin@example.com',
   '{"role":"employer","full_name":"Mod Erator","company_name":"Production Circles"}'),
  ('b7000000-0000-4000-8000-0000000000d1', 'b7member@example.com',
   '{"role":"employer","full_name":"Ordinary Member","company_name":"Some Brand"}')
on conflict (id) do nothing;

\set b7admin  '''b7000000-0000-4000-8000-0000000000a1'''
\set b7member '''b7000000-0000-4000-8000-0000000000d1'''
\set sessA    '''5e551011-0000-4000-8000-00000000000a'''
\set sessB    '''5e551011-0000-4000-8000-00000000000b'''

update public.profiles set is_admin = true where id = :b7admin;
update public.profiles set status = 'approved' where id in (:b7admin, :b7member);

\echo ''
\echo '============ PART 1 — anon CANNOT REACH THE TABLE AT ALL ============'

do $$
declare v text;
begin
  select string_agg(priv, ', ')
  into v
  from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv
  where has_table_privilege('anon', 'public.scope_sessions', priv);

  if v is not null then
    raise exception 'FAIL 1: anon holds % on scope_sessions', v;
  end if;
  raise notice 'PASS 1  anon holds no privilege of any kind on scope_sessions';

  select string_agg(priv, ', ')
  into v
  from unnest(array['INSERT', 'UPDATE', 'DELETE']) as priv
  where has_table_privilege('authenticated', 'public.scope_sessions', priv);

  if v is not null then
    raise exception 'FAIL 1b: authenticated holds % on scope_sessions', v;
  end if;
  raise notice 'PASS 1b authenticated may only SELECT — every write goes through the function';

  -- One policy, and it is the admin read. A write policy here would be the
  -- anon path re-opening.
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'scope_sessions') <> 1 then
    raise exception 'FAIL 1c: scope_sessions has more than the one admin SELECT policy';
  end if;
  raise notice 'PASS 1c exactly one policy on the table, and it is a SELECT';
end $$;

\echo ''
\echo '============ PART 2 — AN ANONYMOUS VISITOR SCOPES A JOB ============'

set role anon;

do $$
declare n int; v text;
begin
  -- Anonymous: no JWT at all.
  perform set_config('request.jwt.claim.sub', '', false);

  -- ---- 2. the session starts: a row with nothing but its token -----------
  perform public.record_scope_session(
    p_session_id      => '5e551011-0000-4000-8000-00000000000a',
    p_referral_source => '{"referrer":"https://google.com","utm_source":"seo"}'::jsonb,
    p_last_step_reached => '01/06 The basics'
  );
  raise notice 'PASS 2  an anonymous caller created their session row';

  -- ---- 2b. …and cannot read it back, not even their own -----------------
  begin
    select count(*) into n from public.scope_sessions;
    raise exception 'FAIL 2b: anon SELECTed scope_sessions and saw % row(s)', n;
  exception
    when insufficient_privilege then
      raise notice 'PASS 2b anon cannot SELECT the table — not even the row they just wrote';
  end;

  -- ---- 2c. …and cannot write it any other way ---------------------------
  begin
    insert into public.scope_sessions (session_id) values (gen_random_uuid());
    raise exception 'FAIL 2c: anon INSERTed directly into scope_sessions';
  exception
    when insufficient_privilege then
      raise notice 'PASS 2c anon cannot INSERT directly';
  end;

  begin
    update public.scope_sessions set contact_email = 'stolen@example.com';
    raise exception 'FAIL 2d: anon UPDATEd scope_sessions directly';
  exception
    when insufficient_privilege then
      raise notice 'PASS 2d anon cannot UPDATE directly';
  end;

  begin
    delete from public.scope_sessions;
    raise exception 'FAIL 2e: anon DELETEd from scope_sessions';
  exception
    when insufficient_privilege then
      raise notice 'PASS 2e anon cannot DELETE — a captured lead cannot be erased from a client';
  end;

  -- ---- 3. answers land as they go, on the SAME row ----------------------
  perform public.record_scope_session(
    p_session_id        => '5e551011-0000-4000-8000-00000000000a',
    p_making_type       => 'Brand video',
    p_last_step_reached => '02/06 Where it lives'
  );
  -- The whole intake, as the tool sends it: every question, not just the four
  -- judgment checkboxes.
  perform public.record_scope_session(
    p_session_id     => '5e551011-0000-4000-8000-00000000000a',
    p_shoot_location => 'Richmond, VA',
    p_answers        => '{"making":"Brand video","onCamera":"conversation",
                          "destination":"website","polish":"standard",
                          "count":"4","each":"3","filming":"two","hire":"local",
                          "distance":"near","shootLocation":"Richmond, VA",
                          "secondCam":"no","audio":"unsure","drone":"yes",
                          "graphics":"no"}'::jsonb,
    p_last_step_reached => '03/06 The shoot'
  );
  -- A later partial save must not drop the eleven keys it didn't mention.
  perform public.record_scope_session(
    p_session_id => '5e551011-0000-4000-8000-00000000000a',
    p_answers    => '{"drone":"no","graphics":"yes"}'::jsonb
  );
  -- The budget, then abandonment. This is the case the whole design exists for.
  perform public.record_scope_session(
    p_session_id        => '5e551011-0000-4000-8000-00000000000a',
    p_budget_input      => '3500',
    p_computed_estimate => 4870,
    p_last_step_reached => '06/06 Your budget'
  );
  raise notice 'PASS 3  four saves, one session token';

  -- ---- 4. a second visitor's writes cannot touch the first's row --------
  perform public.record_scope_session(
    p_session_id  => '5e551011-0000-4000-8000-00000000000b',
    p_making_type => 'TV commercial',
    p_contact_email => 'VisitorB@Example.com  '
  );
  raise notice 'PASS 4  a second anonymous session wrote its own row';
end $$;

reset role;

do $$
declare r public.scope_sessions%rowtype; n int; missing text;
begin
  select count(*) into n from public.scope_sessions;
  if n <> 2 then
    raise exception 'FAIL 3: expected 2 session rows, found % — session_id is not keying the upsert', n;
  end if;

  select * into r from public.scope_sessions where session_id = '5e551011-0000-4000-8000-00000000000a';

  if r.making_type <> 'Brand video' then
    raise exception 'FAIL 3a: making_type is % — a later null call cleared it', r.making_type;
  end if;
  if r.shoot_location <> 'Richmond, VA' then
    raise exception 'FAIL 3b: shoot_location is %', r.shoot_location;
  end if;
  if r.budget_input <> '3500' then
    raise exception 'FAIL 3c: the abandoned budget did not survive (%)', r.budget_input;
  end if;
  if r.computed_estimate <> 4870 then
    raise exception 'FAIL 3d: computed_estimate is %', r.computed_estimate;
  end if;
  -- ---- the whole intake, not just the checklist --------------------------
  select string_agg(k, ', ' order by k)
  into missing
  from unnest(array['making', 'onCamera', 'destination', 'polish', 'count', 'each',
                    'filming', 'hire', 'distance', 'shootLocation',
                    'secondCam', 'audio', 'drone', 'graphics']) as k
  where not (r.answers ? k);

  if missing is not null then
    raise exception 'FAIL 3e: answers is missing intake key(s): % — this table is the '
                    'pre-call briefing and an abandoned session cannot be backfilled', missing;
  end if;

  if r.answers ->> 'audio' <> 'unsure' or r.answers ->> 'onCamera' <> 'conversation'
     or r.answers ->> 'each' <> '3' then
    raise exception 'FAIL 3e2: answers landed with the wrong values (%)', r.answers::text;
  end if;

  -- The partial save merged rather than replaced: it changed its two keys and
  -- left the other twelve alone.
  if r.answers ->> 'drone' <> 'no' or r.answers ->> 'graphics' <> 'yes' then
    raise exception 'FAIL 3e3: the partial answers save did not apply';
  end if;
  if r.answers ->> 'making' <> 'Brand video' then
    raise exception 'FAIL 3e4: a partial answers save replaced the whole object';
  end if;
  raise notice 'PASS 3e the full intake is captured, and a partial save merges into it';
  if r.referral_source ->> 'utm_source' <> 'seo' then
    raise exception 'FAIL 3f: referral_source did not land';
  end if;
  if r.last_step_reached <> '06/06 Your budget' then
    raise exception 'FAIL 3g: last_step_reached is %', r.last_step_reached;
  end if;
  if r.user_id is not null then
    raise exception 'FAIL 3h: an anonymous session came out stamped with a user_id';
  end if;
  if r.cta_clicked is not null then
    raise exception 'FAIL 3i: cta_clicked is set on a session that pressed nothing';
  end if;
  raise notice 'PASS 3+ every answer persisted on one row, nulls cleared nothing, no user stamped';

  -- Visitor B's row is untouched by visitor A's four calls, and the email was
  -- normalised on the way in.
  select * into r from public.scope_sessions where session_id = '5e551011-0000-4000-8000-00000000000b';
  if r.making_type <> 'TV commercial' or r.contact_email <> 'visitorb@example.com' then
    raise exception 'FAIL 4: visitor B''s row is wrong (% / %)', r.making_type, r.contact_email;
  end if;
  if r.budget_input is not null then
    raise exception 'FAIL 4b: visitor A''s budget leaked onto visitor B''s row';
  end if;
  raise notice 'PASS 4+ each token wrote only its own row; email lower-cased on the way in';
end $$;

\echo ''
\echo '============ PART 3 — THE HIGH-WATER MARK AND THE CTA ============'

set role anon;

do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);

  -- Pressing Back must not un-report how far they got.
  perform public.record_scope_session(
    p_session_id        => '5e551011-0000-4000-8000-00000000000a',
    p_last_step_reached => '02/06 Where it lives'
  );

  -- They ask for the call…
  perform public.record_scope_session(
    p_session_id    => '5e551011-0000-4000-8000-00000000000a',
    p_cta_clicked   => 'call_me',
    p_contact_name  => '  Dana Reyes  ',
    p_contact_email => 'dana@example.com',
    p_contact_phone => '(804) 555-0134'
  );
  -- …and then also clicks through to signup.
  perform public.record_scope_session(
    p_session_id  => '5e551011-0000-4000-8000-00000000000a',
    p_cta_clicked => 'signup'
  );
end $$;

reset role;

do $$
declare r public.scope_sessions%rowtype;
begin
  select * into r from public.scope_sessions where session_id = '5e551011-0000-4000-8000-00000000000a';

  if r.last_step_reached <> '06/06 Your budget' then
    raise exception 'FAIL 5: pressing Back lowered last_step_reached to %', r.last_step_reached;
  end if;
  raise notice 'PASS 5  last_step_reached is a high-water mark, not the current step';

  if r.cta_clicked <> 'call_me' then
    raise exception 'FAIL 6: cta_clicked is % — the warm lead lost to a later signup click', r.cta_clicked;
  end if;
  raise notice 'PASS 6  "call me" outranks a later "signup" click';

  if r.contact_name <> 'Dana Reyes' then
    raise exception 'FAIL 6b: contact_name was not trimmed (%)', r.contact_name;
  end if;
  raise notice 'PASS 6b contact details captured and trimmed';

  if r.referral_source ->> 'utm_source' <> 'seo' then
    raise exception 'FAIL 6c: referral_source was rewritten after the session started';
  end if;
  raise notice 'PASS 6c referral_source is written once and never rewritten';
end $$;

\echo ''
\echo '============ PART 4 — CLAIMING A SESSION WITH AN ACCOUNT ============'

set role authenticated;

do $$
declare r public.scope_sessions%rowtype;
begin
  -- The visitor signs up mid-session. The same token now arrives with a JWT.
  perform set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-0000000000d1', false);
  perform public.record_scope_session(
    p_session_id => '5e551011-0000-4000-8000-00000000000b'
  );
  raise notice 'PASS 7  a signed-in caller re-saved their own anonymous session';
end $$;

reset role;

do $$
declare r public.scope_sessions%rowtype;
begin
  select * into r from public.scope_sessions where session_id = '5e551011-0000-4000-8000-00000000000b';
  if r.user_id <> 'b7000000-0000-4000-8000-0000000000d1' then
    raise exception 'FAIL 7: the anonymous session was not stamped with the new account (user_id %)', r.user_id;
  end if;
  raise notice 'PASS 7+ the anonymous session is now linked to the real account';
end $$;

set role anon;

do $$
begin
  -- Someone holding a CLAIMED session's token, signed out, is refused —
  -- a stamped session cannot be edited out from under its owner.
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform public.record_scope_session(
      p_session_id    => '5e551011-0000-4000-8000-00000000000b',
      p_contact_email => 'hijack@example.com'
    );
    raise exception 'FAIL 8: an anonymous caller wrote a session already claimed by an account';
  exception
    when insufficient_privilege then
      raise notice 'PASS 8  a claimed session refuses anonymous writes';
  end;
end $$;

reset role;
set role authenticated;

do $$
begin
  -- …and so is a DIFFERENT account holding the same token.
  perform set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-0000000000a1', false);
  begin
    perform public.record_scope_session(
      p_session_id    => '5e551011-0000-4000-8000-00000000000b',
      p_contact_email => 'hijack@example.com'
    );
    raise exception 'FAIL 8b: another account overwrote a claimed session';
  exception
    when insufficient_privilege then
      raise notice 'PASS 8b a claimed session refuses writes from any other account';
  end;
end $$;

reset role;

do $$
declare r public.scope_sessions%rowtype;
begin
  select * into r from public.scope_sessions where session_id = '5e551011-0000-4000-8000-00000000000b';
  if r.contact_email <> 'visitorb@example.com' then
    raise exception 'FAIL 8c: a refused write still landed (contact_email %)', r.contact_email;
  end if;
  if r.user_id <> 'b7000000-0000-4000-8000-0000000000d1' then
    raise exception 'FAIL 8d: user_id was re-pointed to another account';
  end if;
  raise notice 'PASS 8c user_id is set once and can never be re-pointed';
end $$;

\echo ''
\echo '============ PART 5 — WHO CAN READ THE LEADS ============'

set role authenticated;

do $$
declare n int;
begin
  -- ---- 9. an ordinary member reads nothing ------------------------------
  perform set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-0000000000d1', false);
  select count(*) into n from public.scope_sessions;
  if n <> 0 then
    raise exception 'FAIL 9: an ordinary logged-in member read % lead row(s)', n;
  end if;
  raise notice 'PASS 9  an ordinary member reads 0 rows — including the session they own';

  -- ---- 10. the admin reads them all -------------------------------------
  perform set_config('request.jwt.claim.sub', 'b7000000-0000-4000-8000-0000000000a1', false);
  select count(*) into n from public.scope_sessions;
  if n <> 2 then
    raise exception 'FAIL 10: the admin read % rows, expected 2', n;
  end if;
  raise notice 'PASS 10 the admin reads every scoping session';

  select count(*) into n from public.scope_sessions
  where cta_clicked = 'call_me' and contact_phone is not null;
  if n <> 1 then
    raise exception 'FAIL 10b: the warm-lead call list returned % rows, expected 1', n;
  end if;
  raise notice 'PASS 10b the warm-lead call list works for an admin';

  -- ---- 11. …and still cannot change one ---------------------------------
  begin
    update public.scope_sessions set contact_email = 'edited@example.com';
    raise exception 'FAIL 11: an admin UPDATEd a lead row';
  exception
    when insufficient_privilege then
      raise notice 'PASS 11 even an admin cannot edit a lead — the table is read-only to them';
  end;

  begin
    delete from public.scope_sessions;
    raise exception 'FAIL 11b: an admin DELETEd a lead row';
  exception
    when insufficient_privilege then
      raise notice 'PASS 11b even an admin cannot delete a lead';
  end;
end $$;

reset role;

\echo ''
\echo 'Batch 7 — all assertions passed.'
