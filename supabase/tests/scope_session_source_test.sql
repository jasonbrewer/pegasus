-- 20260801000016 — proves `source` labels a session by the build that captured
-- it, that the label cannot be anything else, and that it cannot be changed
-- after the fact. Run against a database with every migration applied, as
-- postgres (see supabase/tests/run.sh).
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS WORTH A TEST FILE OF ITS OWN.
--
-- The column is one word in a row, and the whole point of it is that somebody
-- filters on it later and trusts the answer. Three ways that quietly stops
-- being true:
--
--   * the value is client-controlled — the static bundle is a public HTML page
--     and anyone can post to the RPC with any string in it;
--   * a later save that omits p_source picks up the parameter's default, which
--     would relabel a session that started somewhere else;
--   * the function was DROPPED and recreated to take the new parameter, so
--     every security property of it — definer, owner, grants — is re-asserted
--     rather than inherited.
--
-- Batch 7's file covers the rest of the function's behaviour and still passes
-- unchanged, which is the other half of the claim: adding the parameter broke
-- none of it.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

\set srcA '''50000000-0000-4000-8000-00000000000a'''
\set srcB '''50000000-0000-4000-8000-00000000000b'''
\set srcC '''50000000-0000-4000-8000-00000000000c'''
\set srcD '''50000000-0000-4000-8000-00000000000d'''

\echo ''
\echo '========== PART 1 — THE LABEL AN ANONYMOUS VISITOR GETS =========='

set role anon;

do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);

  -- The hosted tool: it does not pass p_source at all, and the parameter's
  -- default is what makes that keep working after the signature changed.
  perform public.record_scope_session(
    p_session_id  => '50000000-0000-4000-8000-00000000000a',
    p_making_type => 'Brand video'
  );

  -- The static bundle: passes its own.
  perform public.record_scope_session(
    p_session_id  => '50000000-0000-4000-8000-00000000000b',
    p_making_type => 'Brand video',
    p_source      => '8posts'
  );

  -- Anything else — a typo, a stale build, or somebody posting at the RPC by
  -- hand — must not become a bucket of its own, and must not be a failed
  -- capture either. It falls back to the default.
  perform public.record_scope_session(
    p_session_id => '50000000-0000-4000-8000-00000000000c',
    p_source     => 'not-a-real-build'
  );

  -- Shouting and stray spaces are the same answer as the tidy spelling.
  perform public.record_scope_session(
    p_session_id => '50000000-0000-4000-8000-00000000000d',
    p_source     => '  8POSTS  '
  );

  raise notice 'PASS 1  four sessions captured, three different p_source spellings';
end $$;

reset role;

do $$
declare v text;
begin
  select source into v from public.scope_sessions where session_id = '50000000-0000-4000-8000-00000000000a';
  if v is distinct from 'productioncircles' then
    raise exception 'FAIL 1a: a caller that omitted p_source got source=% — the parameter default '
                    'is what keeps every existing caller working', v;
  end if;
  raise notice 'PASS 1a omitting p_source lands on the default';

  select source into v from public.scope_sessions where session_id = '50000000-0000-4000-8000-00000000000b';
  if v is distinct from '8posts' then
    raise exception 'FAIL 1b: the static bundle''s session got source=% — its leads are not '
                    'filterable apart', v;
  end if;
  raise notice 'PASS 1b a known build is stored as itself';

  select source into v from public.scope_sessions where session_id = '50000000-0000-4000-8000-00000000000c';
  if v is distinct from 'productioncircles' then
    raise exception 'FAIL 1c: an unknown source was stored as % rather than clamped', v;
  end if;
  raise notice 'PASS 1c an unrecognised source falls back to the default, and still captures';

  select source into v from public.scope_sessions where session_id = '50000000-0000-4000-8000-00000000000d';
  if v is distinct from '8posts' then
    raise exception 'FAIL 1d: "  8POSTS  " was stored as % — case and padding must not fork the '
                    'bucket', v;
  end if;
  raise notice 'PASS 1d the label is trimmed and lower-cased on the way in';
end $$;

\echo ''
\echo '========== PART 2 — IT IS A FACT ABOUT THE START OF THE SESSION =========='

set role anon;

