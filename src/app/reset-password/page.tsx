import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "@/app/auth/actions";
import { inputClass } from "@/components/ui";

/**
 * Reached from the emailed link, which lands on /auth/callback first — that
 * exchanges the code for a session, so by the time anyone is here they are
 * signed in as the account being recovered.
 *
 * A stale or expired link therefore shows up as "no session", not as a broken
 * form, and the message says which.
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">Signed in as {user.email}.</p>
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
        <button
          type="submit"
          className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink"
        >
          Save new password
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        <Link href="/dashboard" className="underline">
          Skip for now
        </Link>
      </p>
    </main>
  );
}
