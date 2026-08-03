/**
 * 3.5 — one way to write a phone number.
 *
 * The rule everywhere: recognise a North American number and format it as
 * (000) 000-0000; leave anything else exactly as it was typed. That second
 * half is the important one. There are already numbers in the database that
 * are not ten digits — `232068204003` among them — and a formatter that threw,
 * truncated, or "corrected" those would turn a bad record into a lost one. It
 * is better to show an ugly number than the wrong number.
 *
 * Nothing here rejects input. Validation is a separate decision and this is
 * not the place to start making it.
 */

/** Digits only, so formatting survives however the user typed the separators. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formats for display. Returns the input untouched when it is not a number
 * this can confidently lay out — including empty, extensions, and
 * international numbers.
 */
export function formatPhone(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const d = digits(trimmed);

  // 11 digits starting with the North American country code is the same
  // number with a 1 in front.
  const local = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;

  if (local.length !== 10) return trimmed;

  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/**
 * Normalises on the way into the database, so what is stored is what is shown
 * and the two never drift. Same tolerance: an unrecognised number is stored as
 * typed rather than refused.
 */
export function normalizePhone(value: FormDataEntryValue | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return formatPhone(trimmed) ?? trimmed;
}

/**
 * A `tel:` target. Strips the formatting back out, because dialers want digits
 * — and keeps a leading + so an international number still dials.
 */
export function telHref(value: string): string {
  const plus = value.trim().startsWith("+") ? "+" : "";
  return `tel:${plus}${digits(value)}`;
}
