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
import { CHECKLIST, TRI_OPTS } from "@/lib/scoping/engine";

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

const TRI_VALUES = new Set(TRI_OPTS.map(([value]) => value as string));
const CHECKLIST_KEYS = CHECKLIST.map((item) => item.key as string);

/** Rebuilt from the four keys engine.ts defines — never passed through as-is. */
function cleanJudgment(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of CHECKLIST_KEYS) {
    const value = source[key];
    if (typeof value === "string" && TRI_VALUES.has(value)) out[key] = value;
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
  judgmentAnswers?: unknown;
  shootLocation?: unknown;
  budgetInput?: unknown;
  computedEstimate?: unknown;
  lastStepReached?: unknown;
};

function patchFromProgress(input: ScopeProgressInput): ScopeSessionPatch {
  return {
    making_type: clip(input.makingType, 120),
    judgment_answers: cleanJudgment(input.judgmentAnswers),
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
