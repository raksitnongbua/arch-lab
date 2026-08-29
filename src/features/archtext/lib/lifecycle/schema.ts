/**
 * Schema-declared key knowledge shared by the `.alab` lifecycle parser and
 * serializer — the lifecycle counterpart of `../timeline/schema.ts`, with the
 * same three-way split: `*_KEYS` is canonical key order, `*_RAW` is the
 * optional fields a `! <key> : <json>` escape may set, and everything else
 * known has dedicated syntax and is refused on a `!` line.
 *
 * `META_KEYS` is not redeclared: a lifecycle reuses `ArchLabMetadata`.
 *
 * Imported by `scripts/lifecycle-check.mjs` through Node's type stripping.
 */

import { SEQ_META_RAW } from "../sequence/schema";

/* `subject` before `states`, matching the text: the thing, then what happens
   to it. There is no axis field and no origin — nothing here measures. */
export const LIFECYCLE_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "subject",
  "states",
] as const;

/* The order the subject line and its one continuation write them. */
export const LIFECYCLE_SUBJECT_KEYS = ["label", "description"] as const;

/* `exits` last, matching the text: the state line, its continuations, then
   the departures nested under it. `final` sits with `label` because `ends` is
   written ON the state line, not under it. */
export const LIFECYCLE_STATE_KEYS = [
  "id",
  "label",
  "final",
  "tags",
  "description",
  "exits",
] as const;

/* `rejoins` directly after `label` because both are on the exit line itself —
   `exit "Returned" rejoins packed` — and `when` first among the continuations
   because it is the one a reader looks for. */
export const LIFECYCLE_EXIT_KEYS = [
  "label",
  "rejoins",
  "when",
  "tags",
  "description",
] as const;

/** Imported, not copied, exactly as `TIMELINE_META_RAW` is. */
export const LIFECYCLE_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/**
 * `label` has dedicated syntax — it is the quoted string on the `subject`
 * line — so only the prose slot is escapable, and it is escapable for the
 * reason `description` is everywhere else in the family: it is open-ended
 * author data, so a value from a newer minor that the `desc` line cannot
 * spell is forward tolerance rather than a new grammar production.
 */
export const LIFECYCLE_SUBJECT_RAW: ReadonlySet<string> = new Set([
  "description",
]);

/**
 * `id`, `label` and `final` have dedicated syntax on the state line, and
 * `exits` is STRUCTURAL — it is the nesting in the text, so a raw `! exits`
 * line would build departures the serializer cannot spell back.
 *
 * `tags` and `description` are escapable for the reason they are everywhere
 * else in the family: both are open-ended author data, so a value from a
 * newer minor that the `#tag` micro-grammar or the `desc` line cannot spell is
 * forward tolerance rather than a new grammar production.
 */
export const LIFECYCLE_STATE_RAW: ReadonlySet<string> = new Set([
  "tags",
  "description",
]);

/**
 * The same open-ended fields on an exit, plus `when` — which is prose too,
 * and is here rather than being dedicated-only because an exit's condition is
 * exactly the field a newer minor is most likely to widen (a structured
 * guard, a list of them), and forward tolerance is what keeps such a document
 * openable rather than refused.
 *
 * `rejoins` IS NOT ESCAPABLE, which is worth stating because it is the one
 * field here a `!` line could plausibly want to set: it names a state, and a
 * `! rejoins : "shipped"` line could name a state declared LATER, which is
 * the forward edge this notation exists without (`./keywords.ts`). The
 * dedicated syntax is where that direction is enforced, so the escape hatch
 * must not route around it.
 */
export const LIFECYCLE_EXIT_RAW: ReadonlySet<string> = new Set([
  "when",
  "tags",
  "description",
]);
