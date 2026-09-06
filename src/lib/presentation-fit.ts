/**
 * Whether a diagram will still be readable once it is put somewhere.
 *
 * A DIAGRAM HERE IS MEANT TO BE PRESENTED — shown in a review, dropped in a
 * deck, put on a screen while someone talks through it (`purpose.md`). Every
 * one of those places has a fixed frame, and a diagram wider than its frame is
 * not cropped, it is SHRUNK — and its labels shrink with it. So the question an
 * author cannot answer by looking at their own screen, where the diagram is as
 * large as they like, is the one that decides whether the work was worth doing:
 * at the size this will actually be seen, can anyone read it?
 *
 * WHY THIS MEASURES RATHER THAN RETYPESETS. The obvious version of a "size
 * preset" is the one other tools ship: a presentation preset that enlarges the
 * type ramp so labels survive the fit. That cannot work here, and the reason is
 * architectural rather than a matter of effort — C4 geometry lives IN THE
 * DOCUMENT. A node is 176×88 because the author (or `defaultPositions`) put it
 * there, so growing the type inside it overflows the box, and growing the box
 * rewrites coordinates the author owns. Six of the other eight notations solve
 * their geometry from measured text and would re-solve happily; C4, the
 * notation most likely to be presented, would not. A preset that worked for
 * eight kinds and silently broke the ninth is worse than none.
 *
 * So the dial is turned the other way round: the frame is stated, the fit is
 * computed, and the author is told what the smallest text will measure when it
 * lands there. `codebase.md` §5 — a rule that keeps producing work nobody asked
 * for is the wrong rule; what was wanted was the ANSWER, and the answer does
 * not require moving anything.
 *
 * PURE — no imports, no DOM, so `check:presentation-fit` computes the
 * arithmetic rather than reading the code and believing it.
 */

/** A frame a finished diagram gets put into. */
export interface PresentationFrame {
  id: string;
  /** What a person calls this place. */
  label: string;
  width: number;
  height: number;
}

/**
 * The frames worth measuring against.
 *
 * FOUR, NOT A CATALOGUE. Each is a genuinely different aspect and a genuinely
 * different viewing distance; adding `slide-4x3` beside `slide-16x9` would
 * offer a choice whose answer never differs enough to change what the author
 * does. The dimensions are CSS pixels at the 96/inch the exporter already
 * authors in, so the print frames are their paper sizes at that density.
 */
export const PRESENTATION_FRAMES: readonly PresentationFrame[] = [
  { id: "slide", label: "a 16:9 slide", width: 1280, height: 720 },
  { id: "doc", label: "inline in a document", width: 960, height: 600 },
  { id: "print-a4", label: "A4 landscape", width: 1123, height: 794 },
  { id: "social", label: "a link preview card", width: 1200, height: 632 },
];

/** The frame a diagram is measured against when nobody says otherwise. */
export const DEFAULT_PRESENTATION_FRAME = PRESENTATION_FRAMES[0];

/**
 * The smallest a label may measure in the frame it is read in, in CSS pixels.
 *
 * NINE, and it is a floor for a PROJECTED label rather than a typographic
 * minimum: at a normal viewing distance a 9px label on a slide is at the edge
 * of what a room can read, and below it the audience stops reading the diagram
 * and waits for the speaker to say what it shows — which is the diagram having
 * failed at the one job this product sells. Print is more forgiving and screens
 * at arm's length more forgiving still; one floor for all four frames is the
 * deliberate simplification, because the frame that matters is the harshest.
 */
export const LEGIBLE_FLOOR_PX = 9;

/**
 * The smallest type an exported diagram actually contains, in its own pixels.
 *
 * The node's meta line — the technology, the `[Go 1.22]` — which is the
 * smallest thing every notation draws. Stated here rather than imported from an
 * exporter because those are React-adjacent and this module must stay loadable
 * by a check script; `check:presentation-fit` asserts the two agree, so it
 * cannot drift silently.
 */
export const SMALLEST_TYPE_PX = 10;

export interface PresentationFit {
  frame: PresentationFrame;
  /** What the diagram is multiplied by to fit. Never above 1: nothing is enlarged. */
  scale: number;
  /** What `SMALLEST_TYPE_PX` measures once the diagram is in the frame. */
  smallestTypePx: number;
  /** Whether that lands at or above the floor. */
  legible: boolean;
}

/**
 * How a diagram of `width × height` lands in `frame`.
 *
 * NEVER SCALED UP. A diagram smaller than the frame is placed at its own size,
 * because enlarging it would report a legibility that depends on a viewer
 * choosing to zoom — and every surface that does this fitting (the exporter,
 * a slide, a document) leaves a small figure alone.
 */
export function presentationFit(
  width: number,
  height: number,
  frame: PresentationFrame = DEFAULT_PRESENTATION_FRAME,
): PresentationFit {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const scale = Math.min(1, frame.width / safeWidth, frame.height / safeHeight);
  const smallestTypePx = SMALLEST_TYPE_PX * scale;
  return {
    frame,
    scale,
    smallestTypePx,
    legible: smallestTypePx >= LEGIBLE_FLOOR_PX,
  };
}

/**
 * The widest a diagram may be and still read in `frame`.
 *
 * The number an author can act on: "keep it under 1422px wide" is a target,
 * where "it will be 41% too small" is a complaint. Derived from the same
 * arithmetic rather than stated, so the two can never disagree.
 */
export function legibleWidthLimit(frame: PresentationFrame): number {
  return Math.floor((frame.width * SMALLEST_TYPE_PX) / LEGIBLE_FLOOR_PX);
}

/** As above, for height. */
export function legibleHeightLimit(frame: PresentationFrame): number {
  return Math.floor((frame.height * SMALLEST_TYPE_PX) / LEGIBLE_FLOOR_PX);
}

/**
 * One sentence an author can act on, or `null` when the diagram is fine.
 *
 * NULL RATHER THAN "it fits". A line that appears only when the news is bad is
 * a line worth reading; one that appears every time is one that gets skipped,
 * and this is reported beside a size an author already has.
 */
export function presentationWarning(
  width: number,
  height: number,
  frame: PresentationFrame = DEFAULT_PRESENTATION_FRAME,
): string | null {
  const fit = presentationFit(width, height, frame);
  if (fit.legible) return null;

  const overWidth = width > legibleWidthLimit(frame);
  const limit = overWidth
    ? `${legibleWidthLimit(frame)}px wide`
    : `${legibleHeightLimit(frame)}px tall`;

  return (
    `At ${Math.round(width)} x ${Math.round(height)} px this is shrunk to ` +
    `${Math.round(fit.scale * 100)}% to fit ${frame.label}, which puts its ` +
    `smallest labels at about ${fit.smallestTypePx.toFixed(1)}px — under the ` +
    `${LEGIBLE_FLOOR_PX}px a reader needs. Keep it under ${limit}, or split ` +
    "it into an overview and a diagram it drills into."
  );
}
