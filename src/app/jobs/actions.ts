"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sanitizeCredits, MAX_CREDITS_LENGTH } from "@/lib/sanitize";

/** Postgres unique_violation — the (job_id, freelancer_id) constraint. */
const UNIQUE_VIOLATION = "23505";

const MAX_MESSAGE_LENGTH = 4000;

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

/**
 * An application carries exactly two things: a message and styled credits.
 * That constraint is the product decision, not an accident — the employer
 * reads these, then clicks through to the profile for everything else.
 */
export async function applyToJob(formData: FormData) {
  const jobId = formData.get("job_id") as string;
  const returnTo = safeReturnTo(formData.get("return_to"));

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
  // belongs to the caller, not that the caller is a freelancer, so the role
  // check has to happen here.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "freelancer") {
    redirect(withParam(returnTo, "error", "Only freelancers can apply to jobs"));
  }

  const message = ((formData.get("cover_note") as string) ?? "").trim();

  if (!message) {
    redirect(withParam(returnTo, "error", "Add a message before applying"));
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    redirect(withParam(returnTo, "error", "Your message is too long — please shorten it"));
  }

  const rawCredits = (formData.get("credits_html") as string) ?? "";

  if (rawCredits.length > MAX_CREDITS_LENGTH) {
    redirect(withParam(returnTo, "error", "Your credits are too long — please trim them down"));
  }

  // Sanitized before storage: the employer's applicant view renders this as
  // HTML, and anything can post to this action directly.
  const creditsHtml = sanitizeCredits(rawCredits);

  const { error } = await supabase.from("applications").insert({
    job_id: jobId,
    freelancer_id: user.id,
    cover_note: message,
    credits_html: creditsHtml,
  });

  // Applying twice is a no-op, not a failure: the unique constraint is what
  // enforces "one application per freelancer per job", and a duplicate submit
  // (double click, back button, stale tab) should land on the same "Applied"
  // state rather than an error page.
  if (error && error.code !== UNIQUE_VIOLATION) {
    redirect(withParam(returnTo, "error", error.message));
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  redirect(withParam(returnTo, "applied", jobId));
}