do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);

  -- The rest of the funnel, saved by the same build — and then a save that
  -- forgets to say who it is. Neither may relabel the session.
  perform public.record_scope_session(
    p_session_id        => '50000000-0000-4000-8000-00000000000b',
    p_last_step_reached => '03/05 The shoot',
    p_source            => '8posts'
  );

  perform public.record_scope_session(
    p_session_id => '50000000-0000-4000-8000-00000000000b',
    p_budget_input => '4000'
  );

  -- And an outright attempt to move somebody else's session into this bucket.
  perform public.record_scope_session(
    p_session_id => '50000000-0000-4000-8000-00000000000a',
    p_source     => '8posts'
  );
end $$;

reset role;

do $$
declare v text; n int;
begin
  select source into v from public.scope_sessions where session_id = '50000000-0000-4000-8000-00000000000b';
  if v is distinct from '8posts' then
    raise exception 'FAIL 2a: a later save without p_source relabelled the session to %', v;
  end if;
  raise notice 'PASS 2a a save that omits p_source does not relabel the session';

  select source into v from public.scope_sessions where session_id = '50000000-0000-4000-8000-00000000000a';
  if v is distinct from 'productioncircles' then
    raise exception 'FAIL 2b: a later call moved an existing session into the % bucket', v;
  end if;
  raise notice 'PASS 2b source is first-write-wins — a later call cannot move a session';

  -- The rest of the patch still landed. First-write-wins applies to source and
  -- to nothing else.
  select count(*) into n
  from public.scope_sessions
  where session_id = '50000000-0000-4000-8000-00000000000b'
    and budget_input = '4000' and last_step_reached = '03/05 The shoot';
  if n <> 1 then
    raise exception 'FAIL 2c: pinning source also froze the rest of the row';
  end if;
  raise notice 'PASS 2c everything else on that save still landed';
end $$;

\echo ''
\echo '========== PART 3 — THE STORAGE LAYER SAYS IT TOO =========='

do $$
begin
  -- The function clamps, but the function is not the only thing that could
  -- ever write this column — a future migration, a hand-run UPDATE, a restore.
  -- The constraint is what makes "source is one of the builds" true of the
  -- table rather than of one code path.
  begin
    insert into public.scope_sessions (session_id, source)
    values (gen_random_uuid(), 'somewhere-else');
    raise exception 'FAIL 3: an unknown source was accepted straight into the table';
  exception
    when check_violation then
      raise notice 'PASS 3  the table refuses a source it does not know';
  end;

  begin
    update public.scope_sessions
    set source = 'somewhere-else'
    where session_id = '50000000-0000-4000-8000-00000000000a';
    raise exception 'FAIL 3b: an unknown source was accepted by UPDATE';
  exception
    when check_violation then
      raise notice 'PASS 3b and refuses one on the way in later, too';
  end;
end $$;

\echo ''
\echo '========== PART 4 — WHAT THE DROP AND RECREATE COULD HAVE LOST =========='

do $$
declare
  v_fn constant text :=
    'public.record_scope_session(uuid, text, jsonb, text, text, integer, '
    'public.scope_cta, text, text, text, jsonb, text, text)';
  v_acl aclitem[];
begin
  -- The migration asserts all of this at apply time. It is repeated here
  -- because this file runs against a database that has been through every
  -- migration since, and "still true afterwards" is the property that matters.
  if not exists (select 1 from pg_proc where oid = to_regprocedure(v_fn) and prosecdef) then
    raise exception 'FAIL 4: record_scope_session() is not SECURITY DEFINER';
  end if;

  if (select pg_get_userbyid(proowner) from pg_proc where oid = to_regprocedure(v_fn))
     is distinct from
     (select pg_get_userbyid(proowner) from pg_proc
      where oid = to_regprocedure('public.current_user_is_admin()')) then
    raise exception 'FAIL 4b: the definer function is not owned by the schema''s usual owner';
  end if;

  select proacl into v_acl from pg_proc where oid = to_regprocedure(v_fn);
  if v_acl is null
     or exists (select 1 from aclexplode(v_acl) where grantee = 0 and privilege_type = 'EXECUTE') then
    raise exception 'FAIL 4c: PUBLIC can execute record_scope_session()';
  end if;

  if not has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'FAIL 4d: visitors cannot execute record_scope_session() — capture is dead';
  end if;

  if to_regprocedure('public.record_scope_session(uuid, text, jsonb, text, text, integer, '
                     'public.scope_cta, text, text, text, jsonb, text)') is not null then
    raise exception 'FAIL 4e: the old 12-parameter function is still installed alongside the new '
                    'one — named-parameter calls that omit p_source would be ambiguous';
  end if;

  raise notice 'PASS 4  definer, owner, grants and the single signature all survived the recreate';
end $$;

\echo ''
\echo 'scope source — all assertions passed.'
