/**
 * `LifecycleLabFile` → `.alab` lifecycle text. Deterministic: fixed line
 * order, canonical omission rules mirrored exactly by the parser's defaults,
 * so the same model always yields byte-identical text and
 * `parse(serialize(file))` reproduces `file` losslessly.
 *
 * THE ONE BARE-TOKEN SLOT is a state's id, and it is the whole reason this
 * file has a local `idToken` rather than importing the shared one: an id that
 * is bare-safe but is a RESERVED WORD (`state ends "…"`, `rejoins ends`)
 * reads back as a marker rather than a name. `RESERVED_GANTT_WORDS` next door
 * exists for the identical reason and `../gantt/serialize.ts` solves it the
 * identical way — quote it. `check:lifecycle` asserts the symmetry from a
 * HAND-BUILT model, because that is the shape the MCP tools construct and the
 * parser will never produce on its own.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` omitted when equal to `DEFAULT_TIMESTAMP`.
 *   - `final` omitted when false or absent — `ends` is a MARKER, so "absent"
 *     and "explicitly not final" are one document here, unlike the sequence
 *     numbering toggle whose three states `canvas-editing.md` warns about.
 *     There is no way to write `not-ends`, so nothing can be lost.
 *   - `rejoins` absent means the exit ENDS, and `ends` is written in its
 *     place. Every exit line therefore carries exactly one of the two, which
 *     is what the parser demands on the way in.
 *   - `tags` go through the shared `tagsLine`, which sorts — the same
 *     asymmetry every other grammar here has, and safe for the same reason: a
 *     tag set is a set, where an ordered list is narration.
 *   - `exits` is omitted entirely when a state has none, never written as an
 *     empty run of lines.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models a validator
 * would refuse anyway.
 *
 * Imported by `scripts/lifecycle-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { LifecycleLabFile } from "@/types";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine } from "../serialize";
import { BARE_ID_RE, valueToken } from "../text";
import {
  ENDS_KEYWORD,
  EXIT_KEYWORD,
  LIFECYCLE_BLOCK,
  LIFECYCLE_HEADER_WORD,
  REJOINS_KEYWORD,
  RESERVED_LIFECYCLE_WORDS,
  STATE_KEYWORD,
  SUBJECT_KEYWORD,
  WHEN_KEYWORD,
} from "./keywords";
import {
  LIFECYCLE_EXIT_KEYS,
  LIFECYCLE_FILE_KEYS,
  LIFECYCLE_STATE_KEYS,
  LIFECYCLE_SUBJECT_KEYS,
} from "./schema";

/** Bare when the token class allows it AND it is not a word this grammar
 * reads as a marker — see the file header. */
const idToken = (id: string): string =>
  BARE_ID_RE.test(id) && !RESERVED_LIFECYCLE_WORDS.has(id)
    ? id
    : JSON.stringify(id);

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeLifecycleText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid lifecycle document`,
  );
}

export function serializeLifecycleText(file: LifecycleLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "lifecycle") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${LIFECYCLE_HEADER_WORD}`);

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
    } else if (value !== undefined) metaFallback.push([key, value]);
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
  for (const u of splitUnknowns(file, LIFECYCLE_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  lines.push("");
  lines.push(LIFECYCLE_BLOCK);

  emitSubject(lines, file.subject);

  const states = file.states;
  if (!Array.isArray(states)) invalid("states", states);
  for (const value of states) emitState(lines, value);

  return `${lines.join("\n")}\n`;
}

/* THE SUBJECT COMES FIRST, ALWAYS, and it is written before any state rather
   than being sorted into place: it is what the states are states OF, and a
   document whose subject appeared halfway down would read as a state with an
   unusual keyword. The parser demands the same order. */
function emitSubject(lines: string[], value: unknown): void {
  if (!isRecord(value)) invalid("the subject", value);
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid("the subject label", label);
  }
  lines.push(`  ${SUBJECT_KEYWORD} ${JSON.stringify(label)}`);

  const description = value.description;
  if (typeof description === "string") {
    lines.push(`    desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    lines.push(`    ${bangLine(["description"], null, description)}`);
  }
  for (const u of splitUnknowns(value, LIFECYCLE_SUBJECT_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
}

function emitState(lines: string[], value: unknown): void {
  if (!isRecord(value)) invalid("a state", value);
  const id = value.id;
  if (typeof id !== "string" || id === "") invalid("a state id", id);
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid(`state ${JSON.stringify(id)}.label`, label);
  }

  let line = `  ${STATE_KEYWORD} ${idToken(id)} ${JSON.stringify(label)}`;

  const fallback: [string, unknown][] = [];
  const tags = tagsLine(value.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (value.tags !== undefined) fallback.push(["tags", value.tags]);

  /* `ends` LAST ON THE LINE, after the tags, so the marker that changes what
     the state MEANS is the word the eye lands on. The parser accepts the
     marker anywhere among the trailing tokens; the serializer only ever
     writes this one arrangement, which is what makes the round trip
     byte-identical rather than merely equivalent. */
  const final = value.final;
  if (final === true) line += ` ${ENDS_KEYWORD}`;
  else if (final !== undefined && final !== false) {
    /* Refused rather than pushed onto a `!` line, unlike `tags` and
       `description` beside it: `final` is a MARKER, not open-ended author
       data, and `! final : 3` is a line the parser rightly rejects (the
       marker has dedicated syntax). Writing one would be a serializer
       emitting text its own parser refuses. */
    invalid(`state ${JSON.stringify(id)}.final`, final);
  }
  lines.push(line);

  const description = value.description;
  if (typeof description === "string") {
    lines.push(`    desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }
  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, LIFECYCLE_STATE_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }

  const exits = value.exits;
  if (exits === undefined) return;
  if (!Array.isArray(exits))
    invalid(`state ${JSON.stringify(id)}.exits`, exits);
  for (const exit of exits) emitExit(lines, id, exit);
}

function emitExit(lines: string[], stateId: string, value: unknown): void {
  if (!isRecord(value)) invalid(`an exit of ${JSON.stringify(stateId)}`, value);
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid(`an exit label in ${JSON.stringify(stateId)}`, label);
  }
  let line = `    ${EXIT_KEYWORD} ${JSON.stringify(label)}`;

  const fallback: [string, unknown][] = [];
  const tags = tagsLine(value.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (value.tags !== undefined) fallback.push(["tags", value.tags]);

  /* EXACTLY ONE OF THE TWO, ALWAYS. A model with no `rejoins` is a terminal
     exit and writes `ends`; there is no third spelling, which is why the
     parser can demand one and neither side needs a discriminant field
     (`src/types/lifecycle.ts` argues it). */
  const rejoins = value.rejoins;
  if (rejoins === undefined) line += ` ${ENDS_KEYWORD}`;
  else if (typeof rejoins === "string" && rejoins !== "") {
    line += ` ${REJOINS_KEYWORD} ${idToken(rejoins)}`;
  } else invalid(`exit ${JSON.stringify(label)}.rejoins`, rejoins);
  lines.push(line);

  const when = value.when;
  if (typeof when === "string") {
    lines.push(`      ${WHEN_KEYWORD} ${JSON.stringify(when)}`);
  } else if (when !== undefined) fallback.push(["when", when]);

  const description = value.description;
  if (typeof description === "string") {
    lines.push(`      desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }
  for (const [key, raw] of fallback) {
    lines.push(`      ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, LIFECYCLE_EXIT_KEYS)) {
    lines.push(`      ${bangLine([u.key], u.after, u.value)}`);
  }
}
