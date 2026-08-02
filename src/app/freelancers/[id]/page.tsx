import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { signedAvatarUrl } from "@/lib/avatar";
import { parseVideoUrl } from "@/lib/video";
import {
  PageShell,
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

  // Members-only, same as every profile and job page. The proxy redirects
  // signed-out visitors before they get here; this is defense in depth.
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/freelancers/${id}`)}`);
  }

  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select(
      "profile_id, bio, credits_html, day_rate_cents, home_zip, travel_radius_miles, reel_url, portfolio_url"
    )
    .eq("profile_id", id)
    .maybeSingle();

  if (!freelancer) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_path")
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

  const { data: videoRows } = await supabase
    .from("freelancer_videos")
    .select("id, url")
    .eq("freelancer_id", id)
    .order("sort_order");

  const avatarUrl = await signedAvatarUrl(supabase, profile?.avatar_path);

  // The reel field and any extra video links render together.
  const videos = [
    ...(freelancer.reel_url ? [{ id: "reel", url: freelancer.reel_url }] : []),
    ...(videoRows ?? []),
  ].map((v) => ({ ...v, embed: parseVideoUrl(v.url) }));

  const roles = (roleRows ?? [])
    .map((r) => ROLE_BY_SLUG.get(r.role_slug))
    .filter((r) => r !== undefined);

  const isOwner = user?.id === id;
  const location = place ? [place.city, place.state].filter(Boolean).join(", ") : null;

  return (
    <PageShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg text-gray-400"
            >
              {(profile?.full_name ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile?.full_name ?? "Freelancer"}
            </h1>
            {location && <p className="mt-1 text-sm text-gray-500">{location}</p>}
          </div>
        </div>
        {isOwner && <ButtonLink href="/dashboard/freelancer/profile">Edit profile</ButtonLink>}
      </div>

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

        {freelancer.credits_html && (
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500">
              Credits
            </h2>
            {/* Sanitized server-side on write (src/lib/sanitize.ts) — never
                rendered straight from user input. */}
            <div
              className="text-sm leading-relaxed text-gray-700 [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: freelancer.credits_html }}
            />
          </section>
        )}

        {videos.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-gray-500">
              Reel &amp; video
            </h2>
            <div className="flex flex-col gap-4">
              {videos.map((video) =>
                video.embed ? (
                  <div
                    key={video.id}
                    className="aspect-video w-full overflow-hidden rounded-lg border border-gray-200"
                  >
                    <iframe
                      src={video.embed.embedUrl}
                      title={`${video.embed.provider} video`}
                      allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      className="h-full w-full"
                    />
                  </div>
                ) : (
                  <a
                    key={video.id}
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline"
                  >
                    {video.url}
                  </a>
                )
              )}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
