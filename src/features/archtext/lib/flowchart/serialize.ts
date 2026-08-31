/**
 * `FlowchartLabFile` → `.alab` flowchart text. Deterministic: fixed line
 * order, fixed attribute order, canonical omission rules mirrored exactly
 * by the parser's defaults, so the same model always yields byte-identical
 * text and `parse(serialize(file))` reproduces `file` losslessly.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` lines are omitted when equal to the fixed
 *     sentinel (`DEFAULT_TIMESTAMP`, shared with the other two grammars).
 *   - An edge's `: "label"` tail is written only when `label` is a string —
 *     absent and present are two states and both survive the round trip.
 *   - `groups` produces `group` blocks only when the array is present; an
 *     empty array is invalid (two spellings of "no groups"), matching the
 *     sequence serializer's `boxes` rule.
 *
 * Known optional fields with unexpected shapes, and unknown
 * forward-compatible fields, are carried by the same `!` escape lines the
 * other grammars use (`bangLine` is imported, not copied), preserving value
 * and key position.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models a flowchart
 * validator would refuse anyway (missing required fields, wrong shapes).
 *
 * Imported by `scripts/flowchart-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { FlowchartLabFile } from "@/types";

import { isNormalizedTint } from "@/lib/tint";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import {
  bangLine,
  isFiniteNumber,
  isRecord,
  tagsLine,
  techBody,
} from "../serialize";
import { BARE_ID_RE, numberToken, valueToken } from "../text";
import { TINT_ATTRIBUTE } from "../sequence/keywords";
import {
  FLOWCHART_ARROW,
  FLOWCHART_BLOCK,
  FLOWCHART_HEADER_WORD,
  GROUP_KEYWORD,
  NODE_SHAPE_BY_KEYWORD,
  RESERVED_FLOWCHART_WORDS,
} from "./keywords";
import {
  FLOW_EDGE_KEYS,
  FLOW_FILE_KEYS,
  FLOW_GROUP_KEYS,
  FLOW_NODE_KEYS,
} from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeFlowchartText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid flowchart document`,
  );
}

/**
 * Id token for body lines. Same bare/quoted rule as the C4 grammar's
 * `idToken`, EXTENDED by the flowchart grammar's reserved words: a node
 * literally named `step` or `group` must be quoted on an edge line or the
 * parser would read it as a keyword. One reservation set
 * (`RESERVED_FLOWCHART_WORDS`) feeds both the parser's dispatch and this
 * quoting decision.
 */
function flowIdToken(id: string): string {
  return BARE_ID_RE.test(id) && !RESERVED_FLOWCHART_WORDS.has(id)
    ? id
    : JSON.stringify(id);
}

/* -------------------------------------------------------------------------- */
/* The serializer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Serializes a `FlowchartLabFile` to canonical `.alab` flowchart text. Pure
 * and deterministic: identical models always produce identical bytes, and
 * `parseFlowchartText(serializeFlowchartText(file))` round-trips every field.
 */
