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

function isFiniteNumber(value: unknown): value is number {
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
    emitDiagram(lines, diagram, nodeHome);
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
 * The canonical DECLARATION line for one node — byte for byte the
 * `  <id>:<kind> "Name" …` line `serializeArchText` would write for it, geometry
 * token (or its canonical omission) included.
 *
 * WHY THIS EXISTS. A canvas drag used to be a whole-document re-emit, which
 * deleted every `//` comment, every author blank line and every field the
 * author wrote out that canonical form omits at its default. A drag is now a
 * one-LINE splice into the author's own text, and this is where the
 * replacement line comes from — derived from the serializer rather than
 * assembled a second time, so a patched line cannot be non-canonical.
 * See `playground/input/canvas-edit.ts`.
 *
 * The node's CONTINUATION lines (`desc`, `!` escapes) are deliberately not
 * returned. A drag changes nothing below the declaration line, and handing
 * back a whole block would invite a splice that reflows a `desc` line's
 * spacing for no reason.
 *
 * `null` when `diagramId` or `nodeId` is not in `file`.
 */
export function canonicalNodeLine(
  file: ArchLabFile,
  diagramId: string,
  nodeId: string,
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
    defaultLayoutFor(nodes, edges),
    buildNodeHome(diagrams),
  );
  // `emitNode` pushes the declaration line first and its continuations after.
  return lines[0];
}

/* -------------------------------------------------------------------------- */
/* Diagram / node / edge emitters                                             */
/* -------------------------------------------------------------------------- */

function emitDiagram(
  lines: string[],
  diagram: Record<string, unknown>,
  nodeHome: ReadonlyMap<string, { diagramId: string; name: string }>,
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

  const ownerHome = typeof owner === "string" ? nodeHome.get(owner) : undefined;
  let head = `@${level} ${idToken(id)}`;
  if (!(ownerHome !== undefined && ownerHome.name === title)) {
    head += ` ${JSON.stringify(title)}`;
  }
  if (typeof owner === "string") head += ` owner=${idToken(owner)}`;
  if (typeof parent === "string") {
    if (ownerHome === undefined || ownerHome.diagramId !== parent) {
      head += ` in=${idToken(parent)}`;
    }
  } else if (ownerHome !== undefined) {
    /* Parent is null but inference from owner= would produce one. */
    head += ` in=null`;
  }
  lines.push(head);

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
      const frameId = frame.id;
      const label = frame.label;
      if (typeof frameId !== "string" || frameId === "") {
        invalid(`diagram "${id}".frames[${i}].id`, frameId);
      }
      if (typeof label !== "string" || label === "") {
        invalid(`diagram "${id}".frames[${i}].label`, label);
      }
      let line = `  frame ${idToken(frameId)} ${JSON.stringify(label)}`;
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
          invalid(`diagram "${id}".frames[${i}].parentFrameId`, parent);
        }
      }
      lines.push(line);
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

  const layout = defaultLayoutFor(nodes, edges);
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
function defaultLayoutFor(
  nodes: readonly Record<string, unknown>[],
  edges: readonly Record<string, unknown>[],
): ReadonlyMap<string, Point> {
  const sortedIds = nodes.map((node) => node.id as string).sort(compareStrings);
  return defaultPositions(
    sortedIds,
    edges.flatMap((edge) =>
      typeof edge.source === "string" && typeof edge.target === "string"
        ? [{ source: edge.source, target: edge.target }]
        : [],
    ),
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
