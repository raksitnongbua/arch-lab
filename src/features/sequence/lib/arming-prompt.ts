/**
 * What an ARMED two-click gesture tells the reader to do next — in ONE place,
 * because it has to reach two audiences and it used to reach only one.
 *
 * THE BUG THIS MODULE IS. The insert and repoint gestures are "press a button,
 * then click two lifelines", and the sentence saying so was written straight
 * into `onAnnounce`. The playground renders that live region as
 * `<p aria-live="polite" className="sr-only">`, so the instruction existed for
 * assistive technology and for nobody else. A mouse user pressed “Repoint on
 * the canvas”, watched the edit form close, saw a dashed rule appear, and was
 * never told that two clicks were owed — so the gesture read as a control that
 * does nothing, and was reported as one. The gesture was correct the whole
 * time; it was unreadable.
 *
 * So the wording lives here and the viewer uses it TWICE: once for the live
 * region, once for a prompt on screen. Deriving both from one function rather
 * than writing the sentence twice is `dry.md`'s rule and also the only thing
 * that keeps the two from drifting — a visible prompt that says something
 * slightly different from the announcement is worse than no prompt, because a
 * reader comparing them cannot tell which is the truth.
 *
 * PURITY IS LOAD-BEARING here for the same reason it is in
 * `playground/input/sequence-edit.ts`: `check:canvas-edit` loads this through
 * Node's type stripping, which cannot read `.tsx`. Keep the imports pointed at
 * pure modules — the chrome prefix below is the only one it needs.
 */

import { SEQUENCE_CHROME_CLASS_PREFIX } from "./chrome";

/**
 * The class the on-screen prompt carries.
 *
 * DERIVED FROM THE PREFIX, not spelled out, so it cannot drift from the
 * exporter's selector. The prompt is rendered by `sequence-viewer.tsx` as HTML
 * OUTSIDE the `<svg>` the exporter clones (`export/render-svg.ts` takes
 * `svg.af-seq-svg` and nothing above it), so today it cannot reach a file at
 * all. It carries the prefix anyway: `chrome.ts` states the test — a reader
 * holding a still image loses nothing by its absence — and an instruction to
 * click something is the purest case of that. Naming it this way now means
 * moving the prompt into the drawing later cannot leak it into every SVG, PNG
 * and GIF frame, which is the failure the prefix exists to make impossible.
 * `check:sequence-export` pins that the drawing never renders it.
 */
export const ARMING_PROMPT_CLASS = `${SEQUENCE_CHROME_CLASS_PREFIX}prompt`;

/** What the armed gesture is about to do, as the prompt needs to know it. */
export interface ArmingPromptState {
  purpose: "insert" | "repoint";
  /**
   * For an insert, the step the new message will follow — `null` meaning the
   * end of the flow, which is what "nothing is focused" comes to. For a
   * repoint, the step being moved, which is never `null`.
   */
  step: number | null;
  /**
   * The DISPLAY NAME of the sending lifeline once it has been clicked, `null`
   * while that click is still owed. A name rather than an id: the reader is
   * being asked to compare it with a card on the canvas, and the card shows the
   * name.
   */
  fromName: string | null;
}

/**
 * The one sentence the reader needs: what to click now, what it will do, and
 * how to get out.
 *
 * ESCAPE IS NAMED IN EVERY BRANCH, including the second click, which the
 * announcement used to leave out. Half of a two-click gesture is exactly where
 * a reader most needs to know there is a way back — they have already committed
 * one click to something they may have misread.
 */
export function armingPrompt(state: ArmingPromptState): string {
  if (state.fromName !== null) {
    return `Sending from ${state.fromName}. Now click the receiving lifeline. Escape cancels.`;
  }
  const what =
    state.purpose === "repoint"
      ? `Repointing step ${state.step}`
      : state.step === null
        ? "Inserting a message at the end of the flow"
        : `Inserting a message after step ${state.step}`;
  const which = state.purpose === "repoint" ? "the new sending" : "the sending";
  return `${what}. Click or tab to ${which} lifeline, then the receiving one. Escape cancels.`;
}

/**
 * What the reader is told when they back out. Here rather than at the call site
 * so the two halves of one gesture's vocabulary stay together — a cancel
 * message that named the gesture differently from the prompt would read as a
 * different feature answering.
 */
export function armingCancelled(purpose: ArmingPromptState["purpose"]): string {
  return purpose === "insert" ? "Insert cancelled." : "Repoint cancelled.";
}
