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
 * page nobody visits with a diagram in front of them. So the menu carries a
 * one-line note when elements are placed, and a row that releases them. The
 * counts come from `layerPlacement`, which reads the fact the PARSER recorded
 * about the source; counting `(` here would be a second opinion about the
 * thing the note is asserting.
 *
 * THE NOTE IS ABOVE EVERY ROW IT QUALIFIES, which is why it is not inside a
 * section. It sat in the layer section for a release, so a reader pressing
 * `Whole file` — the same press, the same evidence, the same diagram sitting
 * still — was told nothing, while the reader pressing `This layer` was told.
 * One note at the top says it once and says it before all four rows;
 * repeating it under each heading would say the same sentence twice in a menu
 * two sentences tall.
 *
 * THE RELEASE ROW STAYS UNDER `This layer`, alone, because it releases exactly
 * one layer — `resetLayerPositionsEdit` argues why there is no file-wide one.
 * A second copy under `Whole file` would be one act offered twice under one
 * label, leaving the reader to guess which of the two reached further. It sits
 * in the first section, so it is already on screen when the note is read.
 *
 * AND WHEN THE PRESS CHANGED NOTHING, THIS MENU STAYS OPEN. A toast was built
 * for that moment first and rejected: it appeared in a screen corner, a whole
 * canvas away from the row that had just been pressed, so it read as a
 * notification about the app rather than as the answer to the press — and it
 * offered as its action a remedy this menu already holds one line further
 * down. Staying open costs no component at all. The note changes tense, from
 * a caveat about what a direction will not move to a report of what just did
 * not move, and the release row is already under the reader's pointer.
 *
 * A PRESS THAT DID RE-LAY THE DIAGRAM STILL CLOSES IT. A menu that never
 * closes is a worse control than the toast was: the reader's evidence for "it
 * worked" is seeing the picture, and this menu sits over a corner of it.
 * `directionInertWarning` decides which of the two happened — the same
 * function that words the report — so the menu cannot stay open on a press it
 * would then describe as having moved things.
 *
 * WHICH IS WHY THE DIRECTION ROWS ARE `menuitemradio` AND THE OTHER ROWS ARE
 * NOT. Activating a `menuitem` conventionally dismisses its menu; a radio in a
 * menu conventionally does not, because the reader may be weighing options.
 * The direction rows were already radios — they carry `aria-checked` and the
 * one in force is checked rather than pressable-and-inert — so a menu that
 * survives one of those presses is what the role already promised, not a
 * surprise bolted onto it. The clearing and release rows stay `menuitem` and
 * stay closing: each takes a line out of the document, and there is nothing
 * left to weigh afterwards.
 *
 * FOCUS IS LEFT WHERE THE PRESS PUT IT — on the row that was pressed, which a
 * native `<button>` click already focuses. There is no roving `tabindex` and
 * no focus trap in this menu (or in `zoom-menu.tsx`, whose anatomy it shares),
 * so the release row is one or two Tab stops below the pressed row and needs
 * no reopening, and Escape still closes through `useMenuDismissal`. Moving
 * focus programmatically onto the release row was rejected: it would put the
 * reader's caret on a destructive row they had not chosen.
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
/* The past-tense half of the note, and the test for whether the press moved
   anything — both from the gesture module, so the sentence this menu shows and
   the sentence the live region announces cannot be worded apart. */
