/**
 * Keyword tables of the `.alab` grammar — node-type keywords, arrow forms,
 * and the file extension. One table per mapping, used by both directions,
 * so parser and serializer can never disagree.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { C4NodeType, EdgeDirection, EdgeStyle } from "@/types";

/** The file extension of the arch-lab text format. */
export const ARCHTEXT_EXTENSION = ".alab";

/**
 * Every word a C4 header line may open with, in the order the format
 * documents them — which is the order `parseHeaderLine`'s switch reads them
 * and the order its refusal names them.
 *
 * ONE ARRAY FOR THE SENTENCE AND FOR THE FIX. The refusal used to hand-type
 * this list inside its own message, a screen below the switch that enforces
 * it: two halves of one closed set, each self-consistent, free to disagree —
 * `codebase.md` §4, and the failure mode is a message naming a keyword the
 * parser stopped accepting. The message is now joined from here and
 * `closestMatches` ranks the near misses against the same array, so a
 * fourteenth keyword cannot arrive in one half only. `check:quickfix` reads
 * the `case "…":` labels straight off the parser source and fails if they
 * drift from this array.
 *
 * NOT SHARED with the sequence and flowchart header sets, which are shorter
 * and are their own arrays for the reason their parsers give: `tagcolor`,
 * `customicon`, `generator` and `root` do not exist there, and the two
 * shorter sets are only COINCIDENTALLY equal to each other today.
 */
export const C4_HEADER_KEYWORDS: readonly string[] = [
  "archlab",
  "schema",
  "title",
  "description",
  "owner",
  "direction",
  "tags",
  "created",
  "updated",
  "reviewed",
  "tagcolor",
  "customicon",
  "generator",
  "root",
];

/** `.alab` node-type keyword → model node type (bijective). */
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

/** Model node type → `.alab` keyword (inverse of `NODE_TYPE_BY_KEYWORD`). */
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
