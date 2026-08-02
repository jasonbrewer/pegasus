"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus } from "@/types/database";

const STATUSES: AccountStatus[] = ["pending", "approved", "blocked"];

/** Same-origin relative paths only, so return_to can't become an open redirect. */
function safeReturnTo(value: FormDataEntryValue | null): string {
  const path = (value as string | null) ?? "";
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  return "/admin";
}

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

/**
 * Approve / reject / block / unblock, all of which are one thing: setting an
 * account's status.
 *
 * There is no `.from("profiles").update(...)` here and there cannot be — the
 * client has no UPDATE grant on that column. Everything goes through
 * admin_set_account_status(), which checks the admin flag itself. If this
 * action were called by a non-admin, or by an admin aiming at their own
 * account, the database refuses it; the checks below only decide what error
 * the page shows.
 */
export async function setAccountStatus(formData: FormData) {
  const profileId = formData.get("profile_id") as string;
  const status = formData.get("status") as AccountStatus;
  const returnTo = safeReturnTo(formData.get("return_to"));

  if (!profileId || !STATUSES.includes(status)) {
    redirect(withParam(returnTo, "error", "Pick a valid status"));
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_set_account_status", {
    p_profile_id: profileId,
    p_status: status,
  });

  if (error) {
    redirect(withParam(returnTo, "error", error.message));
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/accounts/${profileId}`);
  redirect(withParam(returnTo, "updated", status));
}
