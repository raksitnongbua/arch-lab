/**
 * Flowchart layout — the ONE place geometry is derived from a
 * `FlowchartLabFile`. The renderer, the viewer, the SVG exporter and the
 * layout check script (`scripts/flowchart-layout-check.mjs`) all read this
 * result; none of them ever computes a coordinate of its own. Same
 * single-source-of-truth discipline as `sequence/lib/layout.ts`, and for the
 * same reason: two geometry computations WILL disagree, and the disagreement
 * only shows up as an arrow that almost meets its box.
 *
 * Pure and framework-free on purpose (no DOM, no React, no CSS): the check
 * script loads this file through Node's type stripping, so importing anything
 * browser-shaped here would break the proof that the layout is testable.
 * Deterministic by construction — every pass iterates arrays in declaration
 * order and every sort is stable — so the same model in gives byte-identical
 * geometry out, which the check script asserts literally.
 *
 * THE ALGORITHM is a compact Sugiyama-style layered layout, because a
 * flowchart is a directed graph with a reading direction, not a list:
 *
 *   1. EDGE CLASSIFICATION — a DFS from the `start` terminators (then any
 *      node the starts cannot reach, in declaration order) marks every edge
 *      that lands on a node still on the DFS stack as a BACK edge. Removing
 *      back edges and self-loops leaves a DAG; the loops are drawn, they just
 *      do not participate in ranking, which is what stops a retry loop from
 *      pulling its whole body up to the top of the page.
 *   2. RANKING — longest path over the DAG: a node sits one row below the
 *      DEEPEST of its predecessors, so a branch that takes three steps and a
 *      branch that takes one re-merge at the same row instead of the short
 *      branch's target floating up beside the long branch's middle.
 *   3. ORDERING — barycentre sweeps (a fixed, even number of down/up passes)
 *      reorder each row by the mean position of its neighbours in the
 *      adjacent row, which is the standard cheap crossing reducer. Fixed
 *      pass count and stable sorts keep it deterministic; the initial order
 *      is declaration order, so ties resolve to the author's narration.
 *   4. COORDINATES — every row is centred on one vertical axis (the classic
 *      flowchart spine); columns inside a row pack with a fixed gap.
 *   5. ROUTING — orthogonal, through CHANNELS and CORRIDORS. The horizontal
 *      band between two rows is a channel; every edge that must move
 *      sideways does it there, on its own LANE (one y per edge per channel),
 *      so no two horizontal runs can overlap. Edges that skip rows drop down
 *      a corridor to the RIGHT of every row; back edges climb a corridor
 *      that HUGS the left flank of only the rows they span, and connect
 *      SIDEWAYS at mid-height wherever the flank is free (see the back-edge
 *      banner below) — nodes never sit in a channel or a corridor, so no
 *      segment can cross a foreign node's body. Rejected alternatives:
 *      straight diagonal lines — they read fine on toy charts and shear
 *      straight through node bodies the moment a branch re-merges; and the
 *      original "back edges climb a corridor left of ALL rows" — shipped,
 *      user-reported as a defect, and retired for the reason the banner
 *      records.
 *
 * Ports: an edge leaves its source's BOTTOM boundary and enters its target's
 * TOP boundary, at x positions spread across the shape so parallel edges do
 * not stack on one line. "Boundary" is per-shape: on a diamond the port sits
 * ON the sloped edge (a vertical drop from a point on the lower edge is
 * outside the diamond, so the line never crosses its own node); on a stadium
 * the spread is clamped to the flat middle so a port cannot float off the
 * cap's curve.
 *
 * Text is measured with the same conservative character-width estimate every
 * other surface uses (`@/lib/text-metrics`): SVG has no synchronous text
 * measurement outside a live DOM, and a DOM measurement here would make
 * layout untestable in Node and non-deterministic across font fallbacks.
 */

import type {
  FlowchartLabFile,
  FlowchartNode,
  FlowchartNodeShape,
} from "@/types";
import {
  layoutDiagramHeading,
  type DiagramHeadingMetrics,
} from "@/lib/diagram-heading";
import { CHAR_WIDTH_RATIO, wrapText } from "@/lib/text-metrics";

/* -------------------------------------------------------------------------- */
/* Constants — exported so the check script asserts against the same numbers   */
/* -------------------------------------------------------------------------- */

