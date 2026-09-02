/**
 * `ArchLabFile` → `.alab` text. Deterministic: fixed line order, fixed
 * attribute order, canonical omission rules (mirrored exactly by the
 * parser's defaults), so the same model always yields byte-identical text
 * and `parse(serialize(file))` reproduces `file` losslessly.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` lines are omitted when equal to the fixed sentinel.
 *   - A diagram's title is omitted when it equals its owner node's name.
 *   - A diagram's `in=` is omitted when it equals the diagram containing its
 *     owner node; `in=null` is written when a parent-less diagram has an
 *     owner (so inference would otherwise kick in).
 *   - A node's `(x,y w×h)` is omitted when both equal the default layered
 *     layout position for its diagram and its type default size.
 *   - An edge's `id=` is omitted when it equals `e-<source>-<target>`.
 *   - The `root` line is omitted when exactly one parentless `@context`
 *     diagram exists and it is the root.
 *
 * Unknown forward-compatible fields, and known optional fields whose shape
 * the editor's validator does not pin down, are carried by `!` escape lines
 * (`! <path> [after <anchor>] : <json>`), preserving both value and key
 * position so the editor's JSON writer reproduces the original bytes.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models the editor's
 * validator would refuse anyway.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { ArchLabFile, C4NodeType, EdgeDirection, Point } from "@/types";

import {
  compareStrings,
  defaultEdgeId,
  defaultPositions,
  defaultSizeFor,
  DEFAULT_TIMESTAMP,
} from "./defaults";
import { arrowFor, KEYWORD_BY_NODE_TYPE } from "./keywords";
import {
  CUSTOM_ICON_KEYS,
  DIAGRAM_KEYS,
  EDGE_KEYS,
  EXTERNAL_REF_KEYS,
  FILE_KEYS,
  GENERATOR_KEYS,
  META_KEYS,
  NODE_KEYS,
  POINT_KEYS,
  VIEWPORT_KEYS,
  splitUnknowns,
} from "./schema";
import {
  BARE_ID_RE,
  BARE_TAG_RE,
  idToken,
  keyToken,
  numberToken,
  tagToken,
  valueToken,
} from "./text";

/* -------------------------------------------------------------------------- */
/* Shape helpers                                                              */
/* -------------------------------------------------------------------------- */

/* `isRecord`, `bangLine`, `techBody` and `tagsLine` are exported for the
   sequence serializer (`./sequence/serialize.ts`): the `!` escape line, the
   `[technology]` quoting rule and the `#tag` line are one grammar shared by
   both `.alab` document types, so the emitters must be shared too. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shared with the flowchart serializer, which needs the same guard for a
 *  pinned node's `(x,y)`. Exported rather than copied — see `dry.md`. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeArchText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model would not pass validateArchLabFile`,
  );
}

function json(value: unknown, what: string): string {
  const out = JSON.stringify(value);
  if (out === undefined) invalid(what, value);
  return out;
}

/** `! <path> [after <anchor>] : <json>` */
export function bangLine(
  path: readonly (string | number)[],
  after: string | null,
  value: unknown,
): string {
  const rendered = path
    .map((segment, i) => {
      if (typeof segment === "number") return String(segment);
      /* A top-level unknown key literally named "meta" must be quoted so it
         is not mistaken for the metadata scope. */
      if (i === 0 && segment === "meta" && path.length === 1) {
        return JSON.stringify(segment);
      }
      return keyToken(segment);
    })
    .join(".");
  const anchor = after === null ? "" : ` after ${keyToken(after)}`;
  return `! ${rendered}${anchor} : ${json(value, `"${rendered}"`)}`;
}

/** Technology body: raw between brackets when safe, JSON-quoted otherwise. */
export function techBody(value: string): string {
  const safe =
    !value.includes("]") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    !value.startsWith('"');
  return safe ? value : JSON.stringify(value);
}

function iconToken(icon: string): string {
  return BARE_ID_RE.test(icon) ? icon : JSON.stringify(icon);
}

function tagKeyToken(tag: string): string {
  return BARE_TAG_RE.test(tag) ? tag : JSON.stringify(tag);
}

