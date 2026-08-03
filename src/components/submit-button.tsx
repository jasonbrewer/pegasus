"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * A submit button that disables itself for as long as its form is in flight.
 *
 * This is the primary fix for duplicate submissions. Server actions give no
 * feedback of their own, so a slow POST looks like a button that did nothing —
 * and the reasonable response to a button that did nothing is to press it
 * again. That produced two identical job postings.
 *
 * useFormStatus() reads the pending state of the nearest enclosing <form>,
 * which is why this has to be a client component rendered INSIDE the form
 * rather than around it.
 *
 * Re-enabling is automatic and needs no error handling here: every one of our
 * actions ends in a redirect, and a failed action redirects back to the same
 * page with ?error=. Either way the browser navigates, the form unmounts, and
 * the next render starts with a fresh, enabled button. Nothing can leave it
 * stuck disabled.
 */

const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  danger: "border border-danger-edge text-danger-ink hover:bg-danger",
  secondary: "border border-field hover:bg-surface-muted",
} as const;

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  size = "md",
}: {
  children: ReactNode;
  /** Shown while in flight. Defaults to the label plus an ellipsis. */
  pendingLabel?: ReactNode;
  variant?: keyof typeof VARIANTS;
  className?: string;
  size?: "sm" | "md";
}) {
  const { pending } = useFormStatus();

  const padding = size === "sm" ? "px-3 py-1.5" : "px-4 py-2";

  return (
    <button
      type="submit"
      disabled={pending}
      // aria-disabled as well as disabled: some screen readers skip a disabled
      // control entirely, and "it went quiet" is the exact problem being fixed.
      aria-disabled={pending}
      className={`rounded-md ${padding} text-sm font-medium transition-opacity ${
        VARIANTS[variant]
      } ${pending ? "cursor-not-allowed opacity-60" : ""} ${className}`}
    >
      {pending ? (pendingLabel ?? <>{children}…</>) : children}
    </button>
  );
}
