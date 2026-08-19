/**
 * `ErLabFile` → `.alab` ER text. Deterministic: fixed line order, fixed
 * attribute order, canonical omission rules mirrored exactly by the parser's
 * defaults, so the same model always yields byte-identical text and
 * `parse(serialize(file))` reproduces `file` losslessly.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` lines are omitted when equal to the fixed sentinel
 *     (`DEFAULT_TIMESTAMP`, shared with the other four grammars).
 *   - A relationship's `: label` tail is written only when `label` is a
 *     string — absent and present are two states and both survive the round
 *     trip. It is written BARE when `BARE_VALUE_RE` accepts it and quoted
 *     otherwise, and the parser reads exactly that class bare, so `places`
 *     and `"ships to"` each come back as themselves.
 *   - A column's `keys` list is written in array order, so `pk fk` and
 *     `fk pk` are different bytes and each is preserved.
 *   - `attributes` produces nested `attr` lines only when the array is
 *     present; an empty array is invalid (two spellings of "no columns"),
 *     matching the flowchart serializer's `groups` rule and the use-case
 *     serializer's `boundaries` rule.
 *
 * THE TWO CARDINALITY GLYPHS ARE LOOKED UP PER SIDE. `TOKEN_BY_CARDINALITY`
 * is indexed `from` / `to` rather than reversed, because "zero or more" is
 * `}o` on the left and `o{` on the right; reversing one string to get the
 * other produces `{o`, which the parser rejects and the renderer draws as
 * nothing. This is the single most breakable line in the file.
 *
 * Known optional fields with unexpected shapes, and unknown
 * forward-compatible fields, are carried by the same `!` escape lines the
 * other grammars use (`bangLine` is imported, not copied), preserving value
 * and key position.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models an ER
 * validator would refuse anyway (missing required fields, wrong shapes).
 *
 * Imported by `scripts/er-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import type { ErCardinality, ErLabFile } from "@/types";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine, techBody } from "../serialize";
import { BARE_ID_RE, valueToken } from "../text";
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_KEYWORD,
  BARE_TYPE_RE,
  CONNECTOR_BY_KIND,
  ENTITY_KEYWORD,
  ER_BLOCK,
  ER_HEADER_WORD,
  RESERVED_ER_WORDS,
  TOKEN_BY_CARDINALITY,
} from "./keywords";
import {
  ER_ATTRIBUTE_KEYS,
  ER_ENTITY_KEYS,
  ER_FILE_KEYS,
  ER_RELATIONSHIP_KEYS,
} from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeErText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid ER document`,
  );
}

/**
 * Id token for body lines. Same bare/quoted rule as the C4 grammar's
 * `idToken`, EXTENDED by the ER grammar's reserved words: an entity literally
 * named `entity` or `attr` must be quoted on a relationship line or the
 * parser would read it as a keyword. One reservation set (`RESERVED_ER_WORDS`)
 * feeds both the parser's dispatch and this quoting decision.
 */
function erIdToken(id: string): string {
  return BARE_ID_RE.test(id) && !RESERVED_ER_WORDS.has(id)
    ? id
    : JSON.stringify(id);
}

/** A column type: bare when `BARE_TYPE_RE` accepts it, quoted otherwise. The
 * parser reads exactly this class bare — see `BARE_TYPE_RE`'s essay for why
 * ER needs its own class rather than the shared `BARE_VALUE_RE`. */
function typeToken(type: string): string {
  return BARE_TYPE_RE.test(type) ? type : JSON.stringify(type);
}

/** The `||--o{` half of a relationship line. Both glyphs come from the
 * side-indexed table; see the file header for why that indexing is not
 * optional. */
function relationshipToken(
  fromCardinality: ErCardinality,
  toCardinality: ErCardinality,
  kind: string,
): string {
  const connector = (CONNECTOR_BY_KIND as Record<string, string | undefined>)[
    kind
  ];
  const left = TOKEN_BY_CARDINALITY.from[fromCardinality];
  const right = TOKEN_BY_CARDINALITY.to[toCardinality];
  if (connector === undefined || left === undefined || right === undefined) {
    /* An unknown cardinality or line style is a new grammar production — a
       major change — not key-level forward tolerance. Throw rather than
       guess a token the parser would reject. */
    invalid("a relationship token", { fromCardinality, toCardinality, kind });
  }
  return `${left}${connector}${right}`;
}

/* -------------------------------------------------------------------------- */
/* The serializer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Serializes an `ErLabFile` to canonical `.alab` ER text. Pure and
 * deterministic: identical models always produce identical bytes, and
 * `parseErText(serializeErText(file))` round-trips every field.
 */