/** Sugar-able tag list: non-empty array of strings. */
export function tagsLine(value: unknown): string | undefined {
  if (isStringArray(value) && value.length > 0) {
    return [...value]
      .sort(compareStrings)
      .map((tag) => tagToken(tag))
      .join(" ");
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* The serializer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Serializes an `ArchLabFile` to canonical `.alab` text. Pure and
 * deterministic: identical models always produce identical bytes, and
 * `parseArchText(serializeArchText(file))` round-trips every field.
 */
export function serializeArchText(file: ArchLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  /* ------------------------------- header ------------------------------- */

  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  lines.push(`archlab ${version}`);

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
  /* Bare, not quoted — one of two fixed words, exactly as the parser reads it.
   * Omitted when absent, which is what keeps a document that never mentions
   * direction byte-identical through a round trip. */
  const fileDirection = (file as Record<string, unknown>).direction;
  if (fileDirection === "tb" || fileDirection === "lr") {
    lines.push(`direction ${fileDirection}`);
  } else if (fileDirection !== undefined) {
    invalid("direction", fileDirection);
  }

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

  const tagColors = metadata.tagColors;
  if (
    isRecord(tagColors) &&
    Object.keys(tagColors).length > 0 &&
    Object.values(tagColors).every((value) => typeof value === "string")
  ) {
    for (const [tag, color] of Object.entries(tagColors)) {
      lines.push(
        `tagcolor ${tagKeyToken(tag)} ${JSON.stringify(color as string)}`,
      );
    }
  } else if (tagColors !== undefined) {
    metaFallback.push(["tagColors", tagColors]);
  }

  const customIcons = metadata.customIcons;
  const customIconOk =
    isRecord(customIcons) &&
    Object.keys(customIcons).length > 0 &&
    Object.values(customIcons).every(
      (icon) =>
        isRecord(icon) &&
        typeof icon.name === "string" &&
        typeof icon.svg === "string",
    );
  if (customIconOk) {
    for (const [slug, iconValue] of Object.entries(customIcons)) {
      const icon = iconValue as unknown as Record<string, unknown>;
      lines.push(
        `customicon ${iconToken(slug)} ${JSON.stringify(icon.name)} ${JSON.stringify(icon.svg)}`,
      );
      for (const u of splitUnknowns(icon, CUSTOM_ICON_KEYS)) {
        lines.push(
          bangLine(["meta", "customIcons", slug, u.key], u.after, u.value),
        );
      }
    }
  } else if (customIcons !== undefined) {
    metaFallback.push(["customIcons", customIcons]);
  }

  const generator = metadata.generator;
  if (
    isRecord(generator) &&
    typeof generator.name === "string" &&
    typeof generator.version === "string"
  ) {
    lines.push(
      `generator ${JSON.stringify(generator.name)} ${JSON.stringify(generator.version)}`,
    );
    for (const u of splitUnknowns(generator, GENERATOR_KEYS)) {
      lines.push(bangLine(["meta", "generator", u.key], u.after, u.value));
    }
  } else if (generator !== undefined) {
    metaFallback.push(["generator", generator]);
  }

  for (const [key, value] of metaFallback) {
    lines.push(bangLine(["meta", key], null, value));
  }
  for (const u of splitUnknowns(metadata, META_KEYS)) {
    lines.push(bangLine(["meta", u.key], u.after, u.value));
  }

  /* -------------------------- root + file unknowns ----------------------- */

  const rootDiagramId = file.rootDiagramId;
  if (typeof rootDiagramId !== "string" || rootDiagramId === "") {
    invalid("rootDiagramId", rootDiagramId);
  }
  const diagramsValue = file.diagrams;
  if (!Array.isArray(diagramsValue)) invalid("diagrams", diagramsValue);
  const diagrams = diagramsValue.map((diagram, i) => {
    if (!isRecord(diagram)) invalid(`diagrams[${i}]`, diagram);
    return diagram;
  });

  const parentless = diagrams.filter(
    (d) => d.level === "context" && d.parentDiagramId === null,
  );
  if (!(parentless.length === 1 && parentless[0].id === rootDiagramId)) {
    lines.push(`root ${idToken(rootDiagramId)}`);
  }

  if (schemaValue !== undefined && typeof schemaValue !== "string") {
    lines.push(bangLine(["$schema"], null, schemaValue));
  }
  for (const u of splitUnknowns(file, FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  /* --------------------- node lookup for owner inference ----------------- */

  const nodeHome = buildNodeHome(diagrams);

  /* ------------------------------ diagrams ------------------------------- */

  for (const diagram of diagrams) {
    lines.push("");
    emitDiagram(lines, diagram, nodeHome, resolveDirection(file, diagram));
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Which diagram each node id lives in, and under what name — the lookup the
 * `^ref` name-omission rule and a diagram's title-omission rule both consult.
 * First declaration wins, matching the parser's own owner inference.
 *
 * Shared with `canonicalNodeLine` for the same reason as `defaultLayoutFor`:
 * a `^ref` line's name is omitted or written depending on this map, so a
 * second copy could omit a name the file around it writes out.
 */
function buildNodeHome(
  diagrams: readonly Record<string, unknown>[],
): ReadonlyMap<string, { diagramId: string; name: string }> {
  const nodeHome = new Map<string, { diagramId: string; name: string }>();
  for (const diagram of diagrams) {
    const id = diagram.id;
    if (typeof id !== "string" || id === "") invalid("a diagram id", id);
    const nodes = diagram.nodes;
    if (!Array.isArray(nodes)) invalid(`diagram "${id}".nodes`, nodes);
    for (const node of nodes) {
      if (!isRecord(node)) invalid(`a node of diagram "${id}"`, node);
      if (typeof node.id !== "string" || node.id === "") {
        invalid("a node id", node.id);
      }
      if (typeof node.name !== "string" || node.name === "") {
        invalid(`node "${node.id}".name`, node.name);
      }
      if (!nodeHome.has(node.id)) {
        nodeHome.set(node.id, { diagramId: id, name: node.name });
      }
    }
  }
  return nodeHome;
}

/**
 * The canonical BLOCK for one node — byte for byte the lines
 * `serializeArchText` would write for it: the `  <id>:<kind> "Name" …`
 * declaration line (geometry token, or its canonical omission, included) plus
 * its `desc` and `!` continuation lines.
 *
 * WHY THIS EXISTS. A canvas edit used to be a whole-document re-emit, which
 * deleted every `//` comment, every author blank line and every field the
 * author wrote out that canonical form omits at its default. An edit is now a
 * splice into the author's own text, and this is where the replacement lines
 * come from — derived from the serializer rather than assembled a second
 * time, so a patched block cannot be non-canonical. The revise gesture is the
 * caller that needs the WHOLE block: it edits `description`, which is a
 * continuation line an edit may add, replace or remove — the same reason the
 * sequence grammar's `canonicalMessageBlock` deals in blocks. The cost is the
 * one that gesture's sibling documents: `!` escape lines inside the edited
 * block come back in canonical ORDER even if the author wrote them the other
 * way round; every byte outside the block is untouched.
 * See `playground/input/canvas-edit.ts`.
 *
 * No `pad` parameter, unlike the sequence blocks: the C4 grammar fixes a
 * node's indentation (two spaces, continuations at four) rather than carrying
 * structure in it, so there is nothing to read off the replaced block.
 *
 * `null` when `diagramId` or `nodeId` is not in `file`.
 */
export function canonicalNodeBlock(
  file: ArchLabFile,
  diagramId: string,
  nodeId: string,
): string[] | null {
  if (!isRecord(file)) invalid("the file", file);
  const diagramsValue = file.diagrams;
  if (!Array.isArray(diagramsValue)) invalid("diagrams", diagramsValue);
  const diagrams = diagramsValue.map((diagram, i) => {
    if (!isRecord(diagram)) invalid(`diagrams[${i}]`, diagram);
    return diagram;
  });
  const diagram = diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;

  const nodes = (diagram.nodes as unknown[]).map(
    (node) => node as Record<string, unknown>,
  );
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) return null;

  const edgesValue = diagram.edges;
  if (!Array.isArray(edgesValue)) {
    invalid(`diagram "${diagramId}".edges`, edgesValue);
  }
  const edges = edgesValue.map((edge, i) => {
    if (!isRecord(edge)) invalid(`diagram "${diagramId}".edges[${i}]`, edge);
    return edge;
  });

  const lines: string[] = [];
  emitNode(
    lines,
    node,
    defaultLayoutFor(nodes, edges, resolveDirection(file, diagram)),
    buildNodeHome(diagrams),
  );
  return lines;
}

/**
 * The canonical DECLARATION line alone — the first line of
 * `canonicalNodeBlock`, which `emitNode` pushes before any continuation.
 *
 * The node's CONTINUATION lines (`desc`, `!` escapes) are deliberately not
 * returned. A drag changes nothing below the declaration line, and handing
 * back a whole block would invite a splice that reflows a `desc` line's
 * spacing for no reason. The revise gesture, which does change `desc`, takes
 * the block instead.
 *
 * `null` when `diagramId` or `nodeId` is not in `file`.
 */
export function canonicalNodeLine(
  file: ArchLabFile,
  diagramId: string,
  nodeId: string,
): string | null {
  const lines = canonicalNodeBlock(file, diagramId, nodeId);
  return lines === null ? null : lines[0];
}

/**
 * The canonical BLOCK for one edge — byte for byte the lines
 * `serializeArchText` would write for it: the `  <source> -> <target> …`
 * relationship line plus any `!` escape continuations the edge carries.
 *
 * Exists for the connect gesture (`playground/input/canvas-edit.ts`), which
 * splices a NEW relationship into the author's own text: deriving the lines
 * from the emitter is what keeps a patched edge canonical — the duty
 * `canonicalNodeBlock` discharges for nodes, one element kind over. A freshly
 * minted edge's block is exactly one line, but this returns whatever the
 * serializer would write so the derivation cannot silently narrow (the
 * `canonicalDiagramBlock` argument).
 *
 * `null` when `diagramId` or `edgeId` is not in `file`.
 */
export function canonicalEdgeBlock(
  file: ArchLabFile,
  diagramId: string,
  edgeId: string,
): string[] | null {
  if (!isRecord(file)) invalid("the file", file);
  const diagramsValue = file.diagrams;
  if (!Array.isArray(diagramsValue)) invalid("diagrams", diagramsValue);
  const diagram = diagramsValue.find(
    (candidate) => isRecord(candidate) && candidate.id === diagramId,
  ) as Record<string, unknown> | undefined;
  if (diagram === undefined) return null;
  const edgesValue = diagram.edges;
  if (!Array.isArray(edgesValue)) {
    invalid(`diagram "${diagramId}".edges`, edgesValue);
  }
  const edge = edgesValue.find(
    (candidate) => isRecord(candidate) && candidate.id === edgeId,
  ) as Record<string, unknown> | undefined;
  if (edge === undefined) return null;
  const lines: string[] = [];
  emitEdge(lines, edge);
  return lines;
}

/**
 * The canonical header line for one `tagColors` entry — byte for byte the
 * line `serializeArchText` writes for it, kept HERE so the one place that
 * knows when a tag or a colour needs quoting (`tagKeyToken`) is the one that
 * spells the line. The colour edit in `playground/input/canvas-edit.ts`
 * splices this into the header when it mints a colour the document does not
 * define yet; a copy of the format string there would drift the first time
 * either learned a new escape.
 */
export function canonicalTagColorLine(tag: string, color: string): string {
  return `tagcolor ${tagKeyToken(tag)} ${JSON.stringify(color)}`;
}

/**
 * The canonical `frame` declaration for a TOP-LEVEL boundary — byte for byte
 * the line `serializeArchText` writes for one with no `parentFrameId`, kept
 * here for `canonicalTagColorLine`'s reason: the one place that knows when an
 * id needs quoting is the one that spells the line. The boundary gesture in
 * `playground/input/canvas-edit.ts` splices this into the diagram body when
 * it mints a frame the document does not declare yet. Top-level only, on
 * purpose: nesting is a statement about two frames the panel's single-element
 * control never makes (`C4NodeFrameChoice`), so `emitDiagram` appends the
 * three-valued `in=` itself.
 */
export function canonicalFrameLine(frameId: string, label: string): string {
  return `  frame ${idToken(frameId)} ${JSON.stringify(label)}`;
}

/**
 * The canonical declaration line for ONE frame of `diagramId` — byte for byte
 * the line `serializeArchText` writes for it, the three-valued `in=` nesting
 * included, which is what `canonicalFrameLine` deliberately does not carry
 * (see its header: a MINT is always top-level; an existing frame is whatever
 * the author nested it in). The boundary rename in
 * `playground/input/canvas-edit.ts` splices this over the frame's own line,
 * and deriving it from the emitter is what keeps a renamed nested frame's
 * `in=` exactly as the serializer would spell it.
 *
 * `null` when `diagramId` or `frameId` is not in `file`.
 */
export function canonicalFrameDeclaration(
  file: ArchLabFile,
  diagramId: string,
  frameId: string,
): string | null {
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  const frames = diagram?.frames;
  const index = frames?.findIndex((frame) => frame.id === frameId) ?? -1;
  const frame = index === -1 ? undefined : frames?.[index];
  if (frame === undefined) return null;
  return frameDeclaration(
    diagramId,
    frame as unknown as Record<string, unknown>,
    index,
  );
}

/**
 * One frame's declaration line, shared by `emitDiagram` and
 * `canonicalFrameDeclaration` so a spliced rename and a full serialise cannot
 * spell the same frame two ways. Validation lives here with the emission for
 * the same reason it does in `emitDiagram`'s other branches: the line and the
 * refusal to write a malformed one are one decision.
 */
function frameDeclaration(
  diagramId: string,
  frame: Record<string, unknown>,
  index: number,
): string {
  const frameId = frame.id;
  const label = frame.label;
  if (typeof frameId !== "string" || frameId === "") {
    invalid(`diagram "${diagramId}".frames[${index}].id`, frameId);
  }
  if (typeof label !== "string" || label === "") {
    invalid(`diagram "${diagramId}".frames[${index}].label`, label);
  }
  let line = canonicalFrameLine(frameId, label);
  // `parentFrameId` is three-valued and all three must survive: absent
  // (no attribute), explicit null (`in=null`) and an id. Writing absent
  // and null the same way would collapse them on the next read.
  if ("parentFrameId" in frame) {
    const parent = frame.parentFrameId;
    if (parent === null) {
      line += " in=null";
    } else if (typeof parent === "string" && parent !== "") {
      line += ` in=${idToken(parent)}`;
    } else {
      invalid(`diagram "${diagramId}".frames[${index}].parentFrameId`, parent);
    }
  }
  return line;
}

/**
 * The canonical BLOCK for one diagram — byte for byte the lines
 * `serializeArchText` writes for it, its `@<level>` head first, WITHOUT the
 * blank separator line (that line belongs to the file's join, and the caller
 * decides whether the splice point already has one).
 *
 * Exists for the nest gesture: giving a node a child diagram appends a whole
 * new diagram block to the text, and deriving those lines from the serializer
 * is what keeps a patched block canonical — the same duty
 * `canonicalNodeBlock` discharges one element down. For the freshly minted
 * child the block is exactly one head line, but this returns whatever the
 * serializer would write so the derivation cannot silently narrow.
 *
 * `null` when `diagramId` is not in `file`.
 */
export function canonicalDiagramBlock(
  file: ArchLabFile,
  diagramId: string,
): string[] | null {
  if (!isRecord(file)) invalid("the file", file);
  const diagramsValue = file.diagrams;
  if (!Array.isArray(diagramsValue)) invalid("diagrams", diagramsValue);
  const diagrams = diagramsValue.map((diagram, i) => {
    if (!isRecord(diagram)) invalid(`diagrams[${i}]`, diagram);
    return diagram;
  });
  const diagram = diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;
  const lines: string[] = [];
  emitDiagram(
    lines,
    diagram,
    buildNodeHome(diagrams),
    resolveDirection(file, diagram),
  );
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Diagram / node / edge emitters                                             */
/* -------------------------------------------------------------------------- */

/**
 * The one `@level id …` line a diagram's block opens with.
 *
 * Extracted so a canvas gesture can replace exactly that line and nothing
 * else. `canonicalDiagramBlock` emits the whole block — every node, edge and
 * frame — and a gesture built on it would be a re-emit, which is the thing
 * `canvas-editing.md` forbids by name: the first drag of the release that did
 * that deleted every `//` comment in the author's file. One line in, one line
 * out.
 */
function diagramHeadLine(
  diagram: Record<string, unknown>,
  nodeHome: ReadonlyMap<string, { diagramId: string; name: string }>,
): string {
  const id = diagram.id as string;
  const level = diagram.level;
  const title = diagram.title;
  const owner = diagram.ownerNodeId;
  const parent = diagram.parentDiagramId;
  const ownerHome = typeof owner === "string" ? nodeHome.get(owner) : undefined;
  let head = `@${level as string} ${idToken(id)}`;
  if (!(ownerHome !== undefined && ownerHome.name === title)) {
    head += ` ${JSON.stringify(title)}`;
  }
  if (typeof owner === "string") head += ` owner=${idToken(owner)}`;
  const ownDirection = diagram.direction;
  if (ownDirection === "tb" || ownDirection === "lr") {
    head += ` direction=${ownDirection}`;
  } else if (ownDirection !== undefined) {
    invalid(`diagram "${id}".direction`, ownDirection);
  }
  if (typeof parent === "string") {
    if (ownerHome === undefined || ownerHome.diagramId !== parent) {
      head += ` in=${idToken(parent)}`;
    }
  } else if (ownerHome !== undefined) {
    /* Parent is null but inference from owner= would produce one. */
    head += ` in=null`;
  }
  return head;
}

/**
 * That line for one diagram of `file`, or null when there is no such diagram.
 * The canvas's layout-direction gesture writes this and only this.
 */
export function canonicalDiagramHead(
  file: ArchLabFile,
  diagramId: string,
): string | null {
  if (!isRecord(file)) invalid("the file", file);
  const diagramsValue = file.diagrams;
  if (!Array.isArray(diagramsValue)) invalid("diagrams", diagramsValue);
  const diagrams = diagramsValue.map((diagram, i) => {
    if (!isRecord(diagram)) invalid(`diagrams[${i}]`, diagram);
    return diagram;
  });
  const diagram = diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;
  return diagramHeadLine(diagram, buildNodeHome(diagrams));
}

function emitDiagram(
  lines: string[],
  diagram: Record<string, unknown>,
  nodeHome: ReadonlyMap<string, { diagramId: string; name: string }>,
  direction: "tb" | "lr",
): void {
  const id = diagram.id as string;
  const level = diagram.level;
  if (
    level !== "context" &&
    level !== "container" &&
    level !== "component" &&
    level !== "code"
  ) {
    invalid(`diagram "${id}".level`, level);
  }
  const title = diagram.title;
  if (typeof title !== "string" || title === "") {
    invalid(`diagram "${id}".title`, title);
  }
  const owner = diagram.ownerNodeId;
  if (owner !== null && (typeof owner !== "string" || owner === "")) {
    invalid(`diagram "${id}".ownerNodeId`, owner);
  }
  const parent = diagram.parentDiagramId;
  if (parent !== null && (typeof parent !== "string" || parent === "")) {
    invalid(`diagram "${id}".parentDiagramId`, parent);
  }

  lines.push(diagramHeadLine(diagram, nodeHome));

  const fallback: [string, unknown][] = [];
  const description = diagram.description;
  if (typeof description === "string") {
    lines.push(`  desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }

  const viewport = diagram.viewport;
  if (viewport !== undefined) {
    if (
      !isRecord(viewport) ||
      !isFiniteNumber(viewport.zoom) ||
      !isFiniteNumber(viewport.x) ||
      !isFiniteNumber(viewport.y)
    ) {
      invalid(`diagram "${id}".viewport`, viewport);
    }
    lines.push(
      `  view ${numberToken(viewport.zoom)} ${numberToken(viewport.x)} ${numberToken(viewport.y)}`,
    );
    for (const u of splitUnknowns(viewport, VIEWPORT_KEYS)) {
      lines.push(`  ${bangLine(["viewport", u.key], u.after, u.value)}`);
    }
  }

  for (const [key, value] of fallback) {
    lines.push(`  ${bangLine([key], null, value)}`);
  }
  for (const u of splitUnknowns(diagram, DIAGRAM_KEYS)) {
    lines.push(`  ${bangLine([u.key], u.after, u.value)}`);
  }

  // Frames precede nodes so a reader meets the boundary before its members,
  // and because a node's `in=` is only meaningful once its frame is declared.
  // Emitted in stored order: the JSON writer already sorted `frames` by id.
  const framesValue = diagram.frames;
  if (framesValue !== undefined) {
    if (!Array.isArray(framesValue)) {
      invalid(`diagram "${id}".frames`, framesValue);
    }
    framesValue.forEach((frame, i) => {
      if (!isRecord(frame)) invalid(`diagram "${id}".frames[${i}]`, frame);
      lines.push(frameDeclaration(id, frame, i));
    });
  }

  const nodes = (diagram.nodes as unknown[]).map(
    (node) => node as Record<string, unknown>,
  );
  const edgesValue = diagram.edges;
  if (!Array.isArray(edgesValue)) invalid(`diagram "${id}".edges`, edgesValue);
  const edges = edgesValue.map((edge, i) => {
    if (!isRecord(edge)) invalid(`diagram "${id}".edges[${i}]`, edge);
    return edge;
  });

  const layout = defaultLayoutFor(nodes, edges, direction);
  for (const node of nodes) {
    emitNode(lines, node, layout, nodeHome);
  }
  if (nodes.length > 0 && edges.length > 0) lines.push("");
  for (const edge of edges) {
    emitEdge(lines, edge);
  }
}

/**
 * The default layered layout a diagram's nodes are measured against — the same
 * inputs the parser uses to fill omitted geometry in, so geometry matching the
 * default is omitted again on the way out.
 *
 * Extracted because `canonicalNodeLine` has to reach the SAME verdict for the
 * one line it writes as a whole-file serialise would. Two copies of this is
 * precisely the "two halves of one thing, each self-consistent, that disagree"
 * failure: a patched line whose geometry token was decided against a different
 * layout is text the next parse reads as a different diagram.
 */
/**
 * The direction a diagram lays out in — the same resolution the parser does.
 *
 * IT HAS TO BE THE SAME FUNCTION OF THE SAME TWO FIELDS. The parser fills
 * geometry in from `defaultPositions`; this module OMITS geometry that matches
 * what `defaultPositions` returns. Resolve differently on the two sides and
 * the omission rule stops holding: the first save of a document that inherits
 * its direction from the file would stamp an explicit `(x,y)` onto every node,
 * because the positions no longer match the default this side computed.
 */
export function resolveDirection(
  file: Record<string, unknown> | ArchLabFile,
  diagram: Record<string, unknown>,
): "tb" | "lr" {
  const own = diagram.direction;
  if (own === "tb" || own === "lr") return own;
  const fileWide = (file as Record<string, unknown>).direction;
  if (fileWide === "tb" || fileWide === "lr") return fileWide;
  return "tb";
}

function defaultLayoutFor(
  nodes: readonly Record<string, unknown>[],
  edges: readonly Record<string, unknown>[],
  direction: "tb" | "lr",
): ReadonlyMap<string, Point> {
  const sortedIds = nodes.map((node) => node.id as string).sort(compareStrings);
  return defaultPositions(
    sortedIds,
    edges.flatMap((edge) =>
      typeof edge.source === "string" && typeof edge.target === "string"
        ? [{ source: edge.source, target: edge.target }]
        : [],
    ),
    direction,
  );
}

function emitNode(
  lines: string[],
  node: Record<string, unknown>,
  layout: ReadonlyMap<string, Point>,
  nodeHome: ReadonlyMap<string, { diagramId: string; name: string }>,
): void {
  const id = node.id as string;
  const name = node.name as string;
  const type = node.type;
  const keyword =
    typeof type === "string"
      ? KEYWORD_BY_NODE_TYPE[type as C4NodeType]
      : undefined;
  if (keyword === undefined) invalid(`node "${id}".type`, type);

  // A `^ref` whose name already equals the referenced node's writes no name:
  // the parser derives it back, so this stays byte-identical through a
  // round-trip while keeping one source of truth in the file. The same
  // omit-when-equal test the diagram title uses.
  //
  // An explicitly DIFFERENT name is still written — the format allows a local
  // override, and silently dropping one would lose data.
  const refForName = node.externalRef;
  let omitName = false;
  if (isRecord(refForName)) {
    const refNodeId = refForName.nodeId;
    const refDiagramId = refForName.diagramId;
    if (typeof refNodeId === "string" && typeof refDiagramId === "string") {
      const target = nodeHome.get(refNodeId);
      omitName =
        target !== undefined &&
        target.diagramId === refDiagramId &&
        target.name === name;
    }
  }

  let line = omitName
    ? `  ${idToken(id)}:${keyword}`
    : `  ${idToken(id)}:${keyword} ${JSON.stringify(name)}`;
  const fallback: [string, unknown][] = [];

  const description = node.description;
  const descriptionLine =
    typeof description === "string"
      ? `    desc ${JSON.stringify(description)}`
      : undefined;
  if (description !== undefined && descriptionLine === undefined) {
    fallback.push(["description", description]);
  }

  const technology = node.technology;
  const icon = node.icon;
  const iconSource = node.iconSource;
  if (typeof icon === "string" && icon !== "") {
    const suffix =
      iconSource === "explicit" ? "!" : iconSource === "inferred" ? "~" : "";
    line += ` @${iconToken(icon)}${suffix}`;
    if (suffix === "" && iconSource !== undefined) {
      fallback.push(["iconSource", iconSource]);
    }
  } else {
    if (icon !== undefined) fallback.push(["icon", icon]);
    if (iconSource !== undefined) fallback.push(["iconSource", iconSource]);
  }
  if (typeof technology === "string") {
    line += ` [${techBody(technology)}]`;
  } else if (technology !== undefined) {
    fallback.push(["technology", technology]);
  }

  const tags = tagsLine(node.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (node.tags !== undefined) fallback.push(["tags", node.tags]);

  const child = node.childDiagramId;
  if (typeof child === "string" && child !== "") {
    line += ` >${idToken(child)}`;
  } else if (child === null) {
    line += ` >null`;
  } else if (child !== undefined) {
    fallback.push(["childDiagramId", child]);
  }

  const childRef = node.childRef;
  if (typeof childRef === "string") {
    line += ` >>${JSON.stringify(childRef)}`;
  } else if (childRef !== undefined) {
    fallback.push(["childRef", childRef]);
  }

  const externalRef = node.externalRef;
  if (externalRef !== undefined) {
    if (
      !isRecord(externalRef) ||
      typeof externalRef.diagramId !== "string" ||
      externalRef.diagramId === "" ||
      typeof externalRef.nodeId !== "string" ||
      externalRef.nodeId === ""
    ) {
      invalid(`node "${id}".externalRef`, externalRef);
    }
    line += ` ^${idToken(externalRef.diagramId)}/${idToken(externalRef.nodeId)}`;
  }

  const frameId = node.frameId;
  if (typeof frameId === "string" && frameId !== "") {
    line += ` in=${idToken(frameId)}`;
  } else if (frameId !== undefined) {
    fallback.push(["frameId", frameId]);
  }

  const pinned = node.pinned;
  if (pinned === true) line += " pin";
  else if (pinned === false) line += " pin=false";
  else if (pinned !== undefined) fallback.push(["pinned", pinned]);

  const position = node.position;
  const size = node.size;
  if (
    !isRecord(position) ||
    !isFiniteNumber(position.x) ||
    !isFiniteNumber(position.y)
  ) {
    invalid(`node "${id}".position`, position);
  }
  if (
    !isRecord(size) ||
    !isFiniteNumber(size.width) ||
    !isFiniteNumber(size.height)
  ) {
    invalid(`node "${id}".size`, size);
  }
  const dp = layout.get(id);
  const ds = defaultSizeFor(type as C4NodeType);
  const isDefault =
    dp !== undefined &&
    Object.is(position.x, dp.x) &&
    Object.is(position.y, dp.y) &&
    Object.is(size.width, ds.width) &&
    Object.is(size.height, ds.height);
  if (!isDefault) {
    line += ` (${numberToken(position.x)},${numberToken(position.y)} ${numberToken(size.width)}x${numberToken(size.height)})`;
  }

  lines.push(line);
  if (descriptionLine !== undefined) lines.push(descriptionLine);
  for (const [key, value] of fallback) {
    lines.push(`    ${bangLine([key], null, value)}`);
  }
  for (const u of splitUnknowns(node, NODE_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
  for (const u of splitUnknowns(position, POINT_KEYS)) {
    lines.push(`    ${bangLine(["position", u.key], u.after, u.value)}`);
  }
  for (const u of splitUnknowns(size, ["width", "height"])) {
    lines.push(`    ${bangLine(["size", u.key], u.after, u.value)}`);
  }
  if (isRecord(externalRef)) {
    for (const u of splitUnknowns(externalRef, EXTERNAL_REF_KEYS)) {
      lines.push(`    ${bangLine(["externalRef", u.key], u.after, u.value)}`);
    }
  }
}

const EDGE_DIRECTIONS: ReadonlySet<string> = new Set([
  "forward",
  "bidirectional",
  "none",
]);

function emitEdge(lines: string[], edge: Record<string, unknown>): void {
  const id = edge.id;
  const source = edge.source;
  const target = edge.target;
  if (typeof id !== "string" || id === "") invalid("an edge id", id);
  if (typeof source !== "string" || source === "") {
    invalid(`edge "${id}".source`, source);
  }
  if (typeof target !== "string" || target === "") {
    invalid(`edge "${id}".target`, target);
  }
  const direction = edge.direction;
  if (typeof direction !== "string" || !EDGE_DIRECTIONS.has(direction)) {
    invalid(`edge "${id}".direction`, direction);
  }
  const style = edge.style;
  if (style !== undefined && style !== "solid" && style !== "dashed") {
    invalid(`edge "${id}".style`, style);
  }

  const arrow = arrowFor(direction as EdgeDirection, style === "dashed");
  let line = `  ${idToken(source)} ${arrow} ${idToken(target)}`;
  const fallback: [string, unknown][] = [];

  const label = edge.label;
  if (typeof label === "string") line += ` : ${JSON.stringify(label)}`;
  else if (label !== undefined) fallback.push(["label", label]);

  const technology = edge.technology;
  if (typeof technology === "string") line += ` [${techBody(technology)}]`;
  else if (technology !== undefined) fallback.push(["technology", technology]);

  const tags = tagsLine(edge.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (edge.tags !== undefined) fallback.push(["tags", edge.tags]);

  const realizes = edge.realizes;
  if (typeof realizes === "string" && realizes !== "") {
    line += ` ~${idToken(realizes)}`;
  } else if (realizes !== undefined) {
    fallback.push(["realizes", realizes]);
  }

  if (id !== defaultEdgeId(source, target)) line += ` id=${idToken(id)}`;
  if (style === "solid") line += " style=solid";

  const waypoints = edge.waypoints;
  const waypointsOk =
    Array.isArray(waypoints) &&
    waypoints.length > 0 &&
    waypoints.every(
      (point) =>
        isRecord(point) && isFiniteNumber(point.x) && isFiniteNumber(point.y),
    );
  if (waypointsOk) {
    const points = (waypoints as Record<string, unknown>[])
      .map(
        (point) =>
          `(${numberToken(point.x as number)},${numberToken(point.y as number)})`,
      )
      .join(" ");
    line += ` via ${points}`;
  } else if (waypoints !== undefined) {
    fallback.push(["waypoints", waypoints]);
  }

  lines.push(line);
  for (const [key, value] of fallback) {
    lines.push(`    ${bangLine([key], null, value)}`);
  }
  for (const u of splitUnknowns(edge, EDGE_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
  if (waypointsOk) {
    (waypoints as Record<string, unknown>[]).forEach((point, i) => {
      for (const u of splitUnknowns(point, POINT_KEYS)) {
        lines.push(
          `    ${bangLine(["waypoints", i, u.key], u.after, u.value)}`,
        );
      }
    });
  }
}
