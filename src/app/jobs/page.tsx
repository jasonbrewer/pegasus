import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { ROLES_BY_GROUP, ROLE_BY_SLUG, ROLES } from "@/lib/roles";
import { formatRate, formatDateRange, formatDistance } from "@/lib/format";
import {
  resolveSearchRadius,
  MIN_RADIUS_MILES,
  MAX_RADIUS_MILES,
  FALLBACK_RADIUS_MILES,
} from "@/lib/search-radius";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  Badge,
  Card,
  inputClass,
} from "@/components/ui";

const VALID_ROLE_SLUGS = new Set(ROLES.map((r) => r.slug));

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    zip?: string;
    role?: string;
    radius?: string;
    any_distance?: string;
    applied?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Members-only. The proxy redirects first; this is defense in depth.
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent("/jobs")}`);
  }

  const [{ data: freelancer }, { data: viewer }] = await Promise.all([
    supabase
      .from("freelancer_profiles")
      .select("home_zip, travel_radius_miles")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const isFreelancer = viewer?.role === "freelancer";

  // Their own ZIP is the default origin, but any US ZIP can be browsed from.
  const zipInput = params.zip?.trim() || freelancer?.home_zip || "";
  const centroid = zipInput ? await lookupZip(supabase, zipInput) : null;
  const zipError = zipInput && !centroid ? INVALID_ZIP_MESSAGE : undefined;

  const roleFilter = params.role && VALID_ROLE_SLUGS.has(params.role) ? params.role : null;

  // Default to the distance the freelancer already said they will travel.
  const defaultRadius = freelancer?.travel_radius_miles ?? FALLBACK_RADIUS_MILES;

  // 6.1 — typed distance with an explicit "Any distance" escape hatch.
  // The branching lives in src/lib/search-radius.ts so it can be tested.
  const anyDistance = params.any_distance === "on";
  const radiusRaw = params.radius;
  const { radiusMiles, error: radiusError } = resolveSearchRadius({
    radiusRaw,
    anyDistanceRaw: params.any_distance,
    defaultRadius,
  });

  const { data: jobs, error: feedError } = centroid
    ? await supabase.rpc("job_feed", {
        p_lat: centroid.lat,
        p_lng: centroid.lng,
        p_radius_miles: radiusMiles,
        p_role_slug: roleFilter,
      })
    : { data: null, error: null };

  // Which of these jobs the viewer has already applied to. RLS scopes
  // applications to the caller's own rows, so this can't leak other people's.
  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: myApplications } = jobIds.length
    ? await supabase
        .from("applications")
        .select("job_id")
        .eq("freelancer_id", user.id)
        .in("job_id", jobIds)
    : { data: [] };
  const appliedJobIds = new Set((myApplications ?? []).map((a) => a.job_id));

  const zips = [...new Set((jobs ?? []).map((j) => j.location_zip))];
  const { data: places } = zips.length
    ? await supabase.from("zip_codes").select("zip, city, state").in("zip", zips)
    : { data: [] };
  const placeByZip = new Map(
    (places ?? []).map((p) => [p.zip, [p.city, p.state].filter(Boolean).join(", ")])
  );

  const originLabel = centroid
    ? [centroid.city, centroid.state].filter(Boolean).join(", ")
    : null;

  return (
    <PageShell>
      <PageHeader
        title="Browse jobs"
        subtitle={originLabel ? `Ranked by distance from ${originLabel}` : "Enter a ZIP to start"}
      />

      <ErrorBanner message={zipError ?? radiusError ?? params.error ?? feedError?.message} />
      {params.applied && <SuccessBanner message="Application sent." />}

      <form method="GET" className="mb-8 grid gap-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">Browse from ZIP</span>
          <input
            name="zip"
            inputMode="numeric"
            defaultValue={zipInput}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-secondary">Role</span>
          <select name="role" defaultValue={roleFilter ?? ""} className={inputClass}>
            <option value="">All roles</option>
            {ROLES_BY_GROUP.map(({ group, roles }) => (
              <optgroup key={group} label={group}>
                {roles.map((role) => (
                  <option key={role.slug} value={role.slug}>
                    {role.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-secondary">Within (miles)</span>
            <input
              name="radius"
              type="number"
              inputMode="numeric"
              min={MIN_RADIUS_MILES}
              max={MAX_RADIUS_MILES}
              step={1}
              defaultValue={radiusRaw ?? String(defaultRadius)}
              aria-describedby="any-distance"
              className={inputClass}
            />
          </label>
          <label id="any-distance" className="flex items-center gap-1.5 text-xs text-secondary">
            <input type="checkbox" name="any_distance" defaultChecked={anyDistance} />
            Any distance
          </label>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover sm:w-auto"
          >
            Search
          </button>
        </div>
        <p className="text-xs text-muted sm:col-span-4">
          Ticking &ldquo;Any distance&rdquo; ignores the mileage box. Remote roles always show,
          however far away they are.
        </p>
      </form>

      {!centroid ? (
        <p className="text-sm text-muted">
          Enter a US ZIP code above to see jobs ranked by how close they are to you.
        </p>
      ) : !jobs || jobs.length === 0 ? (
        <p className="text-sm text-muted">
          No open jobs match this search. Try widening the radius or clearing the role filter —
          remote roles always show regardless of distance.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
            {radiusMiles === null ? " · any distance" : ` · within ${radiusMiles} miles`}
          </p>

          {/* job_feed already orders these: nearest first, remote last. Do not re-sort. */}
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => {
              const role = ROLE_BY_SLUG.get(job.role_slug);
              const isRemote = job.role_category === "remote";
              const place = placeByZip.get(job.location_zip);
              const rate = formatRate(job.rate_cents, job.rate_type);
              const dates = formatDateRange(job.start_date, job.end_date);
              const distance = formatDistance(job.distance_miles);

              return (
                <li key={job.id}>
                  <Card>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                        {/* job_feed returns a null title when the poster hid
                            it — the rule lives in the job_titles policy. */}
                        {job.title ?? "Title hidden by the poster"}
                      </Link>
                      <span className="text-sm text-muted">
                        {isRemote ? "Remote" : distance}
                      </span>
                    </div>

                    <p className="mt-0.5 text-sm text-secondary">
                      <Link href={`/employers/${job.employer_id}`} className="hover:underline">
                        {job.company_network}
                      </Link>
                      {!isRemote && place && <span className="text-muted"> · {place}</span>}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {role && <Badge>{role.label}</Badge>}
                      {job.travel_expected && <Badge>Travel expected</Badge>}
                    </div>

                    {(rate || dates) && (
                      <p className="mt-2 text-sm text-muted">
                        {[rate, dates].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-secondary">
                      {job.description}
                    </p>

                    {/* Applying always goes through the job page: an
                        application must carry a message, so there is no
                        one-click apply from the feed. */}
                    <div className="mt-3 flex items-center gap-3">
                      {appliedJobIds.has(job.id) ? (
                        <>
                          <span className="text-sm font-medium text-success-ink">Applied</span>
                          <Link
                            href={`/jobs/${job.id}`}
                            className="text-sm text-muted underline"
                          >
                            View details
                          </Link>
                        </>
                      ) : isFreelancer ? (
                        <Link
                          href={`/jobs/${job.id}`}
                          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover"
                        >
                          Apply
                        </Link>
                      ) : (
                        <Link href={`/jobs/${job.id}`} className="text-sm text-muted underline">
                          View details
                        </Link>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PageShell>
  );
}
