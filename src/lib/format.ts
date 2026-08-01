import type { RateType } from "@/types/database";

export function formatRate(cents: number | null, type: RateType = "day") {
  if (cents == null) return null;
  const amount = `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (type === "day") return `${amount}/day`;
  if (type === "hourly") return `${amount}/hr`;
  return `${amount} flat`;
}

/**
 * Formats a "YYYY-MM-DD" date column. Parsed from parts rather than
 * `new Date(str)` so a UTC-midnight timestamp can't shift the day backwards
 * for viewers in negative offsets (which is all of the US).
 */
function formatDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (start && end && start !== end) return `${formatDate(start)} – ${formatDate(end)}`;
  const single = start ?? end;
  return single ? formatDate(single) : null;
}

/** Remote roles come back with a null distance and are labelled, not measured. */
export function formatDistance(miles: number | null) {
  if (miles == null) return null;
  if (miles < 1) return "< 1 mi";
  return `${Math.round(miles)} mi`;
}
