import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { formatDistance } from "@/lib/format";
import { PageShell, PageHeader } from "@/components/ui";
import { ApplicantCard, type ApplicantCardData } from "@/components/applicant-card";

export default async function JobApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/dashboard/employer/jobs/${id}/applicants`)}`);
  }

  // RLS on jobs already limits non-open jobs to their owner, but an employer
  // could still read someone else's *open* job, so ownership is checked
  // explicitly here. job_applicants() enforces it a second time server-side.
  const { data: job } = await supabase
    .from("jobs")
    .select("id, company_network, employer_id, role_slug, location_zip, status")
    .eq("id", id)
    .maybeSingle();

  if (!job) {
    notFound();
  }

  if (job.employer_id !== user.id) {
    redirect("/dashboard/employer");
  }

  // 8.1 — opening this page is what flips an applicant's status from Applied
  // to Viewed on their own dashboard. Stamped here rather than behind a button
  // because "the employer opened it" is exactly the event being recorded.
  //
  // The function only ever touches first_viewed_at, only on jobs owned by
  // auth.uid(), and only where it is still null — so a reload does not move
  // the timestamp. A failure here is not worth failing the page over: the
  // employer still gets their applicants, and the next load retries.
  await supabase.rpc("mark_applicants_viewed", { p_job_id: id });

  // Ranked by distance from the job, remote roles last. Security-definer, and
  // internally filtered to jobs owned by auth.uid(). 2.3 — it also drops
  // withdrawn applications, so they stay off this page.
  const { data: applicants, error } = await supabase.rpc("job_applicants", { p_job_id: id });

  const ids = [...new Set((applicants ?? []).map((a) => a.freelancer_id))];

  // reel_url and portfolio_url join the existing home_zip lookup: 5.1 puts the
  // reel on the card and the portfolio in the footer actions.
  const { data: freelancers } = ids.length
    ? await supabase
        .from("freelancer_profiles")
        .select("profile_id, home_zip, reel_url, portfolio_url")
        .in("profile_id", ids)
    : { data: [] };

  const { data: roleRows } = ids.length
    ? await supabase.from("freelancer_roles").select("freelancer_id, role_slug").in("freelancer_id", ids)
    : { data: [] };

  // Not filtered here, deliberately. The freelancer_contacts SELECT policy
  // already says "the seeker, or an employer they applied to" — which is this
  // employer, for exactly these freelancers. Re-stating the rule in TypeScript
  // is how the two versions of it start to drift.
  const { data: contactRows } = ids.length
    ? await supabase
        .from("freelancer_contacts")
        .select("profile_id, phone, contact_email")
        .in("profile_id", ids)
    : { data: [] };

  const zips = [...new Set((freelancers ?? []).map((f) => f.home_zip))];
  const { data: places } = zips.length
    ? await supabase.from("zip_codes").select("zip, city, state").in("zip", zips)
    : { data: [] };

  const placeByZip = new Map(
    (places ?? []).map((p) => [p.zip, [p.city, p.state].filter(Boolean).join(", ")])
  );
  const freelancerById = new Map((freelancers ?? []).map((f) => [f.profile_id, f]));
  const contactById = new Map((contactRows ?? []).map((c) => [c.profile_id, c]));

  const rolesById = new Map<string, string[]>();
  for (const row of roleRows ?? []) {
    const label = ROLE_BY_SLUG.get(row.role_slug)?.label;
    if (!label) continue;
    const list = rolesById.get(row.freelancer_id) ?? [];
    list.push(label);
    rolesById.set(row.freelancer_id, list);
  }

  const { data: titleRow } = await supabase
    .from("job_titles")
    .select("title")
    .eq("job_id", id)
    .maybeSingle();

  const jobRole = ROLE_BY_SLUG.get(job.role_slug);

  const cards: ApplicantCardData[] = (applicants ?? []).map((applicant) => {
    const freelancer = freelancerById.get(applicant.freelancer_id);
    const contact = contactById.get(applicant.freelancer_id);

    return {
      applicationId: applicant.application_id,
      freelancerId: applicant.freelancer_id,
      name: applicant.full_name,
      location: freelancer ? (placeByZip.get(freelancer.home_zip) ?? null) : null,
      distance: formatDistance(applicant.distance_miles),
      roles: rolesById.get(applicant.freelancer_id) ?? [],
      message: applicant.cover_note,
      reelUrl: freelancer?.reel_url ?? null,
      portfolioUrl: freelancer?.portfolio_url ?? null,
      phone: contact?.phone ?? null,
      email: contact?.contact_email ?? null,
    };
  });

  return (
    <PageShell>
      <PageHeader
        title="Applicants"
        subtitle={
          <>
            {titleRow?.title ?? job.company_network}
            {jobRole && <span className="text-muted"> · {jobRole.label}</span>}
          </>
        }
      />

      {error && (
        <p className="mb-5 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">{error.message}</p>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-muted">No applications yet.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {cards.length} {cards.length === 1 ? "applicant" : "applicants"}, closest first ·
            star a card to triage it
          </p>

          {/* job_applicants() already orders by distance; do not re-sort. */}
          <ul className="flex flex-col gap-4">
            {cards.map((applicant) => (
              <li key={applicant.applicationId}>
                <ApplicantCard applicant={applicant} jobId={job.id} />
              </li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}
