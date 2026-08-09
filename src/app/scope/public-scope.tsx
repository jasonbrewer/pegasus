"use client";

import Link from "next/link";
import { Fragment, useActionState, useState, type ReactNode } from "react";
import { ScopeTool, type ScopeProgress } from "@/components/scope/scope-tool";
import styles from "@/components/scope/scope.module.css";
import { fmt } from "@/lib/scoping/engine";
import { SubmitButton } from "@/components/submit-button";
import {
  requestProducerCall,
  saveScopeProgress,
  startScopeSession,
  startSignupFromScope,
  type ProducerCallState,
  type ScopeProgressInput,
} from "./actions";

/**
 * The public wrapper around the shared scoping tool.
 *
 * It adds exactly two things and changes nothing about the tool itself:
 *   1. the session capture — every answer saved as it is given, so an
 *      abandoner still leaves us what they told us;
 *   2. the result panel — the pivot and the two CTAs.
 *
 * The questions, the steps and the arithmetic are all the shared component's,
 * which is the same one /dashboard/employer/scope renders.
 */

/* ===================== CAPTURE ===================== */

/**
 * Where this visit came from, read once, from things the browser already sent
 * or the link already carried.
 *
 * Nothing here is a lookup. No IP geolocation, no fingerprinting, nothing that
 * tries to work out where the visitor is — the shoot location comes from the
 * question the tool asks and from nowhere else. This is marketing attribution
 * for us ("the Google ad is working"), and it says where a click came from,
 * not who made it.
 */
function readReferral(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === "undefined") return out;

  if (document.referrer) out.referrer = document.referrer;
  out.landing_path = window.location.pathname;

  const params = new URLSearchParams(window.location.search);
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

function toInput(progress: ScopeProgress): ScopeProgressInput {
  const { answers } = progress;
  return {
    makingType: answers.making,
    // The WHOLE intake, spread rather than picked apart: a producer opening
    // this row wants the full briefing, and an abandoned session is the one
    // thing nobody can go back and ask about. The action validates every key
    // against engine.ts's own option lists before any of it reaches the
    // database, so passing the object wholesale is safe and stays correct when
    // a question is added.
    answers: { ...answers },
    shootLocation: answers.shootLocation,
    // The NORMALISED budget, never the raw field. Blank, 0 and "Not sure yet"
    // are one answer and all three send null, so nobody who hasn't got a
    // figure yet turns up in the leads table looking like a $0 budget.
    budgetInput: progress.budgetValue === null ? null : String(progress.budgetValue),
    computedEstimate: progress.scope.total,
    lastStepReached: progress.furthestStepLabel,
  };
}

/**
 * The save queue.
 *
 * A plain closure rather than a bundle of refs, because all of this is
 * bookkeeping that must survive re-renders without ever causing one. Created
 * once per mount by the hook below.
 *
 * Two rules it enforces:
 *   * the row exists before anything is saved onto it — the first snapshot
 *     goes in WITH the row, so a visitor who answers one question and leaves
 *     is still a row with a referrer on it;
 *   * one save in flight at a time, newest snapshot queued behind it. Answers
 *     arrive faster than a round trip, and letting them race would sometimes
 *     land an older snapshot last, including an older step count.
 */
function createCapture() {
  let started: Promise<void> | null = null;
  let pending: ScopeProgress | null = null;
  let inFlight = false;

  const flush = async (): Promise<void> => {
    if (inFlight) return;
    const next = pending;
    if (!next) return;

    pending = null;
    inFlight = true;
    try {
      await saveScopeProgress(toInput(next));
    } catch {
      // Capture is our bookkeeping. It never becomes an error on top of the
      // estimate the visitor actually came for.
    } finally {
      inFlight = false;
      if (pending) void flush();
    }
  };

  return (progress: ScopeProgress) => {
    pending = progress;

    if (!started) {
      started = startScopeSession(readReferral(), toInput(progress)).catch(() => {});
      pending = null;
      return;
    }

    void started.then(flush);
  };
}

/* ===================== RESULT ===================== */

/**
 * The primary CTA.
 *
 * It is a form, not a link, and it saves through the same session row the
 * answers went into — so the producer who rings back opens one record and sees
 * what this person is making, where, on what budget, and what the tool quoted
 * them. That briefing is the entire reason the table exists.
 */
