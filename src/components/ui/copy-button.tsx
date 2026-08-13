"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Copy this text", with the confirmation every surface in the app gives.
 *
 * There were four of these — in the syntax docs, the MCP page, the C4
 * playground, and the sequence viewer's dock — with byte-identical handlers and
 * four different names for the same string prop (`code`, `snippet`, `text`,
 * `value`). The behaviour they share is not incidental; it is a set of decisions
 * that should hold everywhere:
 *
 *   - Feedback is an ICON SWAP PLUS a live-region announcement, never colour
 *     alone, so the confirmation reaches a screen reader and a reader who cannot
 *     distinguish the tick's green.
 *   - A blocked clipboard fails SILENTLY. The text is still selectable in the
 *     block behind the button, and "your browser blocked the clipboard" is not
 *     something the reader can act on.
 *   - The accessible name changes to "Copied to clipboard" while confirming, so
 *     the button's own name reports its result.
 */

/** How long the confirmed state stays before reverting to the copy affordance. */
const COPIED_RESET_MS = 2_000;

export function CopyButton({
  text,
  label,
  className,
  iconOnly = false,
}: {
  /** The string written to the clipboard. */
  text: string;
  /**
   * The button's accessible name at rest — a whole phrase, e.g.
   * `"Copy the arch-lab text"`. Replaced by the confirmation while copied.
   */
  label: string;
  /** Overrides the default button chrome; for docked or absolutely-placed uses. */
  className?: string;
  /** Drops the visible "Copy" text, leaving the icon to carry it. */
  iconOnly?: boolean;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
      })
      .catch(() => {
        /* Clipboard blocked — the text stays selectable in the block. */
      });
  }, [text]);

  const iconClass = iconOnly ? "size-3.5" : undefined;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : label}
      className={className ?? buttonClasses({ variant: "ghost", size: "sm" })}
    >
      {copied ? (
        <Check aria-hidden="true" className={cn("text-primary", iconClass)} />
      ) : (
        <Copy aria-hidden="true" className={iconClass} />
      )}
      {iconOnly ? null : copied ? "Copied" : "Copy"}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard." : ""}
      </span>
    </button>
  );
}
