"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { ROLES } from "@/lib/roles";
import { prepareCredits } from "@/lib/sanitize";
import { isHttpUrl } from "@/lib/video";
import {
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
  ALLOWED_AVATAR_TYPES,
} from "@/lib/avatar";

const EDIT_PATH = "/dashboard/freelancer/profile";
const MAX_VIDEOS = 6;

function fail(message: string): never {
  redirect(`${EDIT_PATH}?error=${encodeURIComponent(message)}`);
}

const VALID_ROLE_SLUGS = new Set(ROLES.map((r) => r.slug));

function optionalText(value: FormDataEntryValue | null): string | null {
  const trimmed = (value as string | null)?.trim();
  return trimmed ? trimmed : null;
}

function optionalUrl(value: FormDataEntryValue | null, label: string): string | null {
  const url = optionalText(value);
  if (!url) return null;
  if (!isHttpUrl(url)) fail(`${label} must be a valid http(s) URL`);
  return url;
}

export async function updateFreelancerProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) {
    fail("Your name is required");
  }

  const centroid = await lookupZip(supabase, formData.get("home_zip") as string);
  if (!centroid) {
    fail(INVALID_ZIP_MESSAGE);
  }

  const selectedRoles = formData
    .getAll("roles")
    .map(String)
    .filter((slug) => VALID_ROLE_SLUGS.has(slug));

  if (selectedRoles.length === 0) {
    fail("Select at least one role");
  }

  // 3.3 — credits are sanitized here, before storage, because the profile
  // page renders them as raw HTML. prepareCredits sanitizes first and measures
  // the result, so pasted markup is gone before anything is counted.
  const credits = prepareCredits(formData.get("credits_html") as string);
  if (!credits.ok) {
    fail(credits.error);
  }
  const creditsHtml = credits.html;

  // 3.1 — avatar upload. Optional: an empty file input means "leave as is".
  const avatarFile = formData.get("avatar") as File | null;
  let avatarPath: string | undefined;

  if (avatarFile && avatarFile.size > 0) {
    if (!ALLOWED_AVATAR_TYPES.includes(avatarFile.type)) {
      fail("Profile photo must be a JPEG, PNG, or WebP image");
    }
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      fail("Profile photo must be smaller than 5MB");
    }

    const extension = avatarFile.type === "image/png" ? "png" : avatarFile.type === "image/webp" ? "webp" : "jpg";
    // Folder is the user id: the storage policy only permits writes there.
    const path = `${user.id}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, avatarFile, { contentType: avatarFile.type, upsert: true });

    if (uploadError) {
      fail(`Could not upload your photo: ${uploadError.message}`);
    }

    avatarPath = path;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, ...(avatarPath ? { avatar_path: avatarPath } : {}) })
    .eq("id", user.id);

  if (profileError) {
    fail(profileError.message);
  }

  const { error: freelancerError } = await supabase
    .from("freelancer_profiles")
    .update({
      // 2.2 — day_rate_cents and travel_radius_miles are deliberately absent
      // from this update, not set to null. The fields are gone from the form,
      // so writing them would wipe whatever is already stored — and
      // travel_radius_miles is still read as the default search radius on the
      // job browse page.
      bio: optionalText(formData.get("bio")),
      credits_html: creditsHtml,
      home_zip: centroid.zip,
      reel_url: optionalUrl(formData.get("reel_url"), "Reel URL"),
      portfolio_url: optionalUrl(formData.get("portfolio_url"), "Portfolio URL"),
    })
    .eq("profile_id", user.id);

  if (freelancerError) {
    fail(freelancerError.message);
  }

  // Contact details live in their own table so RLS can restrict them to the
  // seeker and to employers they have applied to. Upsert rather than update:
  // accounts created before that table existed have no row.
  const contactEmail = optionalText(formData.get("contact_email"));

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    fail("Enter a valid contact email");
  }

  const { error: contactError } = await supabase.from("freelancer_contacts").upsert(
    {
      profile_id: user.id,
      phone: optionalText(formData.get("phone")),
      contact_email: contactEmail,
    },
    { onConflict: "profile_id" }
  );

  if (contactError) {
    fail(contactError.message);
  }

  const { error: deleteRolesError } = await supabase
    .from("freelancer_roles")
    .delete()
    .eq("freelancer_id", user.id);

  if (deleteRolesError) {
    fail(deleteRolesError.message);
  }

  const { error: insertRolesError } = await supabase
    .from("freelancer_roles")
    .insert(selectedRoles.map((slug) => ({ freelancer_id: user.id, role_slug: slug })));

  if (insertRolesError) {
    fail(insertRolesError.message);
  }

  // 3.2 — video links. Same replace-the-set approach as roles; the list is
  // short and ordering comes from the form.
  const videoUrls = formData
    .getAll("video_urls")
    .map((v) => (v as string).trim())
    .filter(Boolean)
    .slice(0, MAX_VIDEOS);

  for (const url of videoUrls) {
    if (!isHttpUrl(url)) {
      fail(`"${url}" is not a valid http(s) URL`);
    }
  }

  const { error: deleteVideosError } = await supabase
    .from("freelancer_videos")
    .delete()
    .eq("freelancer_id", user.id);

  if (deleteVideosError) {
    fail(deleteVideosError.message);
  }

  if (videoUrls.length > 0) {
    const { error: insertVideosError } = await supabase.from("freelancer_videos").insert(
      videoUrls.map((url, index) => ({
        freelancer_id: user.id,
        url,
        sort_order: index,
      }))
    );

    if (insertVideosError) {
      fail(insertVideosError.message);
    }
  }

  revalidatePath(EDIT_PATH);
  revalidatePath(`/freelancers/${user.id}`);
  redirect(`${EDIT_PATH}?saved=1`);
}
