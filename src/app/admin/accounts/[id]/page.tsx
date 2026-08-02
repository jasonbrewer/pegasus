import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_BY_SLUG } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/access";
import { formatRate, formatTimestamp } from "@/lib/format";
import {
  PageShell,
  PageHeader,
  ErrorBanner,
  SuccessBanner,
  Badge,
  Card,
  DetailRow,
  ButtonLink,
} from "@/components/ui";
import { StatusActions } from "@/components/status-actions";
import type { AccountStatus } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  // Readable at any status because of the admin SELECT carve-out; for anyone
  // else this row would not come back at all.
  const { data: account } = await supabase
    .from("profiles")
    .select("id, full_name, role, status, is_admin, invited_by, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!account) {
    notFound();
  }

  const { data: inviter } = account.invited_by
    ? await supabase.from("profiles").select("id, full_name").eq("id", account.invited_by).maybeSingle()
    : { data: null };

  const isFreelancer = account.role === "freelancer";

  const { data: freelancer } = isFreelancer
    ? await supabase
        .from("freelancer_profiles")
        .select("home_zip, bio, day_rate_cents, travel_radius_miles, reel_url, portfolio_url")
        .eq("profile_id", id)
        .maybeSingle()
    : { data: null };

  const { data: roleRows } = isFreelancer
    ? await supabase.from("freelancer_roles").select("role_slug").eq("freelancer_id", id)
    : { data: [] };

  const { data: employer } = !isFreelancer
    ? await supabase
        .from("employer_profiles")
        .select("company_name, website, description, home_zip")
        .eq("profile_id", id)
        .maybeSingle()
    : { data: null };

  const { data: jobs } = !isFreelancer
    ? await supabase.from("jobs").select("id, company_network, status").eq("employer_id", id)
    : { data: [] };

  const { data: place } = freelancer?.home_zip || employer?.home_zip
    ? await supabase
        .from("zip_codes")
        .select("city, state")
        .eq("zip", (freelancer?.home_zip ?? employer?.home_zip) as string)
        .maybeSingle()
    : { data: null };

  const location = place ? [place.city, place.state].filter(Boolean).join(", ") : null;
  const returnTo = `/admin/accounts/${id}`;

  return (
    <PageShell>
      <PageHeader
        title={employer?.company_name || account.full_name || "(no name)"}
        subtitle={
          <>
            {account.role}
            {account.is_admin && <span className="text-gray-400"> · admin</span>}
          </>
        }
        action={<ButtonLink href="/admin">Back to moderation</ButtonLink>}
      />

      <ErrorBanner message={query.error} />
      {query.updated && (
        <SuccessBanner
          message={`Account set to ${STATUS_LABEL[query.updated as AccountStatus] ?? query.updated}.`}
        />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Badge>{STATUS_LABEL[account.status]}</Badge>
        <StatusActions
          profileId={account.id}
          role={account.role}
          status={account.status}
          returnTo={returnTo}
        />
      </div>

      <Card>
        <dl>
          <DetailRow label="Name" value={account.full_name} />
          <DetailRow label="Joined" value={formatTimestamp(account.created_at)} />
          <DetailRow label="Based in" value={location} />
          <DetailRow
            label="Invited by"
            value={
              inviter ? (
                <Link href={`/admin/accounts/${inviter.id}`} className="underline">
                  {inviter.full_name || "a member"}
                </Link>
              ) : (
                "Applied directly"
              )
            }
          />
          {isFreelancer ? (
            <>
              <DetailRow label="Day rate" value={formatRate(freelancer?.day_rate_cents ?? null)} />
              <DetailRow
                label="Travels up to"
                value={
                  freelancer?.travel_radius_miles != null
                    ? `${freelancer.travel_radius_miles} miles`
                    : null
                }
              />
              <DetailRow
                label="Reel"
                value={
                  freelancer?.reel_url ? (
                    <a
                      href={freelancer.reel_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View reel
                    </a>
                  ) : null
                }
              />
              <DetailRow
                label="Portfolio"
                value={
                  freelancer?.portfolio_url ? (
                    <a
                      href={freelancer.portfolio_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      View portfolio
                    </a>
                  ) : null
                }
              />
            </>
          ) : (
            <>
              <DetailRow
                label="Website"
                value={
                  employer?.website ? (
                    <a
                      href={employer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {employer.website}
                    </a>
                  ) : null
                }
              />
              <DetailRow label="Postings" value={String(jobs?.length ?? 0)} />
            </>
          )}
        </dl>
      </Card>

      {isFreelancer && (roleRows ?? []).length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {(roleRows ?? []).map((r) => {
            const role = ROLE_BY_SLUG.get(r.role_slug);
            return role ? <Badge key={r.role_slug}>{role.label}</Badge> : null;
          })}
        </div>
      )}

      {isFreelancer && freelancer?.bio && (
        <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {freelancer.bio}
        </p>
      )}

      {!isFreelancer && employer?.description && (
        <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {employer.description}
        </p>
      )}

      {!isFreelancer && (jobs ?? []).length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
            Postings
          </h2>
          <ul className="flex flex-col gap-3">
            {(jobs ?? []).map((job) => (
              <li key={job.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                      {job.company_network}
                    </Link>
                    <Badge>{job.status}</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8">
        <ButtonLink href={isFreelancer ? `/freelancers/${id}` : `/employers/${id}`}>
          View their public profile
        </ButtonLink>
      </div>
    </PageShell>
  );
}
