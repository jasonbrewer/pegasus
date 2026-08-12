import { useCallback, useEffect, useRef, useState } from "react";
import { recordCta } from "./capture";

/**
 * The one call to action, wired to the booking flow the site already uses.
 *
 * These two URLs are not new. They are the same appointment schedule the rest
 * of the site's "book a call" buttons open, copied verbatim so this page joins
 * the existing calendar rather than starting a second one.
 *
 *   CAL_IFRAME  the embeddable form, shown in a modal on a desktop-sized
 *               window, where a full-page redirect out of a half-finished
 *               estimate is the thing most likely to lose the booking
 *   CAL_LINK    the short link, opened in a new tab on a phone, where an
 *               iframed calendar in a 360px-wide modal is unusable
 *
 * The anchor carries CAL_LINK as a real href with target="_blank": middle
 * click, "open in new tab" and a JS failure all still reach the booking page,
 * and the modal is an enhancement layered over a link that already worked.
 */

const CAL_IFRAME =
  "https://calendar.google.com/calendar/appointments/schedules/" +
  "AcZssZ0qjWiIAEzrOzFrJyPog1yhmflvRvygPZNrkt3rDzJJODqFgFjuJjFt0MbrnmrnKViamDnOXc_w?gv=true";

const CAL_LINK = "https://calendar.app.google/YcjTkyQbm9hJv12t8";

/** Matches the site's own breakpoint for "this is a phone". */
const PHONE = "(max-width: 767px)";

function BookingModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Remember what had focus, move focus into the dialog, and hand it back on
    // close — otherwise a keyboard user lands back at the top of the document.
    restoreTo.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // The page behind must not scroll while the calendar is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        // Backdrop only — a click that started inside the panel must not close it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Book a call"
        className="flex w-full flex-col overflow-hidden rounded-xl border border-line bg-surface"
        style={{ maxWidth: "56rem", height: "min(90vh, 44rem)" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <span className="text-sm font-semibold">Pick a time</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md border border-field px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
          >
            Close
          </button>
        </div>
        <iframe
          src={CAL_IFRAME}
          title="Book a call"
          className="w-full flex-1"
          style={{ border: 0 }}
        />
      </div>
    </div>
  );
}

/**
 * "Get a real quote".
 *
 * The RPC write happens first and is not awaited: the click opens the booking
 * flow at once, and the capture rides along with keepalive so it survives the
 * navigation on a phone.
 */
export function BookingCta({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <a
        href={CAL_LINK}
        target="_blank"
        rel="noopener noreferrer"
        data-scope-cta="call_me"
        className={`inline-block rounded-md bg-accent px-5 py-3 text-base font-semibold text-accent-ink no-underline hover:bg-accent-hover ${className}`}
        onClick={(e) => {
          recordCta();

          // Modifier-clicks are the browser's to handle; hijacking them into a
          // modal is how "open in a new tab" stops working.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

          // Phones keep the plain link. Everything else gets the modal, so the
          // estimate is still on screen behind the calendar.
          if (window.matchMedia(PHONE).matches) return;

          e.preventDefault();
          setOpen(true);
        }}
      >
        Get a real quote
      </a>

      {open && <BookingModal onClose={close} />}
    </>
  );
}
