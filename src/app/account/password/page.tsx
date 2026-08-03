import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { changePassword } from "@/app/auth/actions";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  ButtonLink,
  inputClass,
} from "@/components/ui";

/**
 * Change your password while signed in — the everyday path, as opposed to the
 * reset link for someone locked out.
 *
 * Asks for the current password, which is the difference that matters: without
 * it, an unattended logged-in browser is an account takeover.
 */
export default async function AccountPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=" + encodeURIComponent("/account/password"));
  }

  return (
    <PageShell>
      <PageHeader
        title="Change password"
        subtitle={user.email}
        action={<ButtonLink href="/dashboard">Back</ButtonLink>}
      />

      <ErrorBanner message={params.error} />
      {params.changed && <SuccessBanner message="Your password has been changed." />}

      <form action={changePassword} className="flex max-w-md flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Current password
          <input
            type="password"
            name="current_password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </label>
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
          className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
        >
          Change password
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Forgotten your current password?{" "}
        <a href="/forgot-password" className="underline">
          Email yourself a reset link
        </a>
        .
      </p>
    </PageShell>
  );
}
