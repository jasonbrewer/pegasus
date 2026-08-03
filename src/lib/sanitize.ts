import sanitizeHtml from "sanitize-html";
import {
  MAX_CREDITS_LENGTH,
  MAX_CREDITS_RAW_LENGTH,
  CREDITS_ALLOWED_TAGS,
  CREDITS_ALLOWED_ATTRIBUTES,
  CREDITS_ALLOWED_SCHEMES,
  CREDITS_DROPPED_TAGS,
  CREDITS_LINK_REL,
} from "./credits-policy";

export * from "./credits-policy";

/**
 * Credits are pasted from résumés and IMDb pages, then rendered with
 * dangerouslySetInnerHTML — so the stored value must already be safe. This runs
 * server-side before the write, never in the browser, because a client-side
 * sanitizer is only a formatting convenience: anything can POST to the action.
 *
 * The allowlist lives in ./credits-policy so the editor's paste handler can
 * share it. This module is still the one that decides what gets stored.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...CREDITS_ALLOWED_TAGS],
  allowedAttributes: Object.fromEntries(
    Object.entries(CREDITS_ALLOWED_ATTRIBUTES).map(([tag, attrs]) => [tag, [...attrs]])
  ),
  allowedSchemes: [...CREDITS_ALLOWED_SCHEMES],
  allowedSchemesAppliedToAttributes: ["href"],
  // Anything not in allowedTags has its markup dropped but its text kept, so a
  // paste never silently loses the user's words.
  nonTextTags: [...CREDITS_DROPPED_TAGS],
  transformTags: {
    // Pasted links should not be able to reach back into this tab.
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: CREDITS_LINK_REL },
    }),
  },
};

export function sanitizeCredits(input: string | null | undefined): string | null {
  if (!input) return null;
  const clean = sanitizeHtml(input, OPTIONS).trim();
  // A paste of only formatting ("<p><br></p>") should read as empty, not as
  // "this profile has credits".
  return creditsTextLength(clean) > 0 ? clean : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * How long the credits actually *read* — markup excluded.
 *
 * This is what the limit is measured against. Counting raw HTML instead
 * punished people for pasting: a résumé out of Word arrives wrapped in inline
 * styles and mso-* attributes that can be twenty times the size of the words
 * themselves, so a perfectly ordinary paste tripped the limit while the same
 * text typed by hand sailed through.
 *
 * Block tags become a space so that words either side of a paragraph break are
 * not counted as one, and entities are decoded so "&amp;" counts as the one
 * character a reader sees.
 */
export function creditsTextLength(html: string | null | undefined): number {
  if (!html) return 0;

  const spaced = html.replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote)\b[^>]*>/gi, " ");
  const stripped = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });

  const decoded = stripped
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);

  return decoded.replace(/\s+/g, " ").trim().length;
}

export type PreparedCredits =
  | { ok: true; html: string | null }
  | { ok: false; error: string };

/**
 * Validate and sanitize in the one order that is correct: reject an absurd
 * payload, sanitize, then measure the *result*.
 *
 * Measuring after sanitizing matters. The stored value is the sanitized one,
 * so that is what the user's limit should describe — and it means the pasted
 * cruft that caused this bug is gone before anything is counted.
 *
 * Both callers use this rather than composing the pieces themselves, so the
 * order cannot drift apart between the two forms.
 */
export function prepareCredits(input: string | null | undefined): PreparedCredits {
  if (!input) return { ok: true, html: null };

  if (input.length > MAX_CREDITS_RAW_LENGTH) {
    return {
      ok: false,
      error: "That paste is too large to process — try pasting it as plain text",
    };
  }

  const html = sanitizeCredits(input);
  const length = creditsTextLength(html);

  if (length > MAX_CREDITS_LENGTH) {
    return {
      ok: false,
      error: `Your credits are too long — please trim them down (${length.toLocaleString(
        "en-US"
      )} characters, limit ${MAX_CREDITS_LENGTH.toLocaleString("en-US")})`,
    };
  }

  return { ok: true, html };
}
