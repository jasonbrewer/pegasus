"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  markRecoverySession,
  isRecoverySession,
  clearRecoverySession,
} from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { parseInviteRef } from "@/lib/invite";
import type { AccountRole, EmailOtpType } from "@/types/database";

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as AccountRole;
  const fullName = formData.get("full_name") as string;

  const supabase = await createClient();

  let metadata: Record<string, string>;

  if (role === "freelancer") {
    // Validate the ZIP before creating the account, so an unknown ZIP gives a
    // clean form error rather than a failed signup trigger.
    const centroid = await lookupZip(supabase, formData.get("home_zip") as string);

    if (!centroid) {
      redirect(`/sign-up?role=freelancer&error=${encodeURIComponent(INVALID_ZIP_MESSAGE)}`);
    }

    metadata = { role, full_name: fullName, home_zip: centroid.zip };
  } else {
    metadata = {
      role,
      full_name: fullName,
      company_name: formData.get("company_name") as string,
    };
  }

  // 7.1 — remember who invited them, and do nothing else with it. It rides
  // along in the account's signup metadata, so no new column or table is
  // needed and a later referral feature can pick it up.
  const invitedBy = parseInviteRef(formData.get("invited_by") as string | undefined);
  if (invitedBy) {
    metadata.invited_by = invitedBy;
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });

  if (error) {
    redirect(`/sign-up?role=${role}&error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

/**
 * Only allow same-origin relative paths as a post-login destination, so a
 * crafted ?next= can't turn sign-in into an open redirect.
 */
function safeNext(value: FormDataEntryValue | null): string {
  const next = (value as string | null) ?? "";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const params = new URLSearchParams({ error: error.message });
    if (next !== "/dashboard") params.set("next", next);
    redirect(`/sign-in?${params.toString()}`);
  }

  redirect(next);
}

/**
 * Where the emailed reset link comes back to. Prefers NEXT_PUBLIC_SITE_URL so
 * a link mailed from production always points at production; falls back to the
 * request's own origin for local and preview deploys.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * 3.2 — send the recovery email.
 *
 * The response is identical whether or not that address has an account, and
 * Supabase's own error is swallowed for the same reason: this endpoint must
 * not become a way to find out who is a member of a members-only site. The
 * only errors surfaced are ones that are true regardless of the address.
 *
 * The link lands on /auth/callback, which exchanges the code for a session and
 * forwards to /reset-password.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = ((formData.get("email") as string) ?? "").trim();

  if (!email) {
    redirect("/forgot-password?error=" + encodeURIComponent("Enter your email address"));
  }

  const origin = await siteOrigin();
  const supabase = await createClient();

  // A dedicated PATH, and no query string of its own. Two separate lessons
  // here: a nested "?next=..." inside redirect_to stops being part of
  // redirect_to and becomes a parameter of the verify call, and Supabase's
  // verify endpoint redirects back with only "?code=..." — it does not
  // re-append `type`. So anything the destination needs to know has to live in
  // the path, which survives both.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset`,
  });

  redirect("/forgot-password?sent=1");
}

/**
 * Exchanges an emailed auth token for a session — recovery links and email
 * confirmations alike.
 *
 * Called from a POST, never a GET. That is the whole point: the token is
 * single-use, and mail scanners, link unfurlers and browser prefetch all issue
 * GETs. Consuming on GET is what produced "Email link is invalid or has
 * expired" on a link the user was clicking for the first time.
 *
 * Two token shapes are handled because two things can arrive here:
 *
 *   token_hash — from an email template using {{ .TokenHash }}. Preferred, and
 *                the one the README now documents. verifyOtp() needs nothing
 *                from the browser, so the link works even when the mail is
 *                opened on a different device from the one that asked for it —
 *                which is the common case: request on a laptop, read mail on a
 *                phone.
 *
 *   code       — from a template using {{ .ConfirmationURL }}, where Supabase
 *                has already consumed the token at /auth/v1/verify and handed
 *                back a PKCE code. This path REQUIRES the code-verifier cookie
 *                set when the reset was requested, so it only works in the
 *                same browser. Supported for back-compat, not recommended.
 */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = ((formData.get("token_hash") as string) ?? "").trim();
  const code = ((formData.get("code") as string) ?? "").trim();

  // The intent comes from the FORM, set by the route the link landed on —
  // never from a URL parameter, because that is the thing that gets dropped.
  const isRecovery = ((formData.get("intent") as string) ?? "recovery") === "recovery";
  const type: EmailOtpType = isRecovery ? "recovery" : "email";

  const fail = (message: string): never => {
    redirect(
      (isRecovery ? "/forgot-password?error=" : "/sign-in?error=") + encodeURIComponent(message)
    );
  };

  const supabase = await createClient();

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) fail(error.message);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      fail(
        error.message.includes("code verifier")
          ? "Open the reset link in the same browser you requested it from, or request a new one"
          : error.message
      );
    }
  } else {
    fail("That link is missing its token — request a new one");
  }

  if (isRecovery) {
    // A recovery session is indistinguishable from a normal one server-side,
    // so mark it. /reset-password refuses to change a password without this,
    // which is what stops it being a "change anyone's password" page for
    // whoever happens to already be logged in.
    await markRecoverySession();
    redirect("/reset-password");
  }

  redirect("/dashboard");
}

/**
 * 3.2 — set the new password.
 *
 * Works because the recovery link already established a session; there is no
 * token to pass around by hand. Supabase enforces its own password rules on
 * top of the length check here.
 */
export async function updatePassword(formData: FormData) {
  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";

  const fail = (message: string): never => {
    redirect("/reset-password?error=" + encodeURIComponent(message));
  };

  // Re-checked here, not only on the page, because a page check decides what
  // gets rendered — this is the thing that actually writes.
  if (!(await isRecoverySession())) {
    redirect(
      "/account/password?error=" +
        encodeURIComponent("Confirm your current password to change it")
    );
  }

  if (password.length < 6) {
    fail("Your password must be at least 6 characters");
  }

  if (password !== confirm) {
    fail("Those passwords don't match");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    fail(error.message);
  }

  await clearRecoverySession();

  // Signed out on purpose: the new password has not been typed into a login
  // form yet, and finishing on the sign-in page is what proves it works.
  await supabase.auth.signOut();
  redirect("/sign-in?password_changed=1");
}

/**
 * The other way people change a password: already signed in, and they know the
 * current one.
 *
 * Requires the current password, verified by signing in with it. Without that
 * check an unattended logged-in browser is an account takeover — the same
 * reason /reset-password insists on the recovery marker.
 */
export async function changePassword(formData: FormData) {
  const current = (formData.get("current_password") as string) ?? "";
  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";

  const fail = (message: string): never => {
    redirect("/account/password?error=" + encodeURIComponent(message));
  };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/sign-in?next=" + encodeURIComponent("/account/password"));
  }

  if (password.length < 6) fail("Your new password must be at least 6 characters");
  if (password !== confirm) fail("Those passwords don't match");
  if (password === current) fail("That is already your password");

  // Re-authentication, checked before anything is written so a wrong current
  // password cannot leave them signed out.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });

  if (reauthError) {
    fail("That current password isn't right");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error.message);

  redirect("/account/password?changed=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
