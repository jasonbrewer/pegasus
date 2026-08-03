import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { formatRate, formatDateRange } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
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
import { RichTextEditor } from "@/components/rich-text-editor";
import { SubmitButton as PendingButton } from "@/components/submit-button";
import { ParticipationNotice } from "@/components/participation-notice";
import { applyToJob, toggleSavedJob } from "../actions";

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
      "id, employer_id, role_slug, company_network, description, location_zip, travel_expected, start_date, end_date, rate_cents, rate_type, status"
    )
    .eq("id", id)
    .maybeSingle();

  if (!job) {
    notFound();
  }

  const [
    { data: profile },
    { data: employer },
    { data: place },
    { data: existing },
    { data: savedRow },
    { data: ownProfile },
  ] = await Promise.all([
      supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle(),
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
        .select("id, created_at, withdrawn_at")
        .eq("job_id", id)
        .eq("freelancer_id", user.id)
        .maybeSingle(),
      // 8.2 — the saved_jobs policies already scope this to the caller; the
      // filter is just to fetch one row rather than the whole list.
      supabase
        .from("saved_jobs")
        .select("job_id")
        .eq("job_id", id)
        .eq("freelancer_id", user.id)
        .maybeSingle(),
      // 3.4 — the applicant's own profile credits, to pre-fill the apply form.
      supabase
        .from("freelancer_profiles")
        .select("credits_html")
        .eq("profile_id", user.id)
        .maybeSingle(),
    ]);

  // Not filtered here: the job_titles policy returns no row when the poster
  // hid the title and the viewer is not the owner.
  const { data: titleRow } = await supabase
    .from("job_titles")
    .select("title")
    .eq("job_id", id)
    .maybeSingle();

  // Shown only when the poster ticked "share with applicants" AND the viewer
  // applied — again decided by RLS, not by this page.
  const { data: contact } = await supabase
    .from("job_contacts")
    .select("contact_name, contact_email, contact_phone")
    .eq("job_id", id)
    .maybeSingle();

  const role = ROLE_BY_SLUG.get(job.role_slug);
  const isRemote = role?.category === "remote";
  const isFreelancer = profile?.role === "freelancer";
  // Pending and blocked freelancers cannot apply — the applications INSERT
  // policy refuses them. Showing the form anyway would just produce an error.
  const canApply = profile?.status === "approved";
  const isOwner = user.id === job.employer_id;
  // 2.3 — a withdrawn application does not count as applied, so the form
  // comes back. Submitting it reactivates the same row rather than inserting
  // a second one, which is what keeps the unique constraint happy.
  const hasApplied = existing?.withdrawn_at === null || query.applied === id;
  const isSaved = Boolean(savedRow);
  const location = place ? [place.city, place.state].filter(Boolean).join(", ") : null;

  return (
    <PageShell>
      <PageHeader
        title={titleRow?.title ?? "Title hidden by the poster"}
        subtitle={
          employer?.company_name ? (
            <Link href={`/employers/${job.employer_id}`} className="hover:underline">
              {job.company_network}
            </Link>
          ) : undefined
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* 8.2 — saving lives here on the detail page, not on the browse
                list, so the list stays a list. */}
            {isFreelancer && !isOwner && (
              <form action={toggleSavedJob}>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="return_to" value={`/jobs/${job.id}`} />
                <input type="hidden" name="saved" value={isSaved ? "1" : "0"} />
                <PendingButton
                  variant="secondary"
                  size="sm"
                  className={isSaved ? "border-strong" : ""}
                  pendingLabel="…"
                >
                  {isSaved ? "Unsave" : "Save"}
                </PendingButton>
              </form>
            )}
            <ButtonLink href="/jobs">Back to jobs</ButtonLink>
          </div>
        }
      />

      <ErrorBanner message={query.error} />
      {query.applied === id && <SuccessBanner message="Application sent." />}

      <div className="mb-6 flex flex-wrap gap-1.5">
        {role && <Badge>{role.label}</Badge>}
        {isRemote ? <Badge>Remote</Badge> : location && <Badge>{location}</Badge>}
        {job.travel_expected && <Badge>Travel expected</Badge>}
        {job.status !== "open" && <Badge>{job.status}</Badge>}
      </div>

      <p className="mb-6 whitespace-pre-line text-sm leading-relaxed text-secondary">
        {job.description}
      </p>

      <Card>
        <dl>
          <DetailRow label="Rate" value={formatRate(job.rate_cents, job.rate_type)} />
          <DetailRow label="Dates" value={formatDateRange(job.start_date, job.end_date)} />
          <DetailRow label="Location" value={isRemote ? "Remote" : location} />
          <DetailRow label="Company / network" value={job.company_network} />
        </dl>
      </Card>

      {contact && (
        <Card>
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
            Contact
          </p>
          <dl>
            <DetailRow label="Name" value={contact.contact_name} />
            <DetailRow label="Email" value={contact.contact_email} />
            <DetailRow label="Phone" value={formatPhone(contact.contact_phone)} />
          </dl>
        </Card>
      )}

      <div className="mt-8">
        {isOwner ? (
          // prefetch off: opening that page marks applications as viewed, so a
          // hover must not do it.
          <ButtonLink href={`/dashboard/employer/jobs/${job.id}/applicants`} prefetch={false}>
            View applicants
          </ButtonLink>
        ) : hasApplied ? (
          <p className="rounded-md bg-success px-3 py-2 text-sm text-success-ink">
            You&apos;ve applied to this job.
          </p>
        ) : !isFreelancer ? (
          <p className="text-sm text-muted">Only freelancer accounts can apply to jobs.</p>
        ) : !canApply ? (
          <ParticipationNotice viewer={profile} />
        ) : job.status !== "open" ? (
          <p className="text-sm text-muted">This job is no longer accepting applications.</p>
        ) : (
          <form action={applyToJob} className="flex flex-col gap-5">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="return_to" value={`/jobs/${job.id}`} />

            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Apply
            </h2>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Message</span>
              <textarea
                name="cover_note"
                required
                rows={5}
                placeholder="Why you're a fit, your availability for these dates, gear you bring…"
                className={inputClass}
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Credits or résumé</span>
              {/* 3.4 — starts from the profile's "Credits or résumé" rather
                  than blank. Editable before sending: what gets submitted is
                  whatever is in the box, and the profile is untouched. */}
              <RichTextEditor
                name="credits_html"
                defaultValue={ownProfile?.credits_html}
                placeholder="Paste your credits here — formatting is kept…"
              />
              <span className="text-xs text-muted">
                Optional. Paste from a document and the styling comes with it.
              </span>
            </div>

            <div>
              <SubmitButton pendingLabel="Sending…">Send application</SubmitButton>
            </div>
            <p className="text-xs text-muted">
              Applying is always free and unlimited. A message and your credits are all that
              get sent — the employer opens your full profile from there.
            </p>
          </form>
        )}
      </div>
    </PageShell>
  );
}
