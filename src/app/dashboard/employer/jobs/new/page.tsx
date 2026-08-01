import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES_BY_GROUP } from "@/lib/roles";
import { createJob } from "../actions";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Post a job</h1>
        <p className="mt-1 text-sm text-gray-500">
          Free while we&apos;re in v1 — billing switches on later.
        </p>
      </div>

      {params.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      )}

      <form action={createJob} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            name="title"
            required
            placeholder="Two-camera interview shoot"
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Role
          <select name="role_slug" required className="rounded-md border border-gray-300 px-3 py-2">
            <option value="">Select a role…</option>
            {ROLES_BY_GROUP.map(({ group, roles }) => (
              <optgroup key={group} label={group}>
                {roles.map((role) => (
                  <option key={role.slug} value={role.slug}>
                    {role.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Location ZIP
          <input
            name="location_zip"
            required
            inputMode="numeric"
            placeholder="23220"
            className="rounded-md border border-gray-300 px-3 py-2"
          />
          <span className="text-xs text-gray-500">
            Used to rank nearby freelancers. Remote roles aren&apos;t distance-filtered.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="travel_expected" />
          Travel expected
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Start date
            <input type="date" name="start_date" className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            End date
            <input type="date" name="end_date" className="rounded-md border border-gray-300 px-3 py-2" />
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Rate (USD)
            <input
              name="rate"
              inputMode="decimal"
              placeholder="750"
              className="rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Rate type
            <select name="rate_type" className="rounded-md border border-gray-300 px-3 py-2">
              <option value="day">Per day</option>
              <option value="hourly">Per hour</option>
              <option value="flat">Flat</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea
            name="description"
            required
            rows={6}
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </label>

        <div className="mt-2 flex items-center gap-3">
          <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
            Post job
          </button>
          <Link href="/dashboard/employer" className="text-sm text-gray-500 underline">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
