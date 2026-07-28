/**
 * Who owns the pane's text right now — the canvas, or the person typing.
 *
 * This is the whole echo-loop story, kept out of the component so it is a
 * pure function of two strings. The pane has exactly one write direction at
 * a time, the same structural guarantee `src/features/viewer/input/sync.ts`
 * makes for its two panes: text is parsed and pushed to the STORE, and the
 * store is serialized and shown in the TEXTAREA, but never both for the same
 * change. Which of the two is live is decided here, by comparing the model
 * the draft was built against (`base`) with the model the store holds now
 * (`live`) — never by a "we are writing, ignore the next update" flag, which
 * would be a race in disguise.
 *
 *   - No draft — the pane follows the canvas. Nothing to echo.
 *   - `base === live` — the store is exactly where this draft left it, so
 *     the incoming model IS this draft's own write-back. The draft stays on
 *     screen: that is what stops a re-serialization landing under the caret
 *     and reformatting half-typed text.
 *   - `base !== live` and the draft was in sync — the canvas has genuinely
 *     moved on (a drag, an inspector edit, an undo) and the draft describes
 *     the previous model. The canvas wins; the pane follows again. Nothing
 *     is lost but the user's own line breaks, which the model never carried.
 *   - `base !== live` and the draft is NOT in sync — the canvas moved while
 *     there is unparsed or failing text on screen. Neither side may silently
 *     win: the draft is kept and flagged stale so the pane can offer the
 *     choice.
 *
 * Because a superseded draft is simply not displayed, none of this needs a
 * state write during render or inside an effect.
 */

/** The user's text, and the model text it was built against. */
export interface TextDraft {
  text: string;
  /** Canonical text of the model this draft started from, or last produced. */
  base: string;
  /** True once this exact text has been parsed and pushed to the store. */
  synced: boolean;
}

export interface EffectiveText {
  /** What the textarea shows. */
  value: string;
  /** The `base` any edit made from here must carry forward. */
  base: string;
  /** True when the pane is mirroring the canvas rather than a draft. */
  following: boolean;
  /** True when the canvas moved on under an unparsed or failing draft. */
  stale: boolean;
}

/** Decides whether the pane shows the draft or the canvas's own text. */
export function resolveDraft(
  draft: TextDraft | null,
  live: string,
): EffectiveText {
  if (draft === null || (draft.synced && draft.base !== live)) {
    return { value: live, base: live, following: true, stale: false };
  }
  return {
    value: draft.text,
    base: draft.base,
    following: false,
    stale: draft.base !== live,
  };
}
