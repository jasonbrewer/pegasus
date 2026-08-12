import type { ScopeProgress } from "@/components/scope/scope-tool";

/**
 * Lead capture for the static bundle.
 *
 * ===========================================================================
 * THE ONE REAL DIFFERENCE FROM THE HOSTED TOOL — READ THIS FIRST.
 *
 * The hosted tool mints its session id on the server and keeps it in an
 * httpOnly cookie, so the browser can neither choose it nor read it. A static
 * page on someone else's web host has no server, so this build mints the id in
 * the browser with crypto.randomUUID() and keeps it in localStorage.
 *
 * What that costs, precisely: the capability token is now readable by script
 * running on this page. What it does NOT cost:
 *
 *   * the id is still 122 bits of CSPRNG entropy, so nobody guesses one;
 *   * record_scope_session() still returns void, so holding an id — your own
 *     or a guessed one — reveals nothing about the row behind it. It is not a
 *     read oracle, and there is no other read path: `anon` holds no privilege
 *     on scope_sessions at all;
 *   * the worst a stranger can do with a token they somehow obtained is write
 *     over an unclaimed session's own fields. There is nothing to steal, and
 *     no other row is reachable.
 *
 * crypto.randomUUID() needs a secure context, which is satisfied wherever this
 * page is served over HTTPS. On a plain-http origin it is undefined, and the
 * fallback below keeps the tool working (capture goes quiet for that visit
 * rather than the estimate breaking).
 * ===========================================================================
 *
 * The other difference is smaller: the hosted tool posts to a server action
 * which re-validates every field before it reaches the database. This build
 * posts to the RPC directly. That is the same trust boundary either way — a
 * server action is a public endpoint too — and record_scope_session() clamps
 * every field in SQL with the table's check constraints under it. Nothing here
 * is trusted by anything downstream.
 */

const { supabaseUrl, supabaseAnonKey, source } = __SCOPE_CONFIG__;

const ENDPOINT = `${supabaseUrl}/rest/v1/rpc/record_scope_session`;

/** Deliberately generic: this key is visible in devtools on a shared host. */
const STORAGE_KEY = "scope_session_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What record_scope_session() takes. Snake-cased because the RPC is. */
type Patch = {
  p_making_type?: string | null;
  p_answers?: Record<string, string> | null;
  p_shoot_location?: string | null;
  p_budget_input?: string | null;
  p_computed_estimate?: number | null;
  p_cta_clicked?: "call_me" | "signup" | null;
  p_referral_source?: Record<string, string> | null;
  p_last_step_reached?: string | null;
};

/**
 * The session id, minted once per browser and reused across visits.
 *
 * Memoised, because the catch path mints a throwaway id: without the memo a
 * visitor with localStorage disabled would get a fresh id — and therefore a
 * fresh row — on every single save.
 */
let cachedId: string | null = null;

function sessionId(): string | null {
  if (cachedId) return cachedId;

  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    // Not a secure context. Capture is our bookkeeping; the estimate is the
    // product. Going quiet is the right failure.
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && UUID_RE.test(stored)) {
      cachedId = stored;
      return cachedId;
    }
    cachedId = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, cachedId);
  } catch {
    // Private mode, or storage refused. Keep the id in memory for this page
    // view so the visit is still one row rather than one row per answer.
    cachedId = crypto.randomUUID();
  }

  return cachedId;
}

/**
 * One POST to the RPC.
 *
 * A plain fetch rather than a Supabase client library: this page is hosted
 * somewhere else entirely, and two request headers plus a JSON body is the
 * whole protocol. Nothing is imported, nothing is configured, and there is no
 * client object to leak a name into the bundle.
 *
 * `keepalive` so a save fired as the visitor leaves — a CTA click, a closing
 * tab — is still sent by the browser after the page goes away.
 */
async function post(patch: Patch, options: { keepalive?: boolean } = {}): Promise<void> {
  const id = sessionId();
  if (!id) return;

  await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey,
      authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ p_session_id: id, p_source: source, ...patch }),
    keepalive: options.keepalive ?? false,
  });
}

/**
 * Where this visit came from, read once from what the browser already sent and
 * what the link already carried.
 *
 * No lookup of any kind: no IP geolocation, no fingerprinting. The shoot
 * location comes from the question the tool asks and from nowhere else. This
 * says where a click came from, not who made it.
 */
function readReferral(): Record<string, string> {
  const out: Record<string, string> = {};
  if (document.referrer) out.referrer = document.referrer;
  out.landing_path = window.location.pathname;

  const params = new URLSearchParams(window.location.search);
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

function toPatch(progress: ScopeProgress): Patch {
  const { answers } = progress;
  return {
    p_making_type: answers.making,
    // The WHOLE intake, spread rather than picked apart: whoever opens this
    // row before a call wants the full briefing, and an abandoned session is
    // the one thing nobody can go back and ask about.
    p_answers: { ...answers },
    p_shoot_location: answers.shootLocation || null,
    // The NORMALISED budget, never the raw field. Blank, 0 and "Not sure yet"
    // are one answer and all three send null, so nobody who hasn't got a
    // figure yet shows up looking like a $0 budget.
    p_budget_input: progress.budgetValue === null ? null : String(progress.budgetValue),
    p_computed_estimate: progress.scope.total,
    p_last_step_reached: progress.furthestStepLabel,
  };
}

/**
 * The save queue — one save in flight, newest snapshot queued behind it.
 *
 * Answers arrive faster than a round trip, and letting them race would
 * sometimes land an older snapshot last, including an older step count. The
 * referral rides along with the first save only: where they came from is a
 * fact about the start of the session, and the RPC writes it once anyway.
 *
 * A plain closure rather than component state, because all of this is
 * bookkeeping that must survive re-renders without ever causing one.
 */
export function createCapture(): (progress: ScopeProgress) => void {
  let pending: ScopeProgress | null = null;
  let latest: ScopeProgress | null = null;
  let inFlight = false;
  let first = true;

  const flush = async (): Promise<void> => {
    if (inFlight) return;
    const next = pending;
    if (!next) return;

    pending = null;
    inFlight = true;

    const patch = toPatch(next);
    if (first) {
      first = false;
      patch.p_referral_source = readReferral();
    }

    try {
      await post(patch);
    } catch {
      // A failed capture never becomes an error on top of the estimate the
      // visitor actually came for.
    } finally {
      inFlight = false;
      if (pending) void flush();
    }
  };

  // The abandoner's last save. Someone who answers the budget question and
  // then closes the tab has already told us the budget; this is what stops a
  // queued snapshot being thrown away with the page.
  window.addEventListener("pagehide", () => {
    if (!latest) return;
    void post(toPatch(latest), { keepalive: true }).catch(() => {});
  });

  return (progress) => {
    latest = progress;
    pending = progress;
    void flush();
  };
}

/**
 * The CTA, recorded before the booking flow opens.
 *
 * Fire-and-forget on purpose — the click must not wait on a round trip, and a
 * lost capture is worth less than a booking that opened late. `keepalive`
 * covers the case where the click navigates the page away.
 *
 * 'call_me' is the only value this build ever writes: the second CTA on the
 * hosted tool sends people to an account signup that does not exist here.
 */
export function recordCta(): void {
  void post({ p_cta_clicked: "call_me" }, { keepalive: true }).catch(() => {});
}
