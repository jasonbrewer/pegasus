import { cookies } from "next/headers";

/**
 * Marks a session as "arrived here through a password-reset link".
 *
 * Needed because a recovery session looks exactly like any other signed-in
 * session once it exists — Supabase gives the server no flag distinguishing
 * them. Without this, /reset-password would be a page where anyone already
 * logged in can set a new password without proving they know the old one,
 * which turns an unattended laptop into an account takeover.
 *
 * Set in the same request that establishes the session, so it is always the
 * same browser; no cross-device problem. Short-lived, httpOnly, and cleared
 * the moment the password is actually changed.
 */
const COOKIE = "pc_recovery";
const MAX_AGE_SECONDS = 15 * 60;

export async function markRecoverySession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function isRecoverySession(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE)?.value === "1";
}

export async function clearRecoverySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
