import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { loadViewer } from "@/lib/access";

/**
 * The moderation panel.
 *
 * 404 rather than 403 for non-admins: a "forbidden" page confirms the route
 * exists, and there is no reason to tell an ordinary member that it does.
 *
 * This check is a courtesy, not the security boundary. The admin read
 * carve-outs live in RLS and the one write path is admin-gated inside
 * public.admin_set_account_status(), so a non-admin who reached these pages
 * would still see nothing and be able to change nothing.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await loadViewer();

  if (!viewer?.isAdmin) {
    notFound();
  }

  return children;
}
