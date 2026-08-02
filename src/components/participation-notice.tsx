import { participationNotice, type Viewer } from "@/lib/access";

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
    ? "border-red-200 bg-red-50 text-red-900"
    : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`mb-6 rounded-lg border px-4 py-3 ${tone}`}>
      <p className="text-sm font-medium">{notice.title}</p>
      <p className="mt-1 text-sm leading-relaxed opacity-90">{notice.body}</p>
    </div>
  );
}
