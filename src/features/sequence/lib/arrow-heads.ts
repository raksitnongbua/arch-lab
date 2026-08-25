/**
 * The five arrow-head shapes the sequence canvas draws, as SVG path data.
 *
 * WHY PATHS RATHER THAN `<marker>`. A marker is the obvious answer and it was
 * rejected for two reasons that both cost visible bugs elsewhere in this
 * repo. First, colour: a marker paints from its OWN fill/stroke, not the
 * referencing line's, so following the theme would need `context-stroke`
 * (unsupported in Safari at the versions this app supports) or one marker
 * definition per theme per head — which is a half-populated palette waiting to
 * happen. The heads here carry `.af-seq-head-fill` / `.af-seq-head-line`,
 * whose paint is `var(--edge)` escalating to `var(--primary)` on focus, so
 * every theme defines them by defining those two tokens and nothing per-head
 * has to be completed. Second, focus: the canvas's focus rule reaches inside a
 * message group with descendant selectors, and marker content is outside the
 * referencing element's subtree, so a focused arrow's head would have stayed
 * `--edge` while its line escalated.
 *
 * THE TABLE IS TOTAL over `SequenceHeadStyle`, so a head style added to the
 * model is a compile error here rather than an arrow that silently draws
 * bare. `check:sequence-layout` derives its coverage from the same union
 * instead of a hand-listed set of five.
 *
 * WHAT THE SHAPES ARE, and why each is that shape:
 *
 *   - `arrow` — the filled triangle, unchanged from the three-kind canvas.
 *   - `open`  — the same triangle's two edges, unfilled. Open vs filled is the
 *     UML distinction between an asynchronous send and a call, so the two
 *     share a silhouette on purpose: they must read as the same gesture with
 *     one property changed, not as two unrelated marks.
 *   - `cross` — an X centred ON the tip rather than behind it. Drawn behind
 *     the tip (as a "head" occupying the last 9px) it reads as a decorated
 *     arrow; centred on the endpoint it reads as the message stopping there,
 *     which is what a lost message means. The line stops short so the X is not
 *     drawn over — see `SEQ_HEAD_LENGTH` and `arrowLineEnd`.
 *   - `none`  — no path at all. An empty list, not a zero-length path: a
 *     `d=""` path is a DOM node the focus and hover selectors still match, and
 *     a stroke-width transition on nothing was three of the four earlier
 *     attempts at this.
 *   - `bidirectional` — the `arrow` triangle at BOTH ends. Two filled heads
 *     rather than one head and one tail decoration, because Mermaid's `<<->>`
 *     and every UML reading of it mean "an arrowhead each way".
 *
 * Pure and erasable (no DOM, no React, no JSX) so the check scripts can load
 * it through Node's type stripping.
 */

import type { SequenceHeadStyle } from "@/types";

import { fmt } from "@/lib/svg-markup";

/**
 * Along-the-line extent of a head, px. Matches the triangle the canvas has
 * drawn since the three-kind version — the heads are being ADDED to, not
 * retuned, so an existing diagram's arrows keep their exact weight.
 */
export const SEQ_HEAD_LENGTH = 9;

/** Half the across-the-line extent, px. */
export const SEQ_HEAD_HALF_WIDTH = 4.5;

/** Half-diagonal of the cross, px. Smaller than the triangle's half-width so
 * the X reads as a terminator rather than as a wider head than its
 * neighbours: it is measured from the TIP in both directions, so it spans
 * `2 x` this along the line where a triangle spans `SEQ_HEAD_LENGTH`. */
export const SEQ_CROSS_HALF = 4;

/** One end of a message, as the head builders need it: the point the head
 * sits on, and which way along the line it points (`1` = rightward). */
export interface SequenceHeadEnd {
  x: number;
  y: number;
  /** +1 when the arrow travels left-to-right at this end, -1 when right-to-left. */
  direction: 1 | -1;
}

/**
 * The paths one head style contributes, split by how they are PAINTED, because
 * the two need different SVG attributes and different CSS: a filled triangle
 * has no stroke and a stroked chevron has no fill. Both lists may be empty
 * (`none`), and a style may contribute to both (nothing does today, and the
 * shape allows it rather than forcing a future head to pick a side).
 */
export interface SequenceHeadPaths {
  filled: readonly string[];
  stroked: readonly string[];
}

/** Filled triangle with its tip on `end`, pointing along `end.direction`. */
function triangle(end: SequenceHeadEnd): string {
  const back = -SEQ_HEAD_LENGTH * end.direction;
  return `M ${fmt(end.x)} ${fmt(end.y)} l ${fmt(back)} ${fmt(-SEQ_HEAD_HALF_WIDTH)} v ${fmt(SEQ_HEAD_HALF_WIDTH * 2)} Z`;
}

/** The same triangle's two edges, unfilled — the open (async) head. */
function chevron(end: SequenceHeadEnd): string {
  const backX = end.x - SEQ_HEAD_LENGTH * end.direction;
  return `M ${fmt(backX)} ${fmt(end.y - SEQ_HEAD_HALF_WIDTH)} L ${fmt(end.x)} ${fmt(end.y)} L ${fmt(backX)} ${fmt(end.y + SEQ_HEAD_HALF_WIDTH)}`;
}

/** Two strokes crossing ON the endpoint — a lost message. */
function cross(end: SequenceHeadEnd): string {
  const h = SEQ_CROSS_HALF;
  return `M ${fmt(end.x - h)} ${fmt(end.y - h)} L ${fmt(end.x + h)} ${fmt(end.y + h)} M ${fmt(end.x - h)} ${fmt(end.y + h)} L ${fmt(end.x + h)} ${fmt(end.y - h)}`;
}

/**
 * Head style → the paths it draws, given both ends of the message. `target` is
 * the end the message arrives at (the head end for every style but
 * `bidirectional`); `source` is where it left.
 */
export const SEQUENCE_HEAD_SHAPES: Readonly<
  Record<
    SequenceHeadStyle,
    (target: SequenceHeadEnd, source: SequenceHeadEnd) => SequenceHeadPaths
  >
> = {
  none: () => ({ filled: [], stroked: [] }),
  arrow: (target) => ({ filled: [triangle(target)], stroked: [] }),
  open: (target) => ({ filled: [], stroked: [chevron(target)] }),
  cross: (target) => ({ filled: [], stroked: [cross(target)] }),
  bidirectional: (target, source) => ({
    filled: [triangle(target), triangle(source)],
    stroked: [],
  }),
};

/**
 * How far short of the endpoint the LINE must stop for this head, px.
 *
 * Only the cross asks for it, and it is the one measured decision in this
 * module: the X is centred on the endpoint, so a line running the whole way
 * would be drawn through the middle of it and the mark would read as a plus
 * sign on a wire rather than as a terminated message. Every other head sits
 * behind the tip, where the line under it is hidden by its own paint.
 *
 * Returned per END so a bidirectional arrow could ask for both; it never does
 * today, and the shape is what stops a future two-ended head from needing a
 * second function.
 */
export const SEQUENCE_HEAD_LINE_INSET: Readonly<
  Record<SequenceHeadStyle, { target: number; source: number }>
> = {
  none: { target: 0, source: 0 },
  arrow: { target: 0, source: 0 },
  open: { target: 0, source: 0 },
  cross: { target: SEQ_CROSS_HALF, source: 0 },
  bidirectional: { target: 0, source: 0 },
};
