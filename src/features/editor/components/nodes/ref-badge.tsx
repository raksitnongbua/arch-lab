"use client";

/**
 * "Borrowed from another layer" corner chip for `^ref` boundary placeholders
 * (nodes carrying an `externalRef`).
 *
 * Why this exists: before it, a placeholder's ONLY visual cue was `opacity-60`
 * — the same treatment as a drag ghost. That conflated two unrelated ideas.
 * A dashed border with an external-link icon means "this is an
 * `externalSystem`" (a node TYPE); this chip means "this node is a reference
 * to another diagram" (a node ROLE). A `person` can be a reference; an
 * `externalSystem` can be first-class. The two must read differently.
 *
 * Named `↑ <level>` rather than `↑ <diagram id>`: the level is the fact a
 * reader needs ("this came down from the context view"), and it stays legible
 * at 9px where an id like `ctx-livechat` would truncate.
 *
 * Placement is BOTTOM-LEFT deliberately — the only free corner. Top-left is
 * the unknown-icon warning dot, top-right is the editor's child badge, and
 * bottom-right is the viewer's drill chip. Reading as a footnote also suits
 * what a reference IS: supporting detail, not the subject of the diagram.
 *
 * Presentation only, and non-interactive: `pointer-events-none` keeps it from
 * stealing the click that selects the node underneath.
 */

import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { C4Level } from "@/types";

export interface RefBadgeProps {
  /** The level of the diagram this node is a reference INTO. */
  sourceLevel: C4Level;
  /** Node name, for the accessible label only. */
  nodeName: string;
  /**
   * Jump to the original. Optional so the chip stays inert where there is
   * nowhere to go — the viewer shares this component and has no editing
   * destination, and an inert chip is better than a dead-looking button.
   */
  onOpen?: () => void;
  className?: string;
}

const CHIP_CLASSES =
  "absolute -bottom-2 -left-2 z-[2] flex items-center gap-0.5 rounded-full border border-node-border bg-node px-1.5 py-0.5 text-[9px] leading-none font-medium text-muted-foreground shadow-sm";

export function RefBadge({
  sourceLevel,
  nodeName,
  onOpen,
  className,
}: RefBadgeProps): React.JSX.Element {
  const inner = (
    <>
      <ArrowUp aria-hidden="true" className="size-2.5" />
      {sourceLevel}
    </>
  );

  if (onOpen === undefined) {
    const label = `${nodeName} is a reference to the ${sourceLevel} view — shown here for context, edit it at its source`;
    return (
      <span
        data-ref-badge
        aria-label={label}
        title={label}
        className={cn("pointer-events-none", CHIP_CLASSES, className)}
      >
        {inner}
      </span>
    );
  }

  // Clickable: the chip is the visible marker of "this lives somewhere else",
  // so it is the obvious thing to press to get there. `nodrag` keeps React Flow
  // from starting a node drag on the press; `stopPropagation` keeps the click
  // from also selecting the node underneath.
  const label = `${nodeName} is a reference to the ${sourceLevel} view — open the original`;
  return (
    <button
      type="button"
      data-ref-badge
      aria-label={label}
      title="Open original"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        "nodrag cursor-pointer transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        CHIP_CLASSES,
        className,
      )}
    >
      {inner}
    </button>
  );
}
