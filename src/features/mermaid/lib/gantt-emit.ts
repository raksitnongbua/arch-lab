/**
 * `GanttLabFile` → Mermaid `gantt` code: the reverse of `./gantt.ts`, and the
 * missing third of the trio every other dialect here already had. Both
 * directions read the SAME table (`./gantt-mapping.ts`), so what this writes
 * is by construction what the importer reads back.
 *
 * THIS FILE EXISTS BECAUSE `at-risk` FOUND ITS MERMAID SPELLING, and the
 * argument it replaces is worth keeping straight, because the old one is
 * still half true. The gantt was import-only on two grounds:
 *
 *   1. `at-risk` had no Mermaid tag, so an emit would downgrade an amber bar
 *      to `active` and tell nobody. THIS IS NOW WRONG: Mermaid's `crit` is a
 *      hand-typed decoration, arch-lab's `at-risk` is a hand-typed alarm, and
 *      the two say the same thing about the same bar. `./gantt-mapping.ts`
 *      makes the pairing a bijection over the closed vocabulary.
 *   2. The critical path is COMPUTED here and DECORATED there. THIS STILL
 *      STANDS, and this file is where it is enforced: **the emitter never
 *      calls the layout.** It is a pure model→text function, it does not
 *      import `layoutGantt`, and `LaidGanttItem.critical` never reaches this
 *      side of the boundary. Three independent reasons, any one sufficient:
 *      the mermaid feature would grow a dependency on the gantt feature's
 *      scheduling internals for a decoration; a derived truth written as an
 *      authored claim goes stale the first time anyone edits a duration in
 *      the Mermaid file; and one tag cannot carry both the state and the
 *      arithmetic, so honouring the second would break the round trip on
 *      exactly the field this file exists to preserve.
 *
 * If a future reader wants the computed chain in the export, the answer is
 * still no, and `MERMAID_GANTT_EXPORT_CAVEAT` points them at `validate_gantt`
 * and the canvas, which both show it with the float that justifies it.
 *
 * ONE CANONICAL SPELLING FOR EVERYTHING, which is what makes second-
 * generation output byte-stable (`serializeMermaidGantt(parseMermaidGantt(
 * emitted)) === emitted`, the rule `./emit.ts` states for C4):
 *
 *   - the three-field task form (`id, start, length`) always, never the one-
 *     or two-field shorthands — the id is what `after` names, so an emitted
 *     chart is fully referenceable and survives being reordered by hand;
 *   - durations always in days (`14d`, never `2w`);
 *   - starts always explicit — a row with neither `at` nor `after` is written
 *     as day 0's date rather than left to Mermaid's "starts when the previous
 *     row ends", which is the same normalisation the importer already applies
 *     in the other direction;
 *   - the in-body `title` statement rather than YAML frontmatter, because
 *     `gantt` has a native title line and the importer prefers it. (The
 *     flowchart family emits frontmatter; each dialect follows its own
 *     convention, as C4 does.)
 *
 * WHAT MERMAID CANNOT HOLD, and therefore what this drops, is named by
 * `MERMAID_GANTT_EXPORT_CAVEAT`: an item's `desc`, its `#tag`s, the `.alab`
 * header beyond the title, and the computed critical path. Nothing the plan
 * CLAIMS is lost — every section, row, start, length, dependency and state
 * survives.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { GanttItem, GanttLabFile, GanttSection } from "@/types";
import { ganttDateAt } from "@/types";

import {
  GANTT_DATE_FORMAT,
  GANTT_MILESTONE_TAG,
  GANTT_TAG_BY_STATE,
  GANTT_TASK_TAGS,
  MERMAID_GANTT_EXPORT_CAVEAT,
  DROPPED_GANTT_KEYWORDS,
  REFUSED_GANTT_KEYWORDS,
} from "./gantt-mapping";
import { encodeInlineBreaks, mermaidSeparatorFreeLabel } from "./text";

export { MERMAID_GANTT_EXPORT_CAVEAT };

export interface SerializeMermaidGanttOptions {
  /** Write the document title as the in-body `title` line. Default true —
   * the same spelling and the same default as the other emitters here. */
  title?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

/** Mermaid's separator between a task's text and its metadata. */
const GANTT_SEPARATOR = ":";

/** What a label made ENTIRELY of separators falls back to. A row opening with
 * `:` has no text at all, and the importer refuses it — so the placeholder is
 * the difference between a visibly approximated label and a chart that will
 * not re-open. Shared spelling with `./timeline-emit.ts`'s `EMPTIED_CELL`;
 * the two are the same idea in two dialects, not one constant, because each
 * dialect's collapse damages it differently. */
const EMPTIED_LABEL = "-";

/**
 * Every word that opens a gantt STATEMENT, derived from the tables rather
 * than typed out, so a keyword added to any of them is escaped here without
 * anybody remembering to come back.
 *
 * A label whose first word is one of these would be re-read as a setting when
 * the chart is opened — `section review :r, 2026-01-01, 5d` opens a SECTION
 * called "review …" and the task disappears — so such a label is written
 * behind a leading `- `. That is the timeline's `EMPTIED_CELL` move: a
 * visible placeholder in the picture beats a row that silently stops being a
 * row, and the export caveat names it.
 */
