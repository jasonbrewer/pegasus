import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ScopeCta } from "@/types/database";

/**
 * The anonymous scoping session — how a signed-out visitor at /scope is
 * recognised across their own requests, and nothing more than that.
 *
 * ===========================================================================
 * THE SESSION ID IS A CAPABILITY TOKEN, AND IT LIVES IN AN httpOnly COOKIE.
 *
 * It is minted here, on the server, with crypto.randomUUID(). It is never sent
 * to the browser as data, never rendered into the page, never put in the URL,
 * and never readable by script — httpOnly is what makes that last one true.
 *
 * That matters because naming a session id is the entire authorisation for
 * writing to that row (see 20260801000015). If the browser chose the id, or
 * could read it, a visitor could name someone else's session. It cannot: the
 * only thing the client ever does is trigger an action, and the action reads
 * the cookie the server itself set.
 *
 * Nothing identifying goes in the cookie. It is a random uuid with no meaning
 * outside our own table, which is also why it needs no consent banner: it
 * carries the answers the visitor is in the middle of typing, on the page they
 * are typing them into.
 * ===========================================================================
 */

export const SCOPE_SESSION_COOKIE = "pc_scope_session";

/** Long enough to survive "I'll come back to this tomorrow", and no longer. */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The cookie's value if it is there and well-formed, otherwise null. */
export async function readScopeSessionId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SCOPE_SESSION_COOKIE)?.value ?? "";
  return UUID_RE.test(value) ? value : null;
}

/**
 * The id for this visitor, minting and setting one if they don't have it yet.
 *
 * Only callable from a server action or route handler — a Server Component
 * cannot write cookies. That is why the public page starts its session from an
 * action on mount rather than while rendering.
 */
export async function ensureScopeSessionId(): Promise<string> {
  const existing = await readScopeSessionId();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const store = await cookies();
  store.set(SCOPE_SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return id;
}

/** What record_scope_session() will take. Every field is optional; see below. */
export type ScopeSessionPatch = {
  making_type?: string | null;
  /** The whole intake in engine.ts's vocabulary, not just the checklist. */
  answers?: Record<string, string> | null;
  shoot_location?: string | null;
  budget_input?: string | null;
  computed_estimate?: number | null;
  cta_clicked?: ScopeCta | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  referral_source?: Record<string, string> | null;
  last_step_reached?: string | null;
};

/**
 * Writes the patch onto this session's row.
 *
 * The RPC is the ONLY way anything writes to scope_sessions — neither `anon`
 * nor `authenticated` holds a table privilege on it, so there is no `.from()`
 * spelling of this that would work. Undefined fields are sent as null, and the
 * function reads null as "leave it alone", so a patch never clears an answer
 * the visitor already gave us.
 *
 * Errors are returned, never thrown. A failed capture is our bookkeeping
 * problem; it must not become an error message on top of the estimate that
 * the visitor actually came for.
 */
export async function recordScopeSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  patch: ScopeSessionPatch = {}
): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc("record_scope_session", {
    p_session_id: sessionId,
    p_making_type: patch.making_type ?? null,
    p_answers: patch.answers ?? null,
    p_shoot_location: patch.shoot_location ?? null,
    p_budget_input: patch.budget_input ?? null,
    p_computed_estimate: patch.computed_estimate ?? null,
    p_cta_clicked: patch.cta_clicked ?? null,
    p_contact_name: patch.contact_name ?? null,
    p_contact_email: patch.contact_email ?? null,
    p_contact_phone: patch.contact_phone ?? null,
    p_referral_source: patch.referral_source ?? null,
    p_last_step_reached: patch.last_step_reached ?? null,
  });

  if (error) {
    console.error("scope session capture failed", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Links an anonymous scoping session to the account the visitor just created
 * or signed into.
 *
 * Called from the signup and sign-in actions, which is what covers both halves
 * of "during or after the session": the cookie outlives the visit, so someone
 * who scopes on Tuesday and signs up on Thursday still gets their session
 * stamped. The stamp itself happens inside the function — user_id is taken
 * from auth.uid() and is not a parameter — so this passes no identity of its
 * own and cannot claim a session for anyone but the caller.
 *
 * Silent by design: nobody's signup fails because a lead-capture row didn't
 * get stamped.
 */
export async function claimScopeSessionForCaller(
  supabase: SupabaseClient<Database>
): Promise<void> {
  const sessionId = await readScopeSessionId();
  if (!sessionId) return;
  await recordScopeSession(supabase, sessionId);
}
