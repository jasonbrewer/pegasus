import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { requestPasswordReset } from "@/app/auth/actions";
import { inputClass } from "@/components/ui";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          We&apos;ll email you a link that signs you in and lets you set a new password.
        </p>
      </div>

      {params.error && (
        <p className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">{params.error}</p>
      )}

      {params.sent ? (
        <>
          {/* Deliberately the same message whether or not that address has an
              account: this page must not become a way to test who is a member. */}
          <p className="rounded-md bg-success px-3 py-2 text-sm text-success-ink">
            If that address has an account, a reset link is on its way. It expires in an
            hour.
          </p>
          <p className="text-sm text-muted">
            Nothing arrived? Check your spam folder, then try again — or{" "}
            <Link href="/forgot-password" className="underline">
              use a different address
            </Link>
            .
          </p>
        </>
      ) : (
        <form action={requestPasswordReset} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input type="email" name="email" required autoComplete="email" className={inputClass} />
          </label>
          <SubmitButton className="mt-2" pendingLabel="Sending…">Send reset link</SubmitButton>
        </form>
      )}

      <p className="text-center text-sm text-muted">
        <Link href="/sign-in" className="underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
