# Claude Code Spec — Client Scope Tool ("Scope a job")

## Goal
Port the working `client-scope.jsx` prototype into Pegasus as an employer-facing
scoping tool. A non-producer buyer answers a few plain questions and gets an honest,
tiered, line-item video estimate before (or instead of) posting a job.

**v1 is deliberately minimal and low-risk:**
- Frontend only. **No new migration. No Supabase schema change. Does not touch RLS
  or any Batch 6 surface.**
- Baseline rates live in a **config file** that JB edits + redeploys. No DB.
- Employer-facing page shows the **scoper only** — the prototype's "Baseline rates"
  tab is JB's control and is **NOT shipped to employers** (see §5).

---

## 1. Source material
The prototype is the file `client-scope.jsx` (single React component, default export
`ClientScope`). It contains:
- `BASELINE_DEFAULTS` — the house rate sheet (numbers + `trigger`/`help` copy)
- `MAKING`, `POLISH`, `QUESTIONS`, `COUNT_OPTS`, `LEN_OPTS`, `COUNT_N`, `AUDIO_MAKING`, `DEFAULTS`
- `buildScope(answers, baseline, variant)` — pure pricing function, returns `{lines, notes, dropped, total, ...}`
- UI: `MakingPicker`, `OptionGroup`, `PolishPicker`, `Deliverables`, `Estimate`, `ScopeTab`, `BaselineTab`, `MoneyInput`

All logic is framework-agnostic React + inline CSS (no external UI deps, no browser
storage). It drops into Next.js App Router with minimal change.

---

## 2. Where it lives (routes)
Resolve exact paths against the existing employer route structure in the repo
(match whatever convention the current employer dashboard + Post-a-Job pages use —
e.g. `src/app/(employer)/…` or `src/app/employer/…`).

- **New page:** employer-area route `…/scope/page.tsx` — the scoping tool.
- Must sit **behind the existing employer auth guard** (logged-in employer only),
  reusing the same guard/layout the Post-a-Job page uses. Do not invent a new auth path.
- It is a **client component** (`"use client"`) — it's all local state.

---

## 3. Split the prototype for Pegasus
The prototype ships two tabs. **Only ship the scoper.**

- Extract the pricing engine + constants into a lib module, e.g.
  `src/lib/scoping/engine.ts` (exports `buildScope`, the option constants, and types).
- Extract the rate sheet into a **config file** (§4).
- The employer page renders **only** `ScopeTab`'s content (intake + `Estimate`).
  Remove the top tab nav, the `BaselineTab`, and its imports from the employer page.
- Keep `MoneyInput` (it fixes the $-overlap) for the budget field.

---

## 4. Baseline rates as config (no DB in v1)
- Create `src/lib/scoping/baseline.ts` exporting the rate sheet currently in
  `BASELINE_DEFAULTS` (numbers, groups, labels, `trigger`/`help`, and the two special
  knobs `minsPerEditDay` and `deliverableFee`, plus `editHour`).
- JB changes a rate by editing this file and redeploying. Document that at the top of
  the file in a comment.
- **Do not** read rates from Supabase in v1. (Deferred DB version in §7.)

---

## 5. Baseline editor is admin-only and DEFERRED
- Employers must never see or edit baseline rates.
- For v1, JB edits the config file directly — **no admin UI needed yet.**
- (Later: a JB-only editor in the existing `/admin` area, backed by the §7 table.)

---

## 6. Entry points (the "where's the button" answer)
Two placements, same destination (`…/scope`):

1. **Employer dashboard** — a secondary card/button beside the primary "Post a Job"
   CTA. Copy:
   - Hook (heading/link): **"Not sure what a video should cost?"**
   - Button (action): **"Scope a job"**
   Style it clearly secondary to the primary Post-a-Job button; match existing
   dashboard component styling.

2. **Top of the empty Post-a-Job form** — a slim inline prompt for people who click
   Post a Job cold: **"First time hiring video? Scope it here →"** linking to `…/scope`.

Keep the vocabulary consistent: the action is always "Scope a job" wherever it appears.

---

## 7. Documented follow-ups (NOT in v1 — do not build now)
Leave TODO comments referencing these; do not implement:
- **DB-backed rates:** a single isolated `scoping_baseline` table (or one JSONB row),
  JB-only write via the existing admin security-definer pattern, read by the engine.
  This is the only piece that needs a migration, and it should land **after Batch 6
  merges** so it doesn't stack on the security batch.
- **Admin rate editor** in `/admin` (ports the prototype's `BaselineTab`, reading/writing the table above).
- **Pre-fill Post-a-Job from a scope:** carry the finished scope (suggested title,
  budget range, description hints) into the New Job form so a scoped job posts
  pre-filled. This is where the tool stops being a calculator and becomes the on-ramp
  into posting — highest-value upgrade, but a separate task.

---

## 8. Acceptance checks
- Logged-out user hitting `…/scope` is bounced by the same guard as Post-a-Job.
- Employer sees the scoper; there is **no** baseline-rates tab anywhere in the employer UI.
- Changing a number in `src/lib/scoping/baseline.ts` changes the estimate after redeploy.
- `git grep` confirms **no new migration file** and **no Supabase client call** added
  by this feature.
- The three deliverables cases still price correctly through `buildScope`:
  one 4-min = one edit day; four 1-min = one edit day + 3× per-cut fee;
  eight 30-sec = one edit day + 7× per-cut fee.
- Budget-fit tiers (lean/recommended/premium), travel/licensing notes, and the
  standing "ask your production professional about audio" advisory all render.

---

## 9. Out of scope (explicitly)
- The freelancer-side scoper / bidding tool (parked — not part of this project scope).
- Any change to jobs, applications, profiles, RLS, or Batch 6 work.
- Saving/persisting a scope. v1 is stateless; nothing is written anywhere.
