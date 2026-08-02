/**
 * Resolves the job-search distance filter from raw query-string values.
 *
 * Pulled out of the page so the branching is testable: the interesting cases
 * are all about telling three states apart, and an unchecked checkbox is not
 * submitted at all, so its absence cannot mean "unchecked" on its own.
 */
export const MIN_RADIUS_MILES = 1;
export const MAX_RADIUS_MILES = 3000;
export const FALLBACK_RADIUS_MILES = 50;

export interface RadiusSelection {
  /** What job_feed receives. null means no distance cap. */
  radiusMiles: number | null;
  /** Set when the typed value could not be used; results fall back to the default. */
  error?: string;
}

export function resolveSearchRadius({
  radiusRaw,
  anyDistanceRaw,
  defaultRadius,
}: {
  radiusRaw: string | undefined;
  anyDistanceRaw: string | undefined;
  defaultRadius: number;
}): RadiusSelection {
  const anyDistance = anyDistanceRaw === "on";

  // "Any distance" wins outright — the typed number is ignored, not merged.
  if (anyDistance) {
    return { radiusMiles: null };
  }

  // The radius input always submits, so its absence (with the box unticked)
  // means the form was never submitted: a first visit.
  if (radiusRaw === undefined) {
    return { radiusMiles: defaultRadius };
  }

  const typed = radiusRaw.trim();

  if (typed === "") {
    return {
      radiusMiles: defaultRadius,
      error: "Enter a distance in miles, or tick “Any distance”.",
    };
  }

  const parsed = Number(typed);

  if (!Number.isFinite(parsed) || parsed < MIN_RADIUS_MILES || parsed > MAX_RADIUS_MILES) {
    return {
      radiusMiles: defaultRadius,
      error: `Enter a distance between ${MIN_RADIUS_MILES} and ${MAX_RADIUS_MILES} miles, or tick “Any distance”.`,
    };
  }

  return { radiusMiles: parsed };
}
