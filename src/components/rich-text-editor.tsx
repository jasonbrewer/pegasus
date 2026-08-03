"use client";

import { useEffect, useRef, useState } from "react";
import { cleanPastedCredits, plainTextToCredits } from "@/lib/paste-credits";
import { MAX_CREDITS_LENGTH } from "@/lib/credits-policy";

const TOOLBAR: { command: string; label: string; title: string }[] = [
  { command: "bold", label: "B", title: "Bold" },
  { command: "italic", label: "I", title: "Italic" },
  { command: "underline", label: "U", title: "Underline" },
  { command: "insertUnorderedList", label: "• List", title: "Bulleted list" },
  { command: "insertOrderedList", label: "1. List", title: "Numbered list" },
  { command: "removeFormat", label: "Clear", title: "Clear formatting" },
];

/**
 * Minimal paste-and-style editor for credits. Backed by a contenteditable and
 * mirrored into a hidden input so the surrounding server action reads it from
 * FormData like any other field — no client-side fetch, and the form still
 * works as a plain POST.
 *
 * The HTML produced here is a convenience only: it is sanitized server-side
 * before storage, since anything can post to the action directly.
 */
export function RichTextEditor({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue ?? "");
  const [isEmpty, setIsEmpty] = useState(!defaultValue);
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (editorRef.current && defaultValue) {
      editorRef.current.innerHTML = defaultValue;
      setIsEmpty(false);
      setLength(editorRef.current.textContent?.replace(/\s+/g, " ").trim().length ?? 0);
    }
    // Only seeds the initial value; later edits are owned by the DOM node.
  }, [defaultValue]);

  function sync() {
    const node = editorRef.current;
    if (!node) return;
    setHtml(node.innerHTML);
    setIsEmpty(node.textContent?.trim().length === 0);
    // Counted the same way the server counts it — visible characters, not
    // markup — so the number here is the number the limit uses.
    setLength(node.textContent?.replace(/\s+/g, " ").trim().length ?? 0);
  }

  /**
   * Pasted markup is cleaned down to the allowlist before it ever enters the
   * editor, so what the user sees is what gets stored. Without this a paste
   * out of Word arrives as tens of kilobytes of inline styles wrapped around a
   * couple of pages of text.
   *
   * The server sanitizes again on write; this does not replace that.
   */
  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pastedHtml = event.clipboardData.getData("text/html");
    const pastedText = event.clipboardData.getData("text/plain");

    if (!pastedHtml && !pastedText) return;

    event.preventDefault();

    const clean = pastedHtml
      ? cleanPastedCredits(pastedHtml)
      : plainTextToCredits(pastedText);

    if (clean) {
      document.execCommand("insertHTML", false, clean);
    } else if (pastedText) {
      document.execCommand("insertText", false, pastedText);
    }

    sync();
  }

  function run(command: string) {
    // execCommand is deprecated but is still the only cross-browser way to do
    // this without pulling in an editor framework. The output is sanitized
    // server-side regardless.
    document.execCommand(command, false);
    editorRef.current?.focus();
    sync();
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {TOOLBAR.map((item) => (
          <button
            key={item.command}
            type="button"
            title={item.title}
            onClick={() => run(item.command)}
            className="rounded border border-field px-2 py-1 text-xs hover:bg-surface-muted"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted">
            {placeholder}
          </p>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Credits or résumé"
          onInput={sync}
          onBlur={sync}
          onPaste={onPaste}
          className="prose-sm min-h-40 w-full rounded-md border border-field px-3 py-2 text-sm outline-none focus:border-strong [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc"
        />
      </div>

      <input type="hidden" name={name} value={html} />

      {length > 0 && (
        <p
          className={`mt-1 text-xs ${
            length > MAX_CREDITS_LENGTH ? "text-danger-ink" : "text-muted"
          }`}
        >
          {length.toLocaleString("en-US")} / {MAX_CREDITS_LENGTH.toLocaleString("en-US")}{" "}
          characters
        </p>
      )}
    </div>
  );
}
