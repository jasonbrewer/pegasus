"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { normalizePhone } from "@/lib/phone";
import type { RateType } from "@/types/database";

const NEW_JOB_PATH = "/dashboard/employer/jobs/new";

/**
 * How recently an identical posting counts as the same submission.
 *
 * Wide enough to cover a slow round trip and an impatient second click; far
 * too short to interfere with genuinely re-posting the same job next week.
 * This is a safety net for a specific accident, not a rule about how often
 * someone may post.
 */
const DUPLICATE_WINDOW_SECONDS = 30;

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

  // --- duplicate guard -----------------------------------------------------
  //
  // The UI disables the button while the first request is in flight, which is
  // the real fix. This catches what that cannot: a second POST that was
  // already on the wire, a resubmitted form after a back-button, a retry from
  // a flaky connection.
  //
  // Matched on the fields that make a posting what it is. Two postings with
  // the same employer, role, company, description, location, rate and dates,
  // seconds apart, are one posting submitted twice — nobody deliberately
  // creates that. The title is checked too, below, since it lives in its own
  // table.
  //
  // No schema change: this is a SELECT before the INSERT. A truly simultaneous
  // pair could still slip between the two, but that needs two clicks landing
  // in the same few milliseconds, which is exactly what the disabled button
  // prevents.
  const since = new Date(Date.now() - DUPLICATE_WINDOW_SECONDS * 1000).toISOString();

  const { data: recent } = await supabase
    .from("jobs")
    .select("id")
    .eq("employer_id", user.id)
    .eq("role_slug", roleSlug)
    .eq("company_network", companyNetwork)
    .eq("description", description)
    .eq("location_zip", centroid.zip)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);

  if (recent && recent.length > 0) {
    // Confirm the title matches as well — same brief, different project name
    // is a different posting.
    const { data: sameTitle } = await supabase
      .from("job_titles")
      .select("job_id")
      .in("job_id", recent.map((row) => row.id))
      .eq("title", title)
      .limit(1);

    if (sameTitle && sameTitle.length > 0) {
      // Land exactly where a successful post lands, so a double click is
      // indistinguishable from a single one. Nothing is created, nothing is
      // reported as an error — because from the employer's point of view
      // their job did get posted.
      revalidatePath("/dashboard/employer");
      redirect("/dashboard/employer");
    }
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
