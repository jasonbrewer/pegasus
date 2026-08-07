"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  autoRules,
  buildScope,
  fmt,
  CHECKLIST,
  COUNT_OPTS,
  DEFAULTS,
  LEN_OPTS,
  MAKING,
  POLISH,
  QUESTIONS,
  TRI_OPTS,
  type Answers,
  type Question,
  type Scope,
  type Variant,
} from "@/lib/scoping/engine";
import { BASELINE } from "@/lib/scoping/baseline";
import styles from "./scope.module.css";

/**
 * "Scope a job" — the employer-facing scoper.
 *
 * A client component start to finish: every answer is local state, nothing is
 * fetched, and nothing is saved (spec §9 — v1 is stateless). The rate sheet is
 * imported from the config file at build time, so this component never talks
 * to Supabase.
 *
 * The intake is stepped into five groups rather than one long page, and the
 * estimate is live the whole way through — the number moving in response to an
 * answer is the teaching mechanism, so it is never hidden until the end. On
 * desktop it sits beside the questions; on mobile a compact running total
 * follows you down and opens into the full sheet on the last step.
 *
 * The prototype's second tab — the baseline rate editor — is deliberately not
 * here and must not be added. Employers never see or edit the house rates
 * (spec §5); JB edits src/lib/scoping/baseline.ts and redeploys.
 *
 * TODO(spec §7): pre-filling the Post-a-Job form from a finished scope
 * (suggested title, budget range, description hints) is the upgrade that turns
 * this from a calculator into the on-ramp to posting. Separate task.
 */

const VARIANTS: Variant[] = ["lean", "recommended", "premium"];

type Pick = (key: keyof Answers, value: string) => void;

/* ========================= CONTROLS ========================= */

/* Money input with a real prefix that can't collide with the digits. */
function MoneyInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <div className={styles.money}>
      <span className={styles.pfx} aria-hidden="true">
        $
      </span>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      />
    </div>
  );
}

