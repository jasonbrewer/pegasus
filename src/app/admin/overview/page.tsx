import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL } from "@/lib/access";
import { formatPhone } from "@/lib/phone";
import {
  PageShell,
  PageHeader,
  Badge,
  Card,
  SubmitButton,
  ButtonLink,
  inputClass,
} from "@/components/ui";
import type { AccountRole, AccountStatus } from "@/types/database";

export const dynamic = "force-dynamic";

/**
 * 6.3 — every account in one place, with counts and a search.
 *
 * Read-only. Nothing on this page mutates anything; the status buttons live on
 * the moderation page and go through admin_set_account_status() as they always
 * have.
 *
 * Every query below is an ordinary RLS-filtered SELECT. For a non-admin they
 * come back EMPTY rather than forbidden — the admin carve-outs are what make
 * them return anything, so this page cannot leak by forgetting a check. The
 * layout's 404 is a courtesy on top of that, not the boundary.
 */

const STATUS_ORDER: AccountStatus[] = ["pending", "approved", "blocked"];

type Row = {
  id: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  email: string | null;
  phone: string | null;
};

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function AccountList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link href={`/admin/accounts/${row.id}`} className="font-medium hover:underline">
                {row.name || "(no name)"}
              </Link>
              <Badge>{STATUS_LABEL[row.status]}</Badge>
            </div>
            {/* 6.1 — contact is on the row so a moderator can verify without
                opening every account in turn. */}
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
              <span>{row.email ?? "no email on file"}</span>
              {row.phone && <span>{formatPhone(row.phone)}</span>}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = await searchParams;
  const search = (query.q ?? "").trim().toLowerCase();
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, status")
    .order("full_name");

  const { data: companies } = await supabase
    .from("employer_profiles")
    .select("profile_id, company_name");

  // 6.1 — readable here only because of this batch's carve-outs.
  const { data: freelancerContacts } = await supabase
    .from("freelancer_contacts")
    .select("profile_id, phone, contact_email");

  const { data: employerContacts } = await supabase
    .from("employer_contacts")
    .select("profile_id, contact_phone, contact_email");

  const companyById = new Map((companies ?? []).map((c) => [c.profile_id, c.company_name]));
  const freelancerContactById = new Map((freelancerContacts ?? []).map((c) => [c.profile_id, c]));
  const employerContactById = new Map((employerContacts ?? []).map((c) => [c.profile_id, c]));

  const all: Row[] = (profiles ?? []).map((p) => {
    const isFreelancer = p.role === "freelancer";
    const contact = isFreelancer
      ? freelancerContactById.get(p.id)
      : employerContactById.get(p.id);

    return {
      id: p.id,
      name: isFreelancer ? p.full_name : companyById.get(p.id) || p.full_name,
      role: p.role,
      status: p.status,
      email: contact?.contact_email ?? null,
      phone: contact
        ? "phone" in contact
          ? contact.phone
          : contact.contact_phone
        : null,
    };
  });

  // Counts are taken from the unfiltered set — a search narrows the lists, not
  // the totals, or the numbers would change meaning as you type.
  const freelancers = all.filter((r) => r.role === "freelancer");
  const employers = all.filter((r) => r.role === "employer");
  const byStatus = (status: AccountStatus) => all.filter((r) => r.status === status).length;

  // Filtering happens here, not in the query, so one search box can cover the
  // name, the company name and the email at once. This is a convenience over
  // rows RLS already decided this admin may see — it is not the access check.
  const matches = (row: Row) =>
    !search ||
    row.name.toLowerCase().includes(search) ||
    (row.email?.toLowerCase().includes(search) ?? false);

  return (
    <PageShell>
      <PageHeader
        title="Everyone"
        subtitle="Every account on Production Circles, with contact details for verification."
        action={<ButtonLink href="/admin">Moderation queue</ButtonLink>}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CountCard label="Freelancers" value={freelancers.length} />
        <CountCard label="Employers" value={employers.length} />
        {STATUS_ORDER.map((status) => (
          <CountCard key={status} label={STATUS_LABEL[status]} value={byStatus(status)} />
        ))}
      </div>

      <form className="mb-8 flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Search everyone</span>
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Name, company or email…"
            className={inputClass}
          />
        </label>
        <SubmitButton>Search</SubmitButton>
        {search && <ButtonLink href="/admin/overview">Clear</ButtonLink>}
      </form>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Freelancers ({freelancers.filter(matches).length})
        </h2>
        <AccountList
          rows={freelancers.filter(matches)}
          empty={search ? "No freelancers match that search." : "No freelancers yet."}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Employers ({employers.filter(matches).length})
        </h2>
        <AccountList
          rows={employers.filter(matches)}
          empty={search ? "No employers match that search." : "No employers yet."}
        />
      </section>
    </PageShell>
  );
}
