import Link from "next/link";
import { signIn } from "@/app/auth/actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {next && (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-secondary">
          Sign in to continue — Production Circles profiles and jobs are members-only.
        </p>
      )}

      {params.error && (
        <p className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">{params.error}</p>
      )}

      <form action={signIn} className="flex flex-col gap-3">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="rounded-md border border-field px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            className="rounded-md border border-field px-3 py-2"
          />
        </label>

        <p className="text-right text-sm">
          <Link href="/forgot-password" className="text-muted underline hover:text-content">
            Forgot your password?
          </Link>
        </p>

        <button type="submit" className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink">
          Sign in
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
