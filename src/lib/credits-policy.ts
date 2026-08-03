/**
 * What credits may contain, and how much of it.
 *
 * Credits are rendered with dangerouslySetInnerHTML, so what may appear in
 * them is decided here and nowhere else. Two places consume it:
 *
 *   src/lib/sanitize.ts       — the server sanitizer, run before every write.
 *                               This is the enforcement; nothing reaches the
 *                               database without passing through it.
 *   src/lib/paste-credits.ts  — the browser-side paste cleanup, which tidies
 *                               Word/Docs markup as it lands in the editor.
 *
 * It lives in its own module purely so the browser half can read it without
 * dragging `sanitize-html` (a Node library) into the client bundle. There is
 * still only one list: the paste cleanup cannot permit anything the server
 * sanitizer would strip, because it reads the same arrays.
 *
 * The list is deliberately narrow — no script/style/iframe/object, no event
 * handlers, no class or id (which could hijack the page's own styles), and
 * links limited to safe schemes.
 */

export const CREDITS_ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4",
  "blockquote", "a", "span", "div",
] as const;

/** Every attribute not listed for a tag is dropped, including style and class. */
export const CREDITS_ALLOWED_ATTRIBUTES: Record<string, readonly string[]> = {
  // target/rel are listed so the attribute filter doesn't strip them back off
  // after the link hardening adds them.
  a: ["href", "title", "target", "rel"],
};

export const CREDITS_ALLOWED_SCHEMES = ["http", "https", "mailto"] as const;

/**
 * Tags whose *contents* go too, rather than being unwrapped to text. Everything
 * else not on the allowlist keeps its words and loses only its markup, so a
 * paste never silently drops what the user wrote.
 */
export const CREDITS_DROPPED_TAGS = ["script", "style", "textarea", "noscript"] as const;

/** Applied to every pasted link, so a credit can't reach back into this tab. */
export const CREDITS_LINK_REL = "noopener noreferrer nofollow";

/**
 * Visible characters allowed in one credits field — markup excluded.
 *
 * Roughly 3,000 words: a long résumé plus a full credit list, several times
 * over. Generous on purpose. The limit exists so one profile can't carry a
 * novel, not to make people edit down real work history.
 *
 * This used to be measured against raw HTML, which is half of the bug this
 * module exists to fix: a résumé pasted out of Word arrives wrapped in inline
 * styles and mso-* attributes many times the size of the words themselves, so
 * an ordinary paste tripped a limit that the same text typed by hand sailed
 * straight through.
 */
export const MAX_CREDITS_LENGTH = 20000;

/**
 * A hard ceiling on the raw payload, checked before any parsing.
 *
 * Nothing to do with how much a user may write — this only stops a
 * pathological or hostile POST being handed to the sanitizer. Word can
 * genuinely emit thirty times the visible text, so this sits well clear of any
 * real paste.
 */
export const MAX_CREDITS_RAW_LENGTH = 2_000_000;
