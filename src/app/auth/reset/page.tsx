import Link from "next/link";
import { confirmEmailLink } from "@/app/auth/actions";

/**
 * Where password-reset links land.
 *
 * A dedicated PATH, not a query parameter, because that is the thing that
 * survives the round trip. Supabase embeds redirect_to inside its own
 * /auth/v1/verify URL and redirects back with only `?code=…` appended — any
 * `type=recovery` we tried to carry is gone by then, which is exactly why
 * recovery links were authenticating and then landing on the dashboard. A path
 * cannot be dropped.
 *
 * Like /auth/confirm, nothing is consumed on GET: the token is single-use and
 * mail scanners, unfurlers and prefetch all issue GETs. The exchange happens
 * only when the button is POSTed.
 */
export default async function AuthResetPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    code?: string;
    error_description?: string;
  }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash;
  const code = params.code;

  if (params.error_description || (!tokenHash && !code)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
        <h1 className="text-2xl font-semibold">That link didn&apos;t work</h1>
        <p className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {params.error_description ?? "This link is missing its token."}
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
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          Click below and we&apos;ll take you straight to setting a new password. For your
          security this link works once, so we only use it when you press the button.
        </p>
      </div>

      <form action={confirmEmailLink}>
        <input type="hidden" name="token_hash" value={tokenHash ?? ""} />
        <input type="hidden" name="code" value={code ?? ""} />
        {/* The intent is fixed by the route, not read from the URL. */}
        <input type="hidden" name="intent" value="recovery" />
        <button
          type="submit"
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-hover"
        >
          Continue to set a new password
        </button>
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