const GANTT_STATEMENT_WORDS: ReadonlySet<string> = new Set([
  "title",
  "dateFormat",
  "section",
  ...DROPPED_GANTT_KEYWORDS,
  ...REFUSED_GANTT_KEYWORDS.map((entry) => entry.keyword),
]);

/**
 * A task's text, as the row can carry it.
 *
 * TWO SUBSTITUTIONS, both narrow, both visible, both named in the caveat —
 * and each of them is the alternative to a row that changes meaning rather
 * than only wording:
 *
 *   - `:` splits the row at its FIRST occurrence and the dialect has no
 *     escape, so a label carrying one would move half its own text into the
 *     metadata. It becomes ` - `, spaced so the result reads as prose.
 *   - a leading statement word, or a leading `%%`, makes the whole line stop
 *     being a task: the first is read as a setting, the second as a comment
 *     and skipped entirely. A leading `- ` is inert to both.
 */
function taskLabel(label: string): string {
  const text = mermaidSeparatorFreeLabel(label, GANTT_SEPARATOR, EMPTIED_LABEL);
  const firstWord = /^\S+/.exec(text)?.[0] ?? "";
  return GANTT_STATEMENT_WORDS.has(firstWord) || text.startsWith("%%")
    ? `- ${text}`
    : text;
}

/** A section's name, which runs to the end of the line in Mermaid and so
 * needs neither substitution — only the newline codec, which is exact in both
 * directions. */
function sectionLabel(label: string): string {
  return encodeInlineBreaks(label);
}

/* -------------------------------------------------------------------------- */
/* Ids                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The id this row is written under, which is not always the id the model
 * carries.
 *
 * TWO RENAMES, and both are about a field the reader would otherwise LOSE
 * rather than merely see spelled differently:
 *
 *   - AN ID THAT SPELLS A TASK TAG (`done`, `active`, `crit`, `milestone`)
 *     is stripped out of the metadata by any reader following Mermaid's
 *     position-free `getTaskTags` — ours included — and the row then has two
 *     positional fields instead of three, so its start is read as its id.
 *     `.alab` reserves none of these words (`RESERVED_GANTT_WORDS` argues
 *     why a task called `done` is a perfectly ordinary thing to write), so
 *     this collision is reachable from a hand-written document.
 *   - A CHARACTER THE FIELD CANNOT HOLD — a comma ends the field, whitespace
 *     splits an `after` list — has the same effect. The surviving alphabet is
 *     `alabSafeId`'s, `.` and `-` included, so an id this converter itself
 *     produced on the way IN passes through untouched and the round trip is
 *     stable.
 *
 * `used` is MUTATED, so two ids that collide only after renaming take
 * numbered suffixes in first-come order — deterministic, the contract
 * `alabSafeId` states for the other direction.
 */
