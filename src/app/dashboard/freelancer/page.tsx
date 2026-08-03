import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { formatTimestamp } from "@/lib/format";
import { PageShell, PageHeader, Badge, Card, ButtonLink, DetailRow } from "@/components/ui";
import { InviteSection } from "@/components/invite-section";
import { ParticipationNotice } from "@/components/participation-notice";
import { WithdrawApplicationButton } from "@/components/withdraw-application-button";

export default async function FreelancerDashboardPage() {
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

  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select("home_zip, bio")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: place } = freelancer
    ? await supabase
        .from("zip_codes")
        .select("city, state")
        .eq("zip", freelancer.home_zip)
        .maybeSingle()
    : { data: null };

  const { data: roleRows } = await supabase
    .from("freelancer_roles")
    .select("role_slug")
    .eq("freelancer_id", user.id);

  const roleCount = roleRows?.length ?? 0;
  const needsSetup = roleCount === 0 || !freelancer?.bio;

  // 8.1 / 8.2 — activity. Both tables are owner-scoped by RLS, so these read
  // back only this user's rows whatever the filter says.
  const [{ data: applications }, { data: saves }] = await Promise.all([
    supabase
      .from("applications")
      .select("job_id, first_viewed_at, withdrawn_at, created_at")
      .eq("freelancer_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("saved_jobs")
      .select("job_id, created_at")
      .eq("freelancer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const jobIds = [
    ...new Set([
      ...(applications ?? []).map((a) => a.job_id),
      ...(saves ?? []).map((s) => s.job_id),
    ]),
  ];

  // A posting the employer has since closed drops out of these reads — the
  // jobs policy only returns open jobs to anyone but the owner. That is why
  // the cards below tolerate a missing job rather than assuming one.
  const { data: jobRows } = jobIds.length
    ? await supabase.from("jobs").select("id, company_network, role_slug").in("id", jobIds)
    : { data: [] };

  const { data: titleRows } = jobIds.length
    ? await supabase.from("job_titles").select("job_id, title").in("job_id", jobIds)
    : { data: [] };

  const jobById = new Map((jobRows ?? []).map((j) => [j.id, j]));
  const titleByJob = new Map((titleRows ?? []).map((t) => [t.job_id, t.title]));

  /** Shared card body for both lists — same job, two different contexts. */
  function JobLine({
    jobId,
    meta,
    footer,
  }: {
    jobId: string;
    meta: ReactNode;
    footer?: ReactNode;
  }) {
    const job = jobById.get(jobId);
    const role = job ? ROLE_BY_SLUG.get(job.role_slug) : null;
    // Missing title = the poster hid it (job_titles returns no row), not a
    // data error.
    const title = titleByJob.get(jobId) ?? "Title hidden by the poster";

    return (
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {job ? (
            <Link href={`/jobs/${jobId}`} className="font-medium hover:underline">
              {title}
            </Link>
          ) : (
            <span className="font-medium text-muted">{title}</span>
          )}
          {meta}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {job ? job.company_network : "This posting is no longer listed"}
          {role && <span className="text-muted"> · {role.label}</span>}
        </p>
        {footer && <div className="mt-3">{footer}</div>}
      </Card>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={profile?.full_name ? `Hi, ${profile.full_name}` : "Freelancer dashboard"}
        subtitle={user.email}
        action={<ButtonLink href="/dashboard/freelancer/profile">Edit profile</ButtonLink>}
      />

      {/* 9.4 — a pending or blocked freelancer is told why the marketplace
          looks quiet. The invisibility itself is RLS, not this banner. */}
      <ParticipationNotice viewer={profile} />

      {needsSetup && (
        <p className="mb-6 rounded-md bg-notice px-3 py-2 text-sm text-notice-ink">
          Your profile is incomplete — add your roles and a short bio so employers can find you.
        </p>
      )}

      {/* 7.1 — referral is the main growth channel for a login-walled
          product, so this sits above the fold, not in a footer. */}
      <div className="mb-6">
        <InviteSection userId={user.id} />
      </div>

      <Card>
        <dl>
          <DetailRow
            label="Based in"
            value={place ? [place.city, place.state].filter(Boolean).join(", ") : null}
          />
          <DetailRow label="Roles selected" value={roleCount > 0 ? String(roleCount) : "None yet"} />
        </dl>
      </Card>

      {/* 8.1 / 2.3 — My applications. Three states, none set by hand:
          "Applied" is the row existing, "Viewed" is the employer having
          opened their applicant view, and "Withdrawn" is the applicant
          pulling out. A withdrawn application stays here — the employer just
          stops seeing it — and applying again reactivates the same row. */}
      <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-muted">
        My applications
      </h2>
      {!applications || applications.length === 0 ? (
        <p className="text-sm text-muted">
          You haven&apos;t applied to anything yet.{" "}
          <Link href="/jobs" className="underline">
            Browse jobs
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {applications.map((application) => {
            const withdrawn = application.withdrawn_at !== null;
            const status = withdrawn
              ? "Withdrawn"
              : application.first_viewed_at
                ? "Viewed"
                : "Applied";

            return (
              <li key={application.job_id}>
                <JobLine
                  jobId={application.job_id}
                  meta={
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-muted">
                        {formatTimestamp(application.created_at)}
                      </span>
                      <Badge>{status}</Badge>
                    </span>
                  }
                  footer={
                    withdrawn ? (
                      // The job may also have closed since; the detail page
                      // decides whether applying again is still possible.
                      jobById.has(application.job_id) ? (
                        <Link
                          href={`/jobs/${application.job_id}`}
                          className="text-sm underline"
                        >
                          Apply again
                        </Link>
                      ) : null
                    ) : (
                      <WithdrawApplicationButton
                        jobId={application.job_id}
                        title={titleByJob.get(application.job_id) ?? "this job"}
                      />
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* 8.2 — Saved jobs. Private to this account: the employer cannot see
          that their posting was saved. */}
      <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-muted">
        Saved jobs
      </h2>
      {!saves || saves.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing saved yet — open a posting and hit Save to keep it here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {saves.map((save) => (
            <li key={save.job_id}>
              <JobLine
                jobId={save.job_id}
                meta={
                  <span className="text-sm text-muted">
                    Saved {formatTimestamp(save.created_at)}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/jobs"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover"
        >
          Browse jobs
        </Link>
        <ButtonLink href={`/freelancers/${user.id}`}>View public profile</ButtonLink>
      </div>
    </PageShell>
  );
}
