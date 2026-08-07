import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { DeleteJobButton } from "@/components/delete-job-button";
import { PageShell, PageHeader, Badge, Card, ButtonLink, DetailRow } from "@/components/ui";
import { InviteSection } from "@/components/invite-section";
import { ParticipationNotice } from "@/components/participation-notice";
import { formatPhone } from "@/lib/phone";

export default async function EmployerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, status")
    .eq("id", user.id)
    .maybeSingle();

  const { data: employer } = await supabase
    .from("employer_profiles")
    .select("company_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: billing } = await supabase
    .from("employer_billing")
    .select("billing_email")
    .eq("profile_id", user.id)
    .maybeSingle();

  // 4.1 — owner-only, so this read returns nothing for anyone but the employer.
  const { data: contact } = await supabase
    .from("employer_contacts")
    .select("contact_phone, contact_email, linkedin_url")
    .eq("profile_id", user.id)
    .maybeSingle();

  // Existing employers predate these fields being required, so nudge rather
  // than block — the profile form is where the requirement bites.
  const contactIncomplete = !contact?.contact_email || !contact?.contact_phone;

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, company_network, role_slug, status, location_zip")
    .eq("employer_id", user.id)
    .order("created_at", { ascending: false });

  // RLS scopes applications to jobs this employer owns, so counting them here
  // can't reveal anyone else's.
  const jobIds = (jobs ?? []).map((j) => j.id);

  // Title lives in job_titles so the hide toggle is enforced by RLS. The owner
  // always sees their own titles.
  const { data: titleRows } = jobIds.length
    ? await supabase.from("job_titles").select("job_id, title, is_private").in("job_id", jobIds)
    : { data: [] };
  const titleByJob = new Map((titleRows ?? []).map((t) => [t.job_id, t]));
  const { data: applicationRows } = jobIds.length
    ? await supabase
        .from("applications")
        .select("job_id")
        .in("job_id", jobIds)
        // 2.3 — withdrawn applicants drop out of the count, matching what the
        // applicant list itself now shows.
        .is("withdrawn_at", null)
    : { data: [] };

  const applicantCounts = new Map<string, number>();
  for (const row of applicationRows ?? []) {
    applicantCounts.set(row.job_id, (applicantCounts.get(row.job_id) ?? 0) + 1);
  }

  return (
    <PageShell>
      <PageHeader
        title={employer?.company_name || "Employer dashboard"}
        subtitle={user.email}
        action={<ButtonLink href="/dashboard/employer/profile">Edit profile</ButtonLink>}
      />

      {/* 9.4 — a blocked employer sees why their postings vanished. */}
      <ParticipationNotice viewer={profile} />

      {contactIncomplete && (
        <p className="mb-6 rounded-md bg-notice px-3 py-2 text-sm text-notice-ink">
          Your company profile is missing contact details.{" "}
          <Link href="/dashboard/employer/profile" className="underline">
            Add a contact email and phone
          </Link>{" "}
          so we can reach you about your postings.
        </p>
      )}

      {/* 7.1 — referral is the main growth channel for a login-walled
          product, so this sits above the fold, not in a footer. */}
      <div className="mb-6">
        <InviteSection userId={user.id} />
      </div>

      <Card>
        <dl>
          <DetailRow label="Hiring contact" value={profile?.full_name} />
          <DetailRow label="Contact email" value={contact?.contact_email ?? "Not set"} />
          <DetailRow
            label="Contact phone"
            value={formatPhone(contact?.contact_phone) ?? "Not set"}
          />
          <DetailRow
            label="Billing email"
            value={billing?.billing_email ?? "Same as contact email"}
          />
          <DetailRow label="Jobs posted" value={String(jobs?.length ?? 0)} />
        </dl>
      </Card>

      {jobs && jobs.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Your jobs
          </h2>
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => {
              const role = ROLE_BY_SLUG.get(job.role_slug);
              const count = applicantCounts.get(job.id) ?? 0;

              return (
                <li key={job.id}>
                  <Card>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                        {titleByJob.get(job.id)?.title ?? "Untitled"}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        {titleByJob.get(job.id)?.is_private && <Badge>Title hidden</Badge>}
                        {job.status !== "open" && <Badge>{job.status}</Badge>}
                      </div>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{job.company_network}</p>

                    {role && (
                      <p className="mt-0.5 text-sm text-muted">{role.label}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <Link
                        href={`/dashboard/employer/jobs/${job.id}/applicants`}
                        // Opening that page marks applications as viewed, so a
                        // hover must not silently do it.
                        prefetch={false}
                        className="text-sm underline"
                      >
                        {count === 0
                          ? "No applicants yet"
                          : `${count} ${count === 1 ? "applicant" : "applicants"}`}
                      </Link>
                      <DeleteJobButton
                        jobId={job.id}
                        title={titleByJob.get(job.id)?.title ?? "this posting"}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {profile?.status === "approved" && (
          <Link
            href="/dashboard/employer/jobs/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover"
          >
            Post a job
          </Link>
        )}
        <ButtonLink href={`/employers/${user.id}`}>View public profile</ButtonLink>
      </div>

      {/* Secondary to the CTA above on purpose: scoping is for the employer who
          isn't ready to post because they don't know what the job costs. */}
      <div className="mt-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-sm font-medium">Not sure what a video should cost?</h2>
              <p className="mt-0.5 text-sm text-muted">
                Answer a few plain questions and get an honest, line-item estimate.
              </p>
            </div>
            <ButtonLink href="/dashboard/employer/scope">Scope a job</ButtonLink>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
