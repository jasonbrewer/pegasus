import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { signUp } from "@/app/auth/actions";
import { parseInviteRef } from "@/lib/invite";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string; ref?: string }>;
}) {
  const params = await searchParams;
  const role = params.role === "employer" ? "employer" : "freelancer";
  // Carried through signup and stored with the account. Nothing acts on it
  // yet — referral tracking is a separate, later feature.
  const invitedBy = parseInviteRef(params.ref);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">
          {role === "freelancer" ? "Apply to join Production Circles" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {role === "freelancer"
            ? "Membership is free. Applications are reviewed by a person before your profile goes live."
            : "Sign up and post the same day. Freelance profiles are always free; employers pay to post (billing stubbed for v1)."}
        </p>
      </div>

      {invitedBy && (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-secondary">
          You were invited to Production Circles. Your application still gets read — the
          invite just puts it near the front.
        </p>
      )}

      <div className="flex gap-2 text-sm">
        <Link
          href={`/sign-up?role=freelancer${invitedBy ? `&ref=${invitedBy}` : ""}`}
          className={`flex-1 rounded-md border px-3 py-2 text-center ${
            role === "freelancer" ? "border-accent font-medium" : "border-field text-muted"
          }`}
        >
          I&apos;m crew — apply
        </Link>
        <Link
          href={`/sign-up?role=employer${invitedBy ? `&ref=${invitedBy}` : ""}`}
          className={`flex-1 rounded-md border px-3 py-2 text-center ${
            role === "employer" ? "border-accent font-medium" : "border-field text-muted"
          }`}
        >
          I&apos;m hiring
        </Link>
      </div>

      {params.error && (
        <p className="rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">{params.error}</p>
      )}

      <form action={signUp} className="flex flex-col gap-3">
        <input type="hidden" name="role" value={role} />
        {invitedBy && <input type="hidden" name="invited_by" value={invitedBy} />}

        <label className="flex flex-col gap-1 text-sm">
          Full name
          <input name="full_name" required className="rounded-md border border-field px-3 py-2" />
        </label>

        {role === "freelancer" ? (
          <label className="flex flex-col gap-1 text-sm">
            Home ZIP
            <input
              name="home_zip"
              required
              inputMode="numeric"
              className="rounded-md border border-field px-3 py-2"
            />
            <span className="text-xs text-muted">
              Sets your location for proximity matching. Only your city and state are shown to employers.
            </span>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Company name
            <input name="company_name" required className="rounded-md border border-field px-3 py-2" />
          </label>
        )}

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
            minLength={6}
            className="rounded-md border border-field px-3 py-2"
          />
        </label>

        <SubmitButton className="mt-2" pendingLabel="Submitting…">
          {role === "freelancer" ? "Submit application" : "Create account"}
        </SubmitButton>

        {role === "freelancer" && (
          // Said before signing up, so the pending state that follows is what
          // they were told to expect rather than a surprise.
          <p className="text-xs text-muted">
            You&apos;ll be able to sign in and build your profile right away. Employers
            can&apos;t see you, and you can&apos;t apply to jobs, until an admin approves
            your application.
          </p>
        )}
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
