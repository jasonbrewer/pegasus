import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { DeleteJobButton } from "@/components/delete-job-button";
import { PageShell, PageHeader, Badge, Card, ButtonLink, DetailRow } from "@/components/ui";

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
    .select("full_name")
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
    ? await supabase.from("applications").select("job_id").in("job_id", jobIds)
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

      <Card>
        <dl>
          <DetailRow label="Hiring contact" value={profile?.full_name} />
          <DetailRow label="Billing email" value={billing?.billing_email ?? "Not set"} />
          <DetailRow label="Jobs posted" value={String(jobs?.length ?? 0)} />
        </dl>
      </Card>

      {jobs && jobs.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
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
                    <p className="mt-0.5 text-sm text-gray-500">{job.company_network}</p>

                    {role && (
                      <p className="mt-0.5 text-sm text-gray-500">{role.label}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <Link
                        href={`/dashboard/employer/jobs/${job.id}/applicants`}
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
        <Link
          href="/dashboard/employer/jobs/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Post a job
        </Link>
        <ButtonLink href={`/employers/${user.id}`}>View public profile</ButtonLink>
      </div>
    </PageShell>
  );
}
