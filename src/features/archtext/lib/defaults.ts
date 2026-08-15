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
