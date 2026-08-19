/**
 * `DictLabFile` → `.alab` dictionary text. Deterministic: fixed line order,
 * fixed attribute order, canonical omission rules mirrored exactly by the
 * parser's defaults, so the same model always yields byte-identical text and
 * `parse(serialize(file))` reproduces `file` losslessly.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` omitted when equal to `DEFAULT_TIMESTAMP`.
 *   - A field's `flags` list is written in array order, so `required unique`
 *     and `unique required` are different bytes and each is preserved.
 *   - The four prose slots are written in the order the grammar accepts them —
 *     `desc`, `source`, `values`, `example` — and each only when present.
 *   - A section's `desc` is written BEFORE its fields, because the parser's
 *     window for it closes at the first `field` line.
 *   - `fields` is required and non-empty; a section with none is invalid, not
 *     a section written without rows.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models a validator
 * would refuse anyway.
 *
 * Imported by `scripts/dict-check.mjs` through Node's type stripping.
 */

import type { DictLabFile } from "@/types";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine, techBody } from "../serialize";
import { BARE_ID_RE, valueToken } from "../text";
import {
  BARE_DICT_TYPE_RE,
  DICT_BLOCK,
  DICT_HEADER_WORD,
  FIELD_DETAIL_KEYS,
  FIELD_FLAGS,
  FIELD_KEYWORD,
  RESERVED_DICT_WORDS,
  SECTION_KEYWORD,
} from "./keywords";
import { DICT_FIELD_KEYS, DICT_FILE_KEYS, DICT_SECTION_KEYS } from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeDictText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid dictionary document`,
  );
}

/** A field name: bare when possible, quoted when `BARE_ID_RE` refuses it or
 * when it collides with a keyword the parser dispatches on. */
const nameToken = (name: string): string =>
  BARE_ID_RE.test(name) && !RESERVED_DICT_WORDS.has(name)
    ? name
    : JSON.stringify(name);

/** A field type: bare when `BARE_DICT_TYPE_RE` accepts it. The parser reads
 * exactly this class bare, which is what stops a save that changed nothing
 * from changing bytes. */
const typeToken = (type: string): string =>
  BARE_DICT_TYPE_RE.test(type) ? type : JSON.stringify(type);

export function serializeDictText(file: DictLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "dict") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${DICT_HEADER_WORD}`);

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
  for (const u of splitUnknowns(metadata, META_KEYS)) {
    lines.push(bangLine(["meta", u.key], u.after, u.value));
  }
  if (schemaValue !== undefined && typeof schemaValue !== "string") {
    lines.push(bangLine(["$schema"], null, schemaValue));
  }
  for (const u of splitUnknowns(file, DICT_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  lines.push("");
  lines.push(DICT_BLOCK);

  const sections = file.sections;
  if (!Array.isArray(sections)) invalid("sections", sections);
  for (const value of sections) emitSection(lines, value);

  return `${lines.join("\n")}\n`;
}

function emitSection(lines: string[], value: unknown): void {
  if (!isRecord(value)) invalid("a section", value);
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid("a section label", label);
  }

  const fallback: [string, unknown][] = [];
  let line = `  ${SECTION_KEYWORD} ${JSON.stringify(label)}`;

  const technology = value.technology;
  if (typeof technology === "string") line += ` [${techBody(technology)}]`;
  else if (technology !== undefined) {
    fallback.push(["technology", technology]);
  }

  const tags = tagsLine(value.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (value.tags !== undefined) fallback.push(["tags", value.tags]);
  lines.push(line);

  /* `desc` FIRST, before the fields — the parser's window for a section's
     description closes at its first `field` line, so writing it afterwards
     would produce text this file's own parser refuses. */
  const description = value.description;
  if (typeof description === "string") {
    lines.push(`    desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }
  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, DICT_SECTION_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }

  const fields = value.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    invalid(`section ${JSON.stringify(label)}.fields`, fields);
  }
  for (const field of fields) emitField(lines, label, field);
}

function emitField(
  lines: string[],
  sectionLabel: string,
  value: unknown,
): void {
  if (!isRecord(value))
    invalid(`a field of ${JSON.stringify(sectionLabel)}`, value);
  const name = value.name;
  if (typeof name !== "string" || name === "") {
    invalid(`a field name in ${JSON.stringify(sectionLabel)}`, name);
  }
  const type = value.type;
  if (typeof type !== "string" || type === "") {
    invalid(`field "${name}".type`, type);
  }

  let line = `    ${FIELD_KEYWORD} ${nameToken(name)} ${typeToken(type)}`;
  const flags = value.flags;
  if (Array.isArray(flags)) {
    if (flags.length === 0) invalid(`field "${name}".flags`, flags);
    const seen = new Set<string>();
    for (const flag of flags) {
      if (
        typeof flag !== "string" ||
        !(FIELD_FLAGS as readonly string[]).includes(flag) ||
        seen.has(flag)
      ) {
        /* An unknown flag is a new badge — a new grammar production, not
           forward tolerance. A repeat is text the parser refuses. */
        invalid(`field "${name}".flags`, flags);
      }
      seen.add(flag);
      line += ` ${flag}`;
    }
  } else if (flags !== undefined) invalid(`field "${name}".flags`, flags);
  lines.push(line);

  const fallback: [string, unknown][] = [];
  /* `desc` then the three detail keywords, in the order the grammar accepts —
     driven from `FIELD_DETAIL_KEYS` so an added slot cannot be forgotten. */
  const description = value.description;
  if (typeof description === "string") {
    lines.push(`      desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }
  for (const keyword of Object.keys(FIELD_DETAIL_KEYS)) {
    const detail = value[FIELD_DETAIL_KEYS[keyword]];
    if (typeof detail === "string") {
      lines.push(`      ${keyword} ${JSON.stringify(detail)}`);
    } else if (detail !== undefined) {
      fallback.push([FIELD_DETAIL_KEYS[keyword], detail]);
    }
  }
  for (const [key, raw] of fallback) {
    lines.push(`      ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, DICT_FIELD_KEYS)) {
    lines.push(`      ${bangLine([u.key], u.after, u.value)}`);
  }
}
