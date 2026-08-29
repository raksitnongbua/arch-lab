/**
 * Schema-declared key knowledge shared by the `.alab` timeline parser and
 * serializer — the timeline counterpart of `../gantt/schema.ts`, with the same
 * three-way split: `*_KEYS` is canonical key order, `*_RAW` is the optional
 * fields a `! <key> : <json>` escape may set, and everything else known has
 * dedicated syntax and is refused on a `!` line.
 *
 * `META_KEYS` is not redeclared: a timeline reuses `ArchLabMetadata`.
 *
 * Imported by `scripts/timeline-check.mjs` through Node's type stripping.
 */

import { SEQ_META_RAW } from "../sequence/schema";

/* No `origin` and no axis field between `metadata` and `periods`: nothing in
   this notation measures, so there is no calendar for a header line to set
   (`src/types/timeline.ts` argues why). */
export const TIMELINE_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "periods",
] as const;

/* `events` last, matching the text: the period line, then its nested points. */
export const TIMELINE_PERIOD_KEYS = ["label", "events"] as const;

/* The order an event line and its continuation write them: the label on the
   line, then tags, then the one nested prose slot. */
export const TIMELINE_EVENT_KEYS = ["label", "tags", "description"] as const;

/** Imported, not copied, exactly as `GANTT_META_RAW` is. */
export const TIMELINE_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/** `label` is required and `events` is STRUCTURAL — it is the nesting in the
 * text, so a raw `! events` line would build a band the serializer cannot
 * spell back. A period has no other fields, so this set is empty and is
 * declared anyway: an empty set is the statement that nothing here is
 * escapable, where an absent one would read as an oversight. */
export const TIMELINE_PERIOD_RAW: ReadonlySet<string> = new Set<string>();

/**
 * `label` has dedicated syntax — it is the quoted string on the `event` line.
 *
 * `tags` and `description` are escapable for the reason they are everywhere
 * else in the family: both are open-ended author data, so a value from a
 * newer minor that the `#tag` micro-grammar or the `desc` line cannot spell
 * is forward tolerance rather than a new grammar production. There is no
 * closed vocabulary to exclude here, because this notation has none — see
 * `TimelineEvent` on why an event carries no type.
 */
export const TIMELINE_EVENT_RAW: ReadonlySet<string> = new Set([
  "tags",
  "description",
]);
