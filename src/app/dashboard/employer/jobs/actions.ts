"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import type { RateType } from "@/types/database";

const NEW_JOB_PATH = "/dashboard/employer/jobs/new";

function fail(message: string): never {
  redirect(`${NEW_JOB_PATH}?error=${encodeURIComponent(message)}`);
}

export async function createJob(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Validate the ZIP up front so the employer gets a clean error. The
  // jobs_resolve_location_zip trigger re-derives lat/lng on write, so the
  // stored coordinates always come from zip_codes rather than the client.
  const centroid = await lookupZip(supabase, formData.get("location_zip") as string);

  if (!centroid) {
    fail(INVALID_ZIP_MESSAGE);
  }

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const roleSlug = formData.get("role_slug") as string;

  if (!title || !description || !roleSlug) {
    fail("Title, description, and role are all required");
  }

  const rateRaw = (formData.get("rate") as string)?.trim();
  const rateCents = rateRaw ? Math.round(Number(rateRaw) * 100) : null;

  if (rateRaw && (!Number.isFinite(rateCents) || rateCents! < 0)) {
    fail("Enter a valid rate");
  }

  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;

  if (startDate && endDate && endDate < startDate) {
    fail("End date cannot be before the start date");
  }

  const { error } = await supabase.from("jobs").insert({
    employer_id: user.id,
    role_slug: roleSlug,
    title,
    description,
    location_zip: centroid.zip,
    location_lat: centroid.lat,
    location_lng: centroid.lng,
    travel_expected: formData.get("travel_expected") === "on",
    start_date: startDate,
    end_date: endDate,
    rate_cents: rateCents,
    rate_type: (formData.get("rate_type") as RateType) || "day",
  });

  if (error) {
    fail(error.message);
  }

  revalidatePath("/dashboard/employer");
  redirect("/dashboard/employer");
}
