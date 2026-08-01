"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (profileError) {
    fail(profileError.message);
  }

  const { error: employerError } = await supabase
    .from("employer_profiles")
    .update({ company_name: companyName, billing_email: billingEmail })
    .eq("profile_id", user.id);

  if (employerError) {
    fail(employerError.message);
  }

  revalidatePath(EDIT_PATH);
  revalidatePath(`/employers/${user.id}`);
  redirect(`${EDIT_PATH}?saved=1`);
}
