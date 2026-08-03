import Link from "next/link";
import { Badge } from "@/components/ui";
import { ApplicantStar } from "@/components/applicant-star";
import { formatPhone, telHref } from "@/lib/phone";
import { parseVideoUrl } from "@/lib/video";

export interface ApplicantCardData {
  applicationId: string;
  freelancerId: string;
  name: string;
  /** "Richmond, VA", resolved server-side. The ZIP itself never leaves. */
  location: string | null;
  distance: string | null;
  /** Role labels, already resolved from slugs. */
  roles: string[];
  /** The plain-text apply message. Rendered as text, never as HTML. */
  message: string | null;
  reelUrl: string | null;
  portfolioUrl: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * 5.1 — one applicant, condensed enough that a long list stays scannable.
 *
 * Note what is NOT here: the rich-text credits. They are the longest thing an
 * applicant sends and they were what made the old page a wall of text, so they
 * move behind "View full application". Everything an employer triages on —
 * who, where, what they do, what they said, their reel, how to reach them —
 * stays on the card.
 *
 * The card is no longer wrapped in a single link. It has a button and several
 * links of its own now, and interactive elements cannot legally nest inside an
 * anchor.
 */
export function ApplicantCard({
  applicant,
  jobId,
}: {
  applicant: ApplicantCardData;
  jobId: string;
}) {
  const detailHref = `/dashboard/employer/jobs/${jobId}/applicants/${applicant.applicationId}`;
  const reel = parseVideoUrl(applicant.reelUrl);
  const hasContact = Boolean(applicant.phone || applicant.email);

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={detailHref}
            className="font-medium underline decoration-line underline-offset-2 hover:decoration-strong"
          >
            {applicant.name || "Freelancer"}
          </Link>
          <p className="mt-0.5 text-sm text-secondary">
            {applicant.location ?? "Location not set"}
            {applicant.distance && <span className="text-muted"> · {applicant.distance}</span>}
          </p>
        </div>

        <ApplicantStar name={applicant.name || "This applicant"} />
      </div>

      {applicant.roles.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {applicant.roles.map((label) => (
            <Badge key={label}>{label}</Badge>
          ))}
        </div>
      )}

      {applicant.message ? (
        // Clamped rather than truncated on the server, so the full message is
        // still in the page for find-in-page and for a screen reader — the
        // footer link is the way to read the rest comfortably.
        <p className="mt-3 line-clamp-5 whitespace-pre-line text-sm leading-relaxed text-secondary">
          {applicant.message}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">No message sent with this application.</p>
      )}

      {reel ? (
        // Capped rather than full-bleed. A 16:9 player at card width makes one
        // applicant fill the viewport, which is the opposite of 5.2's "easy to
        // scan" — this keeps the reel watchable in place while roughly halving
        // the card's height.
        <div className="mt-3 aspect-video w-full max-w-sm overflow-hidden rounded-md border border-line">
          <iframe
            src={reel.embedUrl}
            title={`${applicant.name || "Applicant"} reel`}
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            // A page of these would otherwise load every player at once.
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full"
          />
        </div>
      ) : (
        applicant.reelUrl && (
          <a
            href={applicant.reelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm underline"
          >
            View reel
          </a>
        )
      )}

      {/* 5.1 — shown outright. This freelancer applied to this employer's job,
          which is exactly the condition the freelancer_contacts SELECT policy
          unlocks on, so there is no second gate to apply here. If the policy
          returned nothing, there is nothing to show. */}
      {hasContact && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {applicant.phone && (
            <a href={telHref(applicant.phone)} className="text-secondary underline">
              {formatPhone(applicant.phone)}
            </a>
          )}
          {applicant.email && (
            <a href={`mailto:${applicant.email}`} className="text-secondary underline">
              {applicant.email}
            </a>
          )}
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-3 text-sm">
        {applicant.portfolioUrl ? (
          <a
            href={applicant.portfolioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View portfolio
          </a>
        ) : (
          // Kept in place rather than dropped, so the three actions line up
          // down the list and a missing portfolio is itself a signal.
          <span className="text-muted">No portfolio</span>
        )}
        <span aria-hidden="true" className="text-muted">
          ·
        </span>
        <Link href={detailHref} className="underline">
          View full application
        </Link>
        <span aria-hidden="true" className="text-muted">
          ·
        </span>
        {hasContact ? (
          <Link href={`${detailHref}#contact`} className="underline">
            View contact
          </Link>
        ) : (
          <span className="text-muted">No contact on file</span>
        )}
      </div>
    </div>
  );
}
