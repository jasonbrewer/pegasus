import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { formatDistance, formatTimestamp } from "@/lib/format";
import { formatPhone, telHref } from "@/lib/phone";
import { parseVideoUrl } from "@/lib/video";
import { PageShell, PageHeader, Badge, Card, DetailRow, ButtonLink } from "@/components/ui";

/**
 * 5.1 — where "View full application" lands.
 *
 * The card shows what an employer triages on. This shows the application as it
 * was actually submitted, including the rich-text credits that used to make
 * the list page a wall of text. It is the application, not the profile: the
 * credits here are the snapshot sent with this application, which is not
 * necessarily what the freelancer's profile says today.
 */
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  const { id, applicationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(
        `/dashboard/employer/jobs/${id}/applicants/${applicationId}`
      )}`
    );
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, company_network, employer_id, role_slug")
    .eq("id", id)
    .maybeSingle();

  if (!job) {
    notFound();
  }

  if (job.employer_id !== user.id) {
    redirect("/dashboard/employer");
  }

  // Reuses the same security-definer function the list page uses, so this page
  // inherits its guarantees without restating them: jobs owned by auth.uid()
  // only, participating freelancers only, withdrawn applications excluded. An
  // application that has since been withdrawn simply is not in the list, and
  // this page 404s — which is the behaviour 2.3 asks for.
  const { data: applicants } = await supabase.rpc("job_applicants", { p_job_id: id });
  const application = (applicants ?? []).find((a) => a.application_id === applicationId);

  if (!application) {
    notFound();
  }

  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select("home_zip, reel_url, portfolio_url, bio")
    .eq("profile_id", application.freelancer_id)
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
    .eq("freelancer_id", application.freelancer_id);

  // Same rule as the card: the policy decides, not this file.
  const { data: contact } = await supabase
    .from("freelancer_contacts")
    .select("phone, contact_email")
    .eq("profile_id", application.freelancer_id)
    .maybeSingle();

  const location = place ? [place.city, place.state].filter(Boolean).join(", ") : null;
  const distance = formatDistance(application.distance_miles);
  const reel = parseVideoUrl(freelancer?.reel_url);
  const roles = (roleRows ?? [])
    .map((r) => ROLE_BY_SLUG.get(r.role_slug))
    .filter((r) => r !== undefined);

  return (
    <PageShell>
      <p className="mb-4 text-sm">
        <Link href={`/dashboard/employer/jobs/${id}/applicants`} className="text-muted underline">
          &larr; All applicants
        </Link>
      </p>

      <PageHeader
        title={application.full_name || "Applicant"}
        subtitle={
          <>
            {location ?? "Location not set"}
            {distance && <span className="text-muted"> · {distance}</span>}
            <span className="text-muted">
              {" "}
              · Applied {formatTimestamp(application.created_at) ?? "recently"}
            </span>
          </>
        }
        action={<ButtonLink href={`/freelancers/${application.freelancer_id}`}>Full profile</ButtonLink>}
      />

      <div className="flex flex-col gap-6">
        {roles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <Badge key={role.slug}>{role.label}</Badge>
            ))}
          </div>
        )}

        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Message</h2>
          {application.cover_note ? (
            // Plain text — rendered as text, never as HTML.
            <p className="whitespace-pre-line text-sm leading-relaxed text-secondary">
              {application.cover_note}
            </p>
          ) : (
            <p className="text-sm text-muted">No message sent with this application.</p>
          )}
        </section>

        {application.credits_html && (
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
              Credits or résumé
            </h2>
            {/* Sanitized server-side at apply time (src/lib/sanitize.ts).
                Never rendered straight from user input. */}
            <div
              className="text-sm leading-relaxed text-secondary [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: application.credits_html }}
            />
          </section>
        )}

        {reel && (
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Reel</h2>
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-line">
              <iframe
                src={reel.embedUrl}
                title={`${application.full_name || "Applicant"} reel`}
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                className="h-full w-full"
              />
            </div>
          </section>
        )}

        {/* The anchor "View contact" targets. */}
        <section id="contact" className="scroll-mt-6">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">Contact</h2>
          <Card>
            <dl>
              <DetailRow
                label="Phone"
                value={
                  contact?.phone ? (
                    <a href={telHref(contact.phone)} className="underline">
                      {formatPhone(contact.phone)}
                    </a>
                  ) : null
                }
              />
              <DetailRow
                label="Email"
                value={
                  contact?.contact_email ? (
                    <a href={`mailto:${contact.contact_email}`} className="underline">
                      {contact.contact_email}
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
            </dl>
            {!contact?.phone && !contact?.contact_email && !freelancer?.portfolio_url && (
              <p className="text-sm text-muted">
                This applicant hasn&apos;t added contact details yet.
              </p>
            )}
          </Card>
        </section>
      </div>
    </PageShell>
  );
}
