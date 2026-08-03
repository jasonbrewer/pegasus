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

  const [{ data: employer }, { data: contact }, { data: billing }] = await Promise.all([
    supabase
      .from("employer_profiles")
      .select("company_name, home_zip, description, website")
      .eq("profile_id", user.id)
      .single(),
    supabase
      .from("employer_contacts")
      .select("contact_phone, contact_email, linkedin_url")
      .eq("profile_id", user.id)
      .maybeSingle(),
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

        {/* 4.1 — the contact NAME, reusing profiles.full_name rather than
            adding a second name field. This is the same value the dashboard
            shows as "Hiring contact". */}
        <Field
          label="Contact name"
          hint="The person a freelancer would be dealing with. Shown on your dashboard as your hiring contact."
        >
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

        {/* 4.1 — required. Kept in employer_contacts, an owner-only table, so
            adding a phone number does not publish it to every member. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact email" hint="Required. Private to you and the moderator.">
            <input
              name="contact_email"
              type="email"
              required
              placeholder="you@company.com"
              defaultValue={contact?.contact_email ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Contact phone" hint="Required. Private to you and the moderator.">
            <input
              name="contact_phone"
              type="tel"
              required
              defaultValue={contact?.contact_phone ?? ""}
              className={inputClass}
            />
          </Field>
        </div>

        {/* 4.2 — optional. */}
        <Field label="LinkedIn" hint="Optional. Your company page or your own profile.">
          <input
            name="linkedin_url"
            type="url"
            placeholder="https://linkedin.com/company/…"
            defaultValue={contact?.linkedin_url ?? ""}
            className={inputClass}
          />
        </Field>

        <Field
          label="Billing email"
          hint="Optional. Leave blank to use your contact email. Only used when employer payments switch on — never shown to freelancers."
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
