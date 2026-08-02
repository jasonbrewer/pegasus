import Link from "next/link";
import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

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
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
  );
}

export function SuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mb-5 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
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
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
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
    <span className="inline-flex items-center rounded-full border border-gray-300 px-2.5 py-0.5 text-xs text-gray-700">
      {children}
    </span>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-gray-200 p-4">{children}</div>;
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
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
      className="inline-block rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
    >
      {children}
    </Link>
  );
}

/** Definition-list row used on the read-only profile views. */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}
