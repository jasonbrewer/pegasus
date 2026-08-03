import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { formatRate, formatDistance } from "@/lib/format";
import { PageShell, PageHeader, Badge, Card } from "@/components/ui";

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
  // internally filtered to jobs owned by auth.uid().
  const { data: applicants, error } = await supabase.rpc("job_applicants", { p_job_id: id });

  const ids = [...new Set((applicants ?? []).map((a) => a.freelancer_id))];

  const { data: freelancers } = ids.length
    ? await supabase
        .from("freelancer_profiles")
        .select("profile_id, home_zip, day_rate_cents")
        .in("profile_id", ids)
    : { data: [] };

  const { data: roleRows } = ids.length
    ? await supabase.from("freelancer_roles").select("freelancer_id, role_slug").in("freelancer_id", ids)
    : { data: [] };

  const zips = [...new Set((freelancers ?? []).map((f) => f.home_zip))];
  const { data: places } = zips.length
    ? await supabase.from("zip_codes").select("zip, city, state").in("zip", zips)
    : { data: [] };

  const placeByZip = new Map(
    (places ?? []).map((p) => [p.zip, [p.city, p.state].filter(Boolean).join(", ")])
  );
  const freelancerById = new Map((freelancers ?? []).map((f) => [f.profile_id, f]));

  const rolesById = new Map<string, string[]>();
  for (const row of roleRows ?? []) {
    const list = rolesById.get(row.freelancer_id) ?? [];
    list.push(row.role_slug);
    rolesById.set(row.freelancer_id, list);
  }

  const { data: titleRow } = await supabase
    .from("job_titles")
    .select("title")
    .eq("job_id", id)
    .maybeSingle();

  const jobRole = ROLE_BY_SLUG.get(job.role_slug);

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

      {!applicants || applicants.length === 0 ? (
        <p className="text-sm text-muted">No applications yet.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {applicants.length} {applicants.length === 1 ? "applicant" : "applicants"}, closest
            first
          </p>

          {/* job_applicants() already orders by distance; do not re-sort. */}
          <ul className="flex flex-col gap-3">
            {applicants.map((applicant) => {
              const freelancer = freelancerById.get(applicant.freelancer_id);
              const place = freelancer ? placeByZip.get(freelancer.home_zip) : null;
              const roleSlugs = rolesById.get(applicant.freelancer_id) ?? [];
              const distance = formatDistance(applicant.distance_miles);
              const rate = formatRate(freelancer?.day_rate_cents ?? null);

              return (
                <li key={applicant.application_id}>
                  {/* 5.3 — the whole card is a link through to the full
                      profile, where gated contact info appears. */}
                  <Link
                    href={`/freelancers/${applicant.freelancer_id}`}
                    className="group block rounded-lg"
                  >
                  <Card interactive>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-medium underline">
                        {applicant.full_name || "Freelancer"}
                      </span>
                      <span className="text-sm text-muted">
                        {distance ?? "Remote role"}
                      </span>
                    </div>

                    <p className="mt-0.5 text-sm text-secondary">
                      {place ?? "Location not set"}
                      {rate && <span className="text-muted"> · {rate}</span>}
                    </p>

                    {roleSlugs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {roleSlugs.map((slug) => {
                          const role = ROLE_BY_SLUG.get(slug);
                          return role ? <Badge key={slug}>{role.label}</Badge> : null;
                        })}
                      </div>
                    )}

                    {applicant.cover_note && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                          Message
                        </p>
                        {/* Plain text — rendered as text, never as HTML. */}
                        <p className="whitespace-pre-line text-sm leading-relaxed text-secondary">
                          {applicant.cover_note}
                        </p>
                      </div>
                    )}

                    {applicant.credits_html && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                          Credits
                        </p>
                        {/* Sanitized server-side at apply time (src/lib/sanitize.ts).
                            Never rendered straight from user input. */}
                        <div
                          className="text-sm leading-relaxed text-secondary [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
                          dangerouslySetInnerHTML={{ __html: applicant.credits_html }}
                        />
                      </div>
                    )}

                    {!applicant.cover_note && !applicant.credits_html && (
                      <p className="mt-3 text-sm text-muted">
                        No message sent with this application.
                      </p>
                    )}

                    <p className="mt-3 text-sm text-muted">
                      View full profile &rarr;
                    </p>
                  </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PageShell>
  );
}
