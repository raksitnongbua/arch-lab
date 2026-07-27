/**
 * Deterministic layered layout for parsed Mermaid diagrams. Mermaid code
 * carries no coordinates, but arch-flow nodes require `position`/`size`, so
 * the parser lays nodes out here.
 *
 * Algorithm — longest-path layering by relationship direction:
 *   1. Every node starts at layer 0, in declaration order.
 *   2. A depth-first pass over the edges (also in declaration order) pushes
 *      each edge's target at least one layer below its source. Edges that
 *      would close a cycle (their target is on the current DFS stack) are
 *      skipped, so the pass terminates on any input.
 *   3. Within a layer, nodes keep declaration order; columns are spaced on a
 *      fixed grid.
 *
 * Determinism: the only inputs are the node order and the edge order, both
 * taken verbatim from the source, and every step iterates them in that
 * order — the same source always yields the same coordinates. All outputs
 * are integral multiples of 8 (data-model.md geometry rule).
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { Point, Size } from "@/types";

/** One size for every parsed node; ≥ the schema minimum of 120×64. */
export const NODE_SIZE: Size = { width: 192, height: 96 };

const ORIGIN = 40; // multiple of 8
const COLUMN_STEP = 240; // width 192 + 48 gap
const ROW_STEP = 176; // height 96 + 80 gap

export interface LayoutEdge {
  source: string;
  target: string;
}

/**
 * Computes a position for every node id. `nodeIds` and `edges` must be in
 * source-declaration order; the result is deterministic and overlap-free.
 */
export function layoutNodes(
  nodeIds: readonly string[],
  edges: readonly LayoutEdge[],
): Map<string, Point> {
  const layer = new Map<string, number>();
  for (const id of nodeIds) layer.set(id, 0);

  const outgoing = new Map<string, string[]>();
  for (const id of nodeIds) outgoing.set(id, []);
  for (const edge of edges) {
    const targets = outgoing.get(edge.source);
    // Endpoints are validated upstream; unknown ids are simply not laid out.
    if (targets !== undefined && layer.has(edge.target)) {
      targets.push(edge.target);
    }
  }

  // Longest-path layering, skipping back-edges (cycle-safe, deterministic).
  const onStack = new Set<string>();
  const place = (id: string, depth: number): void => {
    const current = layer.get(id) ?? 0;
    if (depth > current) layer.set(id, depth);
    else if (depth < current) return; // already deeper via another path
    onStack.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (!onStack.has(target)) place(target, depth + 1);
    }
    onStack.delete(id);
  };
  for (const id of nodeIds) {
    if ((layer.get(id) ?? 0) === 0) place(id, 0);
  }

  const columnByLayer = new Map<number, number>();
  const positions = new Map<string, Point>();
  for (const id of nodeIds) {
    const row = layer.get(id) ?? 0;
    const column = columnByLayer.get(row) ?? 0;
    columnByLayer.set(row, column + 1);
    positions.set(id, {
      x: ORIGIN + column * COLUMN_STEP,
      y: ORIGIN + row * ROW_STEP,
    });
  }
  return positions;
}
