/**
 * Sequence-feature motion constants — the one definition of every duration
 * the sequence viewer animates with, following the convention of
 * `viewer/lib/motion.ts` / `editor/lib/motion.ts`: components never hardcode
 * a millisecond, and reduced motion is honoured through the shared
 * `prefersReducedMotion` helper in exactly one place (the viewer writes
 * these values as `--seq-*` custom properties, zeroed under reduced motion,
 * and `styles/sequence-motion.css` reads only those properties).
 */

import { prefersReducedMotion } from "@/features/editor/lib/motion";

export { prefersReducedMotion };

export const SEQUENCE_DURATIONS = {
  /**
   * One arrow drawing source → target when it is focused. Longer than the
   * editor's 200ms edgeDraw on purpose: there the draw is feedback for an
   * action the user just performed; here it IS the answer to the click —
   * "this is the message you asked about" — so it has to be watchable, not
   * merely perceptible.
   */
  messageDraw: 420,
  /** Arrowhead fade once the line has mostly arrived. */
  headFade: 160,
  /** Delay before the head fades in — the line reaches it first. */
  headDelay: 280,
  /**
   * Per-message delay when a PARTICIPANT's whole message set draws. Small
   * enough that the draws overlap into one calm sweep down the page (each
   * draw is 420ms, so consecutive messages are always mid-flight together),
   * large enough that the step ORDER is visible — the set should read as
   * one gesture, not a stampede and not a flipbook.
   */
  focusStagger: 90,
  /** Cross-fade when focus dims the rest of the diagram (matches the
   * viewer's edgeFocus escalation feel). */
  focusFade: 180,
  /**
   * The idle flow's clock: milliseconds for one band to TRAVERSE the path
   * source → target. The keyframes advance one whole path (100 units) per
   * cycle, so this holds for every message regardless of how many bands
   * ride its train — density lives entirely in the dash PERIOD, not the
   * clock. Slow on purpose — eleven trains run at once. (The construction
   * is the C4 focus flow at ambient scale; see the .af-seq-idle block in
   * sequence-motion.css for the design and the retired-designs history.)
   */
  idleTravel: 4200,
} as const;

/**
 * The custom-property map the viewer stamps on the diagram root. Under
 * reduced motion every duration is 0ms, which parks each animation on its
 * final (meaningful) frame — the CSS `both` fills guarantee the final frame
 * is the element's natural, complete state, never a mid-draw one.
 *
 * `reduced` is a PARAMETER rather than a fresh `prefersReducedMotion()` read:
 * the viewer already tracks the media query reactively (its
 * `useReducedMotion` store), and a second, unsynchronised read here can
 * disagree with the one React rendered with — the same "one source of truth
 * per rule" discipline as everything else in this feature.
 */
export function sequenceMotionVars(
  reduced: boolean,
  /** The user's idle-motion toggle (viewer state, persisted). */
  idleMotion: boolean,
): Record<string, string> {
  const ms = (value: number) => `${reduced ? 0 : value}ms`;
  return {
    "--seq-draw": ms(SEQUENCE_DURATIONS.messageDraw),
    "--seq-head": ms(SEQUENCE_DURATIONS.headFade),
    "--seq-head-delay": ms(SEQUENCE_DURATIONS.headDelay),
    "--seq-stagger": ms(SEQUENCE_DURATIONS.focusStagger),
    "--seq-focus": ms(SEQUENCE_DURATIONS.focusFade),
    "--seq-idle": ms(SEQUENCE_DURATIONS.idleTravel),
    // The idle marker is the one animation a 0ms duration cannot park
    // meaningfully: it is motion and NOTHING else, so its zero state is a
    // stray dot sitting on the line, not a natural frame. It is therefore
    // GATED BY DISPLAY, and this one var carries both reasons to hide it:
    // reduced motion (which must win outright — the stylesheet's own
    // `prefers-reduced-motion` block reaches the same end for the pure-CSS
    // route) and the user's idle-motion toggle. The stylesheet's fallback
    // for this var is `none`, so SSR markup shows no marker until the
    // viewer mounts — the same contract as the 0ms duration fallbacks.
    "--seq-idle-display": reduced || !idleMotion ? "none" : "inline",
  };
}