export function serializeFlowchartText(file: FlowchartLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  /* ------------------------------- header ------------------------------- */
  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "flowchart") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${FLOWCHART_HEADER_WORD}`);

  const schemaValue = file.$schema;
  if (typeof schemaValue === "string") {
    lines.push(`schema ${JSON.stringify(schemaValue)}`);
  }

  const metadata = file.metadata;
  if (!isRecord(metadata)) invalid("metadata", metadata);
  if (typeof metadata.title !== "string" || metadata.title === "") {
    invalid("metadata.title", metadata.title);
  }
  lines.push(`title ${JSON.stringify(metadata.title)}`);

  const metaFallback: [string, unknown][] = [];
  const stringLine = (key: string, keyword: string): void => {
    const value = metadata[key];
    if (typeof value === "string") {
      lines.push(`${keyword} ${JSON.stringify(value)}`);
    } else if (value !== undefined) {
      metaFallback.push([key, value]);
    }
  };
  stringLine("description", "description");
  stringLine("owner", "owner");

  const metaTags = tagsLine(metadata.tags);
  if (metaTags !== undefined) lines.push(`tags ${metaTags}`);
  else if (metadata.tags !== undefined) {
    metaFallback.push(["tags", metadata.tags]);
  }

  for (const [key, keyword] of [
    ["createdAt", "created"],
    ["updatedAt", "updated"],
  ] as const) {
    const value = metadata[key];
    if (typeof value !== "string" || value === "") {
      invalid(`metadata.${key}`, value);
    }
    if (value !== DEFAULT_TIMESTAMP) {
      lines.push(`${keyword} ${valueToken(value)}`);
    }
  }

  const reviewed = metadata.lastReviewedAt;
  if (typeof reviewed === "string") {
    lines.push(`reviewed ${valueToken(reviewed)}`);
  } else if (reviewed !== undefined) {
    metaFallback.push(["lastReviewedAt", reviewed]);
  }

  /* No dedicated flowchart lines for these three (see FLOW_META_RAW for why):
     present means the raw escape, whatever the shape. */
  for (const key of ["tagColors", "customIcons", "generator"]) {
    if (metadata[key] !== undefined) metaFallback.push([key, metadata[key]]);
  }

  for (const [key, value] of metaFallback) {
    lines.push(bangLine(["meta", key], null, value));
  }
  for (const u of splitUnknowns(metadata, META_KEYS)) {
    lines.push(bangLine(["meta", u.key], u.after, u.value));
  }

  if (schemaValue !== undefined && typeof schemaValue !== "string") {
    lines.push(bangLine(["$schema"], null, schemaValue));
  }
  for (const u of splitUnknowns(file, FLOW_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  /* -------------------------------- body -------------------------------- */
  lines.push("");
  lines.push(FLOWCHART_BLOCK);

  const nodes = file.nodes;
  if (!Array.isArray(nodes)) invalid("nodes", nodes);
  emitNodes(lines, nodes, file.groups);

  const edges = file.edges;
  if (!Array.isArray(edges)) invalid("edges", edges);
  if (nodes.length > 0 && edges.length > 0) lines.push("");
  for (const value of edges) emitEdge(lines, value, "  ");

  return `${lines.join("\n")}\n`;
}

/* -------------------------------------------------------------------------- */
/* Nodes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The node block, with `group` clusters restored around their members.
 *
 * Driven by walking `nodes` IN ORDER and opening a group when its first
 * member is reached — the same contract as the sequence serializer's
 * `emitParticipants`, for the same reason: the array is the declaration
 * order and the text has to reproduce it exactly, so a group is only ever a
 * bracket around a run of the real order. A group whose members are NOT such
 * a run is unrepresentable in this text, so it is refused here rather than
 * written as something the parser would read back differently.
 */
/* -------------------------------------------------------------------------- */
/* Canonical blocks, for the editable canvas                                  */
/* -------------------------------------------------------------------------- */

/**
 * ONE ELEMENT'S CANONICAL LINES, so a canvas gesture can splice them into the
 * author's own text instead of re-emitting the file. The C4 grammar's
 * `canonicalNodeBlock` and the sequence grammar's `canonicalParticipantBlock`
 * are the same idea, and `line-patch.ts` holds the argument for why every
 * gesture must go through one of them.
 *
 * A BLOCK, NOT A LINE, for both: a flowchart node's `desc` and either kind's
 * `!` escapes are continuation lines an edit may add, replace or remove, so
 * the unit has to be the element's whole block. Continuations inside the
 * replaced block come back in canonical ORDER even where the author wrote them
 * the other way round; every byte OUTSIDE it is untouched, which is the
 * guarantee that matters.
 */

/**
 * The canonical lines for one node — declaration plus its `desc` and `!`
 * continuations — at `pad` indentation, or `null` when `nodeId` is not in
 * `file`.
 *
 * `pad` IS THE CALLER'S, exactly as in the sequence grammar: a node inside a
 * `group` sits at four spaces and one outside it at two, and this function
 * cannot tell which from the model alone without re-deriving the group walk.
 * The caller reads it off the leading whitespace of the block it is replacing,
 * which is the only source that cannot be wrong about membership.
 */
export function canonicalFlowNodeBlock(
  file: FlowchartLabFile,
  nodeId: string,
  pad: string,
): string[] | null {
  if (!isRecord(file)) invalid("the file", file);
  const nodes = file.nodes;
  if (!Array.isArray(nodes)) invalid("nodes", nodes);
  const node = nodes.find(
    (candidate) => isRecord(candidate) && candidate.id === nodeId,
  );
  if (node === undefined) return null;
  const lines: string[] = [];
  emitNode(lines, node, pad);
  return lines;
}

/**
 * The canonical lines for the edge at `index` in `file.edges`, or `null` when
 * the index does not land on one.
 *
 * BY INDEX, not by a `from`/`to` pair, for the reason `FlowchartSpans` gives
 * at length: a flowchart edge has no id, and two edges between the same pair
 * of nodes are legal text — so a pair is not a key, and a lookup by one would
 * patch whichever of the two it happened to find first.
 */
export function canonicalFlowEdgeBlock(
  file: FlowchartLabFile,
  index: number,
  pad: string,
): string[] | null {
  if (!isRecord(file)) invalid("the file", file);
  const edges = file.edges;
  if (!Array.isArray(edges)) invalid("edges", edges);
  if (!Number.isInteger(index) || index < 0 || index >= edges.length) {
    return null;
  }
  const lines: string[] = [];
  emitEdge(lines, edges[index], pad);
  return lines;
}

function emitNodes(
  lines: string[],
  nodes: unknown[],
  groupsValue: unknown,
): void {
  if (groupsValue === undefined) {
    for (const value of nodes) emitNode(lines, value, "  ");
    return;
  }
  if (!Array.isArray(groupsValue) || groupsValue.length === 0) {
    invalid("groups", groupsValue);
  }

  /** node id → the group that claims it. */
  const groupByMember = new Map<string, { group: Record<string, unknown> }>();
  for (const groupValue of groupsValue) {
    if (!isRecord(groupValue)) invalid("a group", groupValue);
    const members = groupValue.nodes;
    if (
      !Array.isArray(members) ||
      members.length === 0 ||
      !members.every((id) => typeof id === "string" && id !== "")
    ) {
      invalid("a group nodes list", members);
    }
    for (const id of members as string[]) {
      if (groupByMember.has(id)) {
        invalid(`node "${id}" claimed by two groups`, groupsValue);
      }
      groupByMember.set(id, { group: groupValue });
    }
  }

  const emitted = new Set<Record<string, unknown>>();
  let open: Record<string, unknown> | null = null;
  for (const value of nodes) {
    if (!isRecord(value)) invalid("a node", value);
    const id = value.id;
    if (typeof id !== "string") invalid("a node id", id);
    const claim = groupByMember.get(id);
    const group = claim?.group ?? null;

    if (group !== open) {
      open = group;
      if (group !== null) {
        if (emitted.has(group)) {
          invalid(
            `a group whose members are not neighbours in nodes ("${id}" is outside its run)`,
            group,
          );
        }
        emitted.add(group);
        emitGroupOpener(lines, group);
      }
    }
    emitNode(lines, value, group === null ? "  " : "    ");
  }

  for (const groupValue of groupsValue) {
    if (isRecord(groupValue) && !emitted.has(groupValue)) {
      invalid("a group whose nodes are not in the document", groupValue);
    }
  }
}

function emitGroupOpener(
  lines: string[],
  group: Record<string, unknown>,
): void {
  const label = group.label;
  if (typeof label !== "string" || label === "") {
    invalid("a group label", label);
  }
  const fallback: [string, unknown][] = [];
  let line = `  ${GROUP_KEYWORD} ${JSON.stringify(label)}`;
  const tint = group.tint;
  if (isNormalizedTint(tint)) line += ` ${TINT_ATTRIBUTE}=${tint}`;
  else if (tint !== undefined) fallback.push(["tint", tint]);
  lines.push(line);
  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(group, FLOW_GROUP_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
}

function emitNode(lines: string[], value: unknown, pad: string): void {
  if (!isRecord(value)) invalid("a node", value);
  const id = value.id;
  if (typeof id !== "string" || id === "") invalid("a node id", id);
  const shape = value.shape;
  if (typeof shape !== "string" || NODE_SHAPE_BY_KEYWORD[shape] === undefined) {
    /* An unknown SHAPE is not key-level forward tolerance — a new symbol is
       a new grammar production, i.e. a major change. Throw rather than guess
       a keyword the parser would reject. */
    invalid(`node "${id}".shape`, shape);
  }
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid(`node "${id}".label`, label);
  }

  const fallback: [string, unknown][] = [];
  let line = `${pad}${shape} ${flowIdToken(id)} ${JSON.stringify(label)}`;

  const technology = value.technology;
  if (typeof technology === "string") {
    line += ` [${techBody(technology)}]`;
  } else if (technology !== undefined) {
    fallback.push(["technology", technology]);
  }

  const tags = tagsLine(value.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (value.tags !== undefined) fallback.push(["tags", value.tags]);

  /* `(x,y)` LAST ON THE LINE, matching `FLOW_NODE_KEYS`. Written only when the
     author pinned the node: an absent position is the normal case and means
     "solve my place from the arrows", so emitting a derived coordinate here
     would turn every unpinned node into a pinned one on the first save — the
     round trip would still be byte-stable and the document would have silently
     changed meaning. A malformed point falls back to the `!` escape rather
     than being written as a position the parser would reject. */
  const position = value.position;
  if (position !== undefined) {
    /* EXACTLY x AND y, and the key COUNT is the load-bearing half of this
       test. Checking only that x and y are numbers passed a point carrying a
       third key from a newer minor — `{"x":1,"y":2,"z":3}` — and wrote it back
       as `(1,2)`, silently dropping the `z`. A `(x,y)` token cannot spell a
       third coordinate, so a point that has one must ride the `!` escape
       whole. (The C4 serializer splits the extras out as their own bang lines
       instead; that needs a `POINT_KEYS` walk this grammar has no other use
       for, and carrying the point intact loses nothing.) */
    const spellable =
      isRecord(position) &&
      isFiniteNumber(position.x) &&
      isFiniteNumber(position.y) &&
      Object.keys(position).length === 2;
    if (spellable) {
      line += ` (${numberToken(position.x as number)},${numberToken(position.y as number)})`;
    } else {
      fallback.push(["position", position]);
    }
  }
  lines.push(line);

  const description = value.description;
  if (typeof description === "string") {
    lines.push(`${pad}  desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }

  for (const [key, raw] of fallback) {
    lines.push(`${pad}  ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, FLOW_NODE_KEYS)) {
    lines.push(`${pad}  ${bangLine([u.key], u.after, u.value)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                      */
/* -------------------------------------------------------------------------- */

function emitEdge(lines: string[], value: unknown, pad: string): void {
  if (!isRecord(value)) invalid("an edge", value);
  const from = value.from;
  const to = value.to;
  if (typeof from !== "string" || from === "") invalid("an edge source", from);
  if (typeof to !== "string" || to === "") invalid("an edge target", to);

  const fallback: [string, unknown][] = [];
  let line = `${pad}${flowIdToken(from)} ${FLOWCHART_ARROW} ${flowIdToken(to)}`;
  const label = value.label;
  if (typeof label === "string") line += ` : ${JSON.stringify(label)}`;
  else if (label !== undefined) fallback.push(["label", label]);
  lines.push(line);

  for (const [key, raw] of fallback) {
    lines.push(`${pad}  ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, FLOW_EDGE_KEYS)) {
    lines.push(`${pad}  ${bangLine([u.key], u.after, u.value)}`);
  }
}