export const FLOW = {
  /** Same estimate as the sequence layout and the C4 exporter — one fact. */
  charWidthRatio: CHAR_WIDTH_RATIO,

  marginX: 28,
  marginTop: 20,
  marginBottom: 28,

  nodeFontSize: 13,
  metaFontSize: 11,
  labelFontSize: 12,
  /** Per-line advance of wrapped node label text. */
  lineHeight: 17,
  /** Height of the `[technology]` line under the label. */
  techLineHeight: 15,

  padX: 14,
  padY: 10,
  minNodeWidth: 96,
  /**
   * Widest a node label wraps before growing the box. Narrow enough that a
   * prose-y step stays a card rather than a banner; the box then takes the
   * measured widest LINE, so short labels pay nothing.
   */
  maxTextWidth: 176,
  /**
   * Decisions wrap TIGHTER: a rhombus must be twice its inscribed text box in
   * each axis (see `sizeNode`), so every pixel of line width costs two on the
   * diamond — the classic place naive flowchart layout balloons or, worse,
   * lets the text poke through the sloped edges.
   */
  decisionMaxTextWidth: 132,
  /** Clearance between a decision's text box and the rhombus edge. */
  decisionPad: 6,
  decisionMinWidth: 110,
  decisionMinHeight: 64,
  /** Horizontal slant of the io parallelogram — eats width, so it is sized in. */
  ioSkew: 12,
  /** Inset of the `call` shape's double-struck side rails; reserved as pad. */
  callInset: 6,

  /** Horizontal gap between neighbouring nodes in one row. */
  columnGap: 44,
  /** Minimum vertical band between two rows (grows per routing lane). */
  rankGap: 56,
  /** One routing lane's height inside a channel. */
  laneGap: 16,
  /** Gap from the widest row to the first vertical corridor. */
  corridorGap: 32,
  /** Spacing between stacked corridors on one side. */
  corridorStep: 16,
  /** Max spread between neighbouring ports on one node edge. */
  portSpread: 26,

  selfLoopWidth: 40,
  /** Half-height of the self-loop's rectangle around the node's midline. */
  selfLoopRise: 11,

  /** Edge-label box padding and the gap that keeps it OFF its own line. */
  labelPadX: 5,
  labelPadY: 3,
  labelGap: 8,
  /** Inflation used when testing a label box against lines and boxes. */
  labelClearance: 2,
  labelLineHeight: 15,

  groupPadX: 16,
  /** Room inside the frame's top for its label band. */
  groupPadTop: 30,
  groupPadBottom: 14,
  groupLabelFontSize: 11,

  /* ---- the heading block: the document's title and description ------------
   * Inside the drawing, not the page chrome, for the same reason the sequence
   * diagram stamps its own: the export renders this geometry, and a title in
   * HTML would be missing from every file anyone sends on. */
  titleFontSize: 15,
  titleLineHeight: 20,
  descriptionFontSize: 12,
  descriptionLineHeight: 17,
  titleDescriptionGap: 6,
  headingGap: 18,
  titleMinWrapWidth: 320,
  descriptionMaxLines: 3,
} as const;

/** This notation's type scale for the shared heading block. */
const FLOW_HEADING: DiagramHeadingMetrics = {
  titleFontSize: FLOW.titleFontSize,
  titleLineHeight: FLOW.titleLineHeight,
  descriptionFontSize: FLOW.descriptionFontSize,
  descriptionLineHeight: FLOW.descriptionLineHeight,
  descriptionMaxLines: FLOW.descriptionMaxLines,
  titleDescriptionGap: FLOW.titleDescriptionGap,
  headingGap: FLOW.headingGap,
};

function estimateWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * FLOW.charWidthRatio);
}

/* -------------------------------------------------------------------------- */
/* Result shapes                                                               */
/* -------------------------------------------------------------------------- */

export interface FlowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowPoint {
  x: number;
  y: number;
}

export interface LaidFlowNode {
  id: string;
  shape: FlowchartNodeShape;
  label: string;
  /** The label WRAPPED to the shape, one entry per rendered line. The
   * renderer draws these, never `label` — SVG text does not wrap. */
  lines: readonly string[];
  technology?: string;
  tags?: readonly string[];
  /** Focus-only detail; carried through but never measured — it is shown in
   * the viewer's dock, not drawn inside the symbol. */
  description?: string;
  /** Bounding box (a diamond's box circumscribes the rhombus). */
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Row index, 0 at the top — longest path from the start terminators. */
  rank: number;
  /**
   * The text block's box, centred in the shape and measured with the same
   * estimator that sized the shape. Exported so the check script can prove
   * containment (a diamond's inscribed box inside the rhombus) without
   * re-deriving text metrics of its own.
   */
  labelBox: FlowRect;
}

export interface LaidFlowEdge {
  /** Index into `file.edges` — the stable identity focus and checks key on. */
  index: number;
  from: string;
  to: string;
  label?: string;
  /**
   * The orthogonal polyline, source port first, target port last. Every
   * segment is axis-aligned; the renderer rounds the corners. At least two
   * points, always.
   */
  points: readonly FlowPoint[];
  /** Placed clear of every line and every other label; null when unlabelled. */
  labelBox: FlowRect | null;
  /** Wrapped label lines (empty when unlabelled). */
  labelLines: readonly string[];
  /** A loop — target rank at or above source rank. Routed up a corridor
   * hugging the rows it spans, entering the target's flank at mid-height. */
  back: boolean;
  self: boolean;
}

export interface LaidFlowGroup {
  label: string;
  /** Normalised `#rrggbb`, when the document gave one. */
  tint?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodes: readonly string[];
}

export interface FlowchartLayout {
  width: number;
  height: number;
  heading: {
    titleLines: readonly string[];
    descriptionLines: readonly string[];
    height: number;
    width: number;
  };
  nodes: LaidFlowNode[];
  edges: LaidFlowEdge[];
  /** Frames behind the nodes — paint first. Empty when the file groups nothing. */
  groups: LaidFlowGroup[];
}

/* -------------------------------------------------------------------------- */
/* Pass 1 — node sizing                                                        */
/* -------------------------------------------------------------------------- */

interface SizedNode {
  node: FlowchartNode;
  lines: string[];
  /** Measured text block (label lines + optional technology line). */
  textWidth: number;
  textHeight: number;
  width: number;
  height: number;
}

