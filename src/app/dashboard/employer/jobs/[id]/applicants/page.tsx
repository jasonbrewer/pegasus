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
    .select("id, title, employer_id, role_slug, location_zip, status")
    .eq("id", id)
    .maybeSingle();

  if (!job) {
    notFound();
  }

  if (job.employer_id !== user.id) {
    redirect("/dashboard/employer");
  }

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

  const jobRole = ROLE_BY_SLUG.get(job.role_slug);

  return (
    <PageShell>
      <PageHeader
        title="Applicants"
        subtitle={
          <>
            {job.title}
            {jobRole && <span className="text-gray-400"> · {jobRole.label}</span>}
          </>
        }
      />

      {error && (
        <p className="mb-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>
      )}

      {!applicants || applicants.length === 0 ? (
        <p className="text-sm text-gray-500">No applications yet.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500">
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
                  <Card>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link
                        href={`/freelancers/${applicant.freelancer_id}`}
                        className="font-medium hover:underline"
                      >
                        {applicant.full_name || "Freelancer"}
                      </Link>
                      <span className="text-sm text-gray-500">
                        {distance ?? "Remote role"}
                      </span>
                    </div>

                    <p className="mt-0.5 text-sm text-gray-600">
                      {place ?? "Location not set"}
                      {rate && <span className="text-gray-400"> · {rate}</span>}
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
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                        {applicant.cover_note}
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PageShell>
  );
}
