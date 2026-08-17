/**
 * `UseCaseLabFile` → `.alab` use-case text. Deterministic: fixed line order,
 * fixed attribute order, canonical omission rules mirrored exactly by the
 * parser's defaults, so the same model always yields byte-identical text and
 * `parse(serialize(file))` reproduces `file` losslessly.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` lines are omitted when equal to the fixed
 *     sentinel (`DEFAULT_TIMESTAMP`, shared with the other three grammars).
 *   - An association's `: "label"` tail is written only when `label` is a
 *     string — absent and present are two states and both survive the round
 *     trip. A dependency's `: <stereotype>` tail is always written (the
 *     parser requires it) and a generalization writes no tail at all; a
 *     model that puts a label or a stereotype where its kind cannot spell
 *     one is refused, never silently dropped.
 *   - `boundaries` produces `boundary` blocks only when the array is
 *     present; an empty array is invalid (two spellings of "no boundaries"),
 *     matching the flowchart serializer's `groups` rule.
 *
 * Known optional fields with unexpected shapes, and unknown
 * forward-compatible fields, are carried by the same `!` escape lines the
 * other grammars use (`bangLine` is imported, not copied), preserving value
 * and key position.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models a use-case
 * validator would refuse anyway (missing required fields, wrong shapes).
 *
 * Imported by `scripts/usecase-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { UseCaseLabFile } from "@/types";

import { isNormalizedTint } from "@/lib/tint";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine, techBody } from "../serialize";
import { BARE_ID_RE, valueToken } from "../text";
import { TINT_ATTRIBUTE } from "../sequence/keywords";
import {
  BOUNDARY_KEYWORD,
  DEPENDENCY_STEREOTYPES,
  ELEMENT_KIND_BY_KEYWORD,
  RESERVED_USECASE_WORDS,
  TOKEN_BY_EDGE_KIND,
  USECASE_BLOCK,
  USECASE_HEADER_WORD,
} from "./keywords";
import {
  USECASE_BOUNDARY_KEYS,
  USECASE_EDGE_KEYS,
  USECASE_ELEMENT_KEYS,
  USECASE_FILE_KEYS,
} from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeUseCaseText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid use-case document`,
  );
}

/**
 * Id token for body lines. Same bare/quoted rule as the C4 grammar's
 * `idToken`, EXTENDED by the use-case grammar's reserved words: an element
 * literally named `actor` or `boundary` must be quoted on an edge line or
 * the parser would read it as a keyword. One reservation set
 * (`RESERVED_USECASE_WORDS`) feeds both the parser's dispatch and this
 * quoting decision.
 */
function usecaseIdToken(id: string): string {
  return BARE_ID_RE.test(id) && !RESERVED_USECASE_WORDS.has(id)
    ? id
    : JSON.stringify(id);
}

/* -------------------------------------------------------------------------- */
/* The serializer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Serializes a `UseCaseLabFile` to canonical `.alab` use-case text. Pure and
 * deterministic: identical models always produce identical bytes, and
 * `parseUseCaseText(serializeUseCaseText(file))` round-trips every field.
 */
export function serializeUseCaseText(file: UseCaseLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  /* ------------------------------- header ------------------------------- */
  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "usecase") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${USECASE_HEADER_WORD}`);

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

  /* No dedicated use-case lines for these three (see USECASE_META_RAW for
     why): present means the raw escape, whatever the shape. */
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
  for (const u of splitUnknowns(file, USECASE_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  /* -------------------------------- body -------------------------------- */
  lines.push("");
  lines.push(USECASE_BLOCK);

  const elements = file.elements;
  if (!Array.isArray(elements)) invalid("elements", elements);
  emitElements(lines, elements, file.boundaries);

  const edges = file.edges;
  if (!Array.isArray(edges)) invalid("edges", edges);
  if (elements.length > 0 && edges.length > 0) lines.push("");
  for (const value of edges) emitEdge(lines, value);

  return `${lines.join("\n")}\n`;
}

/* -------------------------------------------------------------------------- */
/* Elements                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The element block, with `boundary` boxes restored around their members.
 *
 * Driven by walking `elements` IN ORDER and opening a boundary when its
 * first member is reached — the same contract as the flowchart serializer's
 * `emitNodes`, for the same reason: the array is the declaration order and
 * the text has to reproduce it exactly, so a boundary is only ever a bracket
 * around a run of the real order. A boundary whose members are NOT such a
 * run is unrepresentable in this text, so it is refused here rather than
 * written as something the parser would read back differently.
 */
function emitElements(
  lines: string[],
  elements: unknown[],
  boundariesValue: unknown,
): void {
  if (boundariesValue === undefined) {
    for (const value of elements) emitElement(lines, value, "  ");
    return;
  }
  if (!Array.isArray(boundariesValue) || boundariesValue.length === 0) {
    invalid("boundaries", boundariesValue);
  }

  /** element id → the boundary that claims it. */
  const boundaryByMember = new Map<
    string,
    { boundary: Record<string, unknown> }
  >();
  for (const boundaryValue of boundariesValue) {
    if (!isRecord(boundaryValue)) invalid("a boundary", boundaryValue);
    const members = boundaryValue.usecases;
    if (
      !Array.isArray(members) ||
      members.length === 0 ||
      !members.every((id) => typeof id === "string" && id !== "")
    ) {
      invalid("a boundary usecases list", members);
    }
    for (const id of members as string[]) {
      if (boundaryByMember.has(id)) {
        invalid(`element "${id}" claimed by two boundaries`, boundariesValue);
      }
      boundaryByMember.set(id, { boundary: boundaryValue });
    }
  }

  const emitted = new Set<Record<string, unknown>>();
  let open: Record<string, unknown> | null = null;
  for (const value of elements) {
    if (!isRecord(value)) invalid("an element", value);
    const id = value.id;
    if (typeof id !== "string") invalid("an element id", id);
    const claim = boundaryByMember.get(id);
    const boundary = claim?.boundary ?? null;

    /* The parser's actor-outside-the-edge rule, mirrored: emitting an actor
       inside a boundary block would write text the parser refuses, so the
       unspellable model is refused here instead. */
    if (boundary !== null && value.kind !== "usecase") {
      invalid(
        `element "${id}" inside a ${BOUNDARY_KEYWORD} (only use cases sit inside the system's edge)`,
        value.kind,
      );
    }

    if (boundary !== open) {
      open = boundary;
      if (boundary !== null) {
        if (emitted.has(boundary)) {
          invalid(
            `a boundary whose members are not neighbours in elements ("${id}" is outside its run)`,
            boundary,
          );
        }
        emitted.add(boundary);
        emitBoundaryOpener(lines, boundary);
      }
    }
    emitElement(lines, value, boundary === null ? "  " : "    ");
  }

  for (const boundaryValue of boundariesValue) {
    if (isRecord(boundaryValue) && !emitted.has(boundaryValue)) {
      invalid(
        "a boundary whose use cases are not in the document",
        boundaryValue,
      );
    }
  }
}

