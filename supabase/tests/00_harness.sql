-- Minimal emulation of the Supabase-managed pieces the migrations depend on.
-- Run this against an empty database (with postgis and pgcrypto installed)
-- BEFORE applying supabase/migrations/*.sql, then run the test files.
--
-- ===========================================================================
-- THE PART THAT MATTERS: SUPABASE'S DEFAULT GRANTS
--
-- Bare Postgres gives `authenticated` nothing. Supabase gives it broad table
-- privileges across the whole of `public` — SELECT, INSERT, UPDATE, DELETE on
-- every table, including PostGIS's own — and relies on RLS to be the gate.
--
-- Leaving that out of the harness is not a harmless simplification. It makes
-- `has_table_privilege(...)` answer differently here than in production, which
-- means any assertion written in terms of grants passes locally and can fail
-- on the real database. That is not hypothetical: migration 20260801000014
-- once asserted DELETE was not granted on applications. It passed here and
-- rolled back a live `supabase db push`.
--
-- So this harness grants what Supabase grants, on purpose. If an assertion
-- about write protection passes here now, it is because RLS and the policies
-- do the work — not because the harness quietly withheld a privilege.
--
-- COROLLARY, for anyone adding assertions later: `has_table_privilege` is
-- close to meaningless as a write-protection check on Supabase. The privilege
-- is there by default. Assert write protection as RLS + policy shape instead:
--   * pg_class.relrowsecurity is true, and
--   * no permissive UPDATE/DELETE/ALL policy that a non-owner could satisfy.
-- A grant check is only worth writing when a migration explicitly REVOKEd the
-- privilege — as 000010 does for profiles and 000011 does for applications.
-- ===========================================================================

-- Roles are cluster-wide, so create them only if absent.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);

-- Supabase exposes the current user id via auth.uid(); tests set it with
-- set_config('request.jwt.claim.sub', ...).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Tables that already exist (postgis's spatial_ref_sys, at this point)...
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- ...and everything the migrations are about to create. This is the line that
-- makes the harness behave like production: every table a migration creates
-- arrives with ALL privileges already granted, exactly as it would on Supabase,
-- so RLS is the only thing standing between a role and a row.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
