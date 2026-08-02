import sanitizeHtml from "sanitize-html";

/**
 * Credits are pasted from résumés and IMDb pages, then rendered with
 * dangerouslySetInnerHTML — so the stored value must already be safe. This runs
 * server-side before the write, never in the browser, because a client-side
 * sanitizer is only a formatting convenience: anything can POST to the action.
 *
 * The allowlist is deliberately narrow. No script/style/iframe/object, no event
 * handlers, no class or id attributes (which could be used to hijack the page's
 * own styles), and links are forced to safe schemes.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4",
    "blockquote", "a", "span", "div",
  ],
  allowedAttributes: {
    // target/rel must be listed here or the attribute filter strips them back
    // off after transformTags adds them below.
    a: ["href", "title", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  // Anything not in allowedTags has its markup dropped but its text kept, so a
  // paste never silently loses the user's words.
  nonTextTags: ["script", "style", "textarea", "noscript"],
  transformTags: {
    // Pasted links should not be able to reach back into this tab.
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
    }),
  },
};

export function sanitizeCredits(input: string | null | undefined): string | null {
  if (!input) return null;
  const clean = sanitizeHtml(input, OPTIONS).trim();
  // A paste of only formatting ("<p><br></p>") should read as empty, not as
  // "this profile has credits".
  const textOnly = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).trim();
  return textOnly.length > 0 ? clean : null;
}

/** Guards the length of a paste so one profile can't carry a novel. */
export const MAX_CREDITS_LENGTH = 20000;
