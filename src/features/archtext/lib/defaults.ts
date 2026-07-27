/**
 * The canonical defaults of the `.aft` format. Every rule here is applied
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

/**
 * Default position of the node at ordinal `i` in its diagram's node list
 * sorted by id (UTF-16 order). A 4-column grid on the 8-px lattice. The
 * ordinal is computed over the sorted ids so it does not depend on the
 * order nodes appear in the text or in the model arrays.
 */
export function defaultPositionAt(i: number): Point {
  return { x: 40 + (i % 4) * 240, y: 40 + Math.floor(i / 4) * 160 };
}

/** Default size by node type (data-model.md minimum is 120×64). */
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
