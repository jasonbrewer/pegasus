import { Fragment } from "react";
import type { ScopeProgress } from "@/components/scope/scope-tool";
import styles from "@/components/scope/scope.module.css";
import { fmt } from "@/lib/scoping/engine";
import { BookingCta } from "./booking";

/**
 * What lands under the estimate on the last step.
 *
 * Every number and every line on this panel is read straight off the scope the
 * engine produced — there is no second opinion about what a shooter day costs
 * in this file, and no arithmetic of its own. Change a rate in
 * src/lib/scoping/baseline.ts and this panel changes with the hosted tool, on
 * the next rebuild, because it is reading the same object.
 *
 * What it does NOT carry, deliberately: the account-signup path. That CTA
 * belongs to a product this page is not part of, so 'call_me' is the only
 * value this build ever writes.
 */
export function ResultPanel({ progress }: { progress: ScopeProgress }) {
  const { scope, answers } = progress;

  return (
    <section aria-label="Your estimate and what to do next">
      <div className={`${styles.card} p-5 md:p-8`}>
        {/* Decorative, and the one flourish on a page that is otherwise all
            arithmetic: it frames the number as the end of something rather
            than the start of an invoice. The arrows are hidden from screen
            readers — "Planned right-arrow Shot" is noise read aloud. */}
        <p className={styles.journey} aria-label="Planned, shot, edited, delivered">
          {["Planned", "Shot", "Edited", "Delivered"].map((stage, i) => (
            <Fragment key={stage}>
              {i > 0 && (
                <span className={styles.journeyArrow} aria-hidden="true">
                  →
                </span>
              )}
              <span className={styles.journeyStep}>{stage}</span>
            </Fragment>
          ))}
        </p>

        <span className={`${styles.eyebrow} mb-2 block`}>
          Your {answers.making.toLowerCase()}, {progress.variant}
        </span>
        <p className={`${styles.serif} ${styles.mono} text-4xl font-semibold sm:text-5xl`}>
          {fmt(scope.total)}
        </p>
        <p className="mt-2 text-base text-secondary">
          That&apos;s a real number, from the rates real crews charge — not a range designed to
          get you on a call.
        </p>

        <div className="mt-6">
          <span className={`${styles.eyebrow} mb-2 block`}>What that gets you</span>
          <ul className="flex flex-col gap-1">
            {scope.lines.map((line) => (
              <li key={line.key} className={styles.line}>
                <span className="text-sm">{line.simple}</span>
                <span className={styles.dots} />
                <span className={`${styles.mono} text-sm font-semibold`}>{fmt(line.amt)}</span>
              </li>
            ))}
          </ul>
          <p className={`mt-3 text-sm ${styles.muted}`}>
            {scope.editDays} edit day{scope.editDays > 1 ? "s" : ""} covering{" "}
            {scope.count > 1 ? `${scope.count} cuts` : "one cut"} — about {scope.totalMin} finished
            minute{scope.totalMin === 1 ? "" : "s"} — through rough, fine and final.
          </p>
        </div>
      </div>

      {/* The pivot. The estimate answered "how much"; this names the question
          it can't answer, which is the one that actually stops people. */}
      <div className="mt-8 max-w-2xl">
        <h2 className={`${styles.serif} text-2xl font-semibold`}>
          The number was never the scary part.
        </h2>
        <p className="mt-3 text-base text-secondary">
          Handing it to a stranger is. Every reel on every website looks good — that&apos;s what a
          reel is for. What you can&apos;t tell from one is whether the person behind it will turn
          up on the day, light it properly, get usable audio, and come back with the video they
          promised. Get that wrong once and you&apos;ve spent {fmt(scope.total)} finding out.
        </p>
        <p className="mt-3 text-base text-secondary">
          Book a call and we&apos;ll walk this estimate through line by line, tell you where it
          moves for a job like yours
          {answers.shootLocation.trim() ? ` in ${answers.shootLocation.trim()}` : ""}, and say
          plainly which parts of it you could do without. Free, and you&apos;re not committing to
          anything by asking.
        </p>

        <div className="mt-6">
          <BookingCta />
        </div>

        <p className="mt-5 text-xs text-muted">
          We only know what you typed on this page. We didn&apos;t look up where you are, and
          nobody emails you unless you book a time above.
        </p>
      </div>
    </section>
  );
}
