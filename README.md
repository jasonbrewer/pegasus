# Pegasus

A two-sided marketplace for hiring freelance video/production people, differentiated by a
regional, local-first proximity match instead of a hard geographic wall. First launch market:
Richmond, VA / Mid-Atlantic.

- **Freelancers** create a profile and apply to jobs — always free, unlimited.
- **Employers** post jobs — the paid side (Stripe is stubbed in v1, not wired up yet).

This is a v1 scaffold: Next.js app, Supabase schema/migration, and a stubbed two-role auth flow.
No job feed, job posting, or applicant UI yet — see [What's built vs. deferred](#whats-built-vs-deferred).

## Tech stack

- **Next.js** (App Router, TypeScript) — single full-stack codebase
- **Supabase** — Postgres + PostGIS for geo/proximity queries, Auth, Storage, Row Level Security
- **Stripe** — stubbed for v1 (schema supports it, no API calls yet)
- **Vercel** — deployment target

## Prerequisites

- Node.js 20+
- A Supabase project ([supabase.com](https://supabase.com)) — free tier is fine
- (Optional, for local DB dev) [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker

## 1. Configure Supabase

### Create the project

Create a new project at [supabase.com](https://supabase.com/dashboard). Note the project URL and
anon key from **Project Settings → API** — you'll need them in `.env.local`.

### Enable PostGIS

The migration runs `create extension if not exists "postgis";` itself, which works on Supabase's
hosted Postgres without any manual step. If you'd rather enable it by hand first, go to
**Database → Extensions** in the dashboard and turn on `postgis`.

### Run the migration

The schema lives in `supabase/migrations/`. Apply it with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste the contents of the files in `supabase/migrations/` (in order) into the SQL Editor in the
Supabase dashboard and run them.

### Configure Auth

- **Authentication → Providers → Email** should be enabled (it is by default).
- **Authentication → URL Configuration**: set the Site URL to your local/deployed app URL (e.g.
  `http://localhost:3000`), and add it to Redirect URLs — the auth callback route is at
  `/auth/callback`.
- Email confirmations are on by default on hosted Supabase. You can turn them off under
  **Authentication → Providers → Email → Confirm email** while developing, so `signUp` logs the
  user in immediately instead of waiting on a confirmation email.

### Storage (for later — reels, headshots, stills)

Not required for v1 scope (auth + schema only), but when profile media is built you'll want
buckets under **Storage**, e.g. `reels` and `headshots`, with RLS policies scoped to the owning
user — the same pattern used for the DB tables in the migration.

## 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=       # Project Settings > API > Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Project Settings > API > anon public key
SUPABASE_SERVICE_ROLE_KEY=      # Project Settings > API > service_role key (server-only, never expose)
```

`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` can stay blank — nothing calls Stripe yet.

## 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You can sign up as a freelancer or employer
from the landing page; each role lands on its own placeholder dashboard after sign-up.

## Data model (v1)

See `supabase/migrations/20260801000000_init_schema.sql` for the full DDL and RLS policies, and
`supabase/migrations/20260801000001_job_feed_function.sql` for the proximity-ranked query
functions. Summary:

- **`profiles`** — one row per `auth.users` row; `role` is `freelancer` or `employer`. Populated
  automatically by a trigger on signup from `auth.users.raw_user_meta_data`.
- **`roles`** — the job-role taxonomy (Director of Photography, Camera Operator, Editor, …), each
  tagged `on-location`, `regional`, or `remote`. This category drives the geo-matching behavior.
- **`freelancer_profiles`** / **`freelancer_roles`** — bio, day rate, home ZIP → lat/lng, travel
  radius, reel/portfolio links; a freelancer can hold multiple roles from the taxonomy.
- **`employer_profiles`** — company name + billing fields (`stripe_customer_id`) that sit unused
  until Stripe is wired up.
- **`jobs`** — role, location (ZIP → lat/lng), dates, rate, description, `travel_expected` flag,
  plus `payment_status`/`stripe_checkout_session_id` stub columns so employer billing can switch
  on later without a schema change.
- **`applications`** — a freelancer applying to a job (unique per job/freelancer pair, unlimited
  and free).

### Geo matching

Every freelancer and job stores a `geography(Point, 4326)` column, generated from plain
`lat`/`lng` numeric columns via `GENERATED ALWAYS AS (...) STORED`, indexed with GiST for fast
proximity queries. Matching is soft, not a hard wall:

- `on-location` / `regional` roles are ranked by distance (`job_feed` widens with
  `p_radius_miles`, doesn't hard-exclude beyond it unless you pass a radius).
- `remote` roles are never geo-filtered — they're surfaced platform-wide and sorted last/by recency
  instead of distance.

`public.job_feed(...)` returns the proximity-ranked job feed for a freelancer;
`public.job_applicants(job_id)` returns the proximity-ranked applicant list for an employer's job.

## What's built vs. deferred

**Built in this scaffold:**
- Next.js app (App Router, TypeScript, Tailwind)
- Full v1 database schema + RLS + PostGIS proximity functions
- Supabase client helpers (browser, server, proxy/session-refresh)
- Stubbed auth: sign up (with role picker), sign in, sign out, auth callback route, role-aware
  dashboard redirect

**Explicitly not built yet** (next, after schema review):
- Freelancer profile editing UI
- Job posting UI
- Job feed UI (proximity-ranked, filterable by role)
- Applicant list UI

**Deferred to v2** (per product brief — do not build yet):
- Employer reviews
- Live Stripe payments/escrow
- Messaging, notifications, multi-metro expansion tooling

## Note on the role taxonomy

The product brief left the role list as `[FILL IN]` and pointed to an example list as the shape to
follow. This scaffold seeds that example list verbatim (DP, Camera Operator, Gaffer, Grip, Audio/
Sound Mixer, Drone/Aerial Operator, Editor, Colorist, Motion/VFX, Producer, PA) in
`supabase/migrations/20260801000000_init_schema.sql` and mirrors it in `src/lib/roles.ts`. Treat it
as a placeholder — swap in the real taxonomy before launch (it's a one-table edit plus updating the
mirrored constant).

## Deploy

Deploy to [Vercel](https://vercel.com/new) and set the same environment variables from
`.env.example` in the project's Environment Variables settings.
