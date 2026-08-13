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

import { CopyButton } from "@/components/ui/copy-button";

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
          <CopyButton text={snippet} label={`Copy the ${label}`} />
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
