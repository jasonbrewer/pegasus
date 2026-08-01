import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { PageShell, PageHeader, Card, ButtonLink, DetailRow } from "@/components/ui";

export default async function FreelancerDashboardPage() {
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

  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select("home_zip, travel_radius_miles, bio, day_rate_cents")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: place } = freelancer
    ? await supabase
        .from("zip_codes")
        .select("city, state")
        .eq("zip", freelancer.home_zip)
        .maybeSingle()
    : { data: null };

  const { data: roleRows } = await supabase
    .from("freelancer_roles")
    .select("role_slug")
    .eq("freelancer_id", user.id);

  const roleCount = roleRows?.length ?? 0;
  const needsSetup = roleCount === 0 || !freelancer?.bio;

  return (
    <PageShell>
      <PageHeader
        title={profile?.full_name ? `Hi, ${profile.full_name}` : "Freelancer dashboard"}
        subtitle={user.email}
        action={<ButtonLink href="/dashboard/freelancer/profile">Edit profile</ButtonLink>}
      />

      {needsSetup && (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your profile is incomplete — add your roles and a short bio so employers can find you.
        </p>
      )}

      <Card>
        <dl>
          <DetailRow
            label="Based in"
            value={place ? [place.city, place.state].filter(Boolean).join(", ") : null}
          />
          <DetailRow label="Travel radius" value={`${freelancer?.travel_radius_miles ?? 25} miles`} />
          <DetailRow label="Roles selected" value={roleCount > 0 ? String(roleCount) : "None yet"} />
          <DetailRow
            label="Day rate"
            value={
              freelancer?.day_rate_cents != null
                ? `$${(freelancer.day_rate_cents / 100).toLocaleString("en-US")}/day`
                : "Not set"
            }
          />
        </dl>
      </Card>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <ButtonLink href={`/freelancers/${user.id}`}>View public profile</ButtonLink>
        <form action={signOut}>
          <button type="submit" className="text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        The proximity-ranked job feed lands next.
      </p>
    </PageShell>
  );
}
