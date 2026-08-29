/**
 * `GanttLabFile` → `.alab` gantt text. Deterministic: fixed line order,
 * fixed order on the item line, canonical omission rules mirrored exactly by
 * the parser's defaults, so the same model always yields byte-identical text
 * and `parse(serialize(file))` reproduces `file` losslessly.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` omitted when equal to `DEFAULT_TIMESTAMP`.
 *   - `state` omitted when absent or equal to `STATE_IS_DEFAULT`. The word is
 *     spellable and parses back to absence, so writing `planned` is
 *     idempotent rather than sticky — one constant, read by both directions.
 *   - `milestone` is spelled by WHICH KEYWORD opens the line, never as a value
 *     after one, and a milestone is written with no duration because the
 *     parser refuses one.
 *   - `after` is written in array order, never sorted: the order is the
 *     author's narration and shows up in a diff as a real change. `tags`, by
 *     contrast, go through the shared `tagsLine`, which sorts — the same
 *     asymmetry every other grammar here has.
 *   - `items` is required and non-empty; a section with none is invalid, not
 *     a section written without rows.
 *
 * THE ITEM LINE'S CANONICAL ORDER is id, label, duration, state, `at`,
 * `after`, tags. The parser accepts the self-identifying parts in any order,
 * so this file is the only thing that decides what a saved document looks
 * like, and `check:gantt` asserts a file already in this order round-trips
 * byte-identically.
 *
 * WHERE `starts` GOES, since it is the one header line no other grammar has:
 * after `description`/`owner`/`tags` and before the timestamps. It is a FILE
 * field (`origin`) written amid the metadata lines, which looks inconsistent
 * until you read it as an author does — the human-written header lines first,
 * the machine-written timestamps last, and the calendar with the former
 * because a person types it. The JSON key order is a separate question,
 * answered once by `GANTT_FILE_KEYS`.
 *
 * QUOTING MUST MIRROR THE PARSER'S BARE READ EXACTLY. An id is written bare
 * when `BARE_ID_RE` accepts it and it is not in `RESERVED_GANTT_WORDS` —
 * the same two tests the parser applies when it reads one — because a
 * serializer that quotes more or less than the parser demands turns a save
 * that changed nothing into a diff.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models a validator
 * would refuse anyway.
 *
 * Imported by `scripts/gantt-check.mjs` through Node's type stripping: keep
 * the syntax erasable and type-only imports as `import type`.
 */

