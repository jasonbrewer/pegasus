import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import {
  PageShell,
  PageHeader,
  Badge,
  Card,
  DetailRow,
  ButtonLink,
} from "@/components/ui";
import type { RateType } from "@/types/database";

function formatRate(cents: number | null, type: RateType) {
  if (cents == null) return null;
  const amount = `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (type === "day") return `${amount}/day`;
  if (type === "hourly") return `${amount}/hr`;
  return `${amount} flat`;
}

function formatDates(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (start && end && start !== end) return `${start} → ${end}`;
  return start ?? end;
}

export default async function EmployerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // employer_profiles is readable by authenticated users only (RLS).
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/employers/${id}`)}`);
  }

  const { data: employer } = await supabase
    .from("employer_profiles")
    .select("profile_id, company_name, billing_email, home_zip, description, website")
    .eq("profile_id", id)
    .maybeSingle();

  if (!employer) {
    notFound();
  }

  // Only the resolved city/state is rendered; the raw ZIP stays server-side.
  const { data: employerPlace } = employer.home_zip
    ? await supabase
        .from("zip_codes")
        .select("city, state")
        .eq("zip", employer.home_zip)
        .maybeSingle()
    : { data: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();

  // RLS returns open jobs to everyone, plus draft/closed ones to the owner.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, role_slug, location_zip, start_date, end_date, rate_cents, rate_type, status, travel_expected")
    .eq("employer_id", id)
    .order("created_at", { ascending: false });

  // Resolve each job's ZIP to a city/state in one round trip; the raw ZIP is
  // never rendered.
  const zips = [...new Set((jobs ?? []).map((j) => j.location_zip))];
  const { data: places } = zips.length
    ? await supabase.from("zip_codes").select("zip, city, state").in("zip", zips)
    : { data: [] };

  const placeByZip = new Map(
    (places ?? []).map((p) => [p.zip, [p.city, p.state].filter(Boolean).join(", ")])
  );

  const isOwner = user.id === id;

  return (
    <PageShell>
      <PageHeader
        title={employer.company_name}
        subtitle={
          employerPlace
            ? [employerPlace.city, employerPlace.state].filter(Boolean).join(", ")
            : undefined
        }
        action={isOwner ? <ButtonLink href="/dashboard/employer/profile">Edit profile</ButtonLink> : undefined}
      />

      {employer.description && (
        <p className="mb-6 whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {employer.description}
        </p>
      )}

      <Card>
        <dl>
          <DetailRow label="Hiring contact" value={profile?.full_name} />
          <DetailRow
            label="Website"
            value={
              employer.website ? (
                <a
                  href={employer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {employer.website.replace(/^https?:\/\//, "")}
                </a>
              ) : null
            }
          />
          <DetailRow
            label="Contact"
            value={
              employer.billing_email ? (
                <a href={`mailto:${employer.billing_email}`} className="underline">
                  {employer.billing_email}
                </a>
              ) : null
            }
          />
        </dl>
      </Card>

      <div className="h-8" />

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
        Posted jobs
      </h2>

      {!jobs || jobs.length === 0 ? (
        <p className="text-sm text-gray-500">No jobs posted yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => {
            const role = ROLE_BY_SLUG.get(job.role_slug);
            const place = placeByZip.get(job.location_zip);
            const rate = formatRate(job.rate_cents, job.rate_type);
            const dates = formatDates(job.start_date, job.end_date);

            return (
              <li key={job.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{job.title}</p>
                    {job.status !== "open" && <Badge>{job.status}</Badge>}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {role && <Badge>{role.label}</Badge>}
                    {role?.category === "remote" ? (
                      <Badge>Remote</Badge>
                    ) : (
                      place && <Badge>{place}</Badge>
                    )}
                    {job.travel_expected && <Badge>Travel expected</Badge>}
                  </div>

                  {(rate || dates) && (
                    <p className="mt-2 text-sm text-gray-500">
                      {[rate, dates].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {isOwner && (
        <p className="mt-6">
          <Link href="/dashboard/employer/jobs/new" className="text-sm underline">
            Post another job
          </Link>
        </p>
      )}
    </PageShell>
  );
}
