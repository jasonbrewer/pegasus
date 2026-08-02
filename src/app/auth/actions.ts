"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lookupZip, INVALID_ZIP_MESSAGE } from "@/lib/geocode";
import { parseInviteRef } from "@/lib/invite";
import type { AccountRole } from "@/types/database";

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as AccountRole;
  const fullName = formData.get("full_name") as string;

  const supabase = await createClient();

  let metadata: Record<string, string>;

  if (role === "freelancer") {
    // Validate the ZIP before creating the account, so an unknown ZIP gives a
    // clean form error rather than a failed signup trigger.
    const centroid = await lookupZip(supabase, formData.get("home_zip") as string);

    if (!centroid) {
      redirect(`/sign-up?role=freelancer&error=${encodeURIComponent(INVALID_ZIP_MESSAGE)}`);
    }

    metadata = { role, full_name: fullName, home_zip: centroid.zip };
  } else {
    metadata = {
      role,
      full_name: fullName,
      company_name: formData.get("company_name") as string,
    };
  }

  // 7.1 — remember who invited them, and do nothing else with it. It rides
  // along in the account's signup metadata, so no new column or table is
  // needed and a later referral feature can pick it up.
  const invitedBy = parseInviteRef(formData.get("invited_by") as string | undefined);
  if (invitedBy) {
    metadata.invited_by = invitedBy;
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });

  if (error) {
    redirect(`/sign-up?role=${role}&error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

/**
 * Only allow same-origin relative paths as a post-login destination, so a
 * crafted ?next= can't turn sign-in into an open redirect.
 */
function safeNext(value: FormDataEntryValue | null): string {
  const next = (value as string | null) ?? "";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const params = new URLSearchParams({ error: error.message });
    if (next !== "/dashboard") params.set("next", next);
    redirect(`/sign-in?${params.toString()}`);
  }

  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
