/**
 * HOW TO EDIT THIS CANVAS WITH A MOUSE, written down once and rendered twice —
 * as a strip of icon affordances under the diagram, and as prose in the feature
 * tour.
 *
 * WHY THIS EXISTS AS A MODULE rather than as prose in the component. Twice on
 * this branch a reader could not find a control that was already shipped and
 * already correct: the endpoint gesture, whose instruction only ever reached a
 * screen reader, and the numbering flag, which had no control at all. In both
 * cases every check passed, because no check asked whether the page NAMES what
 * the canvas can do. `check:canvas-edit` now derives that question from
 * `SequenceEditHandlers` — the same contract section 14 derives reachability
 * from — so a gesture added to the canvas fails the guide until the guide grows.
 *
 * A `Record` KEYED BY THE HANDLER, deliberately, and this is the load-bearing
 * shape rather than a nicety: a new key on `SequenceEditHandlers` is a MISSING
 * PROPERTY here, which is a type error before it is a failing check. A
 * hand-listed array of sentences could not notice the gesture it had never
 * heard of, which is `codebase.md` habit 4 and the reason `chrome.ts` reads a
 * prefix instead of a list. `SequenceGuideIcon` extends that one step further:
 * the viewer's glyph table is `Record<SequenceGuideIcon, LucideIcon>`, so a new
 * icon name here is a missing property THERE.
 *
 * WHY IT IS AN ICON STRIP AND NOT A SENTENCE ANY MORE. It shipped as one long
 * line naming eight gestures plus a caveat, and it was reported as too much to
 * read — correctly: it was a paragraph doing a toolbar's job, and a reader
 * scanning for "how do I move this" had to parse prose to find a glyph. So each
 * gesture now leads with THE GLYPH ITS REAL CONTROL CARRIES, which is the thing
 * the reader has to match on screen, and the sentence follows as the item's
 * accessible name and its hover text. Nothing was deleted — the full prose is
 * still assembled here (`SEQUENCE_MOUSE_GUIDE`) and still read out in the tour
 * card, which is the surface a reader opens to be taught rather than reminded.
 *
 * THREE RULES ON THE CONTENT, each one something a reader has already been
 * misled by:
 *
 *   - NAME ONLY GESTURES THAT EXIST, and keep the caveat honest about the one
 *     gesture readers try first. A message drags up and down to move in time; a
 *     lifeline header drags sideways to move its column. What neither does is
 *     POSITION anything — nothing here has
 *     coordinates, so a box does not stay where it is dropped, it takes a
 *     neighbour's slot. `SEQUENCE_MOUSE_GUIDE_CAVEAT` says all three parts,
 *     because a reader arriving from a drawing tool assumes the opposite of
 *     each.
 *   - SAY WHAT TO CLICK, not what is possible. "Endpoints can be changed" sends
 *     a reader hunting; "the From and To menus" does not.
 *   - THE ICON MUST BE THE CONTROL'S OWN ICON. A legend showing a glyph the
 *     screen does not carry is worse than no legend: it is a control the reader
 *     will look for and never find. `check:canvas-edit` pins each name to the
 *     table the viewer renders it from.
 *
 * PURITY IS LOAD-BEARING: `check:canvas-edit` loads this through Node's type
 * stripping, which cannot read `.tsx`. The one import below is `import type`
 * and is erased — which is also why an icon is a NAME here rather than a
 * component; importing `lucide-react` would put a React package on the path of
 * a module whose only harness cannot load one.
 */

import type { SequenceEditHandlers } from "../components/sequence-viewer";

/**
 * The glyphs the guide may show. A closed union rather than `string` so the
 * viewer's `Record<SequenceGuideIcon, LucideIcon>` cannot be missing one — the
 * same "a new key is a type error" shape the handler record has.
 *
 * Every name here is a glyph the canvas ALREADY renders on the control it
 * describes, which is the whole point of showing it.
 */
export type SequenceGuideIcon =
  | "pencil"
  | "arrow-left-right"
  | "arrow-up-down"
  | "columns"
  | "trash"
  | "user-minus"
  | "plus"
  | "user-plus"
  | "list-ordered";

/** One gesture, as the guide presents it. */
export interface SequenceMouseGesture {
  /** The `SequenceEditHandlers` key this entry teaches. */
  handler: string;
  /** The glyph the real control carries — the thing the reader matches. */
  icon: SequenceGuideIcon;
  /**
   * Two or three words naming the EFFECT, not the mechanism: this is what is
   * on screen, so it has to be readable at a glance and has to say what the
   * reader gets rather than which control does it.
   */
  label: string;
  /** The mouse path, in the words the controls themselves carry. The item's
   * accessible name and its hover text — the long half, kept but demoted. */
  mouse: string;
}

