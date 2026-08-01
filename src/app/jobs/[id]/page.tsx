import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { formatRate, formatDateRange } from "@/lib/format";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  Badge,
  Card,
  DetailRow,
  SubmitButton,
  ButtonLink,
  inputClass,
} from "@/components/ui";
import { applyToJob } from "../actions";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ applied?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/jobs/${id}`)}`);
  }

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, employer_id, role_slug, title, description, location_zip, travel_expected, start_date, end_date, rate_cents, rate_type, status"
    )
    .eq("id", id)
    .maybeSingle();

  if (!job) {
    notFound();
  }

  const [{ data: profile }, { data: employer }, { data: place }, { data: existing }] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase
        .from("employer_profiles")
        .select("company_name")
        .eq("profile_id", job.employer_id)
        .maybeSingle(),
      supabase
        .from("zip_codes")
        .select("city, state")
        .eq("zip", job.location_zip)
        .maybeSingle(),
      supabase
        .from("applications")
        .select("id, created_at")
        .eq("job_id", id)
        .eq("freelancer_id", user.id)
        .maybeSingle(),
    ]);

  const role = ROLE_BY_SLUG.get(job.role_slug);
  const isRemote = role?.category === "remote";
  const isFreelancer = profile?.role === "freelancer";
  const isOwner = user.id === job.employer_id;
  const hasApplied = Boolean(existing) || query.applied === id;
  const location = place ? [place.city, place.state].filter(Boolean).join(", ") : null;

  return (
    <PageShell>
      <PageHeader
        title={job.title}
        subtitle={
          employer?.company_name ? (
            <Link href={`/employers/${job.employer_id}`} className="hover:underline">
              {employer.company_name}
            </Link>
          ) : undefined
        }
        action={<ButtonLink href="/jobs">Back to jobs</ButtonLink>}
      />

      <ErrorBanner message={query.error} />
      {query.applied === id && <SuccessBanner message="Application sent." />}

      <div className="mb-6 flex flex-wrap gap-1.5">
        {role && <Badge>{role.label}</Badge>}
        {isRemote ? <Badge>Remote</Badge> : location && <Badge>{location}</Badge>}
        {job.travel_expected && <Badge>Travel expected</Badge>}
        {job.status !== "open" && <Badge>{job.status}</Badge>}
      </div>

      <p className="mb-6 whitespace-pre-line text-sm leading-relaxed text-gray-700">
        {job.description}
      </p>

      <Card>
        <dl>
          <DetailRow label="Rate" value={formatRate(job.rate_cents, job.rate_type)} />
          <DetailRow label="Dates" value={formatDateRange(job.start_date, job.end_date)} />
          <DetailRow label="Location" value={isRemote ? "Remote" : location} />
        </dl>
      </Card>

      <div className="mt-8">
        {isOwner ? (
          <ButtonLink href={`/dashboard/employer/jobs/${job.id}/applicants`}>
            View applicants
          </ButtonLink>
        ) : hasApplied ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            You&apos;ve applied to this job.
          </p>
        ) : !isFreelancer ? (
          <p className="text-sm text-gray-500">Only freelancer accounts can apply to jobs.</p>
        ) : job.status !== "open" ? (
          <p className="text-sm text-gray-500">This job is no longer accepting applications.</p>
        ) : (
          <form action={applyToJob} className="flex flex-col gap-3">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="return_to" value={`/jobs/${job.id}`} />

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Add a note (optional)</span>
              <textarea
                name="cover_note"
                rows={4}
                placeholder="Relevant experience, availability, gear…"
                className={inputClass}
              />
            </label>

            <div>
              <SubmitButton>Apply</SubmitButton>
            </div>
            <p className="text-xs text-gray-500">Applying is always free and unlimited.</p>
          </form>
        )}
      </div>
    </PageShell>
  );
}
