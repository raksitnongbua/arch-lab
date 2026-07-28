"use client";

/**
 * A copyable command or config block for the `/mcp` page.
 *
 * The whole point of that page is that someone pastes one line into their
 * client, so the copy button is the primary control, not decoration. Copy
 * feedback is announced in a live region rather than shown only as a colour
 * change.
 *
 * Long lines scroll INSIDE the block, never the page.
 */

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export function CopySnippet({
  snippet,
  caption,
  label,
}: {
  /** The exact text to display and copy. */
  snippet: string;
  /** Shown in the block's header, e.g. `bash` or `json`. */
  caption: string;
  /** Names the snippet in the copy button's accessible name. */
  label: string;
}): React.JSX.Element {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
          <figcaption className="font-mono text-xs text-muted-foreground">
            {caption}
          </figcaption>
          <CopyButton snippet={snippet} label={label} />
        </div>
        <pre
          tabIndex={0}
          className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <code>{snippet}</code>
        </pre>
      </div>
    </figure>
  );
}

function CopyButton({
  snippet,
  label,
}: {
  snippet: string;
  label: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(snippet)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      })
      .catch(() => {
        /* Clipboard blocked — the text stays selectable in the block. */
      });
  }, [snippet]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : `Copy the ${label}`}
      className={buttonClasses({ variant: "ghost", size: "sm" })}
    >
      {copied ? (
        <Check aria-hidden="true" className="text-primary" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard." : ""}
      </span>
    </button>
  );
}