import {
  directionInertWarning,
  type LayerPlacement,
} from "../input/canvas-edit";

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
 * The note above every direction row BEFORE anything is pressed: what a
 * direction will not move.
 *
 * THE FUTURE-TENSE HALF. After a press that moved nothing the same slot shows
 * `directionInertWarning`'s sentence instead — "Nothing in this layer moved …"
 * rather than "… won't move". Two tenses for one fact, because a caveat read
 * after the act is not a caveat, and a report worded as a warning leaves the
 * reader unsure whether the press landed. They are deliberately different
 * strings, not one string with a verb swapped: the sentence a reader is
 * looking at is how they know which of the two moments they are in.
 *
 * WORDED FROM THE COUNTS rather than chosen from three fixed strings, because
 * the mixed case is the one that has to be exact. "3 of 7 elements are placed
 * by hand" is the sentence that explains a diagram which half-moved; a reader
 * told only that "some elements are placed" has learned nothing they can act
 * on, and a reader told nothing concludes the control is broken.
 *
 * WORDED FOR THE LAYER ON SCREEN AT BOTH SCOPES, and deliberately so. There is
 * no file-wide release, so a sentence promising anything about the diagrams
 * nobody is looking at would promise more than any row here delivers. "These
 * elements are placed by hand" is true of the diagram in front of the reader
 * whichever scope they press, and the remedy offered releases exactly that.
 *
 * `null` when the layout places everything — then there is nothing to warn
 * about and the menu is the four rows it always was.
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
  /**
   * Whether a direction row has been pressed in this opening and moved
   * nothing — which is the only reason this menu is still on screen.
   *
   * It switches the note's tense and nothing else. Cleared with every
   * open and every close, so reopening the menu shows the caveat again rather
   * than a report of a press the reader has since scrolled past.
   */
  const [reported, setReported] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // The dismissal contract lives in the shared hook — see `menu-dismissal.ts`
  // for the Escape-consumption and pointerdown arguments it carries.
  const closeMenu = useCallback(() => {
    setOpen(false);
    setReported(false);
  }, []);
  useMenuDismissal(open, closeMenu, wrapperRef);

  /* What the diagram is ACTUALLY laid out by, which is what the button shows:
     its own attribute if it has one, else the file's, else top-down. The rows
     tick the setting they would write, which is a different question — a
     diagram inheriting `lr` from the file shows "Left-right" on the button and
     a tick on the FILE row, because that is where the line lives. */
  const effective: C4LayoutDirection = layerDirection ?? fileDirection ?? "tb";

  /* WHETHER THIS PRESS CAN CHANGE THE PICTURE AT ALL, asked of the gesture
     module rather than answered here. `placement` is already the parser's
     count; re-deriving the verdict from it in a component would be a second
     opinion about the thing the note is asserting. */
  const inert = placement === null ? null : directionInertWarning(placement);

  const choose = (scope: DirectionScope, direction: C4LayoutDirection) => {
    onApply(scope, direction);
    /* THE MENU SURVIVES A PRESS THAT MOVED NOTHING, and only that one. The
       reader who needs telling is standing at the row they just pressed with
       the release row one line below it; closing over an unchanged diagram is
       what read as a broken control. Everything else closes, because the
       proof it worked is the picture this menu is covering. */
    if (inert === null) {
      closeMenu();
      return;
    }
    setReported(true);
  };
  const clear = (scope: DirectionScope) => {
    closeMenu();
    onClear(scope);
  };
  const release = () => {
    closeMenu();
    onRelease();
  };

  /* ONE SLOT, TWO TENSES — see `placementNote`. The report is
     `directionInertWarning`'s own sentence, which is what keeps the note the
     reader sees and the announcement a screen reader hears from drifting. */
  const note =
    reported && inert !== null
      ? inert.message
      : placement === null
        ? null
        : placementNote(placement);
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
        onClick={() => {
          // Every opening starts on the caveat, never on a report of the
          // press before it.
          setReported(false);
          setOpen((value) => !value);
        }}
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
          {/* ABOVE EVERY ROW, AT BOTH SCOPES: it is the reason any of them may
              do nothing, and a caveat read after the press arrived too late.
              Outside the sections, because gating it on the layer section left
              the reader who pressed "Whole file" with no note at all.

              NOT A LIVE REGION, deliberately — `applyDirection` announces the
              same fact into the one the page already owns, and the same
              sentence in two live regions is one a screen-reader user hears
              twice. This is the sighted reader's channel; that is theirs.

              The report is weighted and the caveat is not: fine print is the
              right register for something that has not happened yet, and the
              wrong one for the answer to a press. */}
          {note !== null ? (
            <p
              className={cn(
                "mb-1 max-w-56 border-b border-border px-2.5 pt-0.5 pb-1.5 text-[11px] leading-snug",
                reported ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {note}
            </p>
          ) : null}
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
                    same kind of act: taking a line out of the document. Under
                    "This layer" only: it releases one layer, and a second copy
                    under the file heading would be one act offered twice under
                    one label. */}
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
