"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { normalizePhone } from "@/lib/phone";
import type { RateType } from "@/types/database";

const NEW_JOB_PATH = "/dashboard/employer/jobs/new";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createJob(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // 9.4 — the jobs INSERT policy already refuses a blocked employer. This
  // turns that refusal into a sentence rather than an RLS error.
  const { data: poster } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (poster?.status !== "approved") {
    fail(NEW_JOB_PATH, "Your account can't post jobs right now — get in touch if you think this is a mistake");
  }

  // --- required fields -----------------------------------------------------
  const companyNetwork = (formData.get("company_network") as string)?.trim();
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const roleSlug = formData.get("role_slug") as string;
  const contactName = (formData.get("contact_name") as string)?.trim();

  if (!companyNetwork) fail(NEW_JOB_PATH, "Company or network is required");
  if (!title) fail(NEW_JOB_PATH, "Project title is required");
  if (!roleSlug) fail(NEW_JOB_PATH, "Pick a role");
  if (!description) fail(NEW_JOB_PATH, "Description is required");

  // Contact info is required to POST; sharing it is the separate toggle below.
  if (!contactName) fail(NEW_JOB_PATH, "A contact name is required to post");

  const contactEmail = ((formData.get("contact_email") as string) ?? "").trim() || null;
  const contactPhone = normalizePhone(formData.get("contact_phone"));

  if (!contactEmail && !contactPhone) {
    fail(NEW_JOB_PATH, "Add a contact email or phone — one is required to post");
  }

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    fail(NEW_JOB_PATH, "Enter a valid contact email");
  }

  const centroid = await lookupZip(supabase, formData.get("location_zip") as string);
  if (!centroid) fail(NEW_JOB_PATH, INVALID_ZIP_MESSAGE);

  const rateRaw = (formData.get("rate") as string)?.trim();
  const rateCents = rateRaw ? Math.round(Number(rateRaw) * 100) : null;
  if (rateRaw && (!Number.isFinite(rateCents) || rateCents! < 0)) {
    fail(NEW_JOB_PATH, "Enter a valid rate");
  }

  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;
  if (startDate && endDate && endDate < startDate) {
    fail(NEW_JOB_PATH, "End date cannot be before the start date");
  }

  // --- write ---------------------------------------------------------------
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      employer_id: user.id,
      role_slug: roleSlug,
      company_network: companyNetwork,
      description,
      location_zip: centroid.zip,
      location_lat: centroid.lat,
      location_lng: centroid.lng,
      travel_expected: formData.get("travel_expected") === "on",
      start_date: startDate,
      end_date: endDate,
      rate_cents: rateCents,
      rate_type: (formData.get("rate_type") as RateType) || "day",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    fail(NEW_JOB_PATH, jobError?.message ?? "Could not create the job");
  }

  // Title lives in its own table so the hide toggle is enforced by RLS rather
  // than by this code. Same for contact info and its share toggle.
  const { error: titleError } = await supabase.from("job_titles").insert({
    job_id: job.id,
    title,
    is_private: formData.get("title_private") === "on",
  });

  if (titleError) {
    // Roll back rather than leave a job with no title; the cascade takes the
    // contact row with it if one exists.
    await supabase.from("jobs").delete().eq("id", job.id);
    fail(NEW_JOB_PATH, titleError.message);
  }

  const { error: contactError } = await supabase.from("job_contacts").insert({
    job_id: job.id,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    share_with_applicants: formData.get("share_contact") === "on",
  });

  if (contactError) {
    await supabase.from("jobs").delete().eq("id", job.id);
    fail(NEW_JOB_PATH, contactError.message);
  }

  revalidatePath("/dashboard/employer");
  redirect("/dashboard/employer");
}

/**
 * Hard delete. Ownership is enforced by the "employers delete their own jobs"
 * RLS policy, not by this function: a non-owner's delete affects zero rows
 * even if they reach this action directly. job_titles, job_contacts and
 * applications all cascade via ON DELETE CASCADE.
 */
export async function deleteJob(formData: FormData) {
  const jobId = formData.get("job_id") as string;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (!jobId) {
    fail("/dashboard/employer", "Missing job");
  }

  const { data: deleted, error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .select("id");

  if (error) {
    fail("/dashboard/employer", error.message);
  }

  // RLS filtered it out — the caller does not own this job.
  if (!deleted || deleted.length === 0) {
    fail("/dashboard/employer", "That job could not be deleted");
  }

  revalidatePath("/dashboard/employer");
  redirect("/dashboard/employer?deleted=1");
}
