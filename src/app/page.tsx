import Link from "next/link";

/**
 * The one page a signed-out visitor sees.
 *
 * It has to answer "what is this?" before anything else — it is a jobs board,
 * and the point is to find work and to hire. The differentiators below are the
 * actual pitch, so they sit above the two doors rather than in a footer.
 *
 * Two doors, on purpose, because the two sides join on different terms:
 * employers sign up and post, freelancers apply and wait for a person to read
 * it. The copy says so plainly — the pending state after signup should be the
 * thing they were told about, not a surprise.
 */

/** The differentiators. Lead is the claim; the line under it is the proof. */
const SELLING_POINTS: { claim: string; detail: string; wide?: boolean }[] = [
  {
    claim: "Free to post. Free to apply.",
    detail: "No paywall to reach people. Neither side pays to be seen or to answer.",
  },
  {
    claim: "Know who you're applying to.",
    detail:
      "Every job shows the real company or network hiring — no blind submissions into a black hole.",
  },
  {
    claim: "Your details aren't for sale — or public.",
    detail:
      "No scraping, no cold outreach from strangers. Your contact info reaches an employer only when you apply to their job.",
  },
  {
    claim: "No pay-to-win rankings.",
    detail: "Matched by fit and location, not by who paid the most.",
  },
  {
    claim: "Paste your credits your way.",
    detail:
      "No rigid forms, no reformatting your résumé — paste it from a document and the formatting comes with it.",
    wide: true,
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-16 sm:py-20">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          A curated jobs board for video &amp; production
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Find the work. Or find the crew.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-secondary">
          Production Circles is a jobs board for freelance video and production people and
          the companies, agencies and producers who hire them. Both sides are vetted — every
          member is reviewed by a person before they appear — so the listings are real and so
          are the people behind them.
        </p>
      </div>

      {/* Above the doors on purpose: these are the reasons to walk through one. */}
      <section className="rounded-xl border border-line bg-surface-muted p-6 sm:p-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          What makes it different
        </h2>
        <ul className="mt-5 grid gap-6 sm:grid-cols-2">
          {SELLING_POINTS.map((point) => (
            <li key={point.claim} className={point.wide ? "sm:col-span-2" : undefined}>
              <p className="font-semibold">{point.claim}</p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">{point.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Employer door — open. Sign up, post, done. */}
        <div className="flex flex-col rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Hiring for a production?</h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Post a job and reach vetted crew, ranked by fit and by how close they actually
            are to your shoot. Sign up and post the same day — no waiting, and posting is
            free.
          </p>
          {/* Copy only — the guided flow itself is a later feature. Deliberately
              not a link, so it doesn't promise a page that isn't there yet. */}
          <p className="mt-3 flex-1 text-sm leading-relaxed text-secondary">
            Not sure what kind of production you need? A few quick questions will help — and
            it&apos;s always free, no waiting.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
            <Link
              href="/sign-up?role=employer"
              className="rounded-full bg-accent px-5 py-2.5 text-accent-ink hover:bg-accent-hover"
            >
              Post a job
            </Link>
            <Link
              href="/sign-up?role=employer"
              className="rounded-full border border-field px-5 py-2.5 hover:bg-surface-muted"
            >
              Sign up
            </Link>
          </div>
        </div>

        {/* Freelancer door — gated. "Apply", never "Join", because approval is
            a person reading it. */}
        <div className="flex flex-col rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">Crew, and want in?</h2>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-secondary">
            Browse real jobs from named companies and apply as often as you like — always
            free. Membership is reviewed: tell us what you do and show your work, and we read
            every application. You&apos;ll be able to build your profile straight away, and
            you become visible to employers once you&apos;re approved.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
            <Link
              href="/sign-up?role=freelancer"
              className="rounded-full bg-accent px-5 py-2.5 text-accent-ink hover:bg-accent-hover"
            >
              Apply to join
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">
            Invited by a member? Use their link — it puts you at the front of the queue,
            though it still gets read.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
        <span>
          Already a member?{" "}
          <Link href="/sign-in" className="text-content underline">
            Sign in
          </Link>
        </span>
        <span>Everything here is behind a login — there is no public directory.</span>
      </div>
    </main>
  );
}
