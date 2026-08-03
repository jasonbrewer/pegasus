import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRecoverySession } from "@/lib/recovery";
import { updatePassword } from "@/app/auth/actions";
import { inputClass } from "@/components/ui";

/**
 * Set a new password, reached only through a reset link.
 *
 * Two conditions, both required:
 *
 *   a session          — established by /auth/reset exchanging the token
 *   the recovery mark  — set in that same exchange
 *
 * The second is what keeps this from being a page where anyone already signed
 * in can change their password without knowing the old one. Someone logged in
 * normally is sent to /account/password instead, which asks for the current
 * password first.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/forgot-password?error=" +
        encodeURIComponent("That reset link has expired or has already been used — request a new one")
    );
  }

  if (!(await isRecoverySession())) {
    redirect("/account/password");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">Resetting the password for {user.email}.</p>
      </div>

      {params.error && (
        <p className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">{params.error}</p>
      )}

      <form action={updatePassword} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Confirm new password
          <input
            type="password"
            name="confirm_password"
            required
            minLength={6}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <SubmitButton className="mt-2" pendingLabel="Saving…">Save new password</SubmitButton>
        <p className="text-xs text-muted">
          You&apos;ll be signed out afterwards and can sign straight back in with the new
          password.
        </p>
      </form>

      <p className="text-center text-sm text-muted">
        <Link href="/sign-in" className="underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
