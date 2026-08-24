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
      {/* A SELECT, not more buttons: the type list is a level's fixed five at
          most, but the referenceable list grows with the model — a context
          diagram's every node is a candidate deeper down. It disappears
          entirely when nothing may be referenced (the root diagram, or a
          diagram that already mirrors everything above it), because an empty
          dropdown is a promise the model cannot keep. */}
      {references.length > 0 ? (
        <label className="flex items-center gap-1 border-l border-border/70 pl-1.5">
          <ArrowUp
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
          <span className="sr-only">
            Reference an element from a level above
          </span>
          <select
            value=""
            onChange={(event) => {
              const [diagramId, nodeId] = event.target.value.split("/");
              if (diagramId === undefined || nodeId === undefined) return;
              onCreateRef({ diagramId, nodeId });
              /* Reset to the prompt: the select is a COMMAND, not a state —
                 leaving the chosen option showing would suggest the strip
                 remembers a selection the diagram does not have. */
              event.target.value = "";
            }}
            title="Mirror an element from a level above into this diagram"
            className="max-w-[10rem] rounded-md bg-transparent px-1 py-1 text-[11px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">Reference…</option>
            {references.map(({ sourceDiagramId, sourceLevel, node }) => (
              <option
                key={`${sourceDiagramId}/${node.id}`}
                value={`${sourceDiagramId}/${node.id}`}
              >
                {node.name} — {LEVEL_LABEL[sourceLevel]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
