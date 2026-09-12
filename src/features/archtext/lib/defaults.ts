/**
 * The canonical defaults of the `.alab` format. Every rule here is applied
 * identically by the parser (fill in what the text omitted) and by the
 * serializer (omit what matches the rule), which is what makes terse,
 * Mermaid-like text and full geometry-carrying text two faces of the same
 * lossless format.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { C4NodeType, Point, Size } from "@/types";

/**
 * `metadata.createdAt`/`updatedAt` when the text carries no `created`/
 * `updated` line. A fixed sentinel (never "now") so that parsing is a pure
 * function and the omission rule is symmetric.
 */
export const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00Z";

/* ---- Default geometry: relationship-aware layered layout ------------------ */

/** Top-left of the first row/column. Multiple of 8. */
const ORIGIN = 40;
/** Horizontal pitch — widest default node (176) plus an 88-px gutter. */
const COLUMN_STEP = 264;
/**
 * Vertical pitch — tallest default node (96) plus a 120-px gutter. The gutter
 * is deliberately generous: edge label chips are anchored at the midpoint of
 * the curve, which for a one-layer hop lands in this band, so it has to hold
 * a two-line chip without touching either row.
 */
const ROW_STEP = 216;

/**
 * Horizontal pitch when layers advance along X (`direction=lr`). Wider than
 * `COLUMN_STEP` on purpose: flowing left-to-right puts every edge label chip
 * in a HORIZONTAL gap, where a two-line chip needs the room the vertical
 * gutter used to give it. 176-px node plus a 144-px gutter.
 */
const LAYER_STEP_X = 320;
/**
 * Vertical pitch between members of one layer under `direction=lr`. Tallest
 * default node (96) plus a 56-px gutter — tighter than `ROW_STEP` because
 * nothing has to fit between these two boxes: an edge from this layer leaves
 * sideways, so the gap carries no label.
 */
const MEMBER_STEP_Y = 152;
/** What `MEMBER_STEP_Y` budgets for the element itself — tallest default node. */
const MEMBER_SPAN = 96;
/**
 * Gap between two bands of a folded flow. Wider than the gutter inside a band
 * because the arrow that crosses it is the one that doubles back — the reader
 * needs to see that the flow continues rather than that two boxes are related.
 */
const BAND_GAP_Y = 120;
/**
 * The shape a folded flow aims at. Every screen a diagram is presented on is
 * landscape — a laptop, a projector, a slide — so this is 16:9 rather than
 * anything derived from the model. A target, never a constraint: the fold
 * picks the band count closest to it and takes whatever ratio that gives.
 */
const TARGET_RATIO = 16 / 9;
/**
 * The shortest band a fold may produce. A flow with fewer layers than this
 * stays on one line whatever its ratio: the strip already fits any frame at
 * full size, and a two-box band reads worse than the straight run it replaced.
 */
const MIN_LAYERS_PER_BAND = 4;
/**
 * Extra pitch inserted between two neighbours in a row that belong to
 * DIFFERENT frames (or where one is framed and the other is not).
 *
 * A frame's rectangle is derived from its members' bounding box inflated by
 * `PAD` on every side (`editor/lib/frame-layout.ts`), so two frames sitting on
 * the ordinary pitch put their borders `COLUMN_STEP − 176 − 2·PAD` apart —
 * thirty-two pixels, and under `lr` the vertical pitch leaves two. Boundaries
 * that close to touching read as one shaded mass rather than as two groups,
 * which is the thing frames exist to stop.
 *
 * The gutter is spent only where a boundary actually falls, so a diagram with
 * no frames is laid out exactly where it always was — this constant cannot
 * move a document that does not use them. A multiple of 8, like every other
 * pitch here.
 */
const FRAME_GUTTER = 64;

/**
 * What one column of the ordinary pitch budgets for the element standing in
 * it. `COLUMN_STEP` is this plus the gutter beside it, and both are stated
 * here so a row that mixes elements with reserved lanes can be measured as
 * widths and gaps rather than as a single pitch.
 */
const NODE_SPAN = 176;
/** The gutter `COLUMN_STEP` leaves between two neighbouring elements. */
const COLUMN_GUTTER = COLUMN_STEP - NODE_SPAN;

