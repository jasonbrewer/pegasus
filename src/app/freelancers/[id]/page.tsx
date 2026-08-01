import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import {
  PageShell,
  PageHeader,
  Badge,
  Card,
  DetailRow,
  ButtonLink,
} from "@/components/ui";

function formatRate(cents: number | null) {
  if (cents == null) return null;
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}/day`;
}

export default async function FreelancerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // freelancer_profiles is publicly readable, so this works signed out too.
  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select("profile_id, bio, day_rate_cents, home_zip, travel_radius_miles, reel_url, portfolio_url")
    .eq("profile_id", id)
    .maybeSingle();

  if (!freelancer) {
    notFound();
  }

  // profiles is readable by authenticated users only, so a signed-out viewer
  // gets no name. Render what we can rather than 404ing.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();

  // home_zip stays server-side: only the resolved city/state is rendered.
  const { data: place } = await supabase
    .from("zip_codes")
    .select("city, state")
    .eq("zip", freelancer.home_zip)
    .maybeSingle();

  const { data: roleRows } = await supabase
    .from("freelancer_roles")
    .select("role_slug")
    .eq("freelancer_id", id);

  const roles = (roleRows ?? [])
    .map((r) => ROLE_BY_SLUG.get(r.role_slug))
    .filter((r) => r !== undefined);

  const isOwner = user?.id === id;
  const location = place ? [place.city, place.state].filter(Boolean).join(", ") : null;

  return (
    <PageShell>
      <PageHeader
        title={profile?.full_name ?? "Freelancer"}
        subtitle={location}
        action={isOwner ? <ButtonLink href="/dashboard/freelancer/profile">Edit profile</ButtonLink> : undefined}
      />

      {!profile && (
        <p className="mb-5 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to see this freelancer&apos;s full details.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {roles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <Badge key={role.slug}>{role.label}</Badge>
            ))}
          </div>
        )}

        {freelancer.bio && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
            {freelancer.bio}
          </p>
        )}

        <Card>
          <dl>
            <DetailRow label="Based in" value={location} />
            <DetailRow label="Day rate" value={formatRate(freelancer.day_rate_cents)} />
            <DetailRow
              label="Travels up to"
              value={`${freelancer.travel_radius_miles} miles`}
            />
            <DetailRow
              label="Reel"
              value={
                freelancer.reel_url ? (
                  <a
                    href={freelancer.reel_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    View reel
                  </a>
                ) : null
              }
            />
            <DetailRow
              label="Portfolio"
              value={
                freelancer.portfolio_url ? (
                  <a
                    href={freelancer.portfolio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    View portfolio
                  </a>
                ) : null
              }
            />
          </dl>
        </Card>
      </div>
    </PageShell>
  );
}
