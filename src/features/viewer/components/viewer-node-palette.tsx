"use client";

/**
 * The Add strip: one button per node type the CURRENT diagram level admits,
 * rendered under the breadcrumb while the canvas is editable.
 *
 * ALWAYS-VISIBLE BUTTONS, not a popover — for BOTH halves, the types and the
 * references. A menu is a second click and a dismissal contract
 * (outside-click, Escape) that would have to negotiate with the canvas's own
 * Escape ladder. A level offers at most five types, so that half fits in one
 * row of the chrome the toolbar already wears; the reference half's list
 * grows with the model instead, so it wraps and is capped — see the note on
 * the group below — rather than earning back the dropdown it replaced.
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

import { ArrowUp, Plus } from "lucide-react";

import { LEVEL_LABEL } from "@/lib/constants";
import type { C4Level, C4NodeType, ExternalRef } from "@/types";

import { creatableNodeTypes } from "../lib/node-palette";
import type { ReferenceableNode } from "../lib/node-palette";

export function ViewerNodePalette({
  level,
  onCreate,
  references,
  onCreateRef,
}: {
  /** The level of the diagram on screen — it decides which types are legal. */
  level: C4Level;
  /** Add one node of `type` to the current diagram. */
  onCreate: (type: C4NodeType) => void;
  /**
   * The ancestors' nodes this diagram may mirror as `^ref` placeholders,
   * already filtered by `referenceableNodes` — the same derivation the host's
   * guard reads, so every option here is one the host will honour.
   */
  references: readonly ReferenceableNode[];
  /** Mirror `source` into this diagram as a boundary placeholder. */
  onCreateRef: (source: ExternalRef) => void;
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
      {/* BUTTONS HERE TOO, replacing the dropdown this half shipped as, for
          the header's reason: picking from a select was a second interaction
          with its own dismissal contract, for a list that is usually two or
          three names. Unlike the type half this list GROWS with the model —
          a context diagram's every node is a candidate deeper down — so the
          group WRAPS into rows and is CAPPED at about three of them with its
          own scrollbar. The two alternatives were weighed and lose: unbounded
          wrapping lets a large model's strip eat the canvas the palette sits
          over, and a "+N more" popover reintroduces exactly the dismissal
          contract buttons were chosen to avoid. The scrollbar is the honest
          overflow affordance — every candidate stays visible or one scroll
          away, none behind a click. The group disappears entirely when
          nothing may be referenced (the root diagram, or a diagram that
          already mirrors everything above it), because an empty group is a
          promise the model cannot keep. */}
      {references.length > 0 ? (
        <div className="flex min-w-0 items-start gap-1 border-l border-border/70 pl-1.5">
          <ArrowUp
            aria-hidden="true"
            className="mt-1.5 size-3.5 shrink-0 text-muted-foreground"
          />
          <div
            role="group"
            aria-label="Reference an element from a level above"
            className="flex max-h-20 min-w-0 flex-wrap items-center gap-0.5 overflow-y-auto"
          >
            {references.map(({ sourceDiagramId, sourceLevel, node }) => (
              <button
                key={`${sourceDiagramId}/${node.id}`}
                type="button"
                onClick={() =>
                  onCreateRef({ diagramId: sourceDiagramId, nodeId: node.id })
                }
                title={`Mirror ${node.name} from the ${LEVEL_LABEL[sourceLevel]} view into this diagram`}
                className="flex min-w-0 items-baseline gap-1 rounded-md px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {/* The NAME is the choice; the level is its address. Muted
                    and smaller so two same-named elements at different
                    levels stay tellable apart without the address shouting
                    over every button. */}
                <span className="max-w-[9rem] truncate">{node.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {LEVEL_LABEL[sourceLevel]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
