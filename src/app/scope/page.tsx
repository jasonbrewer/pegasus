import type { Metadata } from "next";
import { PublicScope } from "./public-scope";

/**
 * /scope — the public, no-account version of the scoping tool.
 *
 * NO AUTH GUARD, and that is the entire point of the route. It is listed in
 * PUBLIC_PATHS in src/lib/supabase/middleware.ts, and there is no getUser()
 * check below: signed in or signed out, everybody gets the same page. The
 * employer-facing copy at /dashboard/employer/scope keeps its guard and is
 * untouched — this is a second door to the same tool, not a hole in that one.
 *
 * The tool itself is the same component that page renders, reading the same
 * rate sheet at build time (src/lib/scoping/baseline.ts). There is no second
 * copy of the questions and no second copy of the numbers, so a rate edit
 * lands on both routes at once or on neither.
 *
 * This page is a Server Component so the metadata below is real, server-
 * rendered <head> content — the estimate is the top of the funnel for people
 * searching "how much does a video cost", and a client-rendered title would be
 * invisible to the thing that is supposed to bring them here.
 */

const TITLE = "What should your video cost? Free estimate — Production Circles";

const DESCRIPTION =
  "Get an honest, itemised estimate for your video in about two minutes — no account, " +
  "no sales call, no email required. See where the real costs hide, then talk to a producer " +
  "if you want one.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/scope" },
  openGraph: {
    type: "website",
    siteName: "Production Circles",
    title: TITLE,
    description: DESCRIPTION,
    url: "/scope",
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function PublicScopePage() {
  return (
    // Wider than PageShell's max-w-2xl for the same reason the dashboard page
    // is: the tool is questions beside a sticky estimate. Padding matches.
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        {/* The H1 is the question the visitor typed into a search box, not our
            name for the feature. "Scope Tool" is what we call it; this is what
            they came looking for. */}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What should your video cost?
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-secondary">
          Answer a few plain questions — no production jargon, no account, no email required.
          You&apos;ll get an honest estimate and an itemised breakdown, and you&apos;ll see where
          the real costs hide, so you walk into any quote already knowing the shape of the job.
        </p>
        <p className="mt-2 max-w-2xl text-base text-muted">
          Built by the people who run the crew. Free, and yours to keep whether or not you ever
          talk to us.
        </p>
      </header>

      <PublicScope />
    </main>
  );
}
