import {
  CREDITS_ALLOWED_TAGS,
  CREDITS_ALLOWED_ATTRIBUTES,
  CREDITS_ALLOWED_SCHEMES,
  CREDITS_DROPPED_TAGS,
  CREDITS_LINK_REL,
} from "./credits-policy";

/**
 * Turns a paste from Word, Google Docs or a web page into the same minimal
 * HTML the server sanitizer would keep.
 *
 * This is a convenience, not a security boundary — src/lib/sanitize.ts still
 * runs on every write, and anything can POST to the action regardless. What it
 * buys is that the editor holds clean markup from the moment of the paste:
 * the user sees what will actually be stored, and the length limit is measured
 * against something honest rather than against forty kilobytes of mso-*
 * attributes wrapping two pages of text.
 *
 * It reads the same allowlist as the server, so it cannot let through anything
 * the server would strip. Where the two differ, this one is deliberately the
 * narrower: bare <span> and <font> are unwrapped here even though the server
 * tolerates a <span>, because once the attributes are gone they carry nothing.
 */

const ALLOWED = new Set<string>(CREDITS_ALLOWED_TAGS);
const DROPPED = new Set<string>(CREDITS_DROPPED_TAGS);

/** Void elements on the allowlist — kept even though they hold no text. */
const VOID = new Set(["br"]);

/**
 * Elements that carry no meaning once their attributes are stripped. Word and
 * Docs emit these by the hundred, one per run of identical formatting.
 */
const ALWAYS_UNWRAP = new Set(["span", "font"]);

/** Only these get style-implied formatting turned back into semantic tags. */
const INLINE_FOR_STYLE = new Set(["span", "font", "a", "b", "strong", "i", "em", "u", "s"]);

type StyleIntent = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Google Docs wraps an entire paste in <b style="font-weight:normal">. */
  explicitlyNotBold: boolean;
};

function readStyle(el: Element): StyleIntent {
  const style = (el.getAttribute("style") ?? "").toLowerCase();

  const weight = /font-weight\s*:\s*([a-z0-9]+)/.exec(style)?.[1];
  const bold = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  const explicitlyNotBold = weight === "normal" || weight === "400";

  return {
    bold,
    explicitlyNotBold,
    italic: /font-style\s*:\s*italic/.test(style),
    // "text-decoration: underline line-through" is one declaration, so test the
    // value rather than matching the whole property.
    underline: /text-decoration[^;]*underline/.test(style),
  };
}

function hasSafeHref(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  // A relative or anchor href has no scheme to check.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  return CREDITS_ALLOWED_SCHEMES.some((scheme) =>
    trimmed.toLowerCase().startsWith(`${scheme}:`)
  );
}

function wrap(doc: Document, tagName: string, content: Node): Node {
  const el = doc.createElement(tagName);
  el.appendChild(content);
  return el;
}

function cleanChildren(parent: Node, doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 3 /* text */) {
      fragment.appendChild(doc.createTextNode(child.nodeValue ?? ""));
      continue;
    }
    // Comment nodes fall through here and vanish, which is how Word's
    // <!--[if gte mso 9]> conditional blocks disappear.
    if (child.nodeType !== 1 /* element */) continue;

    const cleaned = cleanElement(child as Element, doc);
    if (cleaned) fragment.appendChild(cleaned);
  }

  return fragment;
}

function cleanElement(el: Element, doc: Document): Node | null {
  const tag = el.localName.toLowerCase();

  // <style> and friends take their contents with them.
  if (DROPPED.has(tag)) return null;

  const style = readStyle(el);
  const children = cleanChildren(el, doc);

  const isEmpty = !VOID.has(tag) && children.textContent?.trim() === "" && !hasBreak(children);

  let result: Node;

  const unwrap =
    !ALLOWED.has(tag) ||
    ALWAYS_UNWRAP.has(tag) ||
    // The Google Docs wrapper: a <b> that explicitly isn't bold. Keeping it
    // would embolden the entire pasted document.
    ((tag === "b" || tag === "strong") && style.explicitlyNotBold);

  if (unwrap) {
    result = children;
  } else {
    // Word's spacer paragraphs (<p><o:p></o:p></p>) collapse to nothing here.
    if (isEmpty) return null;

    const kept = doc.createElement(tag);
    const allowedAttrs = CREDITS_ALLOWED_ATTRIBUTES[tag] ?? [];

    for (const attr of allowedAttrs) {
      const value = el.getAttribute(attr);
      if (value !== null) kept.setAttribute(attr, value);
    }

    if (tag === "a") {
      // An unsafe scheme loses the link but keeps the words, matching what the
      // server sanitizer does.
      if (!hasSafeHref(kept.getAttribute("href"))) return children;
      kept.setAttribute("target", "_blank");
      kept.setAttribute("rel", CREDITS_LINK_REL);
    }

    kept.appendChild(children);
    result = kept;
  }

  // Word and Docs express bold/italic/underline as inline styles rather than
  // tags. The styles are stripped above, so the intent is put back as the
  // semantic tags the allowlist does permit — otherwise a pasted résumé
  // arrives as a wall of unformatted text.
  //
  // Only for inline elements: wrapping a <p> in <strong> would be invalid
  // nesting, and a block-level style is not the user formatting a word.
  if (INLINE_FOR_STYLE.has(tag) && result.textContent?.trim() !== "") {
    if (style.underline) result = wrap(doc, "u", result);
    if (style.italic) result = wrap(doc, "em", result);
    if (style.bold) result = wrap(doc, "strong", result);
  }

  return result;
}

function hasBreak(node: Node): boolean {
  if (node.nodeType === 1 && (node as Element).localName.toLowerCase() === "br") return true;
  return Array.from(node.childNodes).some(hasBreak);
}

/**
 * Cleans a `text/html` clipboard payload. Exported for the editor's paste
 * handler; `parse` is injectable so this can be exercised outside a browser.
 */
export function cleanPastedCredits(
  html: string,
  parse: (input: string) => Document = (input) =>
    new DOMParser().parseFromString(input, "text/html")
): string {
  if (!html.trim()) return "";

  const doc = parse(`<!doctype html><body>${html}</body>`);
  const cleaned = cleanChildren(doc.body, doc);

  const holder = doc.createElement("div");
  holder.appendChild(cleaned);
  return holder.innerHTML.trim();
}

/**
 * Cleans a `text/plain` paste: blank-line-separated blocks become paragraphs,
 * single newlines become breaks. Escaped, so text that happens to look like
 * markup stays text.
 */
export function plainTextToCredits(text: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escape(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
