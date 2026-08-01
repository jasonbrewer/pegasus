import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { ROLES_BY_GROUP, ROLE_BY_SLUG, ROLES } from "@/lib/roles";
import { formatRate, formatDateRange, formatDistance } from "@/lib/format";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  Badge,
  Card,
  ButtonLink,
  inputClass,
} from "@/components/ui";

const RADIUS_PRESETS = [25, 50, 100];
const VALID_ROLE_SLUGS = new Set(ROLES.map((r) => r.slug));

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ zip?: string; role?: string; radius?: string }>;
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

  const { data: freelancer } = await supabase
    .from("freelancer_profiles")
    .select("home_zip, travel_radius_miles")
    .eq("profile_id", user.id)
    .maybeSingle();

  // Their own ZIP is the default origin, but any US ZIP can be browsed from.
  const zipInput = params.zip?.trim() || freelancer?.home_zip || "";
  const centroid = zipInput ? await lookupZip(supabase, zipInput) : null;
  const zipError = zipInput && !centroid ? INVALID_ZIP_MESSAGE : undefined;

  const roleFilter = params.role && VALID_ROLE_SLUGS.has(params.role) ? params.role : null;

  const defaultRadius = freelancer?.travel_radius_miles ?? 50;
  const radiusOptions = RADIUS_PRESETS.includes(defaultRadius)
    ? RADIUS_PRESETS
    : [...RADIUS_PRESETS, defaultRadius].sort((a, b) => a - b);

  // "any" means no cap, which job_feed expresses as a null radius — distinct
  // from "not supplied", which falls back to the freelancer's own radius.
  const radiusParam = params.radius ?? String(defaultRadius);
  let radiusMiles: number | null;
  if (radiusParam === "any") {
    radiusMiles = null;
  } else {
    const parsed = Number(radiusParam);
    radiusMiles = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRadius;
  }

  const { data: jobs, error: feedError } = centroid
    ? await supabase.rpc("job_feed", {
        p_lat: centroid.lat,
        p_lng: centroid.lng,
        p_radius_miles: radiusMiles,
        p_role_slug: roleFilter,
      })
    : { data: null, error: null };

  // job_feed returns employer_id and location_zip; resolve both for display.
  const employerIds = [...new Set((jobs ?? []).map((j) => j.employer_id))];
  const { data: employers } = employerIds.length
    ? await supabase
        .from("employer_profiles")
        .select("profile_id, company_name")
        .in("profile_id", employerIds)
    : { data: [] };
  const companyById = new Map((employers ?? []).map((e) => [e.profile_id, e.company_name]));

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
        action={<ButtonLink href="/dashboard/freelancer">Dashboard</ButtonLink>}
      />

      <ErrorBanner message={zipError ?? feedError?.message} />

      <form method="GET" className="mb-8 grid gap-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Browse from ZIP</span>
          <input
            name="zip"
            inputMode="numeric"
            placeholder="23220"
            defaultValue={zipInput}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Role</span>
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

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Within</span>
          <select name="radius" defaultValue={radiusParam} className={inputClass}>
            {radiusOptions.map((miles) => (
              <option key={miles} value={miles}>
                {miles} miles
              </option>
            ))}
            <option value="any">Any distance</option>
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 sm:w-auto"
          >
            Search
          </button>
        </div>
      </form>

      {!centroid ? (
        <p className="text-sm text-gray-500">
          Enter a US ZIP code above to see jobs ranked by how close they are to you.
        </p>
      ) : !jobs || jobs.length === 0 ? (
        <p className="text-sm text-gray-500">
          No open jobs match this search. Try widening the radius or clearing the role filter —
          remote roles always show regardless of distance.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          </p>

          {/* job_feed already orders these: nearest first, remote last. Do not re-sort. */}
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => {
              const role = ROLE_BY_SLUG.get(job.role_slug);
              const isRemote = job.role_category === "remote";
              const company = companyById.get(job.employer_id);
              const place = placeByZip.get(job.location_zip);
              const rate = formatRate(job.rate_cents, job.rate_type);
              const dates = formatDateRange(job.start_date, job.end_date);
              const distance = formatDistance(job.distance_miles);

              return (
                <li key={job.id}>
                  <Card>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-medium">{job.title}</p>
                      <span className="text-sm text-gray-500">
                        {isRemote ? "Remote" : distance}
                      </span>
                    </div>

                    <p className="mt-0.5 text-sm text-gray-600">
                      {company ? (
                        <Link href={`/employers/${job.employer_id}`} className="hover:underline">
                          {company}
                        </Link>
                      ) : (
                        "Employer"
                      )}
                      {!isRemote && place && <span className="text-gray-400"> · {place}</span>}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {role && <Badge>{role.label}</Badge>}
                      {job.travel_expected && <Badge>Travel expected</Badge>}
                    </div>

                    {(rate || dates) && (
                      <p className="mt-2 text-sm text-gray-500">
                        {[rate, dates].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-700">
                      {job.description}
                    </p>
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
