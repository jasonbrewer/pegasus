import { moderatorMailto } from "@/lib/support";

/**
 * 2.5 — one visible route to a human, on every page, for both sides.
 *
 * Rendered from the root layout rather than added per-dashboard, so a
 * freelancer stuck in review and an employer wondering why their posting
 * vanished both have the same thing to click without knowing where to look.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm text-muted sm:px-6">
        <span>Production Circles</span>
        <a href={moderatorMailto()} className="underline hover:text-content">
          Contact the moderator for help
        </a>
      </div>
    </footer>
  );
}
