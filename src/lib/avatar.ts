import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * The avatars bucket is private, so a stored path has to be exchanged for a
 * short-lived signed URL before it can be rendered. Done per request on the
 * server; the URL expires, so it can't be passed around as a durable public
 * link to someone without a session.
 */
export async function signedAvatarUrl(
  supabase: SupabaseClient<Database>,
  path: string | null | undefined
): Promise<string | null> {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}

/** Signs many paths at once for list views, preserving null entries. */
export async function signedAvatarUrls(
  supabase: SupabaseClient<Database>,
  paths: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return new Map();

  const { data } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  const map = new Map<string, string>();
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}
