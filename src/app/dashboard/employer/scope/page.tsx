import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, ButtonLink } from "@/components/ui";
import { ScopeTool } from "@/components/scope/scope-tool";

/**
 * "Scope a job" — an honest, tiered, line-item estimate for a buyer who has
 * never commissioned a video and has no idea what one costs.
 *
 * The guard is the same one the Post-a-Job page uses: src/proxy.ts bounces any
 * signed-out request off this path before it renders, and the getUser() check
 * below repeats it here rather than trusting the proxy alone — matching every
 * other page under /dashboard/employer.
 *
 * Post-a-Job's second gate, the `status !== "approved"` block, is deliberately
 * NOT repeated. That one exists because the jobs INSERT policy would refuse a
 * blocked employer's post, so the form is a dead end for them. Scoping writes
 * nothing and posts nothing, so there is no equivalent reason to close it.
 *
 * The tool itself is a client component and the rates are a build-time import,
 * so this page's only Supabase call is the auth guard above.
 *
 * The tool now lives in components/scope because /scope — the public, no-login
 * version — renders the same component. Same questions, same rate sheet, same
 * arithmetic on both routes, by construction. What that page adds (saving the
 * session, the producer-call CTA) it adds through props; none of it reaches
 * here, and this page passes none of them.
 */
export default async function ScopeJobPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    // Wider than PageShell's max-w-2xl on purpose: the tool is a two-column
    // layout, questions beside a sticky estimate. Padding matches PageShell.
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
      <PageHeader
        title="Scope a job"
        subtitle="Answer a few plain questions — no production jargon. You'll get an honest estimate, and you'll see where the real costs hide, so you walk into any quote already knowing the shape of the job."
        action={<ButtonLink href="/dashboard/employer">Back</ButtonLink>}
      />

      <ScopeTool />
    </main>
  );
}
