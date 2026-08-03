import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { confirmEmailLink } from "@/app/auth/actions";

/**
 * The landing page for every emailed auth link.
 *
 * It deliberately does NOT consume the token on GET. The link in a recovery
 * email is single-use, and plenty of things open a link before a human does:
 * Gmail's image/link scanners, corporate mail security gateways, Slack and
 * iMessage unfurlers, browser prefetch. Any one of those burning the token on
 * a GET leaves the actual person staring at "Email link is invalid or has
 * expired" on their first click — which is exactly the bug this fixes.
 *
 * So the token is carried in a hidden field and only exchanged when the form
 * is POSTed. Scanners follow links; they do not submit forms.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    code?: string;
    error_description?: string;
  }>;
}) {
  const params = await searchParams;

  // Supabase appends its own error when /auth/v1/verify rejects the token
  // before we ever see it — an already-consumed or genuinely expired link.
  const supabaseError = params.error_description;

  const tokenHash = params.token_hash;
  const code = params.code;

  // Recovery is the DEFAULT when no type is given, not "email".
  //
  // Supabase's /auth/v1/verify redirects back with only `?code=…` — it does not
  // re-append `type`. Defaulting to "email" therefore sent every recovery link
  // that came through the verify endpoint to the dashboard, authenticated but
  // with no way to actually set a password. Recovery is also the only kind of
  // mail this project sends (signup confirmations are off), so links already
  // sitting in inboxes with no type are recovery links.
  const type = params.type ?? "recovery";
  const isRecovery = type === "recovery";

  if (supabaseError || (!tokenHash && !code)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
        <h1 className="text-2xl font-semibold">That link didn&apos;t work</h1>
        <p className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {supabaseError ?? "This link is missing its token."}
        </p>
        <p className="text-sm text-secondary">
          Reset links can only be used once and expire after an hour. Request a fresh one and
          it will work.
        </p>
        <Link
          href="/forgot-password"
          className="rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-ink"
        >
          Send a new reset link
        </Link>
        <p className="text-center text-sm text-muted">
          <Link href="/sign-in" className="underline">
            Back to sign in
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">
          {isRecovery ? "Reset your password" : "Confirm your email"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isRecovery
            ? "Click below to continue. For your security this link works once, so we only use it when you press the button."
            : "Click below to finish confirming your email address."}
        </p>
      </div>

      <form action={confirmEmailLink}>
        <input type="hidden" name="token_hash" value={tokenHash ?? ""} />
        <input type="hidden" name="code" value={code ?? ""} />
        <input type="hidden" name="intent" value={isRecovery ? "recovery" : "email"} />
        <SubmitButton className="w-full" pendingLabel="Opening…">
          {isRecovery ? "Continue to set a new password" : "Confirm my email"}
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted">
        Didn&apos;t request this?{" "}
        <Link href="/" className="underline">
          Ignore it
        </Link>{" "}
        — nothing changes until you press the button.
      </p>
    </main>
  );
}
