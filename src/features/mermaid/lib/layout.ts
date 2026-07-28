/**
 * Node geometry for parsed Mermaid diagrams. Mermaid code carries no
 * coordinates, but arch-lab nodes require `position`/`size`, so the parser
 * assigns them here.
 *
 * There is deliberately no layout algorithm of its own: this delegates to
 * `defaultPositions` / `defaultSizeFor`, the `.alab` format's own defaults for
 * omitted geometry. One engine means a Mermaid import and a hand-written
 * geometry-less `.alab` file lay out identically, and — because the emitted
 * coordinates *are* the defaults — converting Mermaid to `.alab` yields terse
 * text with no geometry noise at all.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { defaultPositions, defaultSizeFor } from "@/features/archtext";
import type { C4NodeType, Point, Size } from "@/types";

/** Position of a node in a diagram that holds nothing else. */
export const LONE_NODE_POSITION: Point = { x: 40, y: 40 };

export interface LayoutEdge {
  source: string;
  target: string;
}

/** The `.alab` default size for a node of this type. */
export function sizeForNodeType(type: C4NodeType): Size {
  return defaultSizeFor(type);
}

/**
 * Positions every node id from the relationships between them. Deterministic:
 * the same ids and edges always yield the same coordinates, in whatever order
 * they arrive.
 */
export function layoutNodes(
  nodeIds: readonly string[],
  edges: readonly LayoutEdge[],
): Map<string, Point> {
  return defaultPositions(nodeIds, edges);
}
