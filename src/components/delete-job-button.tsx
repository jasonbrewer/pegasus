"use client";

import { deleteJob } from "@/app/dashboard/employer/jobs/actions";

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
      <button
        type="submit"
        className="rounded-md border border-danger-edge px-3 py-1.5 text-sm font-medium text-danger-ink hover:bg-danger"
      >
        Delete posting
      </button>
    </form>
  );
}
