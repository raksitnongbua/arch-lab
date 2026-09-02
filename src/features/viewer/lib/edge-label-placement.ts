/**
 * Where a C4 relationship's label chip goes.
 *
 * THE CHIP USED TO LAND WHEREVER THE CURVE'S MIDPOINT FELL. `getParallelEdgePath`
 * returns that midpoint, slid along the line by the fan bias
 * (`labelBiasByEdgeId`) so the labels of edges sharing an endpoint do not stack
 * — and that was the whole of it. Nothing anywhere in the viewer asked whether
 * the chip had landed on a NODE, or on another chip. On a diagram with a long
 * relationship passing near a third element, the sentence naming that
 * relationship sat on top of an unrelated box; the reader could see there was
 * a label and not what it said, which is worse than no label, because the
 * space is spent either way.
 *
 * So a chip now walks off the anchor until it is clear, and the order it walks
 * in is the argument:
 *
 *   1. PERPENDICULAR FIRST. A label belongs beside its line, not further along
 *      it. Sliding along the line moves the chip toward one of the endpoints
 *      it is between, which is exactly where the fan bias has already put
 *      every other chip meeting that node.
 *   2. NODES OUTRANK CHIPS. If nothing clears both, a candidate that clears
 *      only the node boxes wins: a label crossing another label is a reader's
 *      problem for a second, and a label under a node is invisible for good.
 *      This is the retreat pass, and it is the same judgement the flowchart's
 *      guard placement reaches — that code is not shared, because it is bound
 *      to ranks and corridors this notation does not have, but the rule it
 *      settled on is.
 *   3. THE ANCHOR IS THE LAST RESORT, never a silent one. `placeEdgeLabels`
 *      reports which chips it could not place, so a caller — or a check — can
 *      tell "clear" from "gave up".
 *
 * PURE DATA IN, PURE DATA OUT, and deliberately so: it takes anchors and boxes
 * rather than importing the geometry helpers that produce them. Those reach
 * `@xyflow/react`, and Node's type stripping cannot follow an import chain into
 * React, so a module that imported them could not be loaded by a check script
 * at all. Both callers compute their own anchors — the canvas from measured
 * node rects, the exporter from the model's — and hand them here.
 *
 * ONE FORMULA FOR THE CHIP'S SIZE, used by the surface that avoids the box and
 * by the surface that draws it. They were two: the exporter sized the rectangle
 * it painted and nothing sized the rectangle anyone avoided. A placement pass
 * that dodged a box of a different size than the one drawn would be the
 * "two halves, each self-consistent" failure with extra steps.
 */

import { CHAR_WIDTH_RATIO, MONO_CHAR_WIDTH_RATIO } from "@/lib/text-metrics";

/** A rectangle in flow units, top-left anchored. */
export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Font sizes and padding of the chip, shared with the exporter that paints it. */
const CHIP_LABEL_SIZE = 10;
const CHIP_TECH_SIZE = 9;
const CHIP_LINE_HEIGHT = 13;
const CHIP_PADDING_X = 14;
const CHIP_PADDING_Y = 8;

/**
 * Widest each line of a chip's text may be drawn.
 *
 * The exporter ellipsises to these before painting, so the size below CLAMPS
 * to them: measuring the untruncated string would have the placement pass
 * dodge a rectangle wider than the one anybody draws, which is conservative
 * in the safe direction but still two answers for one box — and on a diagram
 * with one long relationship label it would shove every neighbouring chip
 * aside to make room for width that was never used.
 */
export const CHIP_LABEL_MAX_WIDTH = 176;
export const CHIP_TECH_MAX_WIDTH = 168;

/**
 * The chip's box for a relationship carrying `label` and/or `technology`.
 *
 * Returns null when there is nothing to say — the on-screen "Unlabelled
 * relationship" affordance is an interaction, not content, and it must not
 * reserve space that pushes a real label off its line.
 */
export function edgeChipSize(
  label: string | undefined,
  technology: string | undefined,
): { width: number; height: number } | null {
  const lines: { text: string; size: number; mono: boolean; cap: number }[] =
    [];
  if (label !== undefined && label !== "") {
    lines.push({
      text: label,
      size: CHIP_LABEL_SIZE,
      mono: false,
      cap: CHIP_LABEL_MAX_WIDTH,
    });
  }
  if (technology !== undefined && technology !== "") {
    lines.push({
      text: `[${technology}]`,
      size: CHIP_TECH_SIZE,
      mono: true,
      cap: CHIP_TECH_MAX_WIDTH,
    });
  }
  if (lines.length === 0) return null;

  const widest = Math.max(
    ...lines.map((line) =>
      Math.min(
        line.text.length *
          line.size *
          (line.mono ? MONO_CHAR_WIDTH_RATIO : CHAR_WIDTH_RATIO),
        line.cap,
      ),
    ),
  );
  return {
    width: widest + CHIP_PADDING_X,
    height: lines.length * CHIP_LINE_HEIGHT + CHIP_PADDING_Y,
  };
}

