"use client";

/**
 * The layout-direction control, beside the canvas lock: one small button that
 * opens a menu of OUTCOMES.
 *
 * WHY IT LIVES HERE AND NOT IN THE VIEW-CONTROLS PILL. The pill at the
 * canvas's bottom right — zoom, fit, the minimap, mono — changes what the
 * READER sees and touches no file. This changes the document: it writes a
 * `direction` line, and the next person to open the text sees it. Controls
 * that edit belong with the padlock that governs editing, and this one is only
 * mounted while that padlock is open, so it cannot be pressed on a shared link
 * or a locked canvas.
 *
 * TWO REDESIGNS, AND BOTH FAILURES ARE WORTH KEEPING WRITTEN DOWN.
 *
 * The first offered `File · Top-down · Left-right` as three DIRECTIONS, with
 * `File` meaning "inherit". It conflated which way with how widely, and
 * pressing `File` did nothing for the common case — a diagram with no
 * attribute of its own is already inheriting, so that button was the state in
 * force. It also left no way to set the file's direction at all.
 *
 * The second split scope out as its own segmented control: `This layer |
 * Whole file` beside `Top-down | Left-right`. Correct, and still wrong — four
 * chips in two groups is more chrome than a canvas corner has room for, every
 * two-word label wrapped mid-hyphen ("Top- / down"), and the reader had to
 * ASSEMBLE an outcome from two axes before anything happened.
 * `menu-item.ts` had already written the rule that kills it: "a menu should
 * say what you GET, not make you assemble it."
 *
 * So: one row per outcome, and the anatomy is `zoom-menu.tsx`'s — trigger,
 * shared dismissal hook, real `<button>` rows. No row can be one whose press
 * does nothing: the row in force is CHECKED rather than pressable-and-inert,
 * and a clearing row exists only where there is a line to remove.
 *
 * THE THIRD PASS WAS ABOUT LENGTH, and it is why scope is a heading. The rows
 * read "Top-down, this layer" / "Left-right, whole file" with the `.alab` line
 * each would write spelled underneath in mono — four rows of that is a
 * paragraph in the corner of a canvas, and it said the scope four times to
 * mean two things. A heading says it once and leaves each row a shape and two
 * words; the line it writes moved into the row's `title`, where it is there
 * for the reader who wants it and out of the way of the one who just wants
 * the picture turned. The trigger lost its label for the same reason and one
 * more: the padlock it shares a slot with has always been its glyph alone, and
 * a labelled neighbour reads as a different KIND of control rather than a
 * second one of the same kind.
 *
 * The glyphs are the shapes, not letters: a column of bars for top-down, a row
 * of them for left-to-right. A reader reaches for this because the picture is
 * the wrong shape, so the control shows shapes.
 *
 * AND IT SAYS WHAT IT CANNOT DO, AT THE MOMENT OF PRESSING. Geometry beats the
 * direction per element, so on a diagram somebody has arranged by hand this
 * menu's rows write a line and move nothing — which read as a broken control
 * for as long as the only place that fact was written down was `/validate`, a
 * page nobody visits with a diagram in front of them. So the layer's section
 * carries a one-line note when elements are placed, and a row that releases
 * them. The counts come from `layerPlacement`, which asks the SERIALIZER
 * whether a line carries geometry; counting `(` here would be a second
 * opinion about the thing the note is asserting.
 *
 * THE NOTE IS ONLY HALF OF IT, and knowing which half matters when editing
 * this file: the note is read BEFORE the press and this menu closes on the
 * press, so a reader who pressed anyway is told again afterwards, by the
 * toast `applyDirection` raises — whose action is this section's release row
 * under the same label. Reword the row and both follow, because both take it
 * from `resetLayerLabel`.
 */