/**
 * A node's box, from its own text. The rules per shape:
 *
 *   - `step` / `call`: text plus padding (`call` reserves its double-struck
 *     rails as extra horizontal pad so the rails never touch the words).
 *   - `start` / `end`: a stadium — the round caps eat `height/2` each side,
 *     reserved as extra pad so text cannot sit under the curve.
 *   - `io`: the parallelogram's slant is horizontal room the text cannot
 *     use, so the slant is added on both sides.
 *   - `decision`: the classic trap. A centred rect (w × h) fits inside a
 *     rhombus (W × H) iff w/W + h/H ≤ 1, and the area-minimal solution is
 *     W = 2w, H = 2h — so the diamond is sized to exactly twice its padded
 *     text block per axis, which fits BY CONSTRUCTION with `decisionPad`
 *     of slack. The check script asserts the containment corner by corner.
 */
function sizeNode(node: FlowchartNode): SizedNode {
  const maxText =
    node.shape === "decision" ? FLOW.decisionMaxTextWidth : FLOW.maxTextWidth;
  const lines = wrapText(node.label, maxText, FLOW.nodeFontSize);
  let textWidth = lines.reduce(
    (max, line) => Math.max(max, estimateWidth(line, FLOW.nodeFontSize)),
    0,
  );
  let textHeight = lines.length * FLOW.lineHeight;
  if (node.technology !== undefined) {
    textWidth = Math.max(
      textWidth,
      estimateWidth(`[${node.technology}]`, FLOW.metaFontSize),
    );
    textHeight += FLOW.techLineHeight;
  }

  let width: number;
  let height: number;
  switch (node.shape) {
    case "decision": {
      width = Math.max(
        FLOW.decisionMinWidth,
        (textWidth + FLOW.decisionPad * 2) * 2,
      );
      height = Math.max(
        FLOW.decisionMinHeight,
        (textHeight + FLOW.decisionPad * 2) * 2,
      );
      break;
    }
    case "start":
    case "end": {
      height = textHeight + FLOW.padY * 2;
      width = Math.max(
        FLOW.minNodeWidth,
        textWidth + FLOW.padX * 2 + height, // height/2 per rounded cap
      );
      break;
    }
    case "io": {
      width = Math.max(
        FLOW.minNodeWidth,
        textWidth + FLOW.padX * 2 + FLOW.ioSkew * 2,
      );
      height = textHeight + FLOW.padY * 2;
      break;
    }
    case "call": {
      width = Math.max(
        FLOW.minNodeWidth,
        textWidth + (FLOW.padX + FLOW.callInset) * 2,
      );
      height = textHeight + FLOW.padY * 2;
      break;
    }
    default: {
      width = Math.max(FLOW.minNodeWidth, textWidth + FLOW.padX * 2);
      height = textHeight + FLOW.padY * 2;
    }
  }
  return { node, lines, textWidth, textHeight, width, height };
}

/* -------------------------------------------------------------------------- */
/* Pass 2 — edge classification (which arrows are loops)                       */
/* -------------------------------------------------------------------------- */

interface EdgeClass {
  self: boolean[];
  back: boolean[];
}

/**
 * DFS in declaration order, rooted at the `start` terminators first — the
 * author's declared entry points are the reading order, so a cycle breaks at
 * the arrow that points AGAINST that reading, not at an arbitrary one.
 * Unreached nodes (a disconnected fragment mid-edit) are rooted afterwards in
 * declaration order, so the pass is total and deterministic for any input.
 */
function classifyEdges(file: FlowchartLabFile): EdgeClass {
  const self = file.edges.map((e) => e.from === e.to);
  const back = file.edges.map(() => false);
  const outByNode = new Map<string, number[]>();
  file.edges.forEach((edge, index) => {
    if (self[index]) return;
    const list = outByNode.get(edge.from);
    if (list === undefined) outByNode.set(edge.from, [index]);
    else list.push(index);
  });

  const UNSEEN = 0;
  const ON_STACK = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  const visit = (id: string): void => {
    state.set(id, ON_STACK);
    for (const index of outByNode.get(id) ?? []) {
      const target = file.edges[index].to;
      const targetState = state.get(target) ?? UNSEEN;
      if (targetState === ON_STACK) back[index] = true;
      else if (targetState === UNSEEN) visit(target);
    }
    state.set(id, DONE);
  };
  for (const node of file.nodes) {
    if (node.shape === "start" && (state.get(node.id) ?? UNSEEN) === UNSEEN) {
      visit(node.id);
    }
  }
  for (const node of file.nodes) {
    if ((state.get(node.id) ?? UNSEEN) === UNSEEN) visit(node.id);
  }
  return { self, back };
}

/* -------------------------------------------------------------------------- */
/* Pass 3 — ranks (longest path over the forward DAG)                          */
/* -------------------------------------------------------------------------- */

function rankNodes(
  file: FlowchartLabFile,
  cls: EdgeClass,
): Map<string, number> {
  const rank = new Map<string, number>(file.nodes.map((n) => [n.id, 0]));
  const indegree = new Map<string, number>(file.nodes.map((n) => [n.id, 0]));
  const forwardOut = new Map<string, number[]>();
  file.edges.forEach((edge, index) => {
    if (cls.self[index] || cls.back[index]) return;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    const list = forwardOut.get(edge.from);
    if (list === undefined) forwardOut.set(edge.from, [index]);
    else list.push(index);
  });

  // Kahn's queue seeded in declaration order — the deterministic tiebreak.
  const queue = file.nodes.filter((n) => indegree.get(n.id) === 0);
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head].id;
    for (const index of forwardOut.get(id) ?? []) {
      const target = file.edges[index].to;
      rank.set(
        target,
        Math.max(rank.get(target) ?? 0, (rank.get(id) ?? 0) + 1),
      );
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) {
        const node = file.nodes.find((n) => n.id === target);
        if (node !== undefined) queue.push(node);
      }
    }
  }
  return rank;
}

