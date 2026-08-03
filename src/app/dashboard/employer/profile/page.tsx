import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  Field,
  SubmitButton,
  ButtonLink,
  inputClass,
} from "@/components/ui";
import { updateEmployerProfile } from "./actions";

export default async function EditEmployerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "freelancer") {
    redirect("/dashboard/freelancer/profile");
  }

  const [{ data: employer }, { data: billing }] = await Promise.all([
    supabase
      .from("employer_profiles")
      .select("company_name, home_zip, description, website")
      .eq("profile_id", user.id)
      .single(),
    supabase
      .from("employer_billing")
      .select("billing_email")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Edit your company profile"
        subtitle="Shown to freelancers on your job posts."
        action={<ButtonLink href={`/employers/${user.id}`}>View public profile</ButtonLink>}
      />

      <ErrorBanner message={params.error} />
      <SuccessBanner message={params.saved ? "Profile saved." : undefined} />

      <form action={updateEmployerProfile} className="flex flex-col gap-5">
        <Field label="Company name">
          <input
            name="company_name"
            required
            defaultValue={employer?.company_name ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="Your name" hint="The person freelancers will be dealing with.">
          <input
            name="full_name"
            required
            defaultValue={profile?.full_name ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="About the company" hint="A couple of sentences on what you produce.">
          <textarea
            name="description"
            rows={4}
            defaultValue={employer?.description ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="ZIP" hint="Where you're based. Only your city and state are shown.">
          <input
            name="home_zip"
            inputMode="numeric"
            defaultValue={employer?.home_zip ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="Website">
          <input
            name="website"
            type="url"
            placeholder="https://company.com"
            defaultValue={employer?.website ?? ""}
            className={inputClass}
          />
        </Field>

        <Field
          label="Billing email"
          hint="Private to you. Used for billing when employer payments switch on — it is never shown to freelancers."
        >
          <input
            name="billing_email"
            type="email"
            placeholder="you@company.com"
            defaultValue={billing?.billing_email ?? ""}
            className={inputClass}
          />
        </Field>

        <div className="flex items-center gap-4 pt-1">
          <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
        </div>

        <p className="text-sm text-muted">
          <Link href="/account/password" className="underline">
            Change your password
          </Link>
        </p>
      </form>
    </PageShell>
  );
}
