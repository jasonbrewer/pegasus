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
import { RichTextEditor } from "@/components/rich-text-editor";
import { signedAvatarUrl } from "@/lib/avatar";
import { updateFreelancerProfile } from "./actions";

const MAX_VIDEO_INPUTS = 6;

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
    .select("full_name, role, avatar_path")
    .eq("id", user.id)
    .single();

  // Employers land on their own editor.
  if (profile?.role === "employer") {
    redirect("/dashboard/employer/profile");
  }

  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select("bio, credits_html, day_rate_cents, home_zip, travel_radius_miles, reel_url, portfolio_url")
    .eq("profile_id", user.id)
    .single();

  const { data: myRoles } = await supabase
    .from("freelancer_roles")
    .select("role_slug")
    .eq("freelancer_id", user.id);

  const { data: contact } = await supabase
    .from("freelancer_contacts")
    .select("phone, contact_email")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: videos } = await supabase
    .from("freelancer_videos")
    .select("url")
    .eq("freelancer_id", user.id)
    .order("sort_order");

  const selected = new Set((myRoles ?? []).map((r) => r.role_slug));

  // Existing links plus one spare row, so adding another needs no JavaScript.
  const videoValues = [...(videos ?? []).map((v) => v.url), ""].slice(0, MAX_VIDEO_INPUTS);
  const avatarUrl = await signedAvatarUrl(supabase, profile?.avatar_path);

  return (
    <PageShell>
      <PageHeader
        title="Edit your profile"
        subtitle="This is what employers see when you apply."
        action={<ButtonLink href={`/freelancers/${user.id}`}>View public profile</ButtonLink>}
      />

      <ErrorBanner message={params.error} />
      <SuccessBanner message={params.saved ? "Profile saved." : undefined} />

      <form
        action={updateFreelancerProfile}
        encType="multipart/form-data"
        className="flex flex-col gap-5"
      >
        <Field
          label="Profile photo"
          hint="JPEG, PNG, or WebP, up to 5MB. Leave empty to keep your current photo."
        >
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Your current profile photo"
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs text-muted">
                None
              </span>
            )}
            <input
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-field file:bg-surface file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
        </Field>

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

        <Field
          label="Credits"
          hint="Paste your credits or resume straight from a document — formatting is kept."
        >
          <RichTextEditor
            name="credits_html"
            defaultValue={freelancer?.credits_html}
            placeholder="Paste your credits here…"
          />
        </Field>

        <Fieldset legend="Roles">
          <p className="text-xs text-muted">
            Pick everything you take work for. Remote roles aren&apos;t distance-filtered, so
            they surface to employers nationwide.
          </p>
          <div className="mt-1 flex flex-col gap-4">
            {ROLES_BY_GROUP.map(({ group, roles }) => (
              <div key={group}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
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

        <Fieldset legend="Contact details">
          <p className="text-xs text-muted">
            Private. Only you can see these — an employer sees them once you apply to one of
            their jobs, and never from browsing profiles.
          </p>
          <div className="mt-1 grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Phone</span>
              <input
                name="phone"
                type="tel"
                placeholder="(804) 555-0148"
                defaultValue={contact?.phone ?? ""}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Contact email</span>
              <input
                name="contact_email"
                type="email"
                placeholder="you@example.com"
                defaultValue={contact?.contact_email ?? ""}
                className={inputClass}
              />
            </label>
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

        <Fieldset legend="Video links">
          <p className="text-xs text-muted">
            YouTube and Vimeo links play inline on your profile. Anything else shows as a link.
            Clear a field to remove it.
          </p>
          <div className="mt-1 flex flex-col gap-2">
            {videoValues.map((value, index) => (
              <input
                key={index}
                name="video_urls"
                type="url"
                placeholder="https://vimeo.com/… or https://youtube.com/watch?v=…"
                defaultValue={value}
                className={inputClass}
              />
            ))}
          </div>
        </Fieldset>

        <div className="flex items-center gap-4 pt-1">
          <SubmitButton>Save profile</SubmitButton>
        </div>
      </form>
    </PageShell>
  );
}
