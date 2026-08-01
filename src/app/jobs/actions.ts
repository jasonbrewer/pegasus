"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Postgres unique_violation — the (job_id, freelancer_id) constraint. */
const UNIQUE_VIOLATION = "23505";

/** Same-origin relative paths only, so redirect_to can't become an open redirect. */
function safeReturnTo(value: FormDataEntryValue | null): string {
  const path = (value as string | null) ?? "";
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  return "/jobs";
}

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

export async function applyToJob(formData: FormData) {
  const jobId = formData.get("job_id") as string;
  const returnTo = safeReturnTo(formData.get("return_to"));
  const coverNote = ((formData.get("cover_note") as string) ?? "").trim() || null;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  }

  if (!jobId) {
    redirect(withParam(returnTo, "error", "Missing job"));
  }

  // Employers can't apply. The RLS insert policy only checks that the row
  // belongs to the caller, so the role check has to happen here — and the
  // applications.freelancer_id FK to freelancer_profiles would reject an
  // employer anyway, just with an uglier error.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "freelancer") {
    redirect(withParam(returnTo, "error", "Only freelancers can apply to jobs"));
  }

  const { error } = await supabase.from("applications").insert({
    job_id: jobId,
    freelancer_id: user.id,
    cover_note: coverNote,
  });

  // Applying twice is a no-op, not a failure: the unique constraint is the
  // thing enforcing "one application per freelancer per job", and a duplicate
  // submit (double click, back button, stale tab) should land on the same
  // "Applied" state rather than an error page.
  if (error && error.code !== UNIQUE_VIOLATION) {
    redirect(withParam(returnTo, "error", error.message));
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  redirect(withParam(returnTo, "applied", jobId));
}
