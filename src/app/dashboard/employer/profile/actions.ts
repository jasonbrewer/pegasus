"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";

const EDIT_PATH = "/dashboard/employer/profile";

function fail(message: string): never {
  redirect(`${EDIT_PATH}?error=${encodeURIComponent(message)}`);
}

export async function updateEmployerProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const fullName = (formData.get("full_name") as string)?.trim();
  const companyName = (formData.get("company_name") as string)?.trim();

  if (!fullName) {
    fail("Your name is required");
  }

  if (!companyName) {
    fail("Company name is required");
  }

  const billingEmail = ((formData.get("billing_email") as string) ?? "").trim() || null;

  if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
    fail("Enter a valid contact email");
  }

  // Employer location is optional. If one is supplied it must resolve, so a
  // typo'd ZIP is rejected rather than stored. Coordinates are derived by the
  // employer_profiles_resolve_zip trigger, never sent from here.
  const zipInput = ((formData.get("home_zip") as string) ?? "").trim();
  let homeZip: string | null = null;

  if (zipInput) {
    const centroid = await lookupZip(supabase, zipInput);
    if (!centroid) {
      fail(INVALID_ZIP_MESSAGE);
    }
    homeZip = centroid.zip;
  }

  const website = ((formData.get("website") as string) ?? "").trim() || null;

  if (website && !/^https?:\/\/.+/i.test(website)) {
    fail("Website must start with http:// or https://");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (profileError) {
    fail(profileError.message);
  }

  const { error: employerError } = await supabase
    .from("employer_profiles")
    .update({
      company_name: companyName,
      home_zip: homeZip,
      description: ((formData.get("description") as string) ?? "").trim() || null,
      website,
    })
    .eq("profile_id", user.id);

  if (employerError) {
    fail(employerError.message);
  }

  // Billing lives in its own owner-only table so it isn't readable by every
  // logged-in user the way employer_profiles is.
  const { error: billingError } = await supabase
    .from("employer_billing")
    .upsert({ profile_id: user.id, billing_email: billingEmail }, { onConflict: "profile_id" });

  if (billingError) {
    fail(billingError.message);
  }

  revalidatePath(EDIT_PATH);
  revalidatePath(`/employers/${user.id}`);
  redirect(`${EDIT_PATH}?saved=1`);
}
