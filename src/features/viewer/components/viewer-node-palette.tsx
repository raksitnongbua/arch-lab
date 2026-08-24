"use client";

/**
 * The Add strip: one button per node type the CURRENT diagram level admits,
 * rendered under the breadcrumb while the canvas is editable.
 *
 * THE TWO HALVES TAKE TWO SHAPES, and the split follows the size of what each
 * offers. The TYPE half is always-visible buttons: a level offers at most five
 * types, they fit in one row of the chrome the toolbar already wears, and a
 * menu would spend a second click on a list that never grows. The REFERENCE
 * half is a click-to-open menu, because its list grows with the model — a
 * context diagram's every node is a candidate deeper down — and it shipped as
 * inline buttons first: on a real model the wrapped rows (capped with their
 * own scrollbar) crowded the strip, and the product owner asked for a menu.
 * The dismissal contract a menu owes over this canvas is already solved one
 * control away: `useMenuDismissal`, shared with the zoom menu, closes on
 * outside pointerdown and CONSUMES Escape so one press closes the menu without
 * also clearing the canvas selection — the negotiation with the canvas's
 * Escape ladder that kept a menu out of this strip until the hook existed.
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

import { useCallback, useId, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";

import { useMenuDismissal } from "@/components/ui/menu-dismissal";
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
  const [refsOpen, setRefsOpen] = useState(false);
  const refWrapperRef = useRef<HTMLDivElement>(null);
  const refMenuId = useId();
  const closeRefs = useCallback(() => setRefsOpen(false), []);
  useMenuDismissal(refsOpen, closeRefs, refWrapperRef);

  const chooseRef = (source: ExternalRef): void => {
    setRefsOpen(false);
    onCreateRef(source);
  };

  return (
    <div
      role="group"
      aria-label="Add an element to this diagram"
      className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur"
    >
      {/* The group's visible NAME, not a control, and styled apart from the
          buttons on purpose: same-size sentence-case text beside them read as
          one more button (product-owner report). An uppercase micro-label with
          no hover face and a divider is the register the details panel already
          uses for its term labels, so it reads as "what this row is" — while
          the Plus glyph still makes the mono keywords read as actions rather
          than a legend of what is on the canvas. The word stays visible (never
          icon-only) so the group's aria-label and what a sighted reader sees
          begin with the same word. */}
      <span className="flex items-center gap-1 border-r border-border/70 py-1 pr-2 pl-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
        <Plus aria-hidden="true" className="size-3" />
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
      {/* A MENU, replacing the inline buttons this half wore last — see the
          header for the split's argument. The whole group is still WITHHELD
          when nothing may be referenced (the root diagram, or a diagram that
          already mirrors everything above it): a trigger that opens an empty
          menu is a promise the model cannot keep, and worse than no trigger. */}
      {references.length > 0 ? (
        <div
          ref={refWrapperRef}
          className="relative ml-0.5 border-l border-border/70 pl-1"
        >
          <button
            type="button"
            onClick={() => setRefsOpen((value) => !value)}
            aria-expanded={refsOpen}
            aria-haspopup="menu"
            aria-controls={refsOpen ? refMenuId : undefined}
            title="Mirror an element from a level above into this diagram"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowUp
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
            {/* Sentence case and NOT mono, unlike the keyword buttons beside
                it: this is not a word the source pane will gain (the text
                gains a `^diagram/node` token), and a mono lowercase label here
                would read as one more type. */}
            Reference
            <ChevronDown
              aria-hidden="true"
              className="size-3 text-muted-foreground"
            />
          </button>
          {refsOpen ? (
            <div
              id={refMenuId}
              role="menu"
              aria-label="Reference an element from a level above"
              /* Opens DOWNWARD: the strip sits under the breadcrumb at the
                 canvas's top, so down is where the room is — the zoom menu
                 makes the opposite call from its bottom pill for the same
                 reason. `max-h` + scroll is the menu's own overflow answer
                 (the inline half's wrap-cap is retired with the wrapping):
                 a model can offer more candidates than a canvas is tall. */
              className="af-glass absolute top-full left-0 z-20 mt-1.5 max-h-64 min-w-44 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
            >
              {references.map(({ sourceDiagramId, sourceLevel, node }) => (
                <button
                  key={`${sourceDiagramId}/${node.id}`}
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    chooseRef({ diagramId: sourceDiagramId, nodeId: node.id })
                  }
                  title={`Mirror ${node.name} from the ${LEVEL_LABEL[sourceLevel]} view into this diagram`}
                  className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                >
                  {/* The NAME is the choice; the level is its address. Muted
                      and smaller so two same-named elements at different
                      levels stay tellable apart without the address shouting
                      over every row. */}
                  <span className="min-w-0 flex-1 truncate">{node.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {LEVEL_LABEL[sourceLevel]}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
