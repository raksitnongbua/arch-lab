/**
 * `TimelineLabFile` → `.alab` timeline text. Deterministic: fixed line order,
 * canonical omission rules mirrored exactly by the parser's defaults, so the
 * same model always yields byte-identical text and `parse(serialize(file))`
 * reproduces `file` losslessly.
 *
 * THE SIMPLEST SERIALIZER IN THE FAMILY, and it is worth saying why rather
 * than leaving the brevity to look like something is missing: every other
 * `.alab` grammar has to decide whether a token goes out bare or quoted, and
 * has to make that decision agree exactly with what its parser reads bare —
 * the bug class `check:*`'s "bare/quoted symmetry" group exists for. This
 * grammar has no bare-token slot at all (`./keywords.ts` argues why an event
 * has no id), so a period and an event are `JSON.stringify` of one string
 * each and there is no symmetry to preserve.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` omitted when equal to `DEFAULT_TIMESTAMP`.
 *   - `tags` go through the shared `tagsLine`, which sorts — the same
 *     asymmetry every other grammar here has, and it is safe for the same
 *     reason: a tag set is a set, where an ordered list is narration.
 *   - `events` is required and non-empty; a period with none is invalid, not
 *     a period written without events.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models a validator
 * would refuse anyway.
 *
 * Imported by `scripts/timeline-check.mjs` through Node's type stripping: keep
 * the syntax erasable and type-only imports as `import type`.
 */

import type { TimelineLabFile } from "@/types";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine } from "../serialize";
import { valueToken } from "../text";
import {
  EVENT_KEYWORD,
  PERIOD_KEYWORD,
  TIMELINE_BLOCK,
  TIMELINE_HEADER_WORD,
} from "./keywords";
import {
  TIMELINE_EVENT_KEYS,
  TIMELINE_FILE_KEYS,
  TIMELINE_PERIOD_KEYS,
} from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeTimelineText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid timeline document`,
  );
}

export function serializeTimelineText(file: TimelineLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "timeline") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${TIMELINE_HEADER_WORD}`);

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
  for (const u of splitUnknowns(file, TIMELINE_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  lines.push("");
  lines.push(TIMELINE_BLOCK);

  const periods = file.periods;
  if (!Array.isArray(periods)) invalid("periods", periods);
  for (const value of periods) emitPeriod(lines, value);

  return `${lines.join("\n")}\n`;
}

function emitPeriod(lines: string[], value: unknown): void {
  if (!isRecord(value)) invalid("a period", value);
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid("a period label", label);
  }
  lines.push(`  ${PERIOD_KEYWORD} ${JSON.stringify(label)}`);

  /* A period's "!" lines go here, before its events — at indent 4 they share a
     level with the event lines, and the parser binds a continuation to the last
     declaration it read, so one written after an event would come back
     attached to the event. */
  for (const u of splitUnknowns(value, TIMELINE_PERIOD_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }

  const events = value.events;
  if (!Array.isArray(events) || events.length === 0) {
    invalid(`period ${JSON.stringify(label)}.events`, events);
  }
  for (const event of events) emitEvent(lines, label, event);
}

function emitEvent(lines: string[], periodLabel: string, value: unknown): void {
  if (!isRecord(value)) {
    invalid(`an event of ${JSON.stringify(periodLabel)}`, value);
  }
  const label = value.label;
  if (typeof label !== "string" || label === "") {
    invalid(`an event label in ${JSON.stringify(periodLabel)}`, label);
  }
  let line = `    ${EVENT_KEYWORD} ${JSON.stringify(label)}`;

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
  for (const u of splitUnknowns(value, TIMELINE_EVENT_KEYS)) {
    lines.push(`      ${bangLine([u.key], u.after, u.value)}`);
  }
}