/* -------------------------------------------------------------------------- */
/* Pass 4 — order within rank (barycentre crossing reduction)                  */
/* -------------------------------------------------------------------------- */

/**
 * Four alternating down/up sweeps. Each sweep re-sorts one row by the mean
 * position of its neighbours in the fixed adjacent row; a node with no
 * neighbours keeps its current position as its key, so isolated nodes never
 * jump. Fixed pass count (not "until stable") keeps the cost bounded and the
 * result a pure function of the input; JS sort is stable, so equal keys keep
 * declaration order — the author's branch order breaks every tie.
 */
function orderRanks(
  file: FlowchartLabFile,
  cls: EdgeClass,
  rank: Map<string, number>,
): string[][] {
  const maxRank = Math.max(0, ...[...rank.values()]);
  const rows: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const node of file.nodes) rows[rank.get(node.id) ?? 0].push(node.id);

  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  file.edges.forEach((edge, index) => {
    if (cls.self[index] || cls.back[index]) return;
    (succs.get(edge.from) ?? succs.set(edge.from, []).get(edge.from))?.push(
      edge.to,
    );
    (preds.get(edge.to) ?? preds.set(edge.to, []).get(edge.to))?.push(
      edge.from,
    );
  });

  const sweep = (
    row: string[],
    fixed: string[],
    via: Map<string, string[]>,
  ) => {
    const position = new Map(fixed.map((id, i) => [id, i]));
    const keys = new Map<string, number>();
    row.forEach((id, current) => {
      const neighbours = (via.get(id) ?? []).filter((n) => position.has(n));
      keys.set(
        id,
        neighbours.length === 0
          ? current
          : neighbours.reduce((sum, n) => sum + (position.get(n) ?? 0), 0) /
              neighbours.length,
      );
    });
    row.sort((a, b) => (keys.get(a) ?? 0) - (keys.get(b) ?? 0));
  };

  for (let pass = 0; pass < 2; pass += 1) {
    for (let r = 1; r < rows.length; r += 1) sweep(rows[r], rows[r - 1], preds);
    for (let r = rows.length - 2; r >= 0; r -= 1) {
      sweep(rows[r], rows[r + 1], succs);
    }
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Ports — where an edge meets a shape's boundary                              */
/* -------------------------------------------------------------------------- */

interface Placed extends SizedNode {
  x: number;
  y: number;
  cx: number;
  cy: number;
  rank: number;
}

/**
 * Boundary y at horizontal offset `dx` from the centre, on the bottom
 * (`side` 1) or top (`side` -1) of the shape. Rectangles and parallelograms
 * are flat; a diamond's boundary climbs toward the side vertices, which is
 * what keeps a spread port ON the sloped edge instead of floating in the
 * corner of the bounding box.
 */
function boundaryY(node: Placed, dx: number, side: 1 | -1): number {
  if (node.node.shape === "decision") {
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    const climb = halfH * (1 - Math.min(1, Math.abs(dx) / halfW));
    return node.cy + side * climb;
  }
  return side === 1 ? node.y + node.height : node.y;
}

/**
 * Boundary x at MID-HEIGHT on the given flank (-1 left, 1 right) — where a
 * loop's side exit or entry lands. At the midline every shape is at its
 * widest (a diamond's side vertex, a stadium's cap apex, a rectangle's edge)
 * except the io parallelogram, whose slant leaves the true boundary half a
 * skew inside the bounding box — without that correction a loop's arrowhead
 * would float in the parallelogram's cut corner.
 */
function sideBoundaryX(node: Placed, side: -1 | 1): number {
  const edge = side === -1 ? node.x : node.x + node.width;
  if (node.node.shape === "io") return edge - side * (FLOW.ioSkew / 2);
  return edge;
}

/** Clamp a port spread so every port stays on usable boundary. */
function portOffsets(node: Placed, count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [0];
  // Stadium caps and diamond slopes get unusable near the ends; keep ports in
  // the middle 55% of the width.
  const usable = node.width * 0.55;
  const spread = Math.min(FLOW.portSpread, usable / (count - 1));
  return Array.from(
    { length: count },
    (_, i) => (i - (count - 1) / 2) * spread,
  );
}

/* -------------------------------------------------------------------------- */
/* The layout                                                                  */
/* -------------------------------------------------------------------------- */

export function layoutFlowchart(file: FlowchartLabFile): FlowchartLayout {
  const cls = classifyEdges(file);
  const rank = rankNodes(file, cls);
  const rows = orderRanks(file, cls, rank);
  const sized = new Map(file.nodes.map((n) => [n.id, sizeNode(n)]));

  /* ---- x: every row centred on axis 0 (the flowchart spine) -------------- */
  const placed = new Map<string, Placed>();
  rows.forEach((row, r) => {
    const total =
      row.reduce((sum, id) => sum + (sized.get(id)?.width ?? 0), 0) +
      FLOW.columnGap * Math.max(0, row.length - 1);
    let x = -total / 2;
    for (const id of row) {
      const s = sized.get(id);
      if (s === undefined) continue;
      placed.set(id, {
        ...s,
        x,
        y: 0, // assigned after channel heights are known
        cx: x + s.width / 2,
        cy: 0,
        rank: r,
      });
      x += s.width + FLOW.columnGap;
    }
  });

  /* ---- back edges: which flank they travel --------------------------------
   * A loop must read as a RETURNING ARROW, not a frame. The retired routing
   * sent every back edge out its source's BOTTOM, across to a corridor left
   * of ALL rows, and back in through its target's TOP — three sides of a
   * dashed rounded rectangle around everything in between, visually
   * identical to a group frame (user-reported; fixture 3 of the layout
   * check is that report verbatim). So a back edge now hugs the rows it
   * spans and, wherever the flank is free, leaves its source and enters its
   * target SIDEWAYS at mid-height — the short hook a hand draws to loop an
   * arrow back up beside the column. Side entry also lands a HORIZONTAL
   * arrowhead on the target's flank, where no forward edge ever lands
   * (those enter the top), so the loop's landing is unmistakable. A flank
   * is "free" when no same-row neighbour sits between the node and that
   * side — a blocked flank falls back to the bottom/top port through the
   * channels, which is always legal, just less pretty. */
  interface BackPlan {
    /** -1 = left flank, 1 = right. Left preferred: loops-go-left is the
     * hand-drawn convention, and long forward edges already own the right. */
    side: -1 | 1;
    /** Leave the source's flank at mid-height (else: bottom port, channel). */
    exitSide: boolean;
    /** Enter the target's flank at mid-height (else: top port, channel). */
    entrySide: boolean;
  }
  const flankFree = (id: string, side: -1 | 1): boolean => {
    const node = placed.get(id);
    if (node === undefined) return false;
    for (const other of placed.values()) {
      if (other === node || other.rank !== node.rank) continue;
      if (side === -1 ? other.cx < node.cx : other.cx > node.cx) return false;
    }
    return true;
  };
  const backPlans = new Map<number, BackPlan>();
  file.edges.forEach((edge, index) => {
    if (!cls.back[index] || cls.self[index]) return;
    if (!placed.has(edge.from) || !placed.has(edge.to)) return;
    const sides: (-1 | 1)[] = [-1, 1];
    // The ENTRY side decides (the arrowhead is the loop's landing); the exit
    // follows it so one loop never wraps both flanks.
    const side =
      sides.find((s) => flankFree(edge.to, s)) ??
      sides.find((s) => flankFree(edge.from, s)) ??
      -1;
    backPlans.set(index, {
      side,
      exitSide: flankFree(edge.from, side),
      entrySide: flankFree(edge.to, side),
    });
  });

  /* ---- ports -------------------------------------------------------------
   * Outgoing edges leave the bottom, incoming enter the top; each side's
   * edges are spread by TARGET (resp. source) x so the fan leaves in the
   * direction it travels — the detail that makes a decision's branches read
   * as a fan rather than a knot. Sorting is by placed x with the edge index
   * as tiebreak, so it is deterministic. Side-connected back edges take no
   * port: counting them would keep an offset on the one remaining bottom
   * arrow (the user-reported symptom was a decision's yes/no pair leaving
   * as an ambiguous knot at the bottom vertex). */
  const outPort = new Map<number, number>(); // edge index -> port x
  const inPort = new Map<number, number>();
  for (const node of file.nodes) {
    const p = placed.get(node.id);
    if (p === undefined) continue;
    const outgoing = file.edges
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e, i }) =>
          e.from === node.id &&
          !cls.self[i] &&
          backPlans.get(i)?.exitSide !== true,
      )
      .sort(
        (a, b) =>
          (placed.get(a.e.to)?.cx ?? 0) - (placed.get(b.e.to)?.cx ?? 0) ||
          a.i - b.i,
      );
    portOffsets(p, outgoing.length).forEach((dx, i) => {
      outPort.set(outgoing[i].i, p.cx + dx);
    });
    const incoming = file.edges
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e, i }) =>
          e.to === node.id &&
          !cls.self[i] &&
          backPlans.get(i)?.entrySide !== true,
      )
      .sort(
        (a, b) =>
          (placed.get(a.e.from)?.cx ?? 0) - (placed.get(b.e.from)?.cx ?? 0) ||
          a.i - b.i,
      );
    portOffsets(p, incoming.length).forEach((dx, i) => {
      inPort.set(incoming[i].i, p.cx + dx);
    });
  }

  /* ---- channels and corridors ---------------------------------------------
   * Channel c is the band ABOVE rank c (0..rows.length); channel rows.length
   * is the band below the last row, which back edges leaving the bottom rank
   * need. A lane is one edge's private y inside a channel — assigned in edge
   * declaration order, so two horizontal runs can never share a y. */
  const channelCount = rows.length + 1;
  const laneOf: (number | null)[][] = file.edges.map(() =>
    Array.from({ length: channelCount }, () => null),
  );
  const lanesPerChannel = Array.from({ length: channelCount }, () => 0);
  const claimLane = (edgeIndex: number, channel: number): void => {
    laneOf[edgeIndex][channel] = lanesPerChannel[channel];
    lanesPerChannel[channel] += 1;
  };

  const corridorOf = new Map<number, number>(); // edge index -> corridor x

  interface Plan {
    kind: "straight" | "jog" | "long" | "back" | "self";
  }
  const plans: Plan[] = file.edges.map((edge, index) => {
    if (cls.self[index]) return { kind: "self" };
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (from === undefined || to === undefined) return { kind: "self" };
    const sx = outPort.get(index) ?? from.cx;
    const tx = inPort.get(index) ?? to.cx;
    if (cls.back[index]) {
      // Side-connected ends need no channel lane — the run at mid-height is
      // inside the row band, not in a channel.
      const bp = backPlans.get(index);
      if (bp?.exitSide !== true) claimLane(index, from.rank + 1);
      if (bp?.entrySide !== true) claimLane(index, to.rank);
      return { kind: "back" };
    }
    if (to.rank - from.rank > 1) {
      claimLane(index, from.rank + 1);
      claimLane(index, to.rank);
      return { kind: "long" };
    }
    if (Math.abs(sx - tx) <= 2) return { kind: "straight" };
    claimLane(index, to.rank);
    return { kind: "jog" };
  });

  /* ---- heading (needs only row widths) ------------------------------------ */
  const rowSpan = rows.reduce((max, row) => {
    const first = placed.get(row[0] ?? "");
    const last = placed.get(row[row.length - 1] ?? "");
    if (first === undefined || last === undefined) return max;
    return Math.max(max, last.x + last.width - first.x);
  }, 0);
  const heading = layoutHeading(file, rowSpan);

  /* ---- y: channels stretch for their lanes -------------------------------- */
  const channelHeight = lanesPerChannel.map((lanes, c) => {
    const edgeBand = lanes * FLOW.laneGap;
    // The first and last channels exist only when loops use them.
    if (c === 0 || c === rows.length) return lanes === 0 ? 0 : edgeBand + 12;
    return FLOW.rankGap + edgeBand;
  });
  const channelTop: number[] = [];
  const rowTop: number[] = [];
  let cursor = FLOW.marginTop + heading.height;
  for (let r = 0; r < rows.length; r += 1) {
    channelTop[r] = cursor;
    cursor += channelHeight[r];
    rowTop[r] = cursor;
    const rowHeight = Math.max(
      0,
      ...rows[r].map((id) => placed.get(id)?.height ?? 0),
    );
    for (const id of rows[r]) {
      const p = placed.get(id);
      if (p === undefined) continue;
      // Centre-aligned in the row: a diamond beside a step shares a midline,
      // which is where the eye expects the row to sit.
      p.y = cursor + (rowHeight - p.height) / 2;
      p.cy = p.y + p.height / 2;
    }
    cursor += rowHeight;
  }
  channelTop[rows.length] = cursor;
  cursor += channelHeight[rows.length];
  const flowBottom = cursor;

  const laneY = (edgeIndex: number, channel: number): number => {
    const lane = laneOf[edgeIndex][channel] ?? 0;
    const lanes = lanesPerChannel[channel];
    const height = channelHeight[channel];
    return channelTop[channel] + (height * (lane + 1)) / (lanes + 1);
  };

  /* ---- corridors ----------------------------------------------------------
   * Assigned in edge declaration order, so the corridor xs are a pure
   * function of the document. Long forward edges bypass on the RIGHT of
   * every row — a bypass reads as a bypass, out wide. Back edges HUG: their
   * corridor offsets from the outermost node among ONLY the rows the loop
   * spans, so a loop stays a short hook beside the column it returns along
   * instead of a rectangle around everything (the frame-lookalike defect the
   * back-edge banner above records). `claim` dedupes every corridor against
   * every other, pushing outward by one step, so two corridors — hugging or
   * not, either side — can never share an x and overdraw. */
  const rowsRight = Math.max(
    0,
    ...[...placed.values()].map((p) => p.x + p.width),
  );
  {
    const used: number[] = [];
    const claim = (x: number, step: number): number => {
      let out = x;
      while (used.some((u) => Math.abs(u - out) < FLOW.corridorStep)) {
        out += step;
      }
      used.push(out);
      return out;
    };
    plans.forEach((plan, index) => {
      if (plan.kind === "long") {
        corridorOf.set(
          index,
          claim(rowsRight + FLOW.corridorGap, FLOW.corridorStep),
        );
      } else if (plan.kind === "back") {
        const from = placed.get(file.edges[index].from);
        const to = placed.get(file.edges[index].to);
        const side = backPlans.get(index)?.side ?? -1;
        if (from === undefined || to === undefined) return;
        const lo = Math.min(from.rank, to.rank);
        const hi = Math.max(from.rank, to.rank);
        const spanned = [...placed.values()].filter(
          (p) => p.rank >= lo && p.rank <= hi,
        );
        corridorOf.set(
          index,
          side === -1
            ? claim(
                Math.min(...spanned.map((p) => p.x)) - FLOW.corridorGap,
                -FLOW.corridorStep,
              )
            : claim(
                Math.max(...spanned.map((p) => p.x + p.width)) +
                  FLOW.corridorGap,
                FLOW.corridorStep,
              ),
        );
      }
    });
  }

  /* ---- edge polylines ----------------------------------------------------- */
  const edges: LaidFlowEdge[] = file.edges.map((edge, index) => {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    const base = {
      index,
      from: edge.from,
      to: edge.to,
      ...(edge.label !== undefined ? { label: edge.label } : {}),
      labelBox: null,
      labelLines: [] as string[],
      back: cls.back[index],
      self: cls.self[index],
    };
    if (from === undefined || to === undefined) {
      return { ...base, points: [] };
    }
    const plan = plans[index];
    if (plan.kind === "self") {
      // Off the right flank, clear of the node body by construction.
      const right = from.x + from.width;
      const rise = FLOW.selfLoopRise;
      return {
        ...base,
        self: true,
        points: [
          { x: right, y: from.cy - rise },
          { x: right + FLOW.selfLoopWidth, y: from.cy - rise },
          { x: right + FLOW.selfLoopWidth, y: from.cy + rise },
          { x: right, y: from.cy + rise },
        ],
      };
    }
    const sx = outPort.get(index) ?? from.cx;
    const tx = inPort.get(index) ?? to.cx;
    const start = { x: sx, y: boundaryY(from, sx - from.cx, 1) };
    const end = { x: tx, y: boundaryY(to, tx - to.cx, -1) };
    switch (plan.kind) {
      case "straight":
        return { ...base, points: [start, end] };
      case "jog": {
        const y = laneY(index, to.rank);
        return {
          ...base,
          points: [start, { x: sx, y }, { x: tx, y }, end],
        };
      }
      case "back": {
        // A loop is a HOOK, not a circuit: out of the source's flank at
        // mid-height, up the hugging corridor, into the target's flank —
        // two corners, nothing enclosed. Each blocked flank degrades that
        // end (and only that end) to the old port-and-channel form; the
        // full six-point rectangle only returns when BOTH flanks are
        // blocked, which is the one case it cannot be mistaken for a frame
        // around empty air — every side of it is pressed against a node.
        const corridor = corridorOf.get(index) ?? rowsRight + FLOW.corridorGap;
        const bp = backPlans.get(index);
        const points: FlowPoint[] = [];
        if (bp?.exitSide === true) {
          const exitY = from.cy;
          points.push(
            { x: sideBoundaryX(from, bp.side), y: exitY },
            { x: corridor, y: exitY },
          );
        } else {
          const y1 = laneY(index, from.rank + 1);
          points.push(start, { x: sx, y: y1 }, { x: corridor, y: y1 });
        }
        if (bp?.entrySide === true) {
          const entryY = to.cy;
          points.push(
            { x: corridor, y: entryY },
            { x: sideBoundaryX(to, bp.side), y: entryY },
          );
        } else {
          const y2 = laneY(index, to.rank);
          points.push({ x: corridor, y: y2 }, { x: tx, y: y2 }, end);
        }
        return { ...base, points };
      }
      default: {
        // "long": down into the channel below the source, across to the
        // right-side corridor, along it to the channel above the target,
        // across, and down in — a bypass drawn as a bypass.
        const corridor = corridorOf.get(index) ?? rowsRight + FLOW.corridorGap;
        const y1 = laneY(index, from.rank + 1);
        const y2 = laneY(index, to.rank);
        return {
          ...base,
          points: [
            start,
            { x: sx, y: y1 },
            { x: corridor, y: y1 },
            { x: corridor, y: y2 },
            { x: tx, y: y2 },
            end,
          ],
        };
      }
    }
  });

  /* ---- groups -------------------------------------------------------------- */
  const groups: LaidFlowGroup[] = (file.groups ?? []).map((group) => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const id of group.nodes) {
      const p = placed.get(id);
      if (p === undefined) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.width);
      maxY = Math.max(maxY, p.y + p.height);
    }
    if (minX === Number.POSITIVE_INFINITY) {
      minX = 0;
      minY = 0;
      maxX = 0;
      maxY = 0;
    }
    return {
      label: group.label,
      ...(typeof group.tint === "string" ? { tint: group.tint } : {}),
      x: minX - FLOW.groupPadX,
      y: minY - FLOW.groupPadTop,
      width: maxX - minX + FLOW.groupPadX * 2,
      height: maxY - minY + FLOW.groupPadTop + FLOW.groupPadBottom,
      nodes: group.nodes,
    };
  });

  /* ---- edge labels ----------------------------------------------------------
   * A label sits BESIDE its edge, never on it: the anchor is offset from the
   * first vertical run, and a deterministic candidate walk (right of the
   * line, then stepped down, then the left side, then further out) picks the
   * first spot clear of EVERY line, node box and already-placed label. The
   * check script re-tests all three clearances, so a routing change that
   * crowds a label fails there instead of shipping text on top of an arrow.
   */
  const nodeBoxes: FlowRect[] = [...placed.values()].map((p) => ({
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
  }));
  const placedLabels: FlowRect[] = [];
  for (const edge of edges) {
    if (edge.label === undefined || edge.points.length < 2) continue;
    const lines = wrapText(edge.label, 140, FLOW.labelFontSize);
    const width =
      lines.reduce(
        (max, line) => Math.max(max, estimateWidth(line, FLOW.labelFontSize)),
        0,
      ) +
      FLOW.labelPadX * 2;
    const height = lines.length * FLOW.labelLineHeight + FLOW.labelPadY * 2;

    const anchor = labelAnchor(edge);
    const candidates: FlowPoint[] = [];
    for (const dy of [0, 12, 24, 36]) {
      candidates.push({ x: anchor.x + FLOW.labelGap, y: anchor.y + dy });
      candidates.push({
        x: anchor.x - FLOW.labelGap - width,
        y: anchor.y + dy,
      });
      candidates.push({ x: anchor.x + FLOW.labelGap + 14, y: anchor.y + dy });
    }
    let box: FlowRect = {
      x: candidates[0].x,
      y: candidates[0].y,
      width,
      height,
    };
    for (const candidate of candidates) {
      const trial = { x: candidate.x, y: candidate.y, width, height };
      if (labelClear(trial, edges, nodeBoxes, placedLabels)) {
        box = trial;
        break;
      }
    }
    placedLabels.push(box);
    edge.labelBox = box;
    edge.labelLines = lines;
  }

  /* ---- extents: shift everything so content starts at the margins ---------- */
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = flowBottom;
  const stretch = (rect: FlowRect): void => {
    minX = Math.min(minX, rect.x);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  };
  for (const p of placed.values()) {
    stretch({ x: p.x, y: p.y, width: p.width, height: p.height });
  }
  for (const g of groups) stretch(g);
  for (const e of edges) {
    for (const point of e.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (e.labelBox !== null) stretch(e.labelBox);
  }
  if (minX === Number.POSITIVE_INFINITY) {
    minX = 0;
    maxX = 0;
  }
  const dx = FLOW.marginX - minX;

  const nodes: LaidFlowNode[] = file.nodes.map((node) => {
    const p = placed.get(node.id);
    const s = sized.get(node.id);
    if (p === undefined || s === undefined) {
      // Unreachable for a parsed file — every declared node is placed — but
      // the map access is typed optional and a throw keeps the layout total.
      throw new Error(`node "${node.id}" was never placed`);
    }
    const x = p.x + dx;
    return {
      id: node.id,
      shape: node.shape,
      label: node.label,
      lines: s.lines,
      ...(node.technology !== undefined ? { technology: node.technology } : {}),
      ...(node.tags !== undefined ? { tags: node.tags } : {}),
      ...(node.description !== undefined
        ? { description: node.description }
        : {}),
      x,
      y: p.y,
      width: p.width,
      height: p.height,
      cx: p.cx + dx,
      cy: p.cy,
      rank: p.rank,
      labelBox: {
        x: p.cx + dx - s.textWidth / 2,
        y: p.cy - s.textHeight / 2,
        width: s.textWidth,
        height: s.textHeight,
      },
    };
  });

  const shiftedEdges: LaidFlowEdge[] = edges.map((edge) => ({
    ...edge,
    points: edge.points.map((p) => ({ x: p.x + dx, y: p.y })),
    labelBox:
      edge.labelBox === null
        ? null
        : { ...edge.labelBox, x: edge.labelBox.x + dx },
  }));
  const shiftedGroups: LaidFlowGroup[] = groups.map((group) => ({
    ...group,
    x: group.x + dx,
  }));

  const width = Math.ceil(
    Math.max(maxX + dx, FLOW.marginX + heading.width) + FLOW.marginX,
  );
  const height = Math.ceil(maxY + FLOW.marginBottom);
  return {
    width,
    height,
    heading,
    nodes,
    edges: shiftedEdges,
    groups: shiftedGroups,
  };
}

