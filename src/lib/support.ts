/**
 * 2.5 — how a member reaches a human.
 *
 * A mailto, deliberately. A ticketing system is a product of its own, and the
 * thing actually missing today is that several places already say "get in
 * touch if you think this is a mistake" without giving anyone a way to do it.
 *
 * Overridable per environment so a support alias can change without a deploy.
 * NEXT_PUBLIC_ because the footer renders on public pages too.
 */
export const MODERATOR_EMAIL =
  process.env.NEXT_PUBLIC_MODERATOR_EMAIL?.trim() || "help@productioncircles.com";

/** Prefills the subject so the moderator can triage without opening every mail. */
export function moderatorMailto(subject = "Help with my Production Circles account"): string {
  return `mailto:${MODERATOR_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
