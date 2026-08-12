import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ScopeTool } from "@/components/scope/scope-tool";
import { createCapture } from "./capture";
import { ResultPanel } from "./result";

/**
 * The static bundle's entry point.
 *
 * ===========================================================================
 * THIS IS A RE-WRAP, NOT A SECOND TOOL.
 *
 * The questions, the steps, the rate sheet and the arithmetic all come from
 * the same files the hosted tool renders: <ScopeTool> in components/scope, the
 * engine in lib/scoping. Nothing in this directory prices anything. Edit a
 * rate in src/lib/scoping/baseline.ts, run `npm run build:scope`, and this
 * bundle moves with the hosted route — that is the entire reason this exists
 * instead of a hand-ported copy.
 *
 * What this directory adds is only what a page with no server has to do for
 * itself:
 *   capture.ts   the session id and the writes, without cookies or actions
 *   result.tsx   the panel under the estimate
 *   booking.tsx  the CTA, pointed at the calendar the site already uses
 * ===========================================================================
 */

function App() {
  // Lazy initialiser: one save queue per mount, stable for the life of the page.
  const [onProgress] = useState(createCapture);

  return (
    /*
     * The id is load-bearing for styling, not just a handle: the theme
     * stylesheet reaches the tool's own CSS-module variables through
     * `#scope-app > div`, which is <ScopeTool>'s root element. Renaming this,
     * or putting anything between it and <ScopeTool>, silently drops the
     * palette back to the defaults compiled into the module.
     *
     * Width and padding match the hosted route: the tool is questions beside a
     * sticky estimate, which wants more room than a prose column.
     */
    <main id="scope-app" className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
      <ScopeTool
        intro={
          <header className="mb-8">
            {/* The H1 is the question someone typed into a search box, not our
                name for the feature. */}
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              What should your video cost?
            </h1>
            <p className="mt-3 max-w-2xl text-base text-secondary">
              Answer a few plain questions — no production jargon, no account, no email required.
              You&apos;ll get an honest estimate and an itemised breakdown, and you&apos;ll see
              where the real costs hide, so you walk into any quote already knowing the shape of
              the job.
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Built by the people who run the crew. Free, and yours to keep whether or not you ever
              talk to us.
            </p>
          </header>
        }
        onProgress={onProgress}
        result={(progress) => <ResultPanel progress={progress} />}
      />
    </main>
  );
}

const container = document.getElementById("scope-root");

if (container) {
  createRoot(container).render(<App />);
}