/** Where a label's candidate walk starts: beside the first vertical run
 * (self-loops anchor right of the loop, where the eye looks for the guard). */
function labelAnchor(edge: LaidFlowEdge): FlowPoint {
  if (edge.self) {
    const right = edge.points[1];
    return { x: right.x, y: (edge.points[0].y + edge.points[3].y) / 2 - 8 };
  }
  const [p0, p1] = edge.points;
  if (edge.back) {
    // At the loop's EXIT: the guard names the branch ("no", "retry"), so it
    // must sit where the branch visibly leaves its source — a guard placed
    // along the climb reads as belonging to whatever it happens to be next
    // to, which for the user-reported yes/no pair was the OTHER branch.
    return { x: p0.x, y: p0.y };
  }
  if (edge.points.length === 2) {
    return { x: p0.x, y: (p0.y + p1.y) / 2 - 8 };
  }
  return { x: p0.x, y: p0.y + 4 };
}

/** True when `box` (inflated by the clearance) touches no line, node or label. */
function labelClear(
  box: FlowRect,
  edges: readonly LaidFlowEdge[],
  nodeBoxes: readonly FlowRect[],
  labels: readonly FlowRect[],
): boolean {
  const c = FLOW.labelClearance;
  const inflated = {
    x: box.x - c,
    y: box.y - c,
    width: box.width + c * 2,
    height: box.height + c * 2,
  };
  for (const other of [...nodeBoxes, ...labels]) {
    if (rectsOverlap(inflated, other)) return false;
  }
  for (const edge of edges) {
    for (let i = 0; i + 1 < edge.points.length; i += 1) {
      if (segmentHitsRect(edge.points[i], edge.points[i + 1], inflated)) {
        return false;
      }
    }
  }
  return true;
}

function rectsOverlap(a: FlowRect, b: FlowRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Axis-aligned segment vs rect — the only segment kind this layout emits. */
function segmentHitsRect(a: FlowPoint, b: FlowPoint, rect: FlowRect): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return (
    minX < rect.x + rect.width &&
    maxX > rect.x &&
    minY < rect.y + rect.height &&
    maxY > rect.y
  );
}

/* -------------------------------------------------------------------------- */
/* The heading                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Same design as the sequence heading, same reasons: wrap to the DRAWING's
 * span (floored at `titleMinWrapWidth`) so a long title never widens a small
 * chart, and report the measured width so the canvas widens for the one case
 * wrapping cannot solve — a chart narrower than the wrap floor.
 */
function layoutHeading(
  file: FlowchartLabFile,
  rowSpan: number,
): FlowchartLayout["heading"] {
  return layoutDiagramHeading({
    title: file.metadata.title,
    description: file.metadata.description,
    wrapWidth: Math.max(FLOW.titleMinWrapWidth, rowSpan),
    metrics: FLOW_HEADING,
  });
}