function emitBoundaryOpener(
  lines: string[],
  boundary: Record<string, unknown>,
): void {
  const label = boundary.label;
  if (typeof label !== "string" || label === "") {
    invalid("a boundary label", label);
  }
  const fallback: [string, unknown][] = [];
  let line = `  ${BOUNDARY_KEYWORD} ${JSON.stringify(label)}`;
  const tint = boundary.tint;
  if (isNormalizedTint(tint)) line += ` ${TINT_ATTRIBUTE}=${tint}`;
  else if (tint !== undefined) fallback.push(["tint", tint]);
  lines.push(line);
  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(boundary, USECASE_BOUNDARY_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
}

function emitElement(lines: string[], value: unknown, pad: string): void {
  if (!isRecord(value)) invalid("an element", value);
  const id = value.id;
  if (typeof id !== "string" || id === "") invalid("an element id", id);
  const kind = value.kind;
  if (typeof kind !== "string" || ELEMENT_KIND_BY_KEYWORD[kind] === undefined) {
    /* An unknown KIND is not key-level forward tolerance — a new participant
       class is a new grammar production, i.e. a major change. Throw rather
       than guess a keyword the parser would reject. */
    invalid(`element "${id}".kind`, kind);
  }
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid(`element "${id}".label`, label);
  }

  const fallback: [string, unknown][] = [];
  let line = `${pad}${kind} ${usecaseIdToken(id)} ${JSON.stringify(label)}`;

  const technology = value.technology;
  if (typeof technology === "string") {
    line += ` [${techBody(technology)}]`;
  } else if (technology !== undefined) {
    fallback.push(["technology", technology]);
  }

  const tags = tagsLine(value.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (value.tags !== undefined) fallback.push(["tags", value.tags]);
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
  for (const u of splitUnknowns(value, USECASE_ELEMENT_KEYS)) {
    lines.push(`${pad}  ${bangLine([u.key], u.after, u.value)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                      */
/* -------------------------------------------------------------------------- */

function emitEdge(lines: string[], value: unknown): void {
  if (!isRecord(value)) invalid("an edge", value);
  const kind = value.kind;
  const token =
    typeof kind === "string"
      ? (TOKEN_BY_EDGE_KIND as Record<string, string | undefined>)[kind]
      : undefined;
  if (typeof kind !== "string" || token === undefined) {
    /* An unknown edge KIND is a new line style — a new grammar production,
       not forward tolerance. Same call as an unknown element kind above. */
    invalid("an edge kind", kind);
  }
  const from = value.from;
  const to = value.to;
  if (typeof from !== "string" || from === "") invalid("an edge source", from);
  if (typeof to !== "string" || to === "") invalid("an edge target", to);

  const fallback: [string, unknown][] = [];
  let line = `  ${usecaseIdToken(from)} ${token} ${usecaseIdToken(to)}`;

  /* Per-kind tails, mirroring the parser's per-kind rules exactly — a field
     the kind cannot spell is refused, because dropping it would break the
     round trip and writing it would produce text the parser rejects. */
  if (kind === "dependency") {
    const stereotype = value.stereotype;
    if (
      typeof stereotype !== "string" ||
      !(DEPENDENCY_STEREOTYPES as readonly string[]).includes(stereotype)
    ) {
      invalid(`the "${from}" ${token} "${to}" stereotype`, stereotype);
    }
    line += ` : ${stereotype}`;
  } else if (value.stereotype !== undefined) {
    invalid(
      `a stereotype on ${kind === "association" ? "an" : "a"} ${kind}`,
      value.stereotype,
    );
  }

  if (kind === "association") {
    const label = value.label;
    if (typeof label === "string") line += ` : ${JSON.stringify(label)}`;
    else if (label !== undefined) fallback.push(["label", label]);
  } else if (value.label !== undefined) {
    invalid(`a label on a ${kind}`, value.label);
  }
  lines.push(line);

  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, USECASE_EDGE_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
}
