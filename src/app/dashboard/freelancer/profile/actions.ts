"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { ROLES } from "@/lib/roles";

const EDIT_PATH = "/dashboard/freelancer/profile";

function fail(message: string): never {
  redirect(`${EDIT_PATH}?error=${encodeURIComponent(message)}`);
}

const VALID_ROLE_SLUGS = new Set(ROLES.map((r) => r.slug));

/** Empty string -> null, so we don't store blank strings in nullable columns. */
function optionalText(value: FormDataEntryValue | null): string | null {
  const trimmed = (value as string | null)?.trim();
  return trimmed ? trimmed : null;
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

  // Validate the ZIP before writing so the user gets a clean form error. The
  // DB trigger re-derives home_lat/home_lng from this ZIP on write, so we
  // never send coordinates from the client.
  const centroid = await lookupZip(supabase, formData.get("home_zip") as string);
  if (!centroid) {
    fail(INVALID_ZIP_MESSAGE);
  }

  const dayRateRaw = (formData.get("day_rate") as string)?.trim();
  let dayRateCents: number | null = null;
  if (dayRateRaw) {
    const dollars = Number(dayRateRaw);
    if (!Number.isFinite(dollars) || dollars < 0) {
      fail("Enter a valid day rate");
    }
    dayRateCents = Math.round(dollars * 100);
  }

  const radiusRaw = (formData.get("travel_radius_miles") as string)?.trim();
  const radius = Number(radiusRaw);
  if (!Number.isInteger(radius) || radius < 0 || radius > 3000) {
    fail("Travel radius must be a whole number between 0 and 3000 miles");
  }

  const selectedRoles = formData
    .getAll("roles")
    .map(String)
    .filter((slug) => VALID_ROLE_SLUGS.has(slug));

  if (selectedRoles.length === 0) {
    fail("Select at least one role");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (profileError) {
    fail(profileError.message);
  }

  const { error: freelancerError } = await supabase
    .from("freelancer_profiles")
    .update({
      bio: optionalText(formData.get("bio")),
      day_rate_cents: dayRateCents,
      home_zip: centroid.zip,
      travel_radius_miles: radius,
      reel_url: optionalText(formData.get("reel_url")),
      portfolio_url: optionalText(formData.get("portfolio_url")),
    })
    .eq("profile_id", user.id);

  if (freelancerError) {
    fail(freelancerError.message);
  }

  // Sync the join table: clear and re-insert. The set is at most 24 rows, so
  // a diff isn't worth the complexity.
  const { error: deleteError } = await supabase
    .from("freelancer_roles")
    .delete()
    .eq("freelancer_id", user.id);

  if (deleteError) {
    fail(deleteError.message);
  }

  const { error: insertError } = await supabase
    .from("freelancer_roles")
    .insert(selectedRoles.map((slug) => ({ freelancer_id: user.id, role_slug: slug })));

  if (insertError) {
    fail(insertError.message);
  }

  revalidatePath(EDIT_PATH);
  revalidatePath(`/freelancers/${user.id}`);
  redirect(`${EDIT_PATH}?saved=1`);
}