/** One relationship's chip, as the placement pass sees it. */
export interface LabelToPlace {
  id: string;
  /** The curve midpoint, already slid by the fan bias. */
  anchorX: number;
  anchorY: number;
  /** Unit vector along source → target. Decides which way "beside" is. */
  dirX: number;
  dirY: number;
  width: number;
  height: number;
}

export interface PlacedLabel {
  x: number;
  y: number;
  /** True when every candidate collided and the anchor was used regardless. */
  crowded: boolean;
}

/**
 * How far off the anchor a chip is willing to walk, in flow units.
 *
 * Bounded on purpose. A chip that wanders far enough to clear everything stops
 * being attached to the line it names — past roughly half a row's pitch (108,
 * from `ROW_STEP`) a reader has to guess which relationship it belongs to, and
 * a guessable label in the clear is no better than a certain one behind a box.
 *
 * THE TOP RUNG IS 80 BECAUSE 60 WAS MEASURABLY TOO SHORT. A chip is often
 * nearly as wide as the node it has to clear — "Reads and writes email_logs"
 * over `[MongoDB wire]` estimates 171 wide against a 176-wide box — so
 * sideways is hopeless for it and the escape has to be along the line. Getting
 * past a default node's half-height plus the chip's own half-height and the
 * clearance pad needs 65, and a walk that stopped at 60 reported the chip
 * crowded while sitting squarely on the box. Found by placing that exact chip
 * and measuring the result, not by reading the numbers.
 */
const WALK_RUNGS = [0, 20, 40, 60, 80] as const;

/** Keeps a chip from resting flush against a box it only just clears. */
const CLEARANCE_PAD = 4;

function overlaps(a: LabelRect, b: LabelRect, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.width &&
    a.x + a.width + pad > b.x &&
    a.y - pad < b.y + b.height &&
    a.y + a.height + pad > b.y
  );
}

const rectAt = (
  centreX: number,
  centreY: number,
  width: number,
  height: number,
): LabelRect => ({
  x: centreX - width / 2,
  y: centreY - height / 2,
  width,
  height,
});

/**
 * Places every chip, in one pass, avoiding the node boxes and the chips
 * already placed.
 *
 * Deterministic: labels are walked in id order, so the same diagram always
 * produces the same placement whatever order the caller's arrays happen to be
 * in — the canvas and the exporter build theirs differently, and a diagram
 * whose labels moved between the screen and the PNG would be the same
 * disagreement this module exists to remove.
 */
export function placeEdgeLabels(
  labels: readonly LabelToPlace[],
  nodes: readonly LabelRect[],
): Map<string, PlacedLabel> {
  const placed = new Map<string, PlacedLabel>();
  const taken: LabelRect[] = [];

  const ordered = [...labels].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  for (const label of ordered) {
    // "Beside the line" is the perpendicular; "along" is the fallback.
    const length = Math.hypot(label.dirX, label.dirY) || 1;
    const ux = label.dirX / length;
    const uy = label.dirY / length;
    const px = -uy;
    const py = ux;

    const candidates: { x: number; y: number }[] = [];
    for (const rung of WALK_RUNGS) {
      if (rung === 0) {
        candidates.push({ x: label.anchorX, y: label.anchorY });
        continue;
      }
      candidates.push(
        { x: label.anchorX + px * rung, y: label.anchorY + py * rung },
        { x: label.anchorX - px * rung, y: label.anchorY - py * rung },
        { x: label.anchorX + ux * rung, y: label.anchorY + uy * rung },
        { x: label.anchorX - ux * rung, y: label.anchorY - uy * rung },
      );
    }

    const boxAt = (candidate: { x: number; y: number }): LabelRect =>
      rectAt(candidate.x, candidate.y, label.width, label.height);

    const clearOfNodes = (box: LabelRect): boolean =>
      !nodes.some((node) => overlaps(box, node, CLEARANCE_PAD));
    const clearOfChips = (box: LabelRect): boolean =>
      !taken.some((chip) => overlaps(box, chip, CLEARANCE_PAD));

    let chosen = candidates.find((candidate) => {
      const box = boxAt(candidate);
      return clearOfNodes(box) && clearOfChips(box);
    });
    let crowded = false;

    if (chosen === undefined) {
      // Retreat: node clearance only. A label over a line is legible; a label
      // under a node is not there at all.
      chosen = candidates.find((candidate) => clearOfNodes(boxAt(candidate)));
    }
    if (chosen === undefined) {
      chosen = { x: label.anchorX, y: label.anchorY };
      crowded = true;
    }

    taken.push(boxAt(chosen));
    placed.set(label.id, { x: chosen.x, y: chosen.y, crowded });
  }

  return placed;
}
