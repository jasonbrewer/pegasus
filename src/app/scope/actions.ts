"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import {
  ensureScopeSessionId,
  readScopeSessionId,
  recordScopeSession,
  type ScopeSessionPatch,
} from "@/lib/scoping/session";
import {
  CHECKLIST,
  COUNT_OPTS,
  LEN_OPTS,
  MAKING,
  POLISH,
  QUESTIONS,
  TRI_OPTS,
} from "@/lib/scoping/engine";

/**
 * The write side of the public scope tool.
 *
 * ===========================================================================
 * EVERY ARGUMENT HERE IS UNTRUSTED.
 *
 * A server action is a public endpoint. These are reachable by anyone with a
 * POST, not only by the tool that renders above them, and the tool is the one
 * caller that will always send well-formed input. So nothing below trusts its
 * shape: strings are clipped, the checklist is rebuilt from the keys engine.ts
 * actually defines, the estimate has to be a finite number, and the CTA has to
 * be one of two literals.
 *
 * record_scope_session() clamps all of this a second time in SQL, and the
 * table has check constraints under that. Three layers is right for the one
 * table in this product that a stranger can write to.
 * ===========================================================================
 *
 * WHICH ROW ANY OF THIS WRITES TO IS NOT AN ARGUMENT. It comes from the
 * httpOnly cookie, so a caller cannot aim these at somebody else's session
 * however they craft the request.
 */

const clip = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, max);
};

/**
 * The allow-list for `answers`, built FROM engine.ts's own option lists rather
 * than typed out again here.
 *
 * That is the point: the intake is the tool's to change, and a hand-copied list
 * of valid values would be a second source of truth that silently starts
 * rejecting new options the day someone adds one. Add a question to QUESTIONS
 * or an option to LEN_OPTS and this accepts it on the next build, with no edit
 * here and no migration.
 */
const TRI_VALUES = new Set(TRI_OPTS.map(([value]) => value as string));

const ANSWER_VALUES: Record<string, Set<string>> = {
  // onCamera, destination, filming, hire, distance
  ...Object.fromEntries(
    QUESTIONS.map((q) => [q.key as string, new Set(q.opts.map(([value]) => value))])
  ),
  polish: new Set(POLISH.map((p) => p.key as string)),
  count: new Set(COUNT_OPTS.map(([value]) => value as string)),
  each: new Set(LEN_OPTS.map(([value]) => value as string)),
  // secondCam, audio, drone, graphics — all three-state
  ...Object.fromEntries(CHECKLIST.map((item) => [item.key as string, TRI_VALUES])),
};

const MAKING_LABELS = new Set(MAKING.map((m) => m.label));

/**
 * The complete intake, rebuilt key by key — never passed through as-is.
 *
 * An unknown key is dropped and an unrecognised value is dropped, so what
 * reaches the database is always something the tool could actually have
 * produced. A stranger POSTing at this action cannot use `answers` as a
 * free-text jsonb column.
 */
