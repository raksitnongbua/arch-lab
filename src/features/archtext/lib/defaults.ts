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
 * Horizontal pitch when layers advance along X (see `LAYOUT_VERSION`). Wider
 * than `COLUMN_STEP` on purpose: flowing left-to-right puts every edge label
 * chip in a HORIZONTAL gap, where a two-line chip needs the room the vertical
 * gutter used to give it. 176-px node plus a 144-px gutter.
 */
const LAYER_STEP_X = 320;
/**
 * Vertical pitch between members of one layer when layers advance along X.
 * Tallest default node (96) plus a 56-px gutter — tighter than `ROW_STEP`
 * because nothing has to fit between these two boxes: an edge from this layer
 * leaves sideways, so the gap carries no label.
 */
const MEMBER_STEP_Y = 152;
/**
 * Gap between two bands of a folded flow. Wider than the gutter inside a band
 * because the arrow that crosses it is the one that doubles back — the reader
 * needs to see that the flow continues rather than that two boxes are related.
 */
const BAND_GAP_Y = 120;
/**
 * The shape a folded flow aims at. Every screen a diagram is presented on is
 * landscape — a laptop, a projector, a slide — so this is 16:9 rather than
 * anything derived from the model. It is a target, never a constraint: the fold
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
 * The document version at which the layout may choose its long axis.
 *
 * WHY A VERSION AND NOT A FLAG. The coordinates this module returns are a
 * published interface, and not because anyone published them: the parser fills
 * geometry in from here, the serializer OMITS geometry that matches what it
 * returns, and the canvas editor's text patcher agrees with both. Change the
 * answer for an existing document and nothing errors — the file parses, the
 * share link opens — but the first time its owner nudges anything and saves,
 * every node comes back stamped with an explicit `(x,y)`, because the position
 * no longer matches the default the serializer would have dropped. There is no
 * message for that, and the diff is unrecognisable.
 *
 * So a document written against `1.0` keeps `1.0`'s geometry for as long as it
 * says `1.0`. Adopting the new layout is one edit to the header, made by the
 * person who owns the file, who sees the picture change in the same second.
 * `scripts/c4-layout-guard-check.mjs` holds both halves: the `1.0` fixtures
 * must not move, and the `1.1` ones must.
 */
const LAYOUT_VERSION = { major: 1, minor: 1 } as const;

/** True when `version` is at or past the layout change. Unparsable → oldest. */
function choosesLongAxis(version: string | undefined): boolean {
  if (typeof version !== "string") return false;
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (match === null) return false;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  if (major !== LAYOUT_VERSION.major) return major > LAYOUT_VERSION.major;
  return minor >= LAYOUT_VERSION.minor;
}

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
 * Default geometry when the text omits it: a layered top-down layout derived
 * from the diagram's own relationships — sources on top, each target at least
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
  version?: string,
): Map<string, Point> {
  const ids = [...nodeIds].sort(compareStrings);
  const idSet = new Set(ids);
  const rank = new Map(ids.map((id, index) => [id, index] as const));
  const canonical = canonicalEdges(idSet, edges);
  const layer = layerOf(ids, canonical);

  const predecessors = new Map<string, string[]>();
  for (const id of ids) predecessors.set(id, []);
  for (const edge of canonical) {
    if ((layer.get(edge.source) ?? 0) < (layer.get(edge.target) ?? 0)) {
      predecessors.get(edge.target)?.push(edge.source);
    }
  }

  const rows = new Map<number, string[]>();
  let lastRow = 0;
  for (const id of ids) {
    const row = layer.get(id) ?? 0;
    if (row > lastRow) lastRow = row;
    const bucket = rows.get(row);
    if (bucket === undefined) rows.set(row, [id]);
    else bucket.push(id);
  }

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
    members.forEach((id, column) => columnOf.set(id, column));
  }

  let widest = 1;
  for (const members of rows.values()) {
    if (members.length > widest) widest = members.length;
  }

  const positions = new Map<string, Point>();

  /* From 1.1, layers advance along whichever axis the graph needs LESS of.
   *
   * The layering above is the same either way — this only decides which way to
   * pour it out. A diagram whose layers outnumber its widest layer is a flow,
   * and pouring a flow downwards is what turned a seven-element send path into
   * a column three screens tall and one node wide: the viewport is landscape,
   * so fit-to-view answered a 1:3 drawing by shrinking it to 47%, and every
   * label in it became unreadable for a reason that had nothing to do with the
   * labels. Laid along X the same graph is landscape and reads at full size.
   *
   * A diagram whose widest layer outnumbers its layers is already landscape —
   * a hub with six dependents — and turning THAT sideways would recreate the
   * column in the other direction. Hence `>=` rather than an unconditional
   * flip: the tie goes to the flow, because a two-layer graph as wide as it is
   * deep reads better with its arrows running the way people scan. */
  if (choosesLongAxis(version) && lastRow + 1 >= widest) {
    const layers = lastRow + 1;
    const tallest = widest;

    /* Turning the column on its side is not enough on its own, and the
     * document that prompted this proves it: nineteen relationships over ten
     * layers went from 704x2040 (0.35) to 3056x400 (7.64), which fits a
     * landscape viewport exactly as badly — the drawing is now wider than the
     * frame instead of taller, and fit-to-view shrinks it by the same amount
     * for the same reason. A ribbon is a column.
     *
     * So a long flow FOLDS. Bands read the way text does, left to right and
     * then down, and the number of them is whichever count lands closest to
     * the shape of a screen. On that document: one band 7.64, two bands 1.55,
     * three bands 0.80 — two wins, and the diagram becomes 1600x1032. */
    const bandPitch = tallest * MEMBER_STEP_Y + BAND_GAP_Y;
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
      // easier to follow than a folded one, and only shape justifies the fold.
      if (distance < closest) {
        closest = distance;
        bands = candidate;
      }
    }
    const perBand = Math.ceil(layers / bands);

    for (let layer = 0; layer < layers; layer += 1) {
      const members = rows.get(layer) ?? [];
      const band = Math.floor(layer / perBand);
      // Centre short layers within their band, back on the 8-px grid.
      const inset =
        Math.round(((tallest - members.length) * MEMBER_STEP_Y) / 2 / 8) * 8;
      members.forEach((id, member) => {
        positions.set(id, {
          x: ORIGIN + (layer % perBand) * LAYER_STEP_X,
          y: ORIGIN + band * bandPitch + inset + member * MEMBER_STEP_Y,
        });
      });
    }
    return positions;
  }

  for (let row = 0; row <= lastRow; row += 1) {
    const members = rows.get(row) ?? [];
    // Centre narrow rows under the widest one, snapped back to the 8-px grid.
    const indent =
      Math.round(((widest - members.length) * COLUMN_STEP) / 2 / 8) * 8;
    members.forEach((id, column) => {
      positions.set(id, {
        x: ORIGIN + indent + column * COLUMN_STEP,
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