import type { GanttLabFile } from "@/types";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine } from "../serialize";
import { BARE_ID_RE, numberToken, valueToken } from "../text";
import {
  AFTER_KEYWORD,
  AT_KEYWORD,
  ITEM_STATES,
  MILESTONE_KEYWORD,
  ORIGIN_DATE_RE,
  RESERVED_GANTT_WORDS,
  SECTION_KEYWORD,
  STARTS_KEYWORD,
  STATE_IS_DEFAULT,
  TASK_KEYWORD,
  GANTT_BLOCK,
  GANTT_HEADER_WORD,
} from "./keywords";
import { GANTT_FILE_KEYS, GANTT_ITEM_KEYS, GANTT_SECTION_KEYS } from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeGanttText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid gantt document`,
  );
}

/** An item id: bare when possible, quoted when `BARE_ID_RE` refuses it or when
 * it collides with a word the parser dispatches on. Used for the id slot and
 * for every entry of an `after` list, because the parser reads both the same
 * way. */
const idToken = (id: string): string =>
  BARE_ID_RE.test(id) && !RESERVED_GANTT_WORDS.has(id)
    ? id
    : JSON.stringify(id);

/** Whole days, counted from a fixed point. Rejects fractions and the unsafe
 * range: both would write a token the parser cannot read back, which is a
 * silent data loss rather than a rendering fault. */
function isWholeDays(value: unknown, min: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= min
  );
}

export function serializeGanttText(file: GanttLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "gantt") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${GANTT_HEADER_WORD}`);

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

  /* `origin` has no `!` escape to fall back to — it is a dedicated header line
     and `GANTT_FILE_KEYS` refuses `! origin` by name — so a value the
     parser could not read back is refused here rather than dropped. The
     parser owns the further question of whether the date EXISTS; a serializer
     that re-derived that arithmetic would be a second answer to it. */
  const origin = file.origin;
  if (origin !== undefined) {
    if (typeof origin !== "string" || !ORIGIN_DATE_RE.test(origin)) {
      invalid("origin", origin);
    }
    lines.push(`${STARTS_KEYWORD} ${origin}`);
  }

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
  for (const u of splitUnknowns(file, GANTT_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  lines.push("");
  lines.push(GANTT_BLOCK);

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
  lines.push(`  ${SECTION_KEYWORD} ${JSON.stringify(label)}`);

  /* A section's "!" lines go here, before its rows — at indent 4 they share a
     level with the row lines, and the parser binds a continuation to the last
     declaration it read, so one written after a row would come back attached
     to the row. */
  for (const u of splitUnknowns(value, GANTT_SECTION_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }

  const items = value.items;
  if (!Array.isArray(items) || items.length === 0) {
    invalid(`section ${JSON.stringify(label)}.items`, items);
  }
  for (const item of items) emitItem(lines, label, item);
}

function emitItem(lines: string[], sectionLabel: string, value: unknown): void {
  if (!isRecord(value)) {
    invalid(`a row of ${JSON.stringify(sectionLabel)}`, value);
  }
  const id = value.id;
  if (typeof id !== "string" || id === "") {
    invalid(`a row id in ${JSON.stringify(sectionLabel)}`, id);
  }
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid(`row "${id}".label`, label);
  }

  const milestoneFlag = value.milestone;
  if (milestoneFlag !== undefined && milestoneFlag !== true) {
    /* `false` is not written as `milestone: false` anywhere the parser can
       produce, so a model carrying it is one no round trip made. */
    invalid(`row "${id}".milestone`, milestoneFlag);
  }
  const milestone = milestoneFlag === true;
  const keyword = milestone ? MILESTONE_KEYWORD : TASK_KEYWORD;
  let line = `    ${keyword} ${idToken(id)} ${JSON.stringify(label)}`;

  const duration = value.duration;
  if (milestone) {
    if (duration !== undefined) invalid(`row "${id}".duration`, duration);
  } else {
    /* At least one day: zero is a milestone, and there is a keyword for that.
       The parser refuses `0d` by name; refusing it here keeps the two sides
       agreeing about what a bar is. */
    if (!isWholeDays(duration, 1)) invalid(`row "${id}".duration`, duration);
    line += ` ${numberToken(duration)}d`;
  }

  const state = value.state;
  if (state !== undefined && state !== STATE_IS_DEFAULT) {
    if (
      typeof state !== "string" ||
      !(ITEM_STATES as readonly string[]).includes(state)
    ) {
      /* An unknown state is a new colour on the canvas — a new grammar
         production, not forward tolerance from a newer minor. */
      invalid(`row "${id}".state`, state);
    }
    line += ` ${state}`;
  }

  const at = value.at;
  const after = value.after;
  if (at !== undefined && after !== undefined) {
    /* Refused rather than resolved by precedence, exactly as the parser
       refuses the text form: a dependency already fixes the earliest start,
       so writing both would emit a line this file's own parser rejects. */
    invalid(`row "${id}" (both "${AT_KEYWORD}" and "${AFTER_KEYWORD}")`, {
      at,
      after,
    });
  }
  if (at !== undefined) {
    if (!isWholeDays(at, 0)) invalid(`row "${id}".at`, at);
    line += ` ${AT_KEYWORD} ${numberToken(at)}`;
  }
  if (after !== undefined) {
    if (!Array.isArray(after) || after.length === 0) {
      invalid(`row "${id}".after`, after);
    }
    const rendered: string[] = [];
    for (const dep of after) {
      if (typeof dep !== "string" || dep === "") {
        invalid(`row "${id}".after`, after);
      }
      rendered.push(idToken(dep));
    }
    line += ` ${AFTER_KEYWORD} ${rendered.join(", ")}`;
  }

  const fallback: [string, unknown][] = [];
  const tags = tagsLine(value.tags);
  if (tags !== undefined) line += ` ${tags}`;
  else if (value.tags !== undefined) fallback.push(["tags", value.tags]);
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
  for (const u of splitUnknowns(value, GANTT_ITEM_KEYS)) {
    lines.push(`      ${bangLine([u.key], u.after, u.value)}`);
  }
}