import { useCallback, useId, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { useMenuDismissal } from "@/components/ui/menu-dismissal";
import { cn } from "@/lib/utils";
import type { C4LayoutDirection } from "@/types";

/* One spelling of the row's label, shared with the announcement that points a
   reader at it and with the validator's advice — see `resetLayerLabel`. */
import { resetLayerLabel } from "@/lib/prose";
import type { LayerPlacement } from "../input/canvas-edit";

/** Which document line a press writes. */
export type DirectionScope = "layer" | "file";

function DirectionGlyph({
  value,
  className,
}: {
  value: C4LayoutDirection;
  className?: string;
}) {
  return value === "tb" ? (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <rect x="3" y="1" width="6" height="2.4" rx="0.6" />
      <rect x="3" y="4.8" width="6" height="2.4" rx="0.6" />
      <rect x="3" y="8.6" width="6" height="2.4" rx="0.6" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <rect x="1" y="3" width="2.4" height="6" rx="0.6" />
      <rect x="4.8" y="3" width="2.4" height="6" rx="0.6" />
      <rect x="8.6" y="3" width="2.4" height="6" rx="0.6" />
    </svg>
  );
}

/**
 * The menu's two sections. Scope is a HEADING, not part of every row's label.
 *
 * It was in the labels first — "Top-down, this layer", "Left-right, whole
 * file" — with the line each would write spelled underneath in mono. Four rows
 * of that is a paragraph in a corner of a canvas, and it repeated the scope
 * four times to say two things. A heading says it once, which leaves the row
 * itself two words and a shape.
 *
 * The `.alab` line each choice writes is still there, in the row's `title`:
 * useful to the reader who wants to know what lands in their file, and not in
 * the way of the one who just wants the picture turned.
 */
const SECTIONS: readonly {
  scope: DirectionScope;
  heading: string;
  /** What removing this scope's setting is called, in the reader's terms. */
  clearLabel: string;
  clearTitle: string;
}[] = [
  {
    scope: "layer",
    heading: "This layer",
    clearLabel: "Follow file",
    clearTitle: "Remove this diagram's direction= so it follows the file again",
  },
  {
    scope: "file",
    heading: "Whole file",
    clearLabel: "Clear",
    clearTitle: "Remove the file's direction line",
  },
];

const DIRECTIONS: readonly {
  value: C4LayoutDirection;
  label: string;
}[] = [
  { value: "tb", label: "Top-down" },
  { value: "lr", label: "Left-right" },
];

const WRITES: Record<DirectionScope, Record<C4LayoutDirection, string>> = {
  layer: {
    tb: "Writes direction=tb on this diagram's line",
    lr: "Writes direction=lr on this diagram's line — folds a long flow into bands",
  },
  file: {
    tb: "Writes direction tb in the file header",
    lr: "Writes direction lr in the file header — folds a long flow into bands",
  },
};

/**
 * The note above the layer's direction rows: what a direction will not move.
 *
 * WORDED FROM THE COUNTS rather than chosen from three fixed strings, because
 * the mixed case is the one that has to be exact. "3 of 7 elements are placed
 * by hand" is the sentence that explains a diagram which half-moved; a reader
 * told only that "some elements are placed" has learned nothing they can act
 * on, and a reader told nothing concludes the control is broken.
 *
 * `null` when the layout places everything — then there is nothing to warn
 * about and the section is the two rows it always was.
 */
function placementNote(placement: LayerPlacement): string | null {
  const held = placement.placed + placement.pinned;
  if (held === 0) return null;
  /* The pinned count is said SEPARATELY, never folded into the total: those
     are the elements the release row will leave behind, so a reader who
     presses it and finds one box unmoved was told why beforehand. */
  const pinnedTail =
    placement.pinned === 0
      ? ""
      : ` ${placement.pinned} ${placement.pinned === 1 ? "is pinned and keeps its place" : "are pinned and keep their places"}.`;
  if (held === placement.total) {
    return held === 1
      ? `The only element is placed by hand — a direction won't move it.${pinnedTail}`
      : `All ${held} elements are placed by hand — a direction won't move them.${pinnedTail}`;
  }
  return `${held} of ${placement.total} elements are placed by hand and won't move.${pinnedTail}`;
}

export function LayoutDirectionMenu({
  layerDirection,
  fileDirection,
  placement,
  onApply,
  onClear,
  onRelease,
}: {
  /** This diagram's own attribute, or null when it carries none. */
  layerDirection: C4LayoutDirection | null;
  /** The file's header line, or null when it has none. */
  fileDirection: C4LayoutDirection | null;
  /**
   * How much of the layer on screen is placed by hand — what decides the
   * note, the release row and the trigger's own tooltip. `null` for a
   * document this cannot be asked about, which renders the menu exactly as it
   * was before any of it existed.
   */
  placement: LayerPlacement | null;
  onApply: (scope: DirectionScope, direction: C4LayoutDirection) => void;
  onClear: (scope: DirectionScope) => void;
  /** Hand this layer's hand-written coordinates back to the layout. */
  onRelease: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // The dismissal contract lives in the shared hook — see `menu-dismissal.ts`
  // for the Escape-consumption and pointerdown arguments it carries.
  const closeMenu = useCallback(() => setOpen(false), []);
  useMenuDismissal(open, closeMenu, wrapperRef);

  /* What the diagram is ACTUALLY laid out by, which is what the button shows:
     its own attribute if it has one, else the file's, else top-down. The rows
     tick the setting they would write, which is a different question — a
     diagram inheriting `lr` from the file shows "Left-right" on the button and
     a tick on the FILE row, because that is where the line lives. */
  const effective: C4LayoutDirection = layerDirection ?? fileDirection ?? "tb";

  const choose = (scope: DirectionScope, direction: C4LayoutDirection) => {
    setOpen(false);
    onApply(scope, direction);
  };
  const clear = (scope: DirectionScope) => {
    setOpen(false);
    onClear(scope);
  };
  const release = () => {
    setOpen(false);
    onRelease();
  };

  const note = placement === null ? null : placementNote(placement);
  /* THE TRIGGER CARRIES IT TOO, because the menu's note is only read by
     somebody who has already opened the menu — and the reader most likely to
     be confused is the one who pressed a direction, saw nothing move, and is
     hovering the button wondering whether it did anything. */
  const held = placement === null ? 0 : placement.placed + placement.pinned;
  const heldSuffix =
    held === 0
      ? ""
      : ` — ${held} ${held === 1 ? "element" : "elements"} placed by hand`;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={`Layout runs ${effective === "lr" ? "left to right" : "top to bottom"} — choose a layout direction${heldSuffix}`}
        title={`Layout direction — ${effective === "lr" ? "left to right" : "top to bottom"}${heldSuffix}`}
        /* ONE GLYPH, NO LABEL, squared like the padlock beside it. The two
           controls share a slot, and the padlock has always been its icon
           alone — a labelled neighbour reads as a different KIND of control
           rather than a second one of the same kind. The state is in the
           glyph (bars stacked or bars in a row, which is the shape the
           diagram takes) and in the tooltip and accessible name; the words
           live in the menu, where there is room for them. */
        className={buttonClasses({
          variant: "outline",
          size: "sm",
          className:
            "w-8 border-border bg-card/90 px-0 text-foreground shadow-sm backdrop-blur",
        })}
      >
        <DirectionGlyph value={effective} className="size-3.5 shrink-0" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Layout direction"
          /* Opens DOWNWARD and to the right edge: this button sits at the
             canvas's top right beside the padlock, so there is room below it
             and none above. */
          className="af-glass absolute top-full right-0 z-20 mt-1.5 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {SECTIONS.map((section, index) => {
            const set =
              section.scope === "layer" ? layerDirection : fileDirection;
            return (
              <div
                key={section.scope}
                className={cn(index > 0 && "mt-1 border-t border-border pt-1")}
              >
                <p className="px-2.5 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {section.heading}
                </p>
                {/* ABOVE the rows, not below them: it is the reason the rows
                    may do nothing, and a caveat read after the press is a
                    caveat that arrived too late. Layer scope only — the file
                    section writes a default this menu cannot count the
                    consequences of across diagrams nobody is looking at. */}
                {section.scope === "layer" && note !== null ? (
                  <p className="max-w-56 px-2.5 pt-0.5 pb-1.5 text-[11px] leading-snug text-muted-foreground">
                    {note}
                  </p>
                ) : null}
                {DIRECTIONS.map((direction) => {
                  const inForce = set === direction.value;
                  return (
                    <button
                      key={direction.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={inForce}
                      title={WRITES[section.scope][direction.value]}
                      onClick={() => choose(section.scope, direction.value)}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs whitespace-nowrap transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                        inForce
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-3 shrink-0",
                          !inForce && "invisible",
                        )}
                      />
                      <DirectionGlyph
                        value={direction.value}
                        className="size-3 shrink-0"
                      />
                      {direction.label}
                    </button>
                  );
                })}
                {/* Only when this scope HAS a line to remove, which is what
                    keeps every row in this menu one that does something. */}
                {set !== null ? (
                  <button
                    type="button"
                    role="menuitem"
                    title={section.clearTitle}
                    onClick={() => clear(section.scope)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                  >
                    <span className="size-3 shrink-0" />
                    <RotateCcw aria-hidden="true" className="size-3 shrink-0" />
                    {section.clearLabel}
                  </button>
                ) : null}
                {/* ABSENT, not disabled, when nothing is placed — this menu's
                    founding rule: no row whose press does nothing. Same
                    anatomy as the clearing row above it, because it is the
                    same kind of act: taking a line out of the document. */}
                {section.scope === "layer" &&
                placement !== null &&
                placement.placed > 0 ? (
                  <button
                    type="button"
                    role="menuitem"
                    title={`Removes the (x,y) written on ${placement.placed} element ${placement.placed === 1 ? "line" : "lines"} in this layer. One undo.`}
                    onClick={release}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                  >
                    <span className="size-3 shrink-0" />
                    <RotateCcw aria-hidden="true" className="size-3 shrink-0" />
                    {resetLayerLabel(placement.placed)}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