export function serializeErText(file: ErLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  /* ------------------------------- header ------------------------------- */
  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "er") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${ER_HEADER_WORD}`);

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

  /* No dedicated ER lines for these three (see ER_META_RAW for why): present
     means the raw escape, whatever the shape. */
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
  for (const u of splitUnknowns(file, ER_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  /* -------------------------------- body -------------------------------- */
  lines.push("");
  lines.push(ER_BLOCK);

  const entities = file.entities;
  if (!Array.isArray(entities)) invalid("entities", entities);
  for (const value of entities) emitEntity(lines, value);

  const relationships = file.relationships;
  if (!Array.isArray(relationships)) invalid("relationships", relationships);
  if (entities.length > 0 && relationships.length > 0) lines.push("");
  for (const value of relationships) emitRelationship(lines, value);

  return `${lines.join("\n")}\n`;
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                   */
/* -------------------------------------------------------------------------- */

function emitEntity(lines: string[], value: unknown): void {
  if (!isRecord(value)) invalid("an entity", value);
  const id = value.id;
  if (typeof id !== "string" || id === "") invalid("an entity id", id);
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid(`entity "${id}".label`, label);
  }

  const fallback: [string, unknown][] = [];
  let line = `  ${ENTITY_KEYWORD} ${erIdToken(id)} ${JSON.stringify(label)}`;

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

  /* `desc` FIRST, before the columns — the parser's window for an entity's
     description closes at its first `attr` line (see `parse.ts`'s header),
     so writing it after the columns would produce text this file's own
     parser refuses. */
  const description = value.description;
  if (typeof description === "string") {
    lines.push(`    desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }

  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, ER_ENTITY_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }

  const attributes = value.attributes;
  if (attributes === undefined) return;
  if (!Array.isArray(attributes) || attributes.length === 0) {
    invalid(`entity "${id}".attributes`, attributes);
  }
  for (const attribute of attributes) emitAttribute(lines, id, attribute);
}

function emitAttribute(
  lines: string[],
  entityId: string,
  value: unknown,
): void {
  if (!isRecord(value)) invalid(`a column of "${entityId}"`, value);
  const name = value.name;
  if (typeof name !== "string" || name === "") {
    invalid(`a column name in "${entityId}"`, name);
  }
  const type = value.type;
  if (typeof type !== "string" || type === "") {
    invalid(`column "${entityId}.${name}".type`, type);
  }

  const fallback: [string, unknown][] = [];
  let line = `    ${ATTRIBUTE_KEYWORD} ${erIdToken(name)} ${typeToken(type)}`;

  const keys = value.keys;
  if (Array.isArray(keys)) {
    if (keys.length === 0) {
      /* An empty array and an absent key are two spellings of "a plain
         column", and the parser only produces the absent one. */
      invalid(`column "${entityId}.${name}".keys`, keys);
    }
    const seen = new Set<string>();
    for (const key of keys) {
      if (
        typeof key !== "string" ||
        !(ATTRIBUTE_KEYS as readonly string[]).includes(key) ||
        seen.has(key)
      ) {
        /* An unknown key role is a new glyph — a new grammar production, not
           forward tolerance. A repeat is text the parser refuses. */
        invalid(`column "${entityId}.${name}".keys`, keys);
      }
      seen.add(key);
      line += ` ${key}`;
    }
  } else if (keys !== undefined) {
    invalid(`column "${entityId}.${name}".keys`, keys);
  }
  lines.push(line);

  const description = value.description;
  if (typeof description === "string") {
    lines.push(`      desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }

  for (const [key, raw] of fallback) {
    lines.push(`      ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, ER_ATTRIBUTE_KEYS)) {
    lines.push(`      ${bangLine([u.key], u.after, u.value)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Relationships                                                              */
/* -------------------------------------------------------------------------- */

function emitRelationship(lines: string[], value: unknown): void {
  if (!isRecord(value)) invalid("a relationship", value);
  const from = value.from;
  const to = value.to;
  if (typeof from !== "string" || from === "") {
    invalid("a relationship source", from);
  }
  if (typeof to !== "string" || to === "") {
    invalid("a relationship target", to);
  }
  const kind = value.kind;
  if (typeof kind !== "string") invalid("a relationship kind", kind);
  const token = relationshipToken(
    value.fromCardinality as ErCardinality,
    value.toCardinality as ErCardinality,
    kind,
  );

  const fallback: [string, unknown][] = [];
  let line = `  ${erIdToken(from)} ${token} ${erIdToken(to)}`;

  const label = value.label;
  if (typeof label === "string") {
    if (label === "") {
      /* The parser refuses an empty label and says to omit the ":" instead,
         so writing one would produce text it rejects. */
      invalid(`the "${from}" ${token} "${to}" label`, label);
    }
    /* `valueToken` is bare-when-`BARE_VALUE_RE`-accepts-it, quoted
       otherwise — the exact class the parser reads bare, which is what keeps
       `places` from becoming `"places"` on a save that changed nothing. */
    line += ` : ${valueToken(label)}`;
  } else if (label !== undefined) {
    fallback.push(["label", label]);
  }
  lines.push(line);

  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, ER_RELATIONSHIP_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
}
