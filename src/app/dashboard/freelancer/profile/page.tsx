import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES_BY_GROUP } from "@/lib/roles";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  Field,
  Fieldset,
  SubmitButton,
  ButtonLink,
  inputClass,
} from "@/components/ui";
import { updateFreelancerProfile } from "./actions";

export default async function EditFreelancerProfilePage({
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

  // Employers land on their own editor.
  if (profile?.role === "employer") {
    redirect("/dashboard/employer/profile");
  }

  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select("bio, day_rate_cents, home_zip, travel_radius_miles, reel_url, portfolio_url")
    .eq("profile_id", user.id)
    .single();

  const { data: myRoles } = await supabase
    .from("freelancer_roles")
    .select("role_slug")
    .eq("freelancer_id", user.id);

  const selected = new Set((myRoles ?? []).map((r) => r.role_slug));

  return (
    <PageShell>
      <PageHeader
        title="Edit your profile"
        subtitle="This is what employers see when you apply."
        action={<ButtonLink href={`/freelancers/${user.id}`}>View public profile</ButtonLink>}
      />

      <ErrorBanner message={params.error} />
      <SuccessBanner message={params.saved ? "Profile saved." : undefined} />

      <form action={updateFreelancerProfile} className="flex flex-col gap-5">
        <Field label="Full name">
          <input
            name="full_name"
            required
            defaultValue={profile?.full_name ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="Short bio" hint="A couple of sentences on what you shoot and who you work with.">
          <textarea name="bio" rows={4} defaultValue={freelancer?.bio ?? ""} className={inputClass} />
        </Field>

        <Fieldset legend="Roles">
          <p className="text-xs text-gray-500">
            Pick everything you take work for. Remote roles aren&apos;t distance-filtered, so
            they surface to employers nationwide.
          </p>
          <div className="mt-1 flex flex-col gap-4">
            {ROLES_BY_GROUP.map(({ group, roles }) => (
              <div key={group}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {group}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {roles.map((role) => (
                    <label key={role.slug} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="roles"
                        value={role.slug}
                        defaultChecked={selected.has(role.slug)}
                        className="h-4 w-4"
                      />
                      <span>{role.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Fieldset>

        <Field
          label="Home ZIP"
          hint="Sets your location for proximity matching. Only your city and state are shown publicly."
        >
          <input
            name="home_zip"
            required
            inputMode="numeric"
            placeholder="23220"
            defaultValue={freelancer?.home_zip ?? ""}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Day rate (USD)" hint="Leave blank to keep it private.">
            <input
              name="day_rate"
              inputMode="decimal"
              placeholder="750"
              defaultValue={
                freelancer?.day_rate_cents != null ? String(freelancer.day_rate_cents / 100) : ""
              }
              className={inputClass}
            />
          </Field>

          <Field label="Travel radius (miles)" hint="How far you'll travel for on-location work.">
            <input
              name="travel_radius_miles"
              required
              inputMode="numeric"
              defaultValue={String(freelancer?.travel_radius_miles ?? 25)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Reel URL">
          <input
            name="reel_url"
            type="url"
            placeholder="https://vimeo.com/…"
            defaultValue={freelancer?.reel_url ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="Portfolio URL">
          <input
            name="portfolio_url"
            type="url"
            placeholder="https://…"
            defaultValue={freelancer?.portfolio_url ?? ""}
            className={inputClass}
          />
        </Field>

        <div className="flex items-center gap-4 pt-1">
          <SubmitButton>Save profile</SubmitButton>
          <ButtonLink href="/dashboard/freelancer">Back to dashboard</ButtonLink>
        </div>
      </form>
    </PageShell>
  );
}