function MakingPicker({ value, onPick }: { value: string; onPick: Pick }) {
  return (
    <fieldset className="mb-7">
      <legend className={`${styles.eyebrow} mb-2`}>What are you making?</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What are you making">
        {MAKING.map((m) => (
          <button
            key={m.label}
            type="button"
            role="radio"
            aria-checked={value === m.label}
            className={styles.opt}
            data-on={value === m.label}
            onClick={() => onPick("making", m.label)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className={`mt-2 text-sm ${styles.muted}`}>
        Pick the closest — most of these film about the same way, so the price won&apos;t swing
        much.
      </p>
    </fieldset>
  );
}

function OptionGroup({ q, value, onPick }: { q: Question; value: string; onPick: Pick }) {
  return (
    <fieldset className="mb-7">
      <legend className={`${styles.eyebrow} mb-2`}>{q.label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.label}>
        {q.opts.map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            className={styles.opt}
            data-on={value === v}
            onClick={() => onPick(q.key, v)}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Renders one of the v1 questions by key, so steps can compose them freely. */
function Ask({ k, answers, onPick }: { k: keyof Answers; answers: Answers; onPick: Pick }) {
  const q = QUESTIONS.find((x) => x.key === k);
  if (!q) return null;
  return <OptionGroup q={q} value={answers[k]} onPick={onPick} />;
}

function PolishPicker({ value, onPick }: { value: string; onPick: Pick }) {
  return (
    <fieldset className="mb-7">
      <legend className={`${styles.eyebrow} mb-2`}>How finished should it feel?</legend>
      <p className={`mb-2 text-sm ${styles.muted}`}>
        Roughly: further down means more editing polish, and more cost. Pick the feel you&apos;re
        after.
      </p>
      <div
        className="grid gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="How finished should it feel"
      >
        {POLISH.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={value === p.key}
            className={styles.optbig}
            data-on={value === p.key}
            onClick={() => onPick("polish", p.key)}
          >
            <span className="mb-1 block text-sm font-semibold">{p.title}</span>
            <span className={`block text-xs ${styles.muted}`} style={{ lineHeight: 1.4 }}>
              {p.note}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Deliverables({ answers, onPick }: { answers: Answers; onPick: Pick }) {
  return (
    <fieldset className="mb-7">
      <legend className={`${styles.eyebrow} mb-2`}>What are you getting out of it?</legend>
      <p className={`mb-3 text-sm ${styles.muted}`}>
        One shoot can make many videos. Editing is billed by total finished length, plus a little
        per extra cut.
      </p>
      <div className="mb-4">
        <span className="mb-1 block text-sm font-semibold">How many videos?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How many videos">
          {COUNT_OPTS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={answers.count === v}
              className={styles.opt}
              data-on={answers.count === v}
              onClick={() => onPick("count", v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-sm font-semibold">How long is each?</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How long is each">
          {LEN_OPTS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={answers.each === v}
              className={styles.opt}
              data-on={answers.each === v}
              onClick={() => onPick("each", v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/**
 * The judgment calls — things a buyer may not know they need.
 *
 * "I don't know" is a real button, and it is the honest answer for most people
 * on most of these. It leaves the line out (so the ballpark stays low rather
 * than padded) and hands the question to the assumptions list, where it is
 * flagged for a professional to answer.
 *
 * Where another answer has already forced a line on — event coverage needs a
 * second angle, a conversation needs a sound person — the item shows as
 * answered with its reason, rather than letting a "No" here quietly contradict
 * the estimate sitting next to it.
 */
function JudgmentCalls({ answers, onPick }: { answers: Answers; onPick: Pick }) {
  const auto = autoRules(answers);

  return (
    <fieldset className="mb-7">
      <legend className={`${styles.eyebrow} mb-2`}>Things you might not know you need</legend>
      <p className={`${styles.teach} mb-5`}>
        Not sure on these? Don&apos;t worry — pick &ldquo;I don&apos;t know&rdquo; and we&apos;ll
        leave it out for now. This is just a ballpark so you can plan a number.
      </p>

      <div className="flex flex-col gap-5">
        {CHECKLIST.map((item) => {
          // Aerial is the one call nothing else in the intake implies.
          const rule = item.key === "drone" ? undefined : auto[item.key];
          const forced = rule?.forced ?? false;
          const value = forced ? "yes" : answers[item.key];

          return (
            <div key={item.key}>
              <span className="block text-sm font-semibold">{item.label}</span>
              <p className={`mt-0.5 mb-2 text-xs ${styles.muted}`}>{item.help}</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={item.label}>
                {TRI_OPTS.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={value === v}
                    disabled={forced}
                    className={styles.opt}
                    data-on={value === v}
                    onClick={() => onPick(item.key, v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {forced && rule && (
                <p className={`${styles.teach} mt-2`}>
                  Already in your estimate — {rule.because}.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ========================= ESTIMATE ========================= */

/** The compact number that follows a phone user down the steps. */
function RunningTotal({ total }: { total: number }) {
  return (
    <div className={`${styles.card} flex items-baseline justify-between gap-3 px-4 py-3`}>
      <span className={styles.eyebrow}>Estimate so far</span>
      <span className={`${styles.mono} text-lg font-semibold`} aria-live="polite">
        ~{fmt(total)}
      </span>
    </div>
  );
}

function Estimate({
  scopes,
  active,
  onPickVariant,
  budget,
  answers,
}: {
  scopes: Record<Variant, Scope>;
  active: Variant;
  onPickVariant: (v: Variant) => void;
  budget: string;
  answers: Answers;
}) {
  const [copied, setCopied] = useState(false);

  const b = budget === "" ? null : Number(budget);
  const has = b !== null && !Number.isNaN(b);
  const underFloor = has && scopes.lean.total > b;

  const scope = scopes[active];
  const next: Variant | undefined = VARIANTS[VARIANTS.indexOf(active) + 1];

  const quickEligible =
    answers.filming === "couple" &&
    answers.hire === "local" &&
    answers.distance === "near" &&
    ["one", "broll"].includes(answers.onCamera);

  const copyIt = async () => {
    const body = scope.lines.map((l) => `  ${l.simple} — ${fmt(l.amt)}`).join("\n");
    const assumes = scope.assumptions.map((s) => `  ${s}`).join("\n");
    const text = `SCOPE — ${answers.making} (${active})\n${body}\n  TOTAL — ${fmt(
      scope.total
    )}\n\n${assumes}\n\nIncludes rough, fine, and final cut. Later changes: ${fmt(
      BASELINE.changesHour.v
    )}/hr.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the scope is on screen either way.
    }
  };

  return (
    <div className={`${styles.card} p-5 md:p-6`}>
      <span className={`${styles.eyebrow} mb-3 block`}>Your estimate</span>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Scope level">
        {VARIANTS.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.chip}
            data-on={active === k}
            role="tab"
            aria-selected={active === k}
            onClick={() => onPickVariant(k)}
          >
            {k} · {fmt(scopes[k].total)}
          </button>
        ))}
      </div>

      {has && !underFloor && (
        <p className="mb-4 text-base">
          <span className={`${styles.underline} ${styles.serif}`} style={{ fontWeight: 600 }}>
            {fmt(b)} gets you the {active} version.
          </span>
        </p>
      )}

      {underFloor && (
        <div className={`${styles.warn} mb-4`}>
          <p className={`mb-1 text-sm font-semibold ${styles.warnTitle}`}>
            That budget is short for what you&apos;re describing.
          </p>
          <p className="mb-2 text-sm">
            The leanest honest version is{" "}
            <span className={`${styles.mono} font-semibold`}>{fmt(scopes.lean.total)}</span> — and
            nothing in it is padding.
          </p>
          {quickEligible && (
            <p className="text-sm">
              If you just need footage: a quick local hour, handed off raw, no editing —
              <span className={`${styles.mono} font-semibold`}> {fmt(BASELINE.quickHour.v)}</span>.
            </p>
          )}
        </div>
      )}

      <div className="mb-3">
        {scope.lines.map((l) => (
          <div key={l.key} className={styles.line}>
            <span className="text-sm">{l.simple}</span>
            <span className={styles.dots} />
            <span className={`${styles.mono} text-sm font-semibold`}>{fmt(l.amt)}</span>
          </div>
        ))}
      </div>

      <div className={`${styles.totalRow} flex items-baseline gap-3 pt-2`}>
        <span className={styles.eyebrow}>Estimate</span>
        <span className={styles.dots} />
        <span className={`${styles.mono} ${styles.serif} text-2xl font-semibold`}>
          {fmt(scope.total)}
        </span>
      </div>

      {next && (
        <p className={`mt-3 text-sm ${styles.muted}`}>
          +{fmt(scopes[next].total - scope.total)} → <b className="text-content">{next}</b>
          {next === "premium"
            ? ": fully produced — full polish, graphics, a second angle."
            : ": the full scope as described."}
        </p>
      )}

      {scope.dropped.length > 0 && (
        <p className={`mt-2 text-sm ${styles.muted}`}>
          Trimmed to fit lean:{" "}
          {scope.dropped.map(([label, amt]) => `${label} (−${fmt(amt)})`).join(", ")}.
        </p>
      )}

      {/* The receipt for this number: what it left out, and why. */}
      {scope.assumptions.length > 0 && (
        <div className={`${styles.assumes} mt-4`}>
          <p className={`${styles.eyebrow} mb-2`}>This quote assumes…</p>
          <ul className="flex flex-col gap-1">
            {scope.assumptions.map((s) => (
              <li key={s} className="text-sm">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {scope.notes.length > 0 && (
        <div className="mt-4 space-y-2">
          {scope.notes.map((n, i) => (
            <p key={i} className={styles.teach}>
              {n}
            </p>
          ))}
        </div>
      )}

      {/* Stands on every quote, whatever the answers — sound is the line a
          buyer is most likely to get wrong on their own. */}
      <p className={`${styles.teach} mt-4`}>
        Sound is genuinely hard to predict — too many variables to pin down here. Ask your
        production professional whether this shoot needs a dedicated audio person
        {scope.audioRequired ? " (we've included one as a starting point)" : ""}.
      </p>

      <p className={`mt-4 text-sm ${styles.muted}`}>
        Includes rough, fine, and final cut. Changes after that run {fmt(BASELINE.changesHour.v)}
        /hr — so you always know the price of a finished video before anyone opens an editor.
      </p>

      <div className="mt-4 flex gap-2">
        <button type="button" className={styles.chip} onClick={copyIt}>
          {copied ? "Copied ✓" : "Copy this scope"}
        </button>
      </div>
      <p className={`mt-3 text-sm ${styles.muted}`}>
        An honest ballpark from typical regional rates. A specific pro may quote their own number —
        this gets you in the room already knowing the shape of the job.
      </p>
    </div>
  );
}

/* ========================== TOOL ========================== */

export function ScopeTool() {
  const [answers, setAnswers] = useState<Answers>(DEFAULTS);
  const [budget, setBudget] = useState("");
  const [step, setStep] = useState(0);
  // Lifted so the desktop card and the mobile sheet can never disagree.
  const [pick, setPick] = useState<Variant | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const scopes = useMemo(
    () => ({
      lean: buildScope(answers, BASELINE, "lean"),
      recommended: buildScope(answers, BASELINE, "recommended"),
      premium: buildScope(answers, BASELINE, "premium"),
    }),
    [answers]
  );

  // Most video for the money: the dearest variant the budget still covers.
  const b = budget === "" ? null : Number(budget);
  let fitted: Variant | null = null;
  if (b !== null && !Number.isNaN(b)) {
    for (const k of [...VARIANTS].reverse()) {
      if (scopes[k].total <= b) {
        fitted = k;
        break;
      }
    }
  }
  const active: Variant = pick ?? fitted ?? "recommended";

  // Every value passed here comes from the option lists in engine.ts, so the
  // assertion only restates what the markup already guarantees.
  const onPick: Pick = (key, value) => setAnswers((a) => ({ ...a, [key]: value }) as Answers);

  const steps: { title: string; body: ReactNode }[] = [
    {
      title: "The basics",
      body: (
        <>
          <MakingPicker value={answers.making} onPick={onPick} />
          <Ask k="onCamera" answers={answers} onPick={onPick} />
        </>
      ),
    },
    {
      title: "Where it lives",
      body: (
        <>
          <Ask k="destination" answers={answers} onPick={onPick} />
          <PolishPicker value={answers.polish} onPick={onPick} />
        </>
      ),
    },
    {
      title: "The footage",
      body: <Deliverables answers={answers} onPick={onPick} />,
    },
    {
      title: "The judgment calls",
      body: <JudgmentCalls answers={answers} onPick={onPick} />,
    },
    {
      title: "Logistics",
      body: (
        <>
          <Ask k="filming" answers={answers} onPick={onPick} />
          <Ask k="hire" answers={answers} onPick={onPick} />
          {/* Distance only matters once they're open to bringing someone in. */}
          {answers.hire === "import" && <Ask k="distance" answers={answers} onPick={onPick} />}

          <fieldset className="mb-2">
            <legend className={`${styles.eyebrow} mb-2`}>What&apos;s your budget? (optional)</legend>
            <div className="flex flex-wrap items-center gap-3">
              <MoneyInput
                value={budget}
                onChange={setBudget}
                ariaLabel="Budget in dollars"
                placeholder="e.g. 3500"
              />
              {budget !== "" && (
                <button type="button" className={styles.chip} onClick={() => setBudget("")}>
                  Clear
                </button>
              )}
            </div>
            <p className={`mt-2 text-sm ${styles.muted}`}>
              Tell us what you have and we&apos;ll fit the most video to it. Or leave it blank and
              compare levels.
            </p>
          </fieldset>
        </>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const current = steps[step];

  const go = (to: number) => {
    setStep(to);
    // Send focus to the new step's heading rather than leaving it on a button
    // that just moved out from under the cursor.
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const estimate = (
    <Estimate
      scopes={scopes}
      active={active}
      onPickVariant={setPick}
      budget={budget}
      answers={answers}
    />
  );

  return (
    <div className={styles.root}>
      {/* Phone: the number rides along at the top of the screen, then opens
          into the full sheet on the last step. It is never hidden until the
          end — watching it move is how the tool teaches. */}
      {!isLast && (
        <div className="sticky top-0 z-10 mb-4 lg:hidden">
          <RunningTotal total={scopes[active].total} />
        </div>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <div>
          <div className="mb-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className={styles.eyebrow}>
                Question group {step + 1} of {steps.length}
              </span>
              <span className={`${styles.eyebrow} ${styles.mono}`}>
                {Math.round(((step + 1) / steps.length) * 100)}%
              </span>
            </div>
            <div
              className={styles.progress}
              role="progressbar"
              aria-valuenow={step + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-label="Progress through the questions"
            >
              <div
                className={styles.progressFill}
                style={{ width: `${((step + 1) / steps.length) * 100}%` }}
              />
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className={`${styles.serif} mt-3 text-xl font-semibold outline-none`}
            >
              {current.title}
            </h2>
          </div>

          {current.body}

          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button type="button" className={styles.navBack} onClick={() => go(step - 1)}>
                Back
              </button>
            )}
            {!isLast && (
              <button type="button" className={styles.navNext} onClick={() => go(step + 1)}>
                Next
              </button>
            )}
          </div>

          {/* Phone: the full sheet, once they've answered everything. */}
          {isLast && <div className="mt-8 lg:hidden">{estimate}</div>}
        </div>

        <div className="hidden lg:sticky lg:top-6 lg:block">{estimate}</div>
      </div>
    </div>
  );
}
