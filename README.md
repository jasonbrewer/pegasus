# Production Circles

A two-sided marketplace for hiring freelance video/production people, differentiated by a
regional, local-first proximity match instead of a hard geographic wall. First launch market:
Richmond, VA / Mid-Atlantic. Production domain: `productioncircles.com`.

> **Naming.** "Production Circles" is the product's user-facing name. The internal
> identifiers deliberately still read `pegasus` — the npm package name, the Supabase
> `project_id`, the repo, and the Vercel project. Renaming those would break the build,
> the deploy, and the Supabase connection for no user benefit, so they stay.

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

### Seed the ZIP-code table (required)

Signup and job posting both resolve a ZIP to a lat/lng against the `zip_codes` table, and reject
any ZIP that isn't in it. **Until this is seeded, nobody can sign up as a freelancer or post a
job.** After setting the env vars in step 2:

```bash
npm run seed:zips
```

This loads all 42,249 rows from `data/us-zip-centroids.csv`. It's idempotent (upserts on `zip`),
so re-running is safe. See [ZIP geocoding](#zip-geocoding) for provenance and precision.

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
NEXT_PUBLIC_SITE_URL=           # https://productioncircles.com — the origin invite links are built from
```

`NEXT_PUBLIC_SITE_URL` is optional locally: the invite widget falls back to the request's
own headers. Set it in production so a shared invite link points at the real domain rather
than whatever hostname the request happened to arrive on.

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
- **`employer_profiles`** — company name, description, website, optional ZIP → lat/lng, plus
  billing fields (`stripe_customer_id`) that sit unused until Stripe is wired up.
- **`jobs`** — role, location (ZIP → lat/lng), dates, rate, description, `travel_expected` flag,
  plus `payment_status`/`stripe_checkout_session_id` stub columns so employer billing can switch
  on later without a schema change.
- **`applications`** — a freelancer applying to a job (unique per job/freelancer pair, unlimited
  and free).
- **`zip_codes`** — 42,249 US ZIP centroids. Every ZIP a user submits is resolved against this
  table; see [ZIP geocoding](#zip-geocoding).

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

## Visibility: members-only

Production Circles is login-gated. A signed-out visitor sees the landing page and the
sign-in / sign-up pages, and nothing else — no profiles, no job listings.

This is enforced in two independent places, so neither one is a single point of failure:

- **RLS** — `profiles`, `freelancer_profiles`, `freelancer_roles`, `employer_profiles`, `jobs`,
  and `applications` grant `select` only `to authenticated`. An anonymous client gets zero rows
  from every one of them, even hitting PostgREST directly with the anon key.
- **Route protection** — `src/lib/supabase/middleware.ts` redirects signed-out requests for any
  non-public path to `/sign-in?next=…`, so users land back where they were headed instead of
  seeing an empty page. The `next` parameter only accepts same-origin relative paths, so it
  can't be used as an open redirect.

Two tables stay readable without a session, deliberately:

- **`zip_codes`** — signup has to validate a ZIP *before* the user has a session. Locking this
  down would break sign-up.
- **`roles`** — the static job-role taxonomy. Reference data, not user data.

Owner-only write policies and applicant privacy (an application is visible only to the applicant
and to the job's employer) are unchanged.

## Access control: a curated community

Being logged in is not the same as being let in. Every account carries a
`profiles.status` of `pending`, `approved` or `blocked`, and the marketplace is gated on it.

- **Freelancers sign up `pending`.** They can sign in and build a profile, but they are absent
  from the marketplace — not in profile browsing, not in role searches, not in an employer's
  applicant list — and they cannot apply to jobs. An admin approving them flips all of that on.
- **Employers sign up `approved`.** They post the same day. An admin can `block` one, which
  hides every posting they have and refuses new ones.
- **`blocked` means out**, for either role: hidden from others, actions refused.

An invite link (see `src/lib/invite.ts`) does *not* auto-approve. The inviter's id is carried
through signup into `profiles.invited_by`, so the application surfaces in the queue as
"invited by X" — a fast track through the queue, not around it.

All of this lives in RLS and in column privileges, not in TypeScript. The relevant policies are
in `supabase/migrations/20260801000010_group9_access_control.sql`; two helpers,
`public.is_participating(uuid)` and `public.current_user_is_admin()`, are `security definer` so
that policies can consult a profile without recursing through the very policy being evaluated.

### Making someone an admin

There is deliberately no UI for this. Set the flag by hand:

```sql
update public.profiles set is_admin = true where id = '<user-uuid>';
```

Admins get the moderation panel at `/admin` — the queue of pending applications with their
invited-by info, the employer list, and a lookup for any account. The route 404s for everyone
else.

Admins get **read** carve-outs in RLS (they can see accounts of any status) and exactly one
write: `public.admin_set_account_status(profile_id, status)`, which sets `status` and nothing
else, refuses non-admins, and refuses an admin changing their own account. There is no admin
UPDATE policy anywhere — an admin holding a valid token cannot `PATCH /profiles` directly any
more than a normal member can.

### Nobody can promote themselves

`profiles` has no table-level `UPDATE` grant. `authenticated` holds a column-level grant on
exactly `full_name` and `avatar_path`, so `status`, `is_admin` and `role` are unwritable from
the client — a row-level policy could not have expressed that, because RLS cannot restrict
*which columns* of a permitted row you may write.

## Password recovery — what you must configure

The flow is built (`/forgot-password` → emailed link → `/auth/callback` → `/reset-password`), but
it sends an **outgoing email from Supabase**, and that part is configuration, not code. Without
the two settings below the link either never arrives or arrives pointing at the wrong host.

### 1. Redirect URL allowlist (required — recovery is broken without it)

Supabase refuses any `redirectTo` that is not on its allowlist, and fails *silently* from the
user's point of view: the mail arrives, the link bounces to the site root, and nothing happens.

**Dashboard → Authentication → URL Configuration**

- **Site URL**: `https://productioncircles.com`
- **Redirect URLs**: add `https://productioncircles.com/auth/reset`
  (plus `http://localhost:3000/auth/reset` for local work, and your Vercel preview pattern if
  you test recovery on previews). `/auth/callback` and `/auth/confirm` can stay listed — links
  already sitting in inboxes point at them.

Also set `NEXT_PUBLIC_SITE_URL=https://productioncircles.com` in Vercel — the reset link is built
from it, and without it the link is built from whatever hostname the request arrived on.

### 2. Email sending — the built-in sender is NOT good enough for launch

Supabase's built-in SMTP is explicitly a development convenience:

- **Rate limited to a handful of emails per hour, project-wide.** Not per user — per project. A
  few people resetting passwords in the same hour and the rest silently get nothing.
- **Sends from a shared Supabase domain**, so it has no reputation tied to productioncircles.com
  and lands in spam often enough to matter.
- **No delivery visibility** — no bounce handling, no log of what was sent.

For launch, configure custom SMTP: **Dashboard → Project Settings → Authentication → SMTP
Settings**. Resend, Postmark and SES all work; all need a verified sending domain (a couple of
DNS records) before mail leaves reliably. Until that is done, treat recovery as working but
unreliable — fine for testing, not for real members locked out of their accounts.

### 3. The recovery email template — REQUIRED, and it must use `{{ .TokenHash }}`

**Dashboard → Authentication → Email Templates → Reset Password.** Two things are wrong with
the default: it says "Supabase" rather than "Production Circles", and it uses
`{{ .ConfirmationURL }}`, which is what produced the `otp_expired` bug.

`{{ .ConfirmationURL }}` points at Supabase's own `/auth/v1/verify`, which **consumes the
single-use token on the first GET**. Gmail's link scanners, corporate mail gateways, Slack and
iMessage unfurlers and browser prefetch all issue that GET before a human clicks — so the token
is spent, and the person clicking their own link is told it has expired. It also forces the
whole flow into PKCE, which requires the code-verifier cookie set when the reset was requested,
so opening the mail on a phone after requesting on a laptop cannot work.

`{{ .TokenHash }}` has neither problem: nothing is consumed until our page POSTs it, and
`verifyOtp()` needs nothing from the browser, so any device can open the link.

Paste this in:

```html
<h2>Reset your Production Circles password</h2>
<p>Someone asked to reset the password for this address. If that was you, use the link below —
it expires in an hour and can only be used once.</p>
<p><a href="{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}">Choose a new password</a></p>
<p>If it wasn't you, ignore this email. Your password stays as it is.</p>
```

`{{ .SiteURL }}` is the Site URL from step 1, so set that correctly first.

The in-app copy matches: the request page promises a link that "expires in an hour", the landing
page explains that nothing happens until the button is pressed, and an expired or reused link
lands on `/forgot-password` saying exactly that.

The link deliberately carries no `type`. It does not need one: the **path** decides that
recovery is what is happening, and a path cannot be dropped on the way through Supabase's
verify endpoint — which is what went wrong when `type` was a query parameter.

### How the flow routes, once configured

```
/forgot-password  → resetPasswordForEmail({ redirectTo: "<site>/auth/reset" })
      ↓ email
/auth/reset?token_hash=…        ← GET only renders a button; consumes NOTHING
      ↓ the user presses "Continue"  (POST, intent=recovery fixed by the route)
confirmEmailLink() → verifyOtp() → session + a short-lived recovery marker cookie
      ↓
/reset-password   ← requires BOTH the session and that marker
      ↓ updateUser({ password }), marker cleared, signed out
/sign-in?password_changed=1
```

`/auth/callback` and `/auth/confirm` still exist for links already sitting in inboxes. Neither
consumes anything on GET, and both now treat a token with no `type` as recovery — recovery is
the only mail this project sends, since signup confirmations are off.

### Changing a password while signed in

`/account/password`, linked from both profile editors. It asks for the current password and
verifies it before writing. That is the difference from `/reset-password`: without a
current-password check, any unattended logged-in browser would be an account takeover, which is
also why `/reset-password` refuses to work without the recovery marker.

## ZIP geocoding

Users enter a ZIP; the system stores the ZIP's centroid as lat/lng. There is no external
geocoding API — the dataset is committed to this repo, so the seed is reproducible offline and
there's no key to manage, no rate limit, and no runtime dependency.

**Precision is ZIP-centroid level by design.** We rank "who is near me," not street addresses.
A freelancer is placed at the center of their ZIP, which is accurate to roughly a mile in dense
areas and a few miles in rural ones — well inside the tolerance of a 25-mile travel radius.

### Where the data came from

`data/us-zip-centroids.csv` was generated from the [`zipcodes`](https://www.npmjs.com/package/zipcodes)
npm package (v8.0.0, BSD license), whose US data derives from the public-domain
[federalgovernmentzipcodes.us](http://federalgovernmentzipcodes.us/) dataset.

Columns are `zip,lat,lng,city,state`. Of the package's 42,555 US entries, 306 were dropped
because they carried `0,0` coordinates — those ZIPs are rejected at signup rather than silently
placed off the coast of Africa. That leaves **42,249 rows**.

Accuracy was spot-checked against 18 known city-center ZIPs: median error 0.5 km, max 2.2 km,
none over 10 km. (A different candidate dataset — `midwire/free_zipcode_data` — was rejected for
having 4 of those same 18 off by more than 10 km, up to 45 km.)

The file includes military/diplomatic ZIPs (states `AA`/`AE`/`AP`) and territories such as
American Samoa, positioned at their real overseas coordinates. Those are genuine US ZIPs, so
they're kept — they simply rank as very distant.

### Re-running the seed

```bash
npm run seed:zips
```

Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`. The service
role is required because `zip_codes` is read-only under RLS. The script upserts on the `zip`
primary key, so it's safe to re-run.

To refresh the dataset itself, regenerate the CSV from a newer source and re-run the seed — the
schema doesn't change.

### How validation is enforced

Two layers, deliberately:

1. **App layer** (`src/lib/geocode.ts`) — signup and job posting look the ZIP up first so the user
   gets a clean "Enter a valid US ZIP code" form error.
2. **Database layer** — `handle_new_user`, `resolve_freelancer_home_zip`, and
   `resolve_job_location_zip` re-derive lat/lng from `zip_codes` on every write and raise on an
   unknown ZIP. Coordinates are never taken from client input, so they can't be spoofed, and
   changing a ZIP later automatically moves the coordinates with it.

ZIP+4 input (`23220-1234`) is normalized to the 5-digit code at both layers.

## What's built vs. deferred

**Built in this scaffold:**
- Next.js app (App Router, TypeScript, Tailwind)
- Full v1 database schema + RLS + PostGIS proximity functions
- Supabase client helpers (browser, server, proxy/session-refresh)
- Stubbed auth: sign up (with role picker), sign in, sign out, auth callback route, role-aware
  dashboard redirect
- ZIP → lat/lng geocoding from a committed centroid table, enforced at both app and DB layers
- Job posting form + server action (role picker grouped by taxonomy, validated ZIP)
- Freelancer and employer profile pages (owner-gated edit + members-only view)
- Login gating: RLS scoped to authenticated, plus route-level redirects

**Explicitly not built yet:**
- Freelancer profile editing UI
- Job feed UI (proximity-ranked, filterable by role) — `job_feed()` exists and is tested, but
  nothing renders it yet
- Applicant list UI — same, `job_applicants()` exists
- Apply-to-job flow

**Deferred to v2** (per product brief — do not build yet):
- Employer reviews
- Live Stripe payments/escrow
- Messaging, notifications, multi-metro expansion tooling

## Role taxonomy

24 roles across 7 groups (Camera, Lighting & Grip, Audio, Production, Post-Production, Talent &
Creative, Full-Service). Each role carries a `category` — `on-location`, `regional`, or `remote` —
which drives the geo matching described above, plus a `role_group` used purely for UI bucketing.

The taxonomy is defined in two places that must stay in sync:

- `supabase/migrations/20260801000000_init_schema.sql` — the `roles` table seed (source of truth)
- `src/lib/roles.ts` — the client-side mirror, plus `ROLE_GROUPS` / `ROLES_BY_GROUP` helpers for
  grouped rendering

The column is named `role_group` rather than `group` because `GROUP` is a reserved word in
Postgres and would need quoting at every call site.

## Deploy

Deploy to [Vercel](https://vercel.com/new) and set the same environment variables from
`.env.example` in the project's Environment Variables settings.
