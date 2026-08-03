"use client";

import { withdrawApplication } from "@/app/jobs/actions";

/**
 * Confirm-then-withdraw. The dialog is a courtesy only — ownership is enforced
 * by the applications UPDATE policy and the column-level grant, so bypassing
 * this button changes nothing about who can withdraw what.
 */
export function WithdrawApplicationButton({
  jobId,
  title,
}: {
  jobId: string;
  title: string;
}) {
  return (
    <form
      action={withdrawApplication}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Withdraw your application to "${title}"?\n\nThe employer will stop seeing it. You can apply again later if you change your mind.`
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="return_to" value="/dashboard/freelancer" />
      <button
        type="submit"
        className="rounded-md border border-danger-edge px-3 py-1.5 text-sm font-medium text-danger-ink hover:bg-danger"
      >
        Withdraw application
      </button>
    </form>
  );
}