function emitSafeTaskId(id: string, used: Set<string>): string {
  let safe = id.replace(/[^A-Za-z0-9_.-]/g, "_");
  if (safe === "" || GANTT_TASK_TAGS.has(safe)) safe = `t_${safe}`;
  let candidate = safe;
  for (let suffix = 2; used.has(candidate); suffix += 1) {
    candidate = `${safe}_${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/** `2026-09-07` — the calendar day an offset falls on, in the one format this
 * dialect reads. UTC parts, never `toISOString().slice`-of-a-local-date: the
 * model's day offsets carry no timezone and must not acquire one here. */
function isoDate(file: GanttLabFile, dayOffset: number): string {
  const date = ganttDateAt(file, dayOffset);
  /* Unreachable from `serializeMermaidGantt`, which refuses an origin-less
     file before any row is written. Kept as a narrowing that cannot invent a
     date if this helper is ever called from somewhere else. */
  if (date === null) throw new Error(MERMAID_GANTT_ORIGIN_REFUSAL);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The row's start: a dependency list, or a date. Never Mermaid's implicit
 * "when the previous row ends" — the explicit spelling survives an edit that
 * moves the row, which is the same call the importer makes in reverse. */
function startField(
  item: GanttItem,
  file: GanttLabFile,
  idFor: ReadonlyMap<string, string>,
): string {
  if (item.after !== undefined && item.after.length > 0) {
    const references = item.after.map(
      (reference) => idFor.get(reference) ?? reference,
    );
    return `after ${references.join(" ")}`;
  }
  return isoDate(file, item.at ?? 0);
}

/** The row's length. A milestone writes Mermaid's conventional `0d` — the
 * importer accepts it and keeps no length, so the diamond survives the trip. */
function lengthField(item: GanttItem): string {
  if (item.milestone === true) return "0d";
  if (item.duration === undefined) {
    /* Unreachable from any parsed document: the `.alab` gantt parser refuses
       a task with no length by name, and the Mermaid importer always reads
       one. A model hand-built past both would otherwise emit a bar with no
       width, so it is refused rather than given an invented number. */
    throw new Error(
      `the task "${item.id}" has no duration, so there is no length to write — a Mermaid gantt row needs one (a milestone is the zero-length row)`,
    );
  }
  return `${item.duration}d`;
}

/**
 * `Schema audit :done, audit, 2026-09-07, 5d`.
 *
 * TAG ORDER IS FIXED, and it is `milestone` before the state: the milestone
 * tag decides the SYMBOL and the state decides its colour, so the shape comes
 * first. Any fixed order would do for correctness — Mermaid strips tags from
 * any position — and having one is what keeps a second emit byte-identical to
 * the first.
 */
function taskLine(
  item: GanttItem,
  file: GanttLabFile,
  idFor: ReadonlyMap<string, string>,
): string {
  const tags: string[] = [];
  if (item.milestone === true) tags.push(GANTT_MILESTONE_TAG);
  /* `planned` writes NO tag, which is the absence both formats agree on and
     the reason `GANTT_TAG_BY_STATE` excludes it at the type level. */
  if (item.state !== undefined && item.state !== "planned") {
    tags.push(GANTT_TAG_BY_STATE[item.state]);
  }
  const metadata = [
    ...tags,
    idFor.get(item.id) ?? item.id,
    startField(item, file, idFor),
    lengthField(item),
  ];
  return `    ${taskLabel(item.label)} :${metadata.join(", ")}`;
}

/* -------------------------------------------------------------------------- */
/* The emitter                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The sentence every surface says when an origin-less plan cannot travel.
 *
 * ONE string, thrown by the emitter and used verbatim as the title of the
 * disabled Mermaid controls in the playground, so a reader who presses the
 * greyed-out toggle and a caller who catches the throw are told the same
 * thing. Two hand-written wordings of one refusal is how a page ends up
 * explaining a rule the code no longer has.
 */
export const MERMAID_GANTT_ORIGIN_REFUSAL =
  "this plan has no `starts` line, so day 0 falls on no date and Mermaid " +
  "`gantt` cannot draw a relative axis — add `starts YYYY-MM-DD` to the " +
  ".alab header, or keep .alab, which draws W1, W2, W3";

/**
 * Serializes a `GanttLabFile` to Mermaid `gantt` code. Pure and
 * deterministic: the same model always produces the same bytes, and iteration
 * follows the model's own order.
 *
 * THROWS a plain `Error` for a document with no `origin` — the
 * `serializeMermaidC4` unknown-diagram precedent. Mermaid `gantt` has no
 * relative axis: every chart anchors to a calendar through `dateFormat`, and
 * the honest answers to a plan whose axis reads `W1, W2, W3` are to add a
 * `starts` date or to keep `.alab`. Inventing a day 0 — today, the epoch, the
 * first of the month — would put a date on the chart that the author never
 * chose and cannot see is wrong. Callers that offer this as a menu item are
 * expected to DISABLE it with `MERMAID_GANTT_ORIGIN_REFUSAL` as the reason rather than
 * let a reader press a button that throws.
 */
export function serializeMermaidGantt(
  file: GanttLabFile,
  options: SerializeMermaidGanttOptions = {},
): string {
  if (file.origin === undefined) throw new Error(MERMAID_GANTT_ORIGIN_REFUSAL);

  /* Ids are claimed in one pass over the whole document BEFORE any row is
     written, because `after` may name a row declared later — the same
     two-pass shape the importer needs, for the mirror of its reason. */
  const used = new Set<string>();
  const idFor = new Map<string, string>();
  for (const section of file.sections) {
    for (const item of section.items) {
      idFor.set(item.id, emitSafeTaskId(item.id, used));
    }
  }

  const lines: string[] = ["gantt"];
  const title = file.metadata?.title;
  if (options.title !== false && typeof title === "string" && title !== "") {
    lines.push(`    title ${encodeInlineBreaks(title)}`);
  }
  /* ALWAYS WRITTEN, even though it is Mermaid's own default: it is the line
     that tells a reader — and any other Mermaid renderer — how to read the
     dates below it, and this emitter writes dates unconditionally. */
  lines.push(`    dateFormat ${GANTT_DATE_FORMAT}`);

  for (const section of file.sections) {
    lines.push(...sectionLines(section, file, idFor));
  }

  return `${lines.join("\n")}\n`;
}

/** One band and its rows. An empty section is written anyway — Mermaid draws
 * the heading, and dropping it would silently delete a band the author put in
 * the file. (The IMPORTER drops one, because the `.alab` grammar cannot spell
 * a band with no rows; the asymmetry is the two formats', not a choice.) */
function sectionLines(
  section: GanttSection,
  file: GanttLabFile,
  idFor: ReadonlyMap<string, string>,
): string[] {
  return [
    `    section ${sectionLabel(section.label)}`,
    ...section.items.map((item) => taskLine(item, file, idFor)),
  ];
}