/** An edge as the layout sees it — endpoints only. */
export interface DefaultLayoutEdge {
  source: string;
  target: string;
}

/**
 * Canonical edge list: only edges whose endpoints both exist and differ,
 * deduplicated by endpoint pair, then sorted. Neither the order edges appear
 * in the text nor in the model arrays can reach the layout through this, so
 * the parser and the serializer always agree.
 */
function canonicalEdges(
  ids: ReadonlySet<string>,
  edges: readonly DefaultLayoutEdge[],
): DefaultLayoutEdge[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const key = `${edge.source}\u0000${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  keys.sort(compareStrings);
  return keys.map((key) => {
    const cut = key.indexOf("\u0000");
    return { source: key.slice(0, cut), target: key.slice(cut + 1) };
  });
}

/**
 * Layer index per node: the longest path from any source, computed on the
 * DAG left after dropping back edges. Back edges are found by a DFS in
 * canonical order, so which edge of a cycle gets dropped is deterministic.
 */
function layerOf(
  ids: readonly string[],
  edges: readonly DefaultLayoutEdge[],
): Map<string, number> {
  const out = new Map<string, string[]>();
  for (const id of ids) out.set(id, []);
  for (const edge of edges) out.get(edge.source)?.push(edge.target);

  // Drop back edges (target currently on the DFS stack) to get a DAG.
  const onStack = new Set<string>();
  const done = new Set<string>();
  const forward = new Map<string, string[]>();
  for (const id of ids) forward.set(id, []);
  const walk = (id: string): void => {
    onStack.add(id);
    for (const target of out.get(id) ?? []) {
      if (onStack.has(target)) continue; // back edge — ignore
      forward.get(id)?.push(target);
      if (!done.has(target)) walk(target);
    }
    onStack.delete(id);
    done.add(id);
  };
  for (const id of ids) if (!done.has(id)) walk(id);

  // Longest-path layering over the DAG, in topological order (Kahn).
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const id of ids) {
    for (const target of forward.get(id) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }
  const layer = new Map<string, number>();
  for (const id of ids) layer.set(id, 0);
  const queue = ids.filter((id) => indegree.get(id) === 0);
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    for (const target of forward.get(id) ?? []) {
      const candidate = (layer.get(id) ?? 0) + 1;
      if (candidate > (layer.get(target) ?? 0)) layer.set(target, candidate);
      const remaining = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  return layer;
}

/**
 * Pull each frame's members together inside one already-ordered row, in place.
 *
 * A frame keeps the position its FIRST member earned from the barycentre, and
 * members keep their order relative to one another; everything else keeps its
 * order too. So the only rows this changes are the ones where a stranger sat
 * between two members of the same boundary — the arrangement that makes a
 * frame draw as two rectangles with unrelated elements standing between them.
 */
function regroupByFrame(
  members: string[],
  frameOf: ReadonlyMap<string, string>,
): void {
  if (frameOf.size === 0) return;
  /* One entry per position in the output: a frame id stands for all of that
     frame's members in this row, a node id for one unframed element. Loose
     elements are deliberately NOT bucketed together — grouping them would drag
     every unframed member in the row to wherever the first one sat, a
     reordering the barycentre never asked for. */
  const order: string[][] = [];
  const grouped = new Map<string, string[]>();
  for (const id of members) {
    const frame = frameOf.get(id);
    if (frame === undefined) {
      order.push([id]);
      continue;
    }
    const bucket = grouped.get(frame);
    if (bucket === undefined) {
      const started = [id];
      grouped.set(frame, started);
      order.push(started);
    } else {
      bucket.push(id);
    }
  }
  const out = order.flat();
  members.length = 0;
  members.push(...out);
}

/**
 * Where each member of a row sits along its own axis, in pixels from the
 * first: each member's own span, plus the gutter between it and its
 * neighbour, plus `FRAME_GUTTER` wherever the boundary a member belongs to
 * differs from its neighbour's. The last entry is the row's span, which is
 * what narrow rows are centred against.
 *
 * MEASURED AS WIDTHS AND GAPS rather than as one pitch, because a row may
 * hold reserved lanes as well as elements and the two are not the same size.
 * With no lanes in the row the arithmetic is `span + gutter` for every step,
 * which is the pitch it replaced — so a document that reserves no lane is
 * laid out exactly where it always was.
 */
function offsetsFor(
  members: readonly string[],
  span: number,
  gutter: number,
  frameOf: ReadonlyMap<string, string>,
  isLane: (id: string) => boolean = () => false,
): number[] {
  const out: number[] = [];
  let at = 0;
  members.forEach((id, index) => {
    if (index > 0) {
      const previous = members[index - 1];
      at += isLane(previous) ? 0 : span;
      at += isLane(previous) || isLane(id) ? gutter / 2 : gutter;
      if (
        !isLane(previous) &&
        !isLane(id) &&
        frameOf.get(id) !== frameOf.get(previous)
      ) {
        at += FRAME_GUTTER;
      }
    }
    out.push(at);
  });
  return out;
}

/**
 * Default geometry when the text omits it: a layered layout derived from the
 * diagram's own relationships, running top-down by default and left-to-right
 * (folding a long flow into bands) when the document asks for it — sources on top, each target at least
 * one row below, rows ordered to keep edges short and centred under their
 * parents. Replaces the old fixed 4-column grid, which ignored edges entirely
 * and so turned any real flow into a tangle of long crossing lines.
 *
 * Pure and deterministic: the only inputs are the node ids (sorted) and the
 * canonical edge set, so the parser (filling geometry in) and the serializer
 * (omitting geometry that matches) compute the same coordinates. All outputs
 * are multiples of 8 (the geometry rule).
 */
export function defaultPositions(
  nodeIds: readonly string[],
  edges: readonly DefaultLayoutEdge[],
  direction: "tb" | "lr" = "tb",
  frameOf: ReadonlyMap<string, string> = new Map(),
): Map<string, Point> {
  const ids = [...nodeIds].sort(compareStrings);
  const idSet = new Set(ids);
  const rank = new Map(ids.map((id, index) => [id, index] as const));
  const canonical = canonicalEdges(idSet, edges);
  const layer = layerOf(ids, canonical);

  /**
   * A RESERVED LANE IN EVERY ROW A CONNECTOR CROSSES WITHOUT BELONGING TO IT.
   *
   * An edge whose ends are two or more rows apart has to travel past the rows
   * in between, and those rows used to be ordered as though it did not exist.
   * The barycentre was then free to place one of their elements squarely on
   * the line: a gateway two rows below an ingress had the web application put
   * directly between them, and no corridor search can rescue a connector whose
   * two ends sit on either side of a box — both of its legs have to get past
   * it, whichever lane the crossing run takes.
   *
   * So the long edge is broken into a chain through the rows it crosses, and
   * each link stands in its row as an ordinary member: the barycentre orders
   * it with everything else, and the row's real elements are laid out beside
   * it rather than on top of it. This is the standard dummy-vertex treatment
   * a layered layout uses, and it is here for its ORDER, not its width — a
   * lane and its two half-gutters occupy exactly `COLUMN_STEP`, so no diagram
   * grows because one was reserved.
   *
   * WHAT A LANE DOES NOT DO, because it is visible and the boundary matters. It
   * holds a column open; it does not steer the connector into that column. Both
   * ends are attached by `edge-fan` before any of this is drawn, so where a
   * source and a target sit directly above one another with an unrelated element
   * beside them, the connector still runs straight down between its own two
   * anchors and the lane stands empty somewhere else in the row. Closing that
   * would mean the layout choosing attachment points, which is `edge-fan`'s job
   * and a larger change than this. On every document that ships with the repo
   * the lane is enough — `check:layout-quality` is what says so, and what will
   * say when it stops being enough.
   *
   * `tb` ONLY. The `lr` path folds its layers into bands, so a connector that
   * skips a layer may cross a band boundary rather than a row; what a lane
   * should mean there is a separate question, and reserving one on a geometry
   * that has not been measured for it would move every folded document for a
   * benefit nobody has shown.
   */
  const lanes = new Set<string>();
  const laneRow = new Map<string, number>();
  const predecessors = new Map<string, string[]>();
  for (const id of ids) predecessors.set(id, []);
  canonical.forEach((edge, index) => {
    const from = layer.get(edge.source) ?? 0;
    const to = layer.get(edge.target) ?? 0;
    if (from >= to) return;
    let above = edge.source;
    if (direction === "tb") {
      for (let row = from + 1; row < to; row += 1) {
        /* NUL-prefixed, which no node id can be: `canonicalEdges` already
           uses NUL as the separator no id may contain. */
        const lane = `\u0000lane\u0000${index}\u0000${row}`;
        lanes.add(lane);
        laneRow.set(lane, row);
        rank.set(lane, ids.length + rank.size);
        predecessors.set(lane, [above]);
        above = lane;
      }
    }
    predecessors.get(edge.target)?.push(above);
  });
  const isLane = (id: string): boolean => lanes.has(id);

  const rows = new Map<number, string[]>();
  let lastRow = 0;
  const intoRow = (id: string, row: number): void => {
    if (row > lastRow) lastRow = row;
    const bucket = rows.get(row);
    if (bucket === undefined) rows.set(row, [id]);
    else bucket.push(id);
  };
  for (const id of ids) intoRow(id, layer.get(id) ?? 0);
  for (const lane of lanes) intoRow(lane, laneRow.get(lane) ?? 0);

  // Order each row by the mean column of its predecessors in the row above
  // (barycentre heuristic) so edges run mostly straight down; sorted-id order
  // breaks ties and orders anything with no placed parent.
  const columnOf = new Map<string, number>();
  for (let row = 0; row <= lastRow; row += 1) {
    const members = rows.get(row) ?? [];
    const barycentre = new Map<string, number>();
    for (const id of members) {
      const placed = (predecessors.get(id) ?? [])
        .map((parent) => columnOf.get(parent))
        .filter((column): column is number => column !== undefined);
      if (placed.length > 0) {
        const sum = placed.reduce((total, column) => total + column, 0);
        barycentre.set(id, sum / placed.length);
      }
    }
    members.sort((a, b) => {
      const ba = barycentre.get(a);
      const bb = barycentre.get(b);
      if (ba !== undefined && bb !== undefined && ba !== bb) return ba - bb;
      if (ba !== undefined && bb === undefined) return -1;
      if (ba === undefined && bb !== undefined) return 1;
      return (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
    });
    /* Members of one frame are pulled together, at the position the
       first of them already earned. The barycentre decided the ORDER of this
       row and it still does — this only stops a stranger being interleaved
       between two members of the same boundary, which is what forces a frame
       to draw as two rectangles with the diagram's own elements sitting
       between them. Stable, so a row with no frames is untouched. */
    regroupByFrame(members, frameOf);
    members.forEach((id, column) => columnOf.set(id, column));
  }

  let widest = 1;
  for (const members of rows.values()) {
    if (members.length > widest) widest = members.length;
  }

  const positions = new Map<string, Point>();

  /* `lr`: layers advance along X, and a long flow FOLDS.
   *
   * Turning the column on its side is not enough on its own. Nineteen
   * relationships over ten layers went from 704x2040 (ratio 0.35) to 3056x400
   * (7.64), which fits a landscape viewport exactly as badly — the drawing is
   * wider than the frame instead of taller, and fit-to-view shrinks it by the
   * same amount for the same reason. A ribbon is a column.
   *
   * So bands read the way text does, left to right and then down, and the
   * count is whichever lands closest to the shape of a screen. On that
   * document: one band 7.64, two 1.55, three 0.80 — two wins, and the diagram
   * becomes 1456x904.
   *
   * The `>= widest` test is what stops this being the same bug rotated: a
   * diagram whose widest layer outnumbers its layers is ALREADY landscape — a
   * hub with six dependents — and turning that sideways would recreate the
   * column in the other direction. The tie goes to the flow, because a graph
   * as wide as it is deep reads better with its arrows running the way people
   * scan. */
  if (direction === "lr" && lastRow + 1 >= widest) {
    const layers = lastRow + 1;
    /* Measured in pixels rather than in members, because a layer carrying two
       frames is taller than its member count says. With no frames every span
       is `(n − 1)·MEMBER_STEP_Y` and the arithmetic below is the arithmetic
       that was here before. */
    const spans = new Map<number, number[]>();
    let tallestSpan = 0;
    for (let layer = 0; layer < layers; layer += 1) {
      const offsets = offsetsFor(
        rows.get(layer) ?? [],
        MEMBER_SPAN,
        MEMBER_STEP_Y - MEMBER_SPAN,
        frameOf,
      );
      spans.set(layer, offsets);
      const span = offsets[offsets.length - 1] ?? 0;
      if (span > tallestSpan) tallestSpan = span;
    }
    const bandPitch = tallestSpan + MEMBER_STEP_Y + BAND_GAP_Y;

    let bands = 1;
    let closest = Number.POSITIVE_INFINITY;
    for (let candidate = 1; candidate <= layers; candidate += 1) {
      const perBand = Math.ceil(layers / candidate);
      /* A fold has to buy more than a ratio. Three boxes laid a-b / c read
       * worse than a-b-c however close to 16:9 the second shape scores, and
       * the strip was never the problem — it fits any frame at full size. So
       * only a band with real length in it counts as an option, and one band
       * is always an option. */
      if (candidate > 1 && perBand < MIN_LAYERS_PER_BAND) continue;
      const width = perBand * LAYER_STEP_X;
      const height = candidate * bandPitch - BAND_GAP_Y;
      const distance = Math.abs(width / height - TARGET_RATIO);
      // Strictly closer, so a tie keeps the FEWER bands: an unfolded flow is
      // easier to follow, and only shape justifies the fold.
      if (distance < closest) {
        closest = distance;
        bands = candidate;
      }
    }
    const perBand = Math.ceil(layers / bands);

    for (let layer = 0; layer < layers; layer += 1) {
      const members = rows.get(layer) ?? [];
      const offsets = spans.get(layer) ?? [];
      const span = offsets[offsets.length - 1] ?? 0;
      const band = Math.floor(layer / perBand);
      // Centre short layers within their band, back on the 8-px grid.
      const inset = Math.round((tallestSpan - span) / 2 / 8) * 8;
      members.forEach((id, member) => {
        positions.set(id, {
          x: ORIGIN + (layer % perBand) * LAYER_STEP_X,
          y: ORIGIN + band * bandPitch + inset + offsets[member],
        });
      });
    }
    return positions;
  }

  const columns = new Map<number, number[]>();
  let widestSpan = 0;
  for (let row = 0; row <= lastRow; row += 1) {
    const offsets = offsetsFor(
      rows.get(row) ?? [],
      NODE_SPAN,
      COLUMN_GUTTER,
      frameOf,
      isLane,
    );
    columns.set(row, offsets);
    const span = offsets[offsets.length - 1] ?? 0;
    if (span > widestSpan) widestSpan = span;
  }
  for (let row = 0; row <= lastRow; row += 1) {
    const members = rows.get(row) ?? [];
    const offsets = columns.get(row) ?? [];
    const span = offsets[offsets.length - 1] ?? 0;
    // Centre narrow rows under the widest one, snapped back to the 8-px grid.
    const indent = Math.round((widestSpan - span) / 2 / 8) * 8;
    members.forEach((id, column) => {
      // A lane holds a column open; nothing stands in it, so nothing is placed.
      if (isLane(id)) return;
      positions.set(id, {
        x: ORIGIN + indent + offsets[column],
        y: ORIGIN + row * ROW_STEP,
      });
    });
  }
  return positions;
}

/** Default size by node type; the minimum is 120×64. */
export function defaultSizeFor(type: C4NodeType): Size {
  return type === "person"
    ? { width: 160, height: 96 }
    : { width: 176, height: 88 };
}

/** Default edge id when the edge line carries no `id=` attribute. */
export function defaultEdgeId(source: string, target: string): string {
  return `e-${source}-${target}`;
}

/** UTF-16 code-unit comparison — locale-independent, byte-deterministic. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
