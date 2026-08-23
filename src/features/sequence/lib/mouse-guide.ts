/**
 * HOW TO EDIT THIS CANVAS WITH A MOUSE, written down once and rendered twice —
 * in the hint bar under the diagram and in the feature tour.
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
 * prefix instead of a list.
 *
 * THESE STRINGS ARE A CONTRACT with the controls they describe. Each names a
 * control by the label, glyph or menu the reader can actually see, so changing
 * a control means rewording its line here. Two rules on the wording, both of
 * them things a reader has already been misled by:
 *
 *   - NAME ONLY GESTURES THAT EXIST. There is no drag on this canvas, notes and
 *     fragments have no canvas gesture, and a participant's column cannot be
 *     reordered here. `SEQUENCE_MOUSE_GUIDE_CAVEAT` says the first two out
 *     loud, because a reader who tries a gesture that quietly does nothing
 *     concludes the feature is broken rather than absent.
 *   - SAY WHAT TO CLICK, not what is possible. "Endpoints can be changed" sends
 *     a reader hunting; "the From and To menus" does not.
 *
 * PURITY IS LOAD-BEARING: `check:canvas-edit` loads this through Node's type
 * stripping, which cannot read `.tsx`. The one import below is `import type`
 * and is erased, which is what keeps that true while still typing the keys
 * against the component's own contract.
 */

import type { SequenceEditHandlers } from "../components/sequence-viewer";

/**
 * One mouse path per gesture the canvas offers, in the order the guide reads
 * them: what you can do to a message, then to a lifeline, then to the whole
 * diagram. Object key order IS that order — the guide is built from
 * `Object.entries`, so there is no second list to keep in step.
 */
const MOUSE_PATH: Record<keyof SequenceEditHandlers, string> = {
  onReviseMessage:
    "click an arrow or its label, then the pencil in the details panel, to rewrite its wording",
  onRepointMessage:
    "the panel's From and To menus move the arrow between lifelines — or press “Repoint on the canvas” and click the two lifelines in turn",
  onDeleteMessage: "“Remove this message” at the foot of that panel",
  onReviseParticipant:
    "click a lifeline's card, then the same pencil, to rename it",
  onDeleteParticipant:
    "“Remove this lifeline” goes once nothing points at it any more",
  onInsertMessage:
    "+ in the bottom-left pill, then the sending lifeline, then the receiving one",
  onInsertParticipant: "the figure beside + adds a lifeline at the end",
  onToggleAutonumber: "the numbered-list icon numbers every step",
};

/** One gesture, as the guide presents it. */
export interface SequenceMouseGesture {
  /** The `SequenceEditHandlers` key this line teaches. */
  handler: string;
  /** The mouse path, in the words the controls themselves carry. */
  mouse: string;
}

/** The gesture list, ordered. Derived, so it cannot omit a handler. */
export const SEQUENCE_MOUSE_GESTURES: readonly SequenceMouseGesture[] =
  Object.entries(MOUSE_PATH).map(([handler, mouse]) => ({ handler, mouse }));

/**
 * The gesture list as one line, for the hint bar under the canvas. `·` is the
 * separator that bar already uses for its focus and zoom clauses, so the
 * editing line reads as another row of the same list rather than as a
 * different kind of text.
 */
export const SEQUENCE_MOUSE_GUIDE = SEQUENCE_MOUSE_GESTURES.map(
  (gesture) => gesture.mouse,
).join(" · ");

/**
 * What the mouse does NOT do here. Second sentence of the guide, and the more
 * useful half for a reader arriving from a drawing tool: the canvas owns
 * primary-button drag for panning (`handlePointerDown`), so dragging a message
 * moves the view and not the message — which is indistinguishable from a broken
 * canvas unless somebody says so.
 */
export const SEQUENCE_MOUSE_GUIDE_CAVEAT =
  "Dragging pans the view — nothing on the canvas is moved by dragging, and notes and fragments are edited in the source text beside it.";
