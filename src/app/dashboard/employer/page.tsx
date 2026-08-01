import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { PageShell, PageHeader, Card, ButtonLink, DetailRow } from "@/components/ui";

export default async function EmployerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: employer } = await supabase
    .from("employer_profiles")
    .select("company_name, billing_email")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { count: jobCount } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("employer_id", user.id);

  return (
    <PageShell>
      <PageHeader
        title={employer?.company_name || "Employer dashboard"}
        subtitle={user.email}
        action={<ButtonLink href="/dashboard/employer/profile">Edit profile</ButtonLink>}
      />

      <Card>
        <dl>
          <DetailRow label="Hiring contact" value={profile?.full_name} />
          <DetailRow label="Contact email" value={employer?.billing_email ?? "Not set"} />
          <DetailRow label="Jobs posted" value={String(jobCount ?? 0)} />
        </dl>
      </Card>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/employer/jobs/new"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Post a job
        </Link>
        <ButtonLink href={`/employers/${user.id}`}>View public profile</ButtonLink>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <form action={signOut}>
          <button type="submit" className="text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        The proximity-ranked applicants view lands next.
      </p>
    </PageShell>
  );
}
