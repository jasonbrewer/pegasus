import { participationNotice, type Viewer } from "@/lib/access";
import { moderatorMailto } from "@/lib/support";

/**
 * Explains a pending or blocked account to its owner. Renders nothing for an
 * approved one.
 *
 * This is only ever an explanation. The restriction itself is enforced by RLS,
 * so removing this component would make the app confusing, not permissive.
 */
export function ParticipationNotice({
  viewer,
}: {
  viewer: Pick<Viewer, "role" | "status"> | null;
}) {
  const notice = participationNotice(viewer);
  if (!notice) return null;

  const blocked = viewer?.status === "blocked";
  const tone = blocked
    ? "border-danger-edge bg-danger text-danger-ink"
    : "border-notice-edge bg-notice text-notice-ink";

  return (
    <div className={`mb-6 rounded-lg border px-4 py-3 ${tone}`}>
      <p className="text-sm font-medium">{notice.title}</p>
      <p className="mt-1 text-sm leading-relaxed opacity-90">{notice.body}</p>
      {/* 2.5 — these notices already said "get in touch"; this is the how. */}
      <p className="mt-2 text-sm">
        <a
          href={moderatorMailto(
            blocked ? "My account is blocked" : "Question about my application to join"
          )}
          className="underline"
        >
          Contact the moderator
        </a>
      </p>
    </div>
  );
}
