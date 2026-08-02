"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nav item with active styling. Client-side only because it needs the current
 * pathname; the surrounding nav stays a server component so the session and
 * role are resolved without shipping them to the browser.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // "/jobs" should stay active on "/jobs/[id]", but "/" must match exactly.
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "whitespace-nowrap border-b-2 border-black pb-0.5 text-sm font-medium text-black"
          : "whitespace-nowrap border-b-2 border-transparent pb-0.5 text-sm text-gray-500 hover:text-black"
      }
    >
      {children}
    </Link>
  );
}
