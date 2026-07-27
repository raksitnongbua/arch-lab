/**
 * Keyword tables of the `.aft` grammar — node-type keywords, arrow forms,
 * and the file extension. One table per mapping, used by both directions,
 * so parser and serializer can never disagree.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { C4NodeType, EdgeDirection, EdgeStyle } from "@/types";

/** The file extension of the arch-flow text format. */
export const ARCHTEXT_EXTENSION = ".aft";

/** `.aft` node-type keyword → model node type (bijective). */
export const NODE_TYPE_BY_KEYWORD: Readonly<Record<string, C4NodeType>> = {
  person: "person",
  system: "softwareSystem",
  external: "externalSystem",
  container: "container",
  database: "database",
  queue: "queue",
  component: "component",
  code: "codeElement",
};

/** Model node type → `.aft` keyword (inverse of `NODE_TYPE_BY_KEYWORD`). */
export const KEYWORD_BY_NODE_TYPE: Readonly<Record<C4NodeType, string>> = {
  person: "person",
  softwareSystem: "system",
  externalSystem: "external",
  container: "container",
  database: "database",
  queue: "queue",
  component: "component",
  codeElement: "code",
};

export interface ArrowSpec {
  direction: EdgeDirection;
  /** `undefined` means the edge carries no explicit `style` key. */
  style: EdgeStyle | undefined;
}

/**
 * Arrow token → direction/style. Solid arrows encode "no style key"; the
 * rare explicit `"style": "solid"` is carried by the `style=solid` edge
 * attribute instead, so absent-vs-explicit-solid survives the round trip.
 * Listed longest-first — the parser must try them in this order.
 */
export const ARROWS: readonly (readonly [string, ArrowSpec])[] = [
  ["<..>", { direction: "bidirectional", style: "dashed" }],
  ["<->", { direction: "bidirectional", style: undefined }],
  ["..>", { direction: "forward", style: "dashed" }],
  ["->", { direction: "forward", style: undefined }],
  ["..", { direction: "none", style: "dashed" }],
  ["--", { direction: "none", style: undefined }],
];

/** Direction (+ dashed?) → canonical arrow token. */
export function arrowFor(direction: EdgeDirection, dashed: boolean): string {
  switch (direction) {
    case "bidirectional":
      return dashed ? "<..>" : "<->";
    case "none":
      return dashed ? ".." : "--";
    case "forward":
      return dashed ? "..>" : "->";
  }
}
