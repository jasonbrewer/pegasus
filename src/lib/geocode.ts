import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const INVALID_ZIP_MESSAGE = "Enter a valid US ZIP code";

export interface ZipCentroid {
  zip: string;
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
}

/** Reduces user input ("23220-1234", " 23220 ") to a bare 5-digit ZIP. */
export function normalizeZip(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : null;
}

/**
 * Resolves a ZIP to its centroid. Returns null when the input isn't a 5-digit
 * ZIP or isn't a known US ZIP — callers should surface INVALID_ZIP_MESSAGE
 * rather than storing a placeholder coordinate.
 *
 * The database enforces this too (see the resolve_*_zip triggers), so this is
 * for giving the user a clean error before the write is attempted.
 */
export async function lookupZip(
  supabase: SupabaseClient<Database>,
  input: string | null | undefined
): Promise<ZipCentroid | null> {
  const zip = normalizeZip(input);
  if (!zip) return null;

  const { data, error } = await supabase
    .from("zip_codes")
    .select("zip, lat, lng, city, state")
    .eq("zip", zip)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
