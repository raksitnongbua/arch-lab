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
   * The reply dash's march SPEED, in user units per second — React Flow's
   * animated edge (`stroke-dasharray: 5; animation: dashdraw .5s linear
   * infinite`, i.e. one 10-unit period every 500ms = 20 u/s) at half rate,
   * because theirs animates one hovered edge on demand and ours runs
   * continuously, full diagram width.
   *
   * A SPEED rather than a duration so the derived cycle time always matches
   * the pattern it moves: change the dash and the duration follows, instead of
   * a hand-tuned pair silently drifting into a crawl.
   */
  idleMarchSpeed: 10,

  /**
   * One full traversal of the travelling highlight on a SOLID line, in ms.
   * Unrelated to the march speed and deliberately slower than a dash cycle:
   * this is a soft brightening rather than a moving edge, and eleven of them
   * run at once, so it should register as ambient rather than as traffic.
   */
  idleGlint: 2600,
} as const;

/**
 * The reply dash's period in user units — `dash + gap`, which is exactly how
 * far the pattern must travel to look unchanged, and therefore what one
 * animation cycle advances.
 *
 * This MUST match the `stroke-dasharray` the stylesheet marches on replies and
 * the `from` value of `af-seq-march-dashed`; all three live in the idle block
 * of sequence-motion.css and this exists only to derive the duration.
 *
 * There is no `solid` entry any more, and that absence is the design: sync and
 * async lines are never given a dasharray, because "dashed" already means
 * async-or-reply on a sequence diagram and marching a solid arrow overwrote
 * its kind. They carry the glint instead.
 */
const MARCH_PERIOD = { dashed: 6 + 5 } as const;

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
export function sequenceMotionVars(reduced: boolean): Record<string, string> {
  const ms = (value: number) => `${reduced ? 0 : value}ms`;
  /**
   * A dash period's cycle time at the shared march speed. NOT routed through
   * `ms()`: the march is withdrawn wholesale by `sequenceMarchState` rather
   * than parked, so it never needs a 0ms duration — and a 0ms one would be
   * an infinitely fast animation rather than a still line.
   */
  const marchMs = (period: number) =>
    `${Math.round((period / SEQUENCE_DURATIONS.idleMarchSpeed) * 1000)}ms`;
  return {
    "--seq-draw": ms(SEQUENCE_DURATIONS.messageDraw),
    "--seq-head": ms(SEQUENCE_DURATIONS.headFade),
    "--seq-head-delay": ms(SEQUENCE_DURATIONS.headDelay),
    "--seq-stagger": ms(SEQUENCE_DURATIONS.focusStagger),
    "--seq-focus": ms(SEQUENCE_DURATIONS.focusFade),
    // One dash period per cycle — see MARCH_PERIOD.
    "--seq-march-dashed": marchMs(MARCH_PERIOD.dashed),
    // Not routed through `ms()` either: the glint is withdrawn by the same
    // gate, so it never needs a 0ms duration.
    "--seq-glint": `${SEQUENCE_DURATIONS.idleGlint}ms`,
  };
}

/**
 * Whether the idle march runs — stamped as `data-seq-march` on the diagram
 * root, NOT as a custom property, and that distinction is load-bearing.
 *
 * The march applies two declarations together: the dash pattern AND the
 * animation that moves it. Both must vanish when it is off, because the dash
 * is not decoration — a stopped march that kept its pattern would leave a
 * `sync` arrow looking dashed, which in a sequence diagram means something
 * else entirely (see the march block in sequence-motion.css). A var can
 * switch a VALUE but cannot withdraw a declaration, and the pattern is also
 * per-kind, so the two conditions multiply: an attribute on the root lets one
 * selector gate whichever per-kind rule matched.
 *
 * Reduced motion wins outright over the user's toggle here, and the
 * stylesheet's own `prefers-reduced-motion` block is the pure-CSS route to
 * the same end (belt and braces: this one is React state, that one holds
 * before hydration).
 */
export function sequenceMarchState(
  reduced: boolean,
  idleMotion: boolean,
): "on" | "off" {
  return reduced || !idleMotion ? "off" : "on";
}
