"use client";

import { useState } from "react";

/**
 * Reveals the user's personal signup link and copies it.
 *
 * The URL is built on the server and passed in, so it is present in the HTML
 * and can be read and selected even before hydration — only the copy button
 * needs JavaScript.
 */
export function InviteLink({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by permissions or a non-secure origin; the
      // input is selectable, so the user can still copy by hand.
      setCopied(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Invite a friend
      </button>
    );
  }

  return (
    <div className="w-full">
      <p className="mb-2 text-sm text-gray-600">
        Share this link. It&apos;s yours — anyone who signs up through it is recorded as your
        invite.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Your personal invite link"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
