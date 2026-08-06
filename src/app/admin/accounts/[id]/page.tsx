import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/access";
import { formatRate, formatTimestamp } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  Badge,
  Card,
  DetailRow,
  ButtonLink,
} from "@/components/ui";
import { StatusActions } from "@/components/status-actions";
import type { AccountStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  // Readable at any status because of the admin SELECT carve-out; for anyone
  // else this row would not come back at all.
  const { data: account } = await supabase
    .from("profiles")
    .select("id, full_name, role, status, is_admin, invited_by, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!account) {
    notFound();
  }

  const { data: inviter } = account.invited_by
    ? await supabase.from("profiles").select("id, full_name").eq("id", account.invited_by).maybeSingle()
    : { data: null };

  const isFreelancer = account.role === "freelancer";

  const { data: freelancer } = isFreelancer
    ? await supabase
        .from("freelancer_profiles")
        .select("home_zip, bio, day_rate_cents, travel_radius_miles, reel_url, portfolio_url")
        .eq("profile_id", id)
        .maybeSingle()
    : { data: null };

  const { data: roleRows } = isFreelancer
    ? await supabase.from("freelancer_roles").select("role_slug").eq("freelancer_id", id)
    : { data: [] };

  const { data: employer } = !isFreelancer
    ? await supabase
        .from("employer_profiles")
        .select("company_name, website, description, home_zip")
        .eq("profile_id", id)
        .maybeSingle()
    : { data: null };

  const { data: jobs } = !isFreelancer
    ? await supabase.from("jobs").select("id, company_network, status").eq("employer_id", id)
    : { data: [] };

  // 6.1 / 6.2 — contact details, readable here only because of the admin
  // SELECT carve-outs added in 20260801000014. For a non-admin these come back
  // empty: an employer sees a freelancer's contact only after being applied to,
  // and employer contact info is otherwise owner-only.
  const { data: freelancerContact } = isFreelancer
    ? await supabase
        .from("freelancer_contacts")
        .select("phone, contact_email")
        .eq("profile_id", id)
        .maybeSingle()
    : { data: null };

  const { data: employerContact } = !isFreelancer
    ? await supabase
        .from("employer_contacts")
        .select("contact_phone, contact_email, linkedin_url")
        .eq("profile_id", id)
        .maybeSingle()
    : { data: null };

  // 6.4 — what this freelancer applied to, and what they sent. Read only:
  // there is no admin UPDATE policy on applications and no UI here to write
  // one. Withdrawn applications are included — a moderator looking into an
  // account needs the whole record, not the employer's live shortlist.
  const { data: applications } = isFreelancer
    ? await supabase
        .from("applications")
        .select("id, job_id, cover_note, credits_html, withdrawn_at, created_at")
        .eq("freelancer_id", id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const appliedJobIds = [...new Set((applications ?? []).map((a) => a.job_id))];

  const { data: appliedJobs } = appliedJobIds.length
    ? await supabase.from("jobs").select("id, company_network, status").in("id", appliedJobIds)
    : { data: [] };

  const { data: appliedTitles } = appliedJobIds.length
    ? await supabase.from("job_titles").select("job_id, title").in("job_id", appliedJobIds)
    : { data: [] };

  const appliedJobById = new Map((appliedJobs ?? []).map((j) => [j.id, j]));
  const appliedTitleByJob = new Map((appliedTitles ?? []).map((t) => [t.job_id, t.title]));

  const { data: place } = freelancer?.home_zip || employer?.home_zip
    ? await supabase
        .from("zip_codes")
        .select("city, state")
        .eq("zip", (freelancer?.home_zip ?? employer?.home_zip) as string)
        .maybeSingle()
    : { data: null };

  const location = place ? [place.city, place.state].filter(Boolean).join(", ") : null;
  const returnTo = `/admin/accounts/${id}`;

  return (
    <PageShell>
      <PageHeader
        title={employer?.company_name || account.full_name || "(no name)"}
        subtitle={
          <>
            {account.role}
            {account.is_admin && <span className="text-muted"> · admin</span>}
          </>
        }
        action={<ButtonLink href="/admin">Back to moderation</ButtonLink>}
      />

      <ErrorBanner message={query.error} />
      {query.updated && (
        <SuccessBanner
          message={`Account set to ${STATUS_LABEL[query.updated as AccountStatus] ?? query.updated}.`}
        />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Badge>{STATUS_LABEL[account.status]}</Badge>
        <StatusActions
          profileId={account.id}
          role={account.role}
          status={account.status}
          returnTo={returnTo}
        />
      </div>

      <Card>
        <dl>
          <DetailRow label="Name" value={account.full_name} />
          <DetailRow label="Joined" value={formatTimestamp(account.created_at)} />
          <DetailRow label="Based in" value={location} />
          <DetailRow
            label="Invited by"
            value={
              inviter ? (
                <Link href={`/admin/accounts/${inviter.id}`} className="underline">
                  {inviter.full_name || "a member"}
                </Link>
              ) : (
                "Applied directly"
              )
            }
          />
          {isFreelancer ? (
            <>
              <DetailRow label="Day rate" value={formatRate(freelancer?.day_rate_cents ?? null)} />
              <DetailRow
                label="Travels up to"
                value={
                  freelancer?.travel_radius_miles != null
                    ? `${freelancer.travel_radius_miles} miles`
                    : null
                }
              />
              <DetailRow
                label="Reel"
                value={
                  freelancer?.reel_url ? (
                    <a
                      href={freelancer.reel_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View reel
                    </a>
                  ) : null
                }
              />
              <DetailRow
                label="Portfolio"
                value={
                  freelancer?.portfolio_url ? (
                    <a
                      href={freelancer.portfolio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View portfolio
                    </a>
                  ) : null
                }
              />
            </>
          ) : (
            <>
              <DetailRow
                label="Website"
                value={
                  employer?.website ? (
                    <a
                      href={employer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {employer.website}
                    </a>
                  ) : null
                }
              />
              <DetailRow label="Postings" value={String(jobs?.length ?? 0)} />
            </>
          )}
        </dl>
      </Card>

      {/* 6.1 / 6.2 — contact for verification. Kept in its own card, and
          labelled, so it is obvious this is information the moderator sees and
          the rest of the membership does not. */}
      <div className="mt-6">
        <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Contact</h2>
          <span className="text-xs text-muted">
            Visible to moderators for verification — not to other members
          </span>
        </div>
        <dl>
          <DetailRow
            label="Phone"
            value={formatPhone(
              isFreelancer ? freelancerContact?.phone : employerContact?.contact_phone
            )}
          />
          <DetailRow
            label="Email"
            value={
              isFreelancer ? freelancerContact?.contact_email : employerContact?.contact_email
            }
          />
          {!isFreelancer && (
            <DetailRow
              label="LinkedIn"
              value={
                employerContact?.linkedin_url ? (
                  <a
                    href={employerContact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {employerContact.linkedin_url}
                  </a>
                ) : null
              }
            />
          )}
        </dl>
        </Card>
      </div>

      {isFreelancer && (roleRows ?? []).length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {(roleRows ?? []).map((r) => {
            const role = ROLE_BY_SLUG.get(r.role_slug);
            return role ? <Badge key={r.role_slug}>{role.label}</Badge> : null;
          })}
        </div>
      )}

      {isFreelancer && freelancer?.bio && (
        <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-secondary">
          {freelancer.bio}
        </p>
      )}

      {!isFreelancer && employer?.description && (
        <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-secondary">
          {employer.description}
        </p>
      )}

      {!isFreelancer && (jobs ?? []).length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Postings
          </h2>
          <ul className="flex flex-col gap-3">
            {(jobs ?? []).map((job) => (
              <li key={job.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                      {job.company_network}
                    </Link>
                    <Badge>{job.status}</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 6.4 — what they applied to and what they sent. Read only. */}
      {isFreelancer && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Applications ({(applications ?? []).length})
          </h2>

          {(applications ?? []).length === 0 ? (
            <p className="text-sm text-muted">They haven&apos;t applied to anything yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(applications ?? []).map((application) => {
                const job = appliedJobById.get(application.job_id);

                return (
                  <li key={application.id}>
                    <Card>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <Link
                          href={`/jobs/${application.job_id}`}
                          className="font-medium hover:underline"
                        >
                          {appliedTitleByJob.get(application.job_id) ?? "Untitled posting"}
                        </Link>
                        {application.withdrawn_at ? (
                          <Badge>Withdrawn</Badge>
                        ) : (
                          <span className="text-sm text-muted">
                            Applied {formatTimestamp(application.created_at)}
                          </span>
                        )}
                      </div>

                      {job && <p className="mt-0.5 text-sm text-muted">{job.company_network}</p>}

                      {/* Collapsed by default: an account under review can have
                          a lot of these, and the point of the list is the
                          pattern, not the prose. */}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm underline">
                          What they sent
                        </summary>

                        <div className="mt-3">
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                            Message
                          </p>
                          {application.cover_note ? (
                            // Plain text — rendered as text, never as HTML.
                            <p className="whitespace-pre-line text-sm leading-relaxed text-secondary">
                              {application.cover_note}
                            </p>
                          ) : (
                            <p className="text-sm text-muted">No message.</p>
                          )}
                        </div>

                        {application.credits_html && (
                          <div className="mt-3">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                              Credits or résumé
                            </p>
                            {/* Sanitized server-side at apply time
                                (src/lib/sanitize.ts). Never rendered straight
                                from user input. */}
                            <div
                              className="text-sm leading-relaxed text-secondary [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
                              dangerouslySetInnerHTML={{ __html: application.credits_html }}
                            />
                          </div>
                        )}
                      </details>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className="mt-8">
        <ButtonLink href={isFreelancer ? `/freelancers/${id}` : `/employers/${id}`}>
          View their public profile
        </ButtonLink>
      </div>
    </PageShell>
  );
}
