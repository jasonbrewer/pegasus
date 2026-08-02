import { setAccountStatus } from "@/app/admin/actions";
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

const toneClass: Record<Action["tone"], string> = {
  primary: "bg-black text-white hover:bg-gray-800 border-black",
  danger: "border-red-300 text-red-700 hover:bg-red-50",
  plain: "border-gray-300 hover:bg-gray-50",
};

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
          <button
            type="submit"
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${toneClass[action.tone]}`}
          >
            {action.label}
          </button>
        </form>
      ))}
    </div>
  );
}