function ProducerCallForm() {
  const [state, formAction] = useActionState<ProducerCallState, FormData>(requestProducerCall, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div className={`${styles.card} p-5 md:p-6`}>
        <p className={`${styles.serif} text-xl font-semibold`}>
          Thanks, {state.name} — we&apos;ll call you.
        </p>
        <p className="mt-2 text-sm text-secondary">
          A producer will be in touch within one business day. They&apos;ll have this estimate in
          front of them, so you won&apos;t have to explain the job twice. Nothing gets booked and
          nothing gets charged on that call.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className={`${styles.card} p-5 md:p-6`}>
      <p className={`${styles.serif} text-xl font-semibold`}>Have a producer call me — free</p>
      <p className="mt-1 mb-4 text-sm text-secondary">
        No obligation, no sales script. They&apos;ll walk this estimate through with you and line
        up crew who actually shoot this kind of thing.
      </p>

      {state.status === "error" && (
        <p className="mb-4 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">
          {state.message}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Your name
          <input name="contact_name" required maxLength={120} className={`${styles.text} ${styles.textFull}`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input type="email" name="contact_email" maxLength={200} className={`${styles.text} ${styles.textFull}`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Phone
          <input type="tel" name="contact_phone" maxLength={40} className={`${styles.text} ${styles.textFull}`} />
          <span className="text-xs text-muted">
            Either one is enough — whichever you&apos;d rather be reached on.
          </span>
        </label>
      </div>

      <SubmitButton className="mt-4" pendingLabel="Sending…">
        Have a producer call me
      </SubmitButton>
    </form>
  );
}

/**
 * The result screen.
 *
 * The number first and without hedging, then what it buys in plain English,
 * then the thing the number cannot answer. Everything itemised here is read
 * straight off the scope the engine produced — no second opinion about what a
 * shooter day costs lives in this file.
 */
function ResultPanel({ progress }: { progress: ScopeProgress }) {
  const { scope, answers } = progress;

  return (
    <section aria-label="Your estimate and what to do next">
      <div className={`${styles.card} p-5 md:p-8`}>
        {/* The journey line. Decorative, and the one flourish on a page that is
            otherwise all arithmetic: it frames the number as the end of
            something rather than the start of an invoice. The arrows are
            hidden from screen readers — read aloud, "Planned right-arrow Shot"
            is noise; the four words on their own carry it. */}
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
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <div>
          <h2 className={`${styles.serif} text-2xl font-semibold`}>
            The number was never the scary part.
          </h2>
          <p className="mt-3 text-base text-secondary">
            Handing it to a stranger is. Every reel on every website looks good — that&apos;s what
            a reel is for. What you can&apos;t tell from one is whether the person behind it will
            turn up on the day, light it properly, get usable audio, and come back with the video
            they promised. Get that wrong once and you&apos;ve spent {fmt(scope.total)} finding out.
          </p>
          <p className="mt-3 text-base text-secondary">
            That&apos;s the part we do. Tell us about the shoot and a producer — an actual
            producer, not a sales rep — will call you, walk this estimate through line by line,
            and put crew in front of you who have shot this exact thing before
            {answers.shootLocation.trim() ? ` in ${answers.shootLocation.trim()}` : ""}. Free, and
            you&apos;re not committing to anything by asking.
          </p>

          {/* Secondary path, deliberately quieter and further down. Someone who
              already knows what they want shouldn't have to wait for a call. */}
          <div className="mt-6 border-t border-line pt-5">
            <p className="text-sm font-medium">Rather just get on with it?</p>
            <p className="mt-1 mb-3 text-sm text-muted">
              Create an account and post this as a job. Crew apply to you, and it&apos;s free to
              post.
            </p>
            <form action={startSignupFromScope}>
              <SubmitButton variant="secondary" pendingLabel="Taking you there…">
                Create an account &amp; post this job
              </SubmitButton>
            </form>
          </div>

          <p className="mt-5 text-xs text-muted">
            We only know what you typed on this page. We didn&apos;t look up where you are, and we
            won&apos;t email you unless you ask us to above.{" "}
            <Link href="/how-we-operate" className="underline">
              How we operate
            </Link>
            .
          </p>
        </div>

        <ProducerCallForm />
      </div>
    </section>
  );
}

/* ====================== TOOL ====================== */

export function PublicScope({ intro }: { intro?: ReactNode }) {
  // Lazy initialiser: one queue per mount, and a stable identity for the life
  // of the component.
  const [onProgress] = useState(createCapture);

  return (
    <ScopeTool
      intro={intro}
      onProgress={onProgress}
      result={(progress) => <ResultPanel progress={progress} />}
    />
  );
}
