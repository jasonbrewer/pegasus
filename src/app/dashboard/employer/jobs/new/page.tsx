import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES_BY_GROUP } from "@/lib/roles";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  Field,
  Fieldset,
  SubmitButton,
  ButtonLink,
  inputClass,
} from "@/components/ui";
import { createJob } from "../actions";

export default async function NewJobPage({
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
    redirect("/sign-in");
  }

  // Prefill the company from their profile; they can override it per post,
  // since a production company often posts on behalf of a client.
  const { data: employer } = await supabase
    .from("employer_profiles")
    .select("company_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  return (
    <PageShell>
      <PageHeader
        title="Post a job"
        subtitle="Free while we're in v1 — billing switches on later."
        action={<ButtonLink href="/dashboard/employer">Cancel</ButtonLink>}
      />

      <ErrorBanner message={params.error} />

      <form action={createJob} className="flex flex-col gap-5">
        <Field
          label="Company or network"
          hint="Who the freelancer would be working for. Always shown to logged-in users."
        >
          <input
            name="company_network"
            required
            placeholder="Discovery Channel"
            defaultValue={employer?.company_name ?? ""}
            className={inputClass}
          />
        </Field>

        <p className="-mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          If the company/network is not accurate, the post will be deleted.
        </p>

        <Field label="Project title">
          <input
            name="title"
            required
            placeholder="Shark Week promo"
            className={inputClass}
          />
        </Field>

        <label className="-mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" name="title_private" className="mt-0.5" />
          <span>
            Hide the title from applicants
            <span className="block text-xs text-gray-500">
              They&apos;ll still see the company, role, location, dates and rate.
            </span>
          </span>
        </label>

        <Field label="Role">
          <select name="role_slug" required defaultValue="" className={inputClass}>
            <option value="">Select a role…</option>
            {ROLES_BY_GROUP.map(({ group, roles }) => (
              <optgroup key={group} label={group}>
                {roles.map((role) => (
                  <option key={role.slug} value={role.slug}>
                    {role.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        <Field
          label="Location ZIP"
          hint="Used to rank nearby freelancers. Remote roles aren't distance-filtered."
        >
          <input
            name="location_zip"
            required
            inputMode="numeric"
            placeholder="23220"
            className={inputClass}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="travel_expected" />
          Travel expected
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Start date">
            <input type="date" name="start_date" className={inputClass} />
          </Field>
          <Field label="End date">
            <input type="date" name="end_date" className={inputClass} />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Rate (USD)">
            <input name="rate" inputMode="decimal" placeholder="750" className={inputClass} />
          </Field>
          <Field label="Rate type">
            <select name="rate_type" defaultValue="day" className={inputClass}>
              <option value="day">Per day</option>
              <option value="hourly">Per hour</option>
              <option value="flat">Flat</option>
            </select>
          </Field>
        </div>

        <Field label="Description">
          <textarea name="description" required rows={6} className={inputClass} />
        </Field>

        <Fieldset legend="Your contact info">
          <p className="text-xs text-gray-500">
            Required to post. Private by default — kept off the listing unless you tick the box
            below.
          </p>
          <div className="mt-1 flex flex-col gap-3">
            <input
              name="contact_name"
              required
              placeholder="Contact name"
              className={inputClass}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="contact_email"
                type="email"
                placeholder="you@company.com"
                className={inputClass}
              />
              <input name="contact_phone" type="tel" placeholder="(804) 555-0100" className={inputClass} />
            </div>
          </div>

          <label className="mt-1 flex items-start gap-2 text-sm">
            <input type="checkbox" name="share_contact" className="mt-0.5" />
            <span>
              Share my contact info with people who apply
              <span className="block text-xs text-gray-500">
                Only applicants to this job, and only if you tick this. Free either way.
              </span>
            </span>
          </label>
        </Fieldset>

        <div className="flex items-center gap-4 pt-1">
          <SubmitButton>Post job</SubmitButton>
          <ButtonLink href="/dashboard/employer">Cancel</ButtonLink>
        </div>
      </form>
    </PageShell>
  );
}
