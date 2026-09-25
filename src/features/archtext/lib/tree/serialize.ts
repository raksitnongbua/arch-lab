/**
 * `TreeLabFile` → `.alab` tree text. The inverse of `./parse.ts`, and the
 * half of the pair that makes the round trip a hard invariant: open a file,
 * change nothing, save, and the bytes must be identical (`check:tree`).
 *
 * THE ORDER IS THE SCHEMA'S, NOT THIS FILE'S. `./schema.ts` declares
 * `TREE_NODE_KEYS` in the order a node's lines are written, so a reader
 * comparing the two sees one order rather than two that happen to agree
 * today. The same is true of `TREE_FILE_KEYS` for the header.
 *
 * WHAT IS WRITTEN AND WHAT IS NOT:
 *
 *   - A TRAILING EMPTY CELL never reaches the model — `./parse.ts` trims it —
 *     so nothing here has to decide about one. An empty cell with a filled
 *     cell after it survives and is written as the bare `EMPTY_CELL_TOKEN`:
 *     dropping it would shift every later cell one column left, which is a
 *     silent change to what the document says.
 *   - AN EMPTY `children` ARRAY IS NEVER WRITTEN, because absent and empty
 *     mean the same thing (`src/types/tree.ts`) and writing one would make a
 *     leaf round-trip into a different model than it parsed from.
 *   - THE TWO TIMESTAMPS ARE OMITTED WHEN THEY EQUAL `DEFAULT_TIMESTAMP`,
 *     which is the symmetric half of the parser filling them in. Writing them
 *     would grow a terse document on its first save.
 *   - UNKNOWN KEYS RIDE THE `!` ESCAPE, in the position their `after` anchor
 *     names, which is what lets a document written by a newer minor open,
 *     save and keep the fields this version has never heard of.
 */

import type { TreeLabFile, TreeNode } from "@/types";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine } from "../serialize";
import { valueToken } from "../text";
import {
  CELL_KEYWORD,
  COLUMNS_KEYWORD,
  DESC_KEYWORD,
  EMPTY_CELL_TOKEN,
  INDENT_STEP,
  LEVELS_KEYWORD,
  NODE_KEYWORD,
  TREE_BLOCK_MARKER,
  TREE_HEADER_WORD,
} from "./keywords";
import { TREE_FILE_KEYS, TREE_NODE_KEYS } from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `cannot serialize a tree: ${what} is ${JSON.stringify(value)}`,
  );
}

const pad = (level: number): string => " ".repeat(level * INDENT_STEP);

/** Serialises one node and everything under it, depth-first. */
function writeNode(node: TreeNode, level: number, out: string[]): void {
  if (typeof node.id !== "string" || node.id === "")
    invalid("a node id", node.id);
  if (typeof node.label !== "string") invalid("a node label", node.label);

  const indent = pad(level);
  const tags = tagsLine(node.tags);
  out.push(
    `${indent}${NODE_KEYWORD} ${node.id} ${JSON.stringify(node.label)}` +
      (tags === undefined ? "" : ` ${tags}`),
  );

  const inner = pad(level + 1);
  const fallback: [string, unknown][] = [];

  if (typeof node.description === "string") {
    out.push(`${inner}${DESC_KEYWORD} ${JSON.stringify(node.description)}`);
  } else if (node.description !== undefined) {
    fallback.push(["description", node.description]);
  }

  if (tags === undefined && node.tags !== undefined) {
    fallback.push(["tags", node.tags]);
  }

  const cells = node.cells;
  if (Array.isArray(cells) && cells.every((cell) => typeof cell === "string")) {
    for (const cell of cells) {
      out.push(
        cell === ""
          ? `${inner}${CELL_KEYWORD} ${EMPTY_CELL_TOKEN}`
          : `${inner}${CELL_KEYWORD} ${JSON.stringify(cell)}`,
      );
    }
  } else if (cells !== undefined) {
    fallback.push(["cells", cells]);
  }

  /* Forward tolerance: anything this version cannot spell is written back
     through the escape rather than dropped. */
  for (const [key, value] of fallback) {
    out.push(`${inner}${bangLine([key], null, value)}`);
  }
  for (const unknown of splitUnknowns(node, TREE_NODE_KEYS)) {
    out.push(
      `${inner}${bangLine([unknown.key], unknown.after, unknown.value)}`,
    );
  }

  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) writeNode(child, level + 1, out);
  } else if (children !== undefined) {
    invalid("a node's children", children);
  }
}

