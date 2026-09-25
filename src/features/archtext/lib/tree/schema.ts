/**
 * Schema-declared key knowledge shared by the `.alab` tree parser and
 * serializer — the tree counterpart of `../lifecycle/schema.ts`, with the same
 * three-way split: `*_KEYS` is canonical key order, `*_RAW` is the optional
 * fields a `! <key> : <json>` escape may set, and everything else known has
 * dedicated syntax and is refused on a `!` line.
 *
 * `META_KEYS` is not redeclared: a tree reuses `ArchLabMetadata`.
 *
 * Imported by `scripts/tree-check.mjs` through Node's type stripping.
 */

import { SEQ_META_RAW } from "../sequence/schema";

/* `columns` before `root`, matching the text: what the columns are called,
   then the thing being broken down. There is no axis field and no origin —
   nothing here measures. */
export const TREE_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "levels",
  "columns",
  "root",
] as const;

/* `children` last, matching the text: the node line, its continuations, then
   what is nested under it. `tags` sits right after `label` because tags are
   written ON the node line; `description` then `cells` follow in the order
   their continuation lines are emitted, so this list and the serializer read
   the same way down the page. */
export const TREE_NODE_KEYS = [
  "id",
  "label",
  "tags",
  "description",
  "cells",
  "children",
] as const;

/** Imported, not copied, exactly as `LIFECYCLE_META_RAW` is. */
export const TREE_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/**
 * `id` and `label` have dedicated syntax on the node line, and `children` is
 * STRUCTURAL — it is the nesting in the text, so a raw `! children` line would
 * build a subtree the serializer cannot spell back.
 *
 * `CELLS IS NOT ESCAPABLE`, which is worth stating because it is the one field
 * here a `!` line could plausibly want to set: it is an array of strings and
 * looks exactly like the sort of open-ended author data the family escapes
 * elsewhere. The dedicated syntax is where the two rules that keep a cell
 * meaningful are enforced — that the document declared `columns` at all, and
 * that a node carries no more cells than there are headers — and a `! cells :
 * ["a","b","c"]` line on a two-column document would route around both,
 * producing a model whose third cell has nothing to be drawn under. The
 * escape hatch must not be a way to write a document the grammar refuses.
 *
 * `tags` and `description` are escapable for the reason they are everywhere
 * else in the family: both are open-ended author data, so a value from a newer
 * minor that the `#tag` micro-grammar or the `desc` line cannot spell is
 * forward tolerance rather than a new grammar production.
 */
export const TREE_NODE_RAW: ReadonlySet<string> = new Set([
  "tags",
  "description",
]);