/**
 * One entry per gesture the canvas offers, in the order the guide reads them:
 * what you can do to a message, then to a lifeline, then to the whole diagram.
 * Object key order IS that order — the guide is built from `Object.entries`, so
 * there is no second list to keep in step.
 */
const MOUSE_PATH: Record<
  keyof SequenceEditHandlers,
  Omit<SequenceMouseGesture, "handler">
> = {
  onReviseMessage: {
    icon: "pencil",
    label: "Reword a step",
    mouse:
      "click an arrow or its label, then the pencil in the details panel, to rewrite its wording",
  },
  onRepointMessage: {
    icon: "arrow-left-right",
    label: "Change ends",
    mouse:
      "the panel's From and To menus move the arrow between lifelines — or press “Repoint on the canvas” and click the two lifelines in turn",
  },
  onReorderMessage: {
    icon: "arrow-up-down",
    label: "Move a step in time",
    mouse:
      "drag an arrow up or down to move it earlier or later, or hold Alt and press the up and down arrow keys on the focused step",
  },
  onDeleteMessage: {
    icon: "trash",
    label: "Remove a step",
    mouse: "“Remove this message” at the foot of that panel",
  },
  onReviseParticipant: {
    icon: "pencil",
    label: "Rename a lifeline",
    mouse: "click a lifeline's card, then the same pencil, to rename it",
  },
  onReorderParticipant: {
    icon: "columns",
    label: "Move a column",
    mouse:
      "drag a lifeline's card left or right to move its column, or hold Alt and press the left and right arrow keys on the focused lifeline",
  },
  onDeleteParticipant: {
    icon: "user-minus",
    label: "Remove a lifeline",
    mouse: "“Remove this lifeline” goes once nothing points at it any more",
  },
  onInsertMessage: {
    icon: "plus",
    label: "Add a step",
    mouse:
      "+ in the bottom-left pill, then the sending lifeline, then the receiving one",
  },
  onInsertParticipant: {
    icon: "user-plus",
    label: "Add a lifeline",
    mouse: "the figure beside + adds a lifeline at the end",
  },
  onToggleAutonumber: {
    icon: "list-ordered",
    label: "Number the steps",
    mouse: "the numbered-list icon numbers every step",
  },
};

/** The gesture list, ordered. Derived, so it cannot omit a handler. */
export const SEQUENCE_MOUSE_GESTURES: readonly SequenceMouseGesture[] =
  Object.entries(MOUSE_PATH).map(([handler, entry]) => ({ handler, ...entry }));

/**
 * The gesture list as one line, for the feature tour's card. `·` is the
 * separator the viewer's hint bars already use for their focus and zoom
 * clauses, so the editing list reads as another row of the same text.
 *
 * STILL DERIVED FROM THE SAME RECORD even though the strip under the canvas no
 * longer renders it. The tour is where a reader goes to be TAUGHT, and prose is
 * the right shape there; the strip is where they go to be reminded, and a glyph
 * is the right shape there. What must never happen again is the two of them
 * being written twice — that is how the tour came to describe the endpoint
 * gesture in words the panel no longer used.
 */
export const SEQUENCE_MOUSE_GUIDE = SEQUENCE_MOUSE_GESTURES.map(
  (gesture) => gesture.mouse,
).join(" · ");

/**
 * What the mouse does NOT do here — three clauses, one per assumption a reader
 * arriving from a drawing tool brings with them.
 *
 * THE VALUABLE HALF IS THE THIRD CLAUSE. A reader arriving from a drawing
 * tool assumes a drag POSITIONS the thing they dragged; here it cannot, because
 * there is nowhere in the format to write a position down — a drag hands the
 * element a neighbour's SLOT and the layout re-solves everything else. Saying
 * that up front is what stops the first drag from reading as a canvas that
 * snaps back.
 */
export const SEQUENCE_MOUSE_GUIDE_CAVEAT =
  "Dragging a message or a lifeline card reorders it; dragging bare canvas pans the view. Nothing here is positioned — a dragged element takes a neighbour's place in the order rather than staying where you drop it, and notes and fragments are edited in the source text beside the diagram.";

/**
 * What the strip says when the canvas is READ-ONLY, and the reason it exists at
 * all is layout rather than wording.
 *
 * The legend used to render only while editing was on. Once the canvas started
 * LOCKED by default, that made pressing Edit reveal a row and — because the
 * drawing is pane-fitted — rescale the whole diagram, so a reader's first act
 * on the canvas resized it. The strip is now always present and swaps its
 * CONTENTS, which means the read-only state needs a sentence of its own.
 *
 * It names the control rather than the gesture: a locked canvas offers exactly
 * one action, and a legend of eight gestures a reader cannot use yet would be
 * the "shipped control nobody can find" failure inverted — eight they can see
 * and none they can do.
 */
export const SEQUENCE_READ_ONLY_HINT =
  "Read-only — press Edit above to change this diagram on the canvas.";