/** Serialises a whole tree document. Pure and deterministic. */
export function serializeTreeText(file: TreeLabFile): string {
  if (typeof file.version !== "string") invalid("version", file.version);

  const lines: string[] = [];
  lines.push(`archlab ${file.version} ${TREE_HEADER_WORD}`);

  const metadata = file.metadata;
  if (!isRecord(metadata)) invalid("metadata", metadata);
  if (typeof metadata.title !== "string")
    invalid("metadata.title", metadata.title);
  if (metadata.title !== "") {
    lines.push(`title ${JSON.stringify(metadata.title)}`);
  }

  const metaFallback: [string, unknown][] = [];
  const stringLine = (key: string, keyword: string): void => {
    const value = metadata[key];
    if (typeof value === "string") {
      lines.push(`${keyword} ${JSON.stringify(value)}`);
    } else if (value !== undefined) metaFallback.push([key, value]);
  };
  stringLine("description", "description");
  stringLine("owner", "owner");

  const metaTags = tagsLine(metadata.tags);
  if (metaTags !== undefined) lines.push(`tags ${metaTags}`);
  else if (metadata.tags !== undefined)
    metaFallback.push(["tags", metadata.tags]);

  for (const [key, keyword] of [
    ["createdAt", "created"],
    ["updatedAt", "updated"],
  ] as const) {
    const value = metadata[key];
    if (typeof value !== "string" || value === "") {
      invalid(`metadata.${key}`, value);
    }
    if (value !== DEFAULT_TIMESTAMP)
      lines.push(`${keyword} ${valueToken(value)}`);
  }

  const reviewed = metadata.lastReviewedAt;
  if (typeof reviewed === "string")
    lines.push(`reviewed ${valueToken(reviewed)}`);
  else if (reviewed !== undefined) {
    metaFallback.push(["lastReviewedAt", reviewed]);
  }

  for (const key of ["tagColors", "customIcons", "generator"]) {
    if (metadata[key] !== undefined) metaFallback.push([key, metadata[key]]);
  }
  for (const [key, value] of metaFallback) {
    lines.push(bangLine(["meta", key], null, value));
  }
  for (const unknown of splitUnknowns(metadata, META_KEYS)) {
    lines.push(bangLine(["meta", unknown.key], unknown.after, unknown.value));
  }

  const schemaValue = file.$schema;
  if (typeof schemaValue === "string") {
    lines.push(`schema ${JSON.stringify(schemaValue)}`);
  } else if (schemaValue !== undefined) {
    lines.push(bangLine(["$schema"], null, schemaValue));
  }
  for (const unknown of splitUnknowns(file, TREE_FILE_KEYS)) {
    lines.push(bangLine([unknown.key], null, unknown.value));
  }

  lines.push("");
  lines.push(TREE_BLOCK_MARKER);

  const levels = file.levels;
  if (Array.isArray(levels) && levels.length > 0) {
    lines.push(
      `${pad(1)}${LEVELS_KEYWORD} ${levels.map((name) => JSON.stringify(name)).join(" ")}`,
    );
  }

  const columns = file.columns;
  if (Array.isArray(columns) && columns.length > 0) {
    lines.push(
      `${pad(1)}${COLUMNS_KEYWORD} ${columns.map((c) => JSON.stringify(c)).join(" ")}`,
    );
  }

  if (!isRecord(file.root)) invalid("root", file.root);
  writeNode(file.root as unknown as TreeNode, 1, lines);

  return `${lines.join("\n")}\n`;
}
