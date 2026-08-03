import { setAccountStatus } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import type { AccountRole, AccountStatus } from "@/types/database";

type Action = {
  label: string;
  status: AccountStatus;
  tone: "primary" | "danger" | "plain";
};

/**
 * There are only three states, so "approve / reject / block / unblock" is four
 * verbs over the same column:
 *
 *   Approve  -> approved   Reject  -> blocked
 *   Block    -> blocked    Unblock -> approved
 *
 * Reject and Block land on the same state deliberately: a rejected applicant
 * and a removed member are both "not allowed in", and a second state for
 * "rejected" would have to be enforced identically everywhere. If rejection
 * ever needs its own handling (a different email, a re-apply window), that is
 * the moment to add the enum value — not before.
 */
function actionsFor(role: AccountRole, status: AccountStatus): Action[] {
  if (status === "blocked") {
    return [{ label: "Unblock", status: "approved", tone: "primary" }];
  }

  if (status === "pending") {
    return [
      { label: "Approve", status: "approved", tone: "primary" },
      { label: "Reject", status: "blocked", tone: "danger" },
    ];
  }

  return [
    {
      label: role === "employer" ? "Block employer" : "Block",
      status: "blocked",
      tone: "danger",
    },
  ];
}

/** Maps this file's tones onto the shared button's variants. */
const toneVariant = {
  primary: "primary",
  danger: "danger",
  plain: "secondary",
} as const;

export function StatusActions({
  profileId,
  role,
  status,
  returnTo,
}: {
  profileId: string;
  role: AccountRole;
  status: AccountStatus;
  returnTo: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actionsFor(role, status).map((action) => (
        <form key={action.label} action={setAccountStatus}>
          <input type="hidden" name="profile_id" value={profileId} />
          <input type="hidden" name="status" value={action.status} />
          <input type="hidden" name="return_to" value={returnTo} />
          {/* Moderation writes go through admin_set_account_status(); a
              double click would fire it twice for no reason. */}
          <SubmitButton variant={toneVariant[action.tone]} size="sm" pendingLabel="Saving…">
            {action.label}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}
