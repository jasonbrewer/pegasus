import Link from "next/link";
import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-field px-3 py-2 text-sm outline-none focus:border-strong";

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">{children}</main>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-5 rounded-md bg-danger px-3 py-2 text-sm text-danger-ink">{message}</p>
  );
}

export function SuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-5 rounded-md bg-success px-3 py-2 text-sm text-success-ink">{message}</p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-field px-2.5 py-0.5 text-xs text-secondary">
      {children}
    </span>
  );
}

/**
 * `interactive` is for a card wrapped in a link: the hover tint has to live on
 * the card itself, since the card's own background would otherwise cover a
 * hover set on the parent. Needs `group` on that parent.
 */
export function Card({
  children,
  interactive = false,
}: {
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface p-4${
        interactive ? " transition-colors group-hover:bg-surface-muted" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover"
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  prefetch,
}: {
  href: string;
  children: ReactNode;
  /** Pass false for destinations that write on render — see the applicant view. */
  prefetch?: false;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className="inline-block rounded-md border border-field px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
    >
      {children}
    </Link>
  );
}

/** Definition-list row used on the read-only profile views. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line-soft py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}
