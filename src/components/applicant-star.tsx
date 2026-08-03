"use client";

import { useState } from "react";

/**
 * 5.1 — the triage star on an applicant card.
 *
 * Gmail-style: click cycles empty → yellow → green → blue → red → empty. What
 * each colour means is the employer's business; the app assigns none, which is
 * why the colours are their own token scale (--flag-*) rather than the status
 * tints. A red star must not imply "rejected".
 *
 * DELIBERATELY NOT PERSISTED. The state lives in this component and is gone on
 * reload — that is what Batch 5 asked for, with "filter by starred" and its
 * storage coming later. Nothing else reads it, so nothing can quietly start
 * depending on a value that does not survive a refresh.
 */

const CYCLE = [null, "yellow", "green", "blue", "red"] as const;

type Flag = (typeof CYCLE)[number];

const FLAG_CLASS: Record<NonNullable<Flag>, string> = {
  yellow: "text-flag-yellow",
  green: "text-flag-green",
  blue: "text-flag-blue",
  red: "text-flag-red",
};

export function ApplicantStar({ name }: { name: string }) {
  const [step, setStep] = useState(0);
  const flag = CYCLE[step];

  return (
    <button
      type="button"
      onClick={() => setStep((current) => (current + 1) % CYCLE.length)}
      // The label carries the state, since colour alone would leave a
      // screen-reader user with no way to tell the five steps apart.
      aria-label={
        flag
          ? `${name}: flagged ${flag}. Click to change the flag.`
          : `${name}: not flagged. Click to flag.`
      }
      title="Visual triage only — flags aren't saved yet"
      className={`-mr-1 -mt-1 shrink-0 rounded-md p-1 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-strong ${
        flag ? FLAG_CLASS[flag] : "text-muted"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        // Empty is an outline, a flag is filled — so the state survives being
        // printed, or being looked at by someone who can't separate the hues.
        fill={flag ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M12 2.6l2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.42l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.95z" />
      </svg>
    </button>
  );
}
