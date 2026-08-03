import { createClient } from "@/lib/supabase/server";
import type { AccountRole, AccountStatus } from "@/types/database";

/**
 * The signed-in account, as far as access control is concerned.
 *
 * This is a convenience for rendering — every rule it describes is already
 * enforced by RLS (migration 20260801000010). Nothing here is load-bearing:
 * skipping a check below hides a message, it does not open a door. That is the
 * whole point of putting the gating in the schema.
 */
export type Viewer = {
  id: string;
  fullName: string;
  role: AccountRole;
  status: AccountStatus;
  isAdmin: boolean;
};

export async function loadViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, status, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    role: data.role,
    status: data.status,
    isAdmin: data.is_admin,
  };
}

/** Approved accounts take part; pending and blocked ones do not. */
export function isParticipating(viewer: Pick<Viewer, "status"> | null): boolean {
  return viewer?.status === "approved";
}

export const STATUS_LABEL: Record<AccountStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  blocked: "Blocked",
};

/**
 * What to tell someone who cannot take part yet. Returns null for accounts in
 * good standing.
 */
export function participationNotice(
  viewer: Pick<Viewer, "role" | "status"> | null
): { title: string; body: string } | null {
  if (!viewer || viewer.status === "approved") return null;

  if (viewer.status === "blocked") {
    return {
      title: "Your account is blocked",
      body:
        viewer.role === "employer"
          ? "Your postings are hidden and you can't publish new ones. Get in touch if you think this is a mistake."
          : "Your profile is hidden from employers and you can't apply to jobs. Get in touch if you think this is a mistake.",
    };
  }

  return {
    title: "Your application is under review",
    body:
      "Production Circles is a curated community, so a person reads every application. " +
      "Fill out your profile in the meantime — a complete profile with credits and a reel gets reviewed faster. " +
      "You'll be able to apply to jobs once you're approved, and until then employers can't see you.",
  };
}
