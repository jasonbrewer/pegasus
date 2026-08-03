import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { NavLink } from "./nav-link";

/**
 * Persistent top bar, rendered from the root layout so it appears on every
 * page. Pegasus is login-gated, so a signed-out visitor only ever sees this on
 * the landing and auth pages — there it shows the sign-in/sign-up affordances
 * and no marketplace links.
 */
export async function TopNav() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  let isAdmin = false;
  let status: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    role = profile?.role ?? null;
    status = profile?.status ?? null;
    isAdmin = profile?.is_admin ?? false;
  }

  const links =
    role === "employer"
      ? [
          { href: "/dashboard/employer", label: "My jobs" },
          { href: "/dashboard/employer/jobs/new", label: "Post a job" },
          { href: "/dashboard/employer/profile", label: "Company profile" },
        ]
      : role === "freelancer"
        ? [
            { href: "/jobs", label: "Browse jobs" },
            { href: "/dashboard/freelancer", label: "Dashboard" },
            { href: "/dashboard/freelancer/profile", label: "My profile" },
          ]
        : [];

  // A blocked employer has nothing to post, so the link goes rather than
  // leading to a form the database will refuse.
  const visibleLinks =
    role === "employer" && status !== "approved"
      ? links.filter((link) => link.href !== "/dashboard/employer/jobs/new")
      : links;

  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="text-sm font-semibold tracking-tight">
          Pegasus
        </Link>

        {visibleLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {visibleLinks.map((link) => (
              <NavLink key={link.href} href={link.href}>
                {link.label}
              </NavLink>
            ))}
            {/* 9.3 — only ever rendered for an admin. The route 404s for
                everyone else regardless. */}
            {isAdmin && <NavLink href="/admin">Moderation</NavLink>}
          </div>
        )}

        <div className="ml-auto flex items-center gap-4">
          {user ? (
            <form action={signOut}>
              <button
                type="submit"
                className="whitespace-nowrap rounded-md border border-field px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
              >
                Log out
              </button>
            </form>
          ) : (
            <>
              <Link href="/sign-in" className="whitespace-nowrap text-sm text-muted hover:text-content">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