function cleanAnswers(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const out: Record<string, string> = {};

  // The two that aren't a pick from a fixed list: one is a label from a known
  // set, the other is whatever they typed into "Where's the shoot?".
  const making = clip(source.making, 120);
  if (making && MAKING_LABELS.has(making)) out.making = making;

  const shootLocation = clip(source.shootLocation, 160);
  if (shootLocation) out.shootLocation = shootLocation;

  for (const [key, allowed] of Object.entries(ANSWER_VALUES)) {
    const value = source[key];
    if (typeof value === "string" && allowed.has(value)) out[key] = value;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Marketing attribution, and only the fields named here.
 *
 * Note what this does NOT do: there is no IP lookup, no fingerprint, no
 * geolocation. Where the shoot is comes from the question the tool asks and
 * from nowhere else. This is the referrer and the UTM tags the visitor's own
 * link already carried — it says where the click came from, not who clicked.
 */
const REFERRAL_KEYS = [
  "referrer",
  "landing_path",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

function cleanReferral(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of REFERRAL_KEYS) {
    const value = clip(source[key], 200);
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function cleanEstimate(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;
  return Math.min(Math.max(Math.round(input), 0), 10_000_000);
}

/** The answer fields the tool sends as it goes. */
export type ScopeProgressInput = {
  makingType?: unknown;
  /** The whole intake, not just the judgment checklist. */
  answers?: unknown;
  shootLocation?: unknown;
  budgetInput?: unknown;
  computedEstimate?: unknown;
  lastStepReached?: unknown;
};

function patchFromProgress(input: ScopeProgressInput): ScopeSessionPatch {
  return {
    making_type: clip(input.makingType, 120),
    answers: cleanAnswers(input.answers),
    shoot_location: clip(input.shootLocation, 160),
    budget_input: clip(input.budgetInput, 40),
    computed_estimate: cleanEstimate(input.computedEstimate),
    last_step_reached: clip(input.lastStepReached, 80),
  };
}

/**
 * Called once when the tool mounts. Mints the cookie and creates the row, so a
 * visitor who answers one question and leaves is still a row we can count.
 */
export async function startScopeSession(
  referral: unknown,
  progress: ScopeProgressInput = {}
): Promise<void> {
  const sessionId = await ensureScopeSessionId();
  const supabase = await createClient();

  await recordScopeSession(supabase, sessionId, {
    ...patchFromProgress(progress),
    referral_source: cleanReferral(referral),
  });
}

/**
 * Called on each answer, each step change, and each blur of a typed field —
 * not on submit, because there is no submit. Someone who fills in the budget
 * and then closes the tab has already left us the budget.
 */
export async function saveScopeProgress(progress: ScopeProgressInput): Promise<void> {
  const sessionId = await readScopeSessionId();
  // No cookie means the session never started — startScopeSession() will
  // create the row a moment later with the same answers.
  if (!sessionId) return;

  const supabase = await createClient();
  await recordScopeSession(supabase, sessionId, patchFromProgress(progress));
}

export type ProducerCallState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; name: string };

/**
 * The primary CTA: "Have a producer call me — free".
 *
 * Validation is deliberately thin. This is a lead form, not an account: a name
 * and one way to reach them is the bar, and a fussier form would lose people
 * who are already at the point of asking for a call. Phone goes through the
 * same normaliser the rest of the product uses, so the number a producer dials
 * off this table looks like every other number in the database.
 */
export async function requestProducerCall(
  _previous: ProducerCallState,
  formData: FormData
): Promise<ProducerCallState> {
  const name = clip(formData.get("contact_name"), 120);
  const email = clip(formData.get("contact_email"), 200);
  const phone = normalizePhone(formData.get("contact_phone"));

  if (!name) return { status: "error", message: "Tell us your name so we know who to ask for" };
  if (!email && !phone) {
    return { status: "error", message: "We need an email or a phone number to reach you on" };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "That email address doesn't look right" };
  }

  const sessionId = await ensureScopeSessionId();
  const supabase = await createClient();

  const { ok } = await recordScopeSession(supabase, sessionId, {
    cta_clicked: "call_me",
    contact_name: name,
    contact_email: email,
    contact_phone: phone,
  });

  if (!ok) {
    return {
      status: "error",
      message: "Something went wrong saving that. Try again, or email hello@productioncircles.com",
    };
  }

  return { status: "sent", name };
}

/**
 * The secondary CTA. A form-and-redirect rather than a link with an onClick,
 * because a fire-and-forget request raced against a navigation is a request
 * that sometimes doesn't happen — and "they went to sign up" is the second
 * most useful thing this table records.
 */
export async function startSignupFromScope(): Promise<void> {
  const sessionId = await readScopeSessionId();

  if (sessionId) {
    const supabase = await createClient();
    await recordScopeSession(supabase, sessionId, { cta_clicked: "signup" });
  }

  redirect("/sign-up?role=employer");
}
