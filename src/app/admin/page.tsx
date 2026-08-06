import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL } from "@/lib/access";
import { formatTimestamp } from "@/lib/format";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  Badge,
  Card,
  SubmitButton,
  ButtonLink,
  inputClass,
} from "@/components/ui";
import { StatusActions } from "@/components/status-actions";
import type { AccountStatus } from "@/types/database";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: AccountStatus }) {
  return <Badge>{STATUS_LABEL[status]}</Badge>;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; updated?: string }>;
}) {
  const query = await searchParams;
  const search = (query.q ?? "").trim();
  const supabase = await createClient();

  // Every read on this page relies on the admin SELECT carve-outs added in
  // migration 20260801000010. Without the admin flag these queries come back
  // empty rather than forbidden — the panel would simply have nothing in it.
  const { data: pending } = await supabase
    .from("profiles")
    .select("id, full_name, role, status, invited_by, created_at")
    .eq("role", "freelancer")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: employers } = await supabase
    .from("profiles")
    .select("id, full_name, role, status, created_at")
    .eq("role", "employer")
    .order("created_at", { ascending: false });

  const { data: matches } = search
    ? await supabase
        .from("profiles")
        .select("id, full_name, role, status")
        .ilike("full_name", `%${search}%`)
        .order("full_name")
        .limit(25)
    : { data: null };

  // Inviter names for the queue. A separate lookup rather than a join, because
  // invited_by points back at the same table.
  const inviterIds = [...new Set((pending ?? []).map((p) => p.invited_by).filter((id) => id !== null))];
  const { data: inviters } = inviterIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", inviterIds)
    : { data: [] };
  const inviterById = new Map((inviters ?? []).map((i) => [i.id, i.full_name]));

  const companyIds = (employers ?? []).map((e) => e.id);
  const { data: companies } = companyIds.length
    ? await supabase.from("employer_profiles").select("profile_id, company_name").in("profile_id", companyIds)
    : { data: [] };
  const companyById = new Map((companies ?? []).map((c) => [c.profile_id, c.company_name]));

  return (
    <PageShell>
      <PageHeader
        title="Moderation"
        subtitle="Who gets into Production Circles, and who stays in."
        action={<ButtonLink href="/admin/overview">Everyone</ButtonLink>}
      />

      <ErrorBanner message={query.error} />
      {query.updated && (
        <SuccessBanner message={`Account set to ${STATUS_LABEL[query.updated as AccountStatus] ?? query.updated}.`} />
      )}

      {/* Look up any account by name — freelancer or employer, any status. */}
      <form className="mb-8 flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Find an account</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name…"
            className={inputClass}
          />
        </label>
        <SubmitButton>Search</SubmitButton>
      </form>

      {search && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Results for &ldquo;{search}&rdquo;
          </h2>
          {!matches || matches.length === 0 ? (
            <p className="text-sm text-muted">Nobody by that name.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {matches.map((account) => (
                <li key={account.id}>
                  <Card>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link
                        href={`/admin/accounts/${account.id}`}
                        className="font-medium hover:underline"
                      >
                        {account.full_name || "(no name)"}
                      </Link>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        {account.role}
                        <StatusBadge status={account.status} />
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
          Applications to join
        </h2>
        <p className="mb-3 text-sm text-muted">
          Freelancers waiting on review. They can sign in and build a profile, but no employer
          can see them yet.
        </p>

        {!pending || pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing in the queue.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((account) => (
              <li key={account.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link
                      href={`/admin/accounts/${account.id}`}
                      className="font-medium hover:underline"
                    >
                      {account.full_name || "(no name)"}
                    </Link>
                    <span className="text-sm text-muted">
                      Applied {formatTimestamp(account.created_at)}
                    </span>
                  </div>

                  <p className="mt-0.5 text-sm text-muted">
                    {account.invited_by ? (
                      <>
                        Invited by{" "}
                        <Link
                          href={`/admin/accounts/${account.invited_by}`}
                          className="underline"
                        >
                          {inviterById.get(account.invited_by) ?? "a member"}
                        </Link>
                      </>
                    ) : (
                      "Applied directly"
                    )}
                  </p>

                  <div className="mt-3">
                    <StatusActions
                      profileId={account.id}
                      role={account.role}
                      status={account.status}
                      returnTo="/admin"
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
          Employers
        </h2>
        <p className="mb-3 text-sm text-muted">
          Employers join without review. Blocking one hides every posting they have and stops
          them making new ones.
        </p>

        {!employers || employers.length === 0 ? (
          <p className="text-sm text-muted">No employers yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {employers.map((account) => (
              <li key={account.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link
                      href={`/admin/accounts/${account.id}`}
                      className="font-medium hover:underline"
                    >
                      {companyById.get(account.id) || account.full_name || "(no name)"}
                    </Link>
                    <StatusBadge status={account.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {account.full_name} · joined {formatTimestamp(account.created_at)}
                  </p>
                  <div className="mt-3">
                    <StatusActions
                      profileId={account.id}
                      role={account.role}
                      status={account.status}
                      returnTo="/admin"
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
