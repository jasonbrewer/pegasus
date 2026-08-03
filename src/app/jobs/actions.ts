"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prepareCredits } from "@/lib/sanitize";

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
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "freelancer") {
    redirect(withParam(returnTo, "error", "Only freelancers can apply to jobs"));
  }

  // 9.4 — the applications INSERT policy already refuses a non-approved
  // account. Checking here only buys a sentence the applicant can act on
  // instead of a row-level-security error.
  if (profile.status !== "approved") {
    redirect(
      withParam(
        returnTo,
        "error",
        profile.status === "pending"
          ? "Your application to join is still under review — you can apply to jobs once you're approved"
          : "Your account is blocked, so you can't apply to jobs"
      )
    );
  }

  const message = ((formData.get("cover_note") as string) ?? "").trim();

  if (!message) {
    redirect(withParam(returnTo, "error", "Add a message before applying"));
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    redirect(withParam(returnTo, "error", "Your message is too long — please shorten it"));
  }

  // Sanitized before storage: the employer's applicant view renders this as
  // HTML, and anything can post to this action directly. The length limit is
  // measured on the sanitized result, so pasted formatting doesn't count
  // against the applicant.
  const credits = prepareCredits(formData.get("credits_html") as string);

  if (!credits.ok) {
    redirect(withParam(returnTo, "error", credits.error));
  }

  const creditsHtml = credits.html;

  const { error } = await supabase.from("applications").insert({
    job_id: jobId,
    freelancer_id: user.id,
    cover_note: message,
    credits_html: creditsHtml,
  });

  // A row already exists for this (job, freelancer). Two ways that happens:
  // they withdrew and are coming back, or they double-submitted.
  //
  // 2.3 — the unique constraint is deliberately kept, so re-applying
  // reactivates the one row rather than inserting a second. reapply_to_job()
  // returns 0 when the existing application was never withdrawn, which is the
  // double-submit case: land on the same "applied" state rather than an error,
  // exactly as before, and without overwriting what they already sent.
  if (error?.code === UNIQUE_VIOLATION) {
    const { error: reapplyError } = await supabase.rpc("reapply_to_job", {
      p_job_id: jobId,
      p_cover_note: message,
      p_credits_html: creditsHtml,
    });

    if (reapplyError) {
      redirect(withParam(returnTo, "error", reapplyError.message));
    }
  } else if (error) {
    redirect(withParam(returnTo, "error", error.message));
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard/freelancer");
  redirect(withParam(returnTo, "applied", jobId));
}

/**
 * 2.3 — withdraw an application.
 *
 * A plain UPDATE, not an RPC, because the database can express this rule on
 * its own: the row-level policy pins it to the applicant, and the column-level
 * grant limits the write to withdrawn_at. The policy's WITH CHECK also makes
 * it one-way — clearing withdrawn_at is refused, so coming back has to go
 * through applyToJob, which re-checks that the account may still participate.
 *
 * Nothing is deleted. The employer stops seeing the applicant; the applicant
 * keeps the row on their dashboard, marked withdrawn.
 */
export async function withdrawApplication(formData: FormData) {
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

  // The freelancer_id filter is belt-and-braces — the policy already scopes
  // this to the caller, so a tampered job_id still touches nobody else's row.
  const { error } = await supabase
    .from("applications")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .eq("freelancer_id", user.id)
    .is("withdrawn_at", null);

  if (error) {
    redirect(withParam(returnTo, "error", error.message));
  }

  revalidatePath("/dashboard/freelancer");
  revalidatePath(`/jobs/${jobId}`);
  redirect(withParam(returnTo, "withdrawn", jobId));
}

/**
 * 8.2 — save / unsave a posting.
 *
 * A save is private to the freelancer who made it: the saved_jobs policies
 * pin every row to auth.uid(), so this action cannot touch anyone else's
 * saves however it is called. Employer accounts are turned away by the
 * foreign key to freelancer_profiles, not by a check here.
 */
export async function toggleSavedJob(formData: FormData) {
  const jobId = formData.get("job_id") as string;
  const returnTo = safeReturnTo(formData.get("return_to"));
  const saved = formData.get("saved") === "1";

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

  const { error } = saved
    ? await supabase
        .from("saved_jobs")
        .delete()
        .eq("freelancer_id", user.id)
        .eq("job_id", jobId)
    : await supabase.from("saved_jobs").insert({ freelancer_id: user.id, job_id: jobId });

  // Saving something already saved lands on the same state, same as applying
  // twice — a double click shouldn't be an error page.
  if (error && error.code !== UNIQUE_VIOLATION) {
    redirect(withParam(returnTo, "error", error.message));
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard/freelancer");
  redirect(returnTo);
}
