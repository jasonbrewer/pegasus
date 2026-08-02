-- Group 3 — profile media.
--
-- 3.1 Profile picture (Supabase Storage)
-- 3.2 Reel + video links
-- 3.3 Rich-text credits/bio (stores HTML)
--
-- All three are PUBLIC fields under the privacy model, i.e. visible to any
-- logged-in user and to nobody else. Contact information stays in the
-- freelancer_contacts / job_contacts tables from Group 1 and is untouched here.

-- ---------------------------------------------------------------------------
-- 3.1 — Profile picture
--
-- The column holds a Storage object PATH ("<user-id>/<file>"), not a URL: the
-- avatars bucket is private, so the app mints a short-lived signed URL per
-- render. A public bucket would have made avatars fetchable without a session,
-- which the privacy model forbids. Renamed rather than added so there is no
-- dead column — nothing read avatar_url.
-- ---------------------------------------------------------------------------

alter table public.profiles rename column avatar_url to avatar_path;

-- ---------------------------------------------------------------------------
-- 3.3 — Rich-text credits
--
-- Stores sanitized HTML. Sanitizing happens server-side in src/lib/sanitize.ts
-- before the value ever reaches this column, because the profile page renders
-- it with dangerouslySetInnerHTML.
-- ---------------------------------------------------------------------------

alter table public.freelancer_profiles
  add column credits_html text;

-- ---------------------------------------------------------------------------
-- 3.2 — Video links
--
-- freelancer_profiles already has a single reel_url and portfolio_url; this
-- table carries the additional YouTube/Vimeo links, which are a list.
-- ---------------------------------------------------------------------------

create table public.freelancer_videos (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.freelancer_profiles (profile_id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index freelancer_videos_freelancer_id_idx
  on public.freelancer_videos (freelancer_id, sort_order);

alter table public.freelancer_videos enable row level security;

create policy "freelancer videos are readable by authenticated users"
  on public.freelancer_videos for select
  to authenticated
  using (true);

create policy "freelancers manage their own videos"
  on public.freelancer_videos for all
  to authenticated
  using (auth.uid() = freelancer_id)
  with check (auth.uid() = freelancer_id);

-- RLS narrows privileges; it never grants them. Without this every read of the
-- table raises "permission denied for table".
grant select, insert, update, delete on public.freelancer_videos to authenticated;

-- ---------------------------------------------------------------------------
-- 3.1 (cont.) — Storage bucket and policies
--
-- Guarded so the migration also runs against a plain Postgres instance (local
-- verification), where the storage schema does not exist. On Supabase the
-- guard passes and the bucket and policies are created.
-- ---------------------------------------------------------------------------

do $$
declare
  bucket_ready boolean;
begin
  -- pg_catalog.pg_namespace, NOT information_schema.schemata.
  --
  -- information_schema.schemata is privilege-filtered: it lists only schemas
  -- the current role owns or holds a privilege on. On Supabase the storage
  -- schema is owned by supabase_storage_admin, so a migration role without an
  -- explicit grant sees ZERO rows there even though the schema plainly exists
  -- — and this whole block silently no-opped while the migration reported
  -- success. pg_namespace is the catalog and is never filtered.
  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    raise notice 'storage schema absent — skipping bucket setup (expected outside Supabase)';
    return;
  end if;

  -- Private bucket: objects are reachable only through a signed URL minted for
  -- a logged-in viewer, never by guessing a public URL.
  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', false)
  on conflict (id) do update set public = false;

  execute $p$
    drop policy if exists "avatars readable by authenticated users" on storage.objects;
    create policy "avatars readable by authenticated users"
      on storage.objects for select
      to authenticated
      using (bucket_id = 'avatars');
  $p$;

  -- Writes are confined to a folder named after the user's id, so one user
  -- cannot overwrite another's avatar.
  execute $p$
    drop policy if exists "users upload their own avatar" on storage.objects;
    create policy "users upload their own avatar"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $p$;

  execute $p$
    drop policy if exists "users update their own avatar" on storage.objects;
    create policy "users update their own avatar"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $p$;

  execute $p$
    drop policy if exists "users delete their own avatar" on storage.objects;
    create policy "users delete their own avatar"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $p$;

  -- Post-condition. If the storage schema exists, this block must have done
  -- its work; anything else is a silent skip of the kind described above, and
  -- should fail the migration rather than leave avatars unconfigured.
  select exists (
    select 1 from storage.buckets where id = 'avatars' and public is false
  ) into bucket_ready;

  if not bucket_ready then
    raise exception
      'avatars bucket missing or public after setup — storage configuration did not apply';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars readable by authenticated users'
  ) then
    raise exception 'avatars storage policies did not apply';
  end if;
end $$;
