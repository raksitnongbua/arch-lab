/**
 * How long the lit head of an ambient sweep is, given the line it travels.
 *
 * THE TIMELINE'S ALONE, and it lived in `src/lib` for exactly one commit. The
 * lifecycle drew the same washing head down its own spine and had the same
 * defect in it, so the fix was shared; then the lifecycle's ambient became
 * marching dashes, whose pattern is two constants and needs no cap at all.
 * `dry.md` is plain that code used inside one feature stays in that feature,
 * and a shared module with one consumer is a claim about coupling that is no
 * longer true. Should the timeline's wash ever become a march too, this file
 * does not move back — it goes away.
 *
 * The stylesheet held a flat `--tl-sweep-head: 90` and paired it with
 * `calc(spine-len - 90)` as the gap.
 *
 * ── THE DEFECT THAT BOUGHT THIS FILE ──────────────────────────────────────
 *
 * A NEGATIVE VALUE MAKES THE WHOLE `stroke-dasharray` INVALID, and an invalid
 * dasharray is not a partial failure — the declaration is dropped and the line
 * renders SOLID. So on any diagram whose spine was shorter than 90 units the
 * ambient stopped being a travelling head and became the entire line, fading
 * from nothing to full strength and back, for ever. The smallest timeline the grammar accepts
 * measures 37.2 units, which put `-52.8` in the gap: not an exotic document,
 * the smallest one the notation admits.
 *
 * And the hard failure had a soft one either side of it. At 99.8 units — three
 * bare states — the arithmetic was still legal and the head covered 90% of the
 * line, which reads as the same pulsing solid line by a different mechanism.
 * A rule that only refused the negative would have called that one fixed.
 *
 * ── THE ANSWER ────────────────────────────────────────────────────────────
 *
 * The head is an ABSOLUTE length capped by a SHARE of the line. A wash on a
 * long spine wants a fixed head — 90 units reads the same whether the spine is
 * 500 or 900 — and only a short spine needs it to shrink, so the share binds
 * exactly where the flat number stopped working and nowhere else.
 *
 * `SWEEP_HEAD_SHARE` is 0.38 rather than a rounder third for a stated reason:
 * the cap then starts binding at 236.8 units, which is below every bundled
 * document and below the playground starter. Every diagram anyone has
 * actually looked at is pixel-identical to before, and only the short ones
 * that were broken move.
 *
 * STAMPED FROM THE COMPONENT, never computed in CSS. `min()` inside
 * `stroke-dasharray` would express this in one line and would probably work —
 * but "probably" is how the original shipped, its failure mode is a silently
 * solid line, and that is the exact failure being fixed here. The components
 * already stamp the spine's solved length; the head is arithmetic on the same
 * number. Both stylesheets keep the flat value as their declared default, and
 * `check:timeline-motion` pins it to `SWEEP_HEAD_MAX` and measures the result
 * over every bundled document plus the grammar's minimum.
 */

/** The head's length in user units on any spine long enough to carry it. */
export const SWEEP_HEAD_MAX = 90;

/**
 * The most of a spine the head may cover, as a fraction.
 *
 * THE GAP IS WHAT MAKES IT A HEAD. At this share the unlit part of the line is
 * still roughly twice the lit part, so a reader sees a mark travelling down a
 * line rather than a line changing brightness.
 */
export const SWEEP_HEAD_SHARE = 0.38;

/**
 * The head for a spine of `length` user units.
 *
 * TOTAL, and deliberately so: a one-state lifecycle or a one-event timeline
 * has a zero-length spine, and both components clamp that to 1 before it
 * arrives here. A zero or negative length still answers with a positive head
 * rather than throwing, because the canvas's contract is that it draws whatever
 * parsed — a hand-built model reaches it without passing the parser's refusals.
 */
export function sweepHead(length: number): number {
  const spine = Number.isFinite(length) && length > 0 ? length : 1;
  return Math.min(SWEEP_HEAD_MAX, spine * SWEEP_HEAD_SHARE);
}
