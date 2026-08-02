import Link from "next/link";

/**
 * The one page a signed-out visitor sees.
 *
 * Two doors, on purpose, because the two sides join on different terms:
 * employers sign up and post, freelancers apply and wait for a person to read
 * it. The copy says so plainly — the pending state after signup should be the
 * thing they were told about, not a surprise.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-12 px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Richmond, VA &amp; the Mid-Atlantic
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          A curated production community.
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-gray-600">
          Pegasus is a vetted network of freelance video and production people — and the
          companies, agencies and producers who hire them. Members are reviewed, not
          auto-listed, and everything here is behind a login. No public directory, no
          scraping your details, no cold outreach from strangers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Employer door — open. Sign up, post, done. */}
        <div className="flex flex-col rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold">Hiring for a production?</h2>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">
            Post a job and reach local crew ranked by how close they actually are to your
            shoot. Sign up and post the same day — no waiting.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
            <Link
              href="/sign-up?role=employer"
              className="rounded-full bg-black px-5 py-2.5 text-white hover:bg-gray-800"
            >
              Post a job
            </Link>
            <Link
              href="/sign-up?role=employer"
              className="rounded-full border border-gray-300 px-5 py-2.5 hover:bg-gray-50"
            >
              Sign up
            </Link>
          </div>
        </div>

        {/* Freelancer door — gated. "Apply", never "Join", because approval is
            a person reading it. */}
        <div className="flex flex-col rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold">Crew, and want in?</h2>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">
            Membership is free and always will be — but it is reviewed. Tell us what you
            do and show your work; we read every application. You&apos;ll be able to build
            your profile straight away, and you become visible to employers once
            you&apos;re approved.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
            <Link
              href="/sign-up?role=freelancer"
              className="rounded-full bg-black px-5 py-2.5 text-white hover:bg-gray-800"
            >
              Apply to join
            </Link>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Invited by a member? Use their link — it puts you at the front of the queue,
            though it still gets read.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500">
        <span>
          Already a member?{" "}
          <Link href="/sign-in" className="text-black underline">
            Sign in
          </Link>
        </span>
        <span className="text-gray-400">
          Local-first: crew are matched to work by real distance, not by a nationwide list.
        </span>
      </div>
    </main>
  );
}
