/**
 * Per-user signup links.
 *
 * Every user gets their own link rather than one generic signup URL, so that a
 * later referral/access-control feature can tell who invited whom. Nothing
 * acts on the inviter id yet — it is carried through signup and stored, and
 * that is all.
 *
 * The id in the link is the inviter's user id. No new column or table is
 * needed for that, which is deliberate: this task is meant to store nothing
 * complex. The trade-off is that the link exposes a real user id publicly and
 * cannot be rotated or revoked. If either matters later, swap this for an
 * opaque per-user code — only buildInviteUrl and parseInviteRef would change,
 * plus a column to hold the code.
 */

/** Query-string key carrying the inviter. */
export const INVITE_PARAM = "ref";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildInviteUrl(origin: string, inviterId: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/sign-up?${INVITE_PARAM}=${encodeURIComponent(inviterId)}`;
}

/**
 * Accepts an inviter id from an untrusted query string.
 *
 * Shape is checked but existence is not: confirming the id belongs to a real
 * account would turn the signup page into an oracle for probing whether a
 * given user id exists. A bogus id is simply carried along and ignored.
 */
export function parseInviteRef(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}
