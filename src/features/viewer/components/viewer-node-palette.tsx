"use client";

/**
 * The Add strip: one button per node type the CURRENT diagram level admits,
 * rendered under the breadcrumb while the canvas is editable.
 *
 * ALWAYS-VISIBLE BUTTONS, not a popover. A menu is a second click and a
 * dismissal contract (outside-click, Escape) that would have to negotiate
 * with the canvas's own Escape ladder; a level offers at most five types, so
 * the whole choice fits in one row of the chrome the toolbar already wears.
 *
 * THE LABELS ARE THE `.alab` KEYWORDS, in mono, on purpose: pressing
 * `database` makes the source pane gain a `:database` line, so the button
 * teaches the exact word the reader will meet in the text — the same
 * text-first framing the details panel uses for `[technology]`.
 *
 * The list itself comes from `creatableNodeTypes` — derived from the syntax
 * reference's own table and pinned to the parser's, see `lib/node-palette.ts`.
 * Offering the full eight-type list here would ship buttons that produce an
 * invalid document at this level.
 */

import { Plus } from "lucide-react";

import type { C4Level, C4NodeType } from "@/types";

import { creatableNodeTypes } from "../lib/node-palette";

export function ViewerNodePalette({
  level,
  onCreate,
}: {
  /** The level of the diagram on screen — it decides which types are legal. */
  level: C4Level;
  /** Add one node of `type` to the current diagram. */
  onCreate: (type: C4NodeType) => void;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Add an element to this diagram"
      className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur"
    >
      {/* Not a heading, part of the group's visual name: the Plus glyph is
          what makes the mono keywords read as actions rather than as a
          legend of what is already on the canvas. */}
      <span className="flex items-center gap-1 pr-1 pl-1.5 text-[11px] font-medium text-muted-foreground">
        <Plus aria-hidden="true" className="size-3.5" />
        Add
      </span>
      {creatableNodeTypes(level).map(({ keyword, type }) => (
        <button
          key={keyword}
          type="button"
          onClick={() => onCreate(type)}
          title={`Add a ${keyword} element to this diagram`}
          className="rounded-md px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {keyword}
        </button>
      ))}
    </div>
  );
}
