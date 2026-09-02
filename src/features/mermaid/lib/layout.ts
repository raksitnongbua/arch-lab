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

/**
 * The `.alab` schema version the Mermaid importers stamp on the models they
 * build. Kept beside the layout call that has to agree with it.
 */
const MERMAID_MODEL_VERSION = "1.0";

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
  /* Pinned to the version the Mermaid importers stamp on the model they build
   * (`version: "1.0"`, in every `toModel`), NOT left to the default. An import
   * writes a whole document: if the geometry here came from a later layout than
   * the header it writes, the file would be born disagreeing with itself, and
   * the first save would stamp a coordinate onto every node. Whether a Mermaid
   * import should ADOPT a later layout is a product decision about what new
   * documents get — make it by changing both together, here and in the
   * importers, not by dropping this argument. */
  return defaultPositions(nodeIds, edges, MERMAID_MODEL_VERSION);
}
