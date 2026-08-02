import { headers } from "next/headers";
import { buildInviteUrl } from "@/lib/invite";
import { InviteLink } from "./invite-link";

/**
 * Server half of the invite widget: works out the site origin and builds the
 * caller's personal link, so the URL is in the HTML rather than assembled in
 * the browser.
 *
 * Origin comes from NEXT_PUBLIC_SITE_URL when set, otherwise from the request
 * headers. Behind Vercel the forwarded headers are the accurate ones — host
 * alone would be the internal hostname.
 */
async function resolveOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";

  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function InviteSection({ userId }: { userId: string }) {
  const origin = await resolveOrigin();
  if (!origin) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <InviteLink url={buildInviteUrl(origin, userId)} />
    </div>
  );
}
