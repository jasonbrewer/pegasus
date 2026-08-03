"use client";

import { deleteJob } from "@/app/dashboard/employer/jobs/actions";
import { SubmitButton } from "@/components/submit-button";

/**
 * Confirm-then-delete. The dialog is a courtesy only — ownership is enforced
 * by the jobs DELETE policy, so bypassing this button changes nothing.
 */
export function DeleteJobButton({ jobId, title }: { jobId: string; title: string }) {
  return (
    <form
      action={deleteJob}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Delete "${title}"?\n\nThis is permanent. The posting and every application to it will be removed. This cannot be undone.`
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">
        Delete posting
      </SubmitButton>
    </form>
  );
}
