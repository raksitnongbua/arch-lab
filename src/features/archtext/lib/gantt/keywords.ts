/**
 * Keyword tables of the `.alab` GANTT grammar — the seventh document type
 * of the arch-lab text format, next to the C4 grammar in `../keywords.ts`, the
 * sequence grammar in `../sequence/keywords.ts`, the flowchart grammar in
 * `../flowchart/keywords.ts`, the use-case grammar in `../usecase/keywords.ts`,
 * the ER grammar in `../er/keywords.ts` and the dictionary grammar in
 * `../dict/keywords.ts`. One table per mapping, used by both directions, so
 * parser and serializer can never disagree.
 *
 * It lives inside `src/features/archtext/` for the reason every other grammar
 * here does: all seven document types are the SAME text format — same
 * `archlab` header, same header keywords, same `!` escape, same `LineCursor`,
 * same `ArchTextParseError`, same `#tag` micro-grammar — and owning the family
 * in one feature keeps every shared rule imported, never copied.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line — see `../sequence/detect.ts`):
 *
 *   archlab 1.0            → a C4 document
 *   archlab 1.0 sequence   → a sequence document
 *   archlab 1.0 flowchart  → a flowchart document
 *   archlab 1.0 usecase    → a use-case document
 *   archlab 1.0 er         → an ER document
 *   archlab 1.0 dict       → a data dictionary
 *   archlab 1.0 gantt   → a gantt
 *
 * This parser demands the `gantt` word, so the seven grammars stay mutually
 * exclusive from line 1.
 *
 * THE ITEM LINE, and why everything sits on it rather than nesting:
 *
 *   task audit "Schema audit" 5d done at 0
 *   task shadow "Shadow writes" 13d active after audit
 *   milestone parity "Parity signed off" after verify #gate
 *
 * A task's payload is four small values — a duration, a status, a start and a
 * dependency list — and every one of them is a single token. Nesting them as
 * continuation lines, in the manner of the dictionary's four prose slots,
 * would turn a five-word plan item into six lines and make the text stop
 * looking like the diagram it draws. The prose slot that IS long — `desc` —
 * nests, exactly as it does everywhere else in this family.
 *
 * CANONICAL ORDER ON THE LINE is fixed and the serializer always writes it:
 * id, label, duration, state, `at`, `after`, tags. The parser accepts the
 * keyword-introduced parts (`at`, `after`) in either order, because a human
 * writing one by hand has no reason to know which came first — but it writes
 * back the canonical order, and `check:gantt` asserts a file already in
 * canonical order round-trips byte-identically.
 *
 * WHY `at` AND `after` ARE MUTUALLY EXCLUSIVE, enforced by the parser rather
 * than resolved by precedence: a dependency already fixes an item's earliest
 * start, so a file carrying both is a file making two claims about one number.
 * Picking a winner would mean a document whose drawn start silently disagrees
 * with a line the author wrote and can still see.
 *
 * WHY THERE IS NO `crit` KEYWORD, WHICH IS NOT THE SAME AS THE TAG BEING
 * UNREPRESENTABLE. This grammar has no way to DECLARE a critical path, and it
 * must not grow one: the path is COMPUTED from the float pass in
 * `src/features/gantt/lib/layout.ts`, and a declared one can contradict the
 * arithmetic — when it does, the diagram is simply wrong.
 *
 * Mermaid's `crit` tag is nonetheless carried, both ways, because it is not
 * actually a path declaration: it is a decoration an author types to say a
 * bar is in trouble, which is what `at-risk` says here. So the tag maps onto
 * the STATE word this file already has, no new keyword is owed, and the
 * computed path is still never written down anywhere. The mapping lives in
 * `src/features/mermaid/lib/gantt-mapping.ts`.
 *
 * COLLISION CHECK against the other six grammars' tokens, done once so nobody
 * has to redo it:
 *
 *   - `task` and `milestone` appear in no other grammar.
 *   - `section` is the dictionary's section opener, and means the same thing
 *     here — a named band of rows. Reusing the word is deliberate; the header
 *     word decides the parser before any body line is read, so there is no
 *     ambiguity, and two spellings for one idea would be worse.
 *   - `after` is not a token in any other grammar (the flowchart spells a
 *     dependency as an arrow, `a --> b`).
 *   - `at` is new. It is two characters and very ordinary as an id, which is
 *     why it is reserved below rather than merely dispatched on.
 *
 * Imported by `scripts/gantt-check.mjs` through Node's type stripping: keep
 * the syntax erasable and type-only imports as `import type`.
 */

import type { GanttItemState } from "@/types";

/** The word after the version that marks a gantt document. */
export const GANTT_HEADER_WORD = "gantt";

/** The single body block opener (`@gantt`, no id: one diagram per file). */
export const GANTT_BLOCK = "@gantt";

/** Opens a band of rows, whose items are the lines nested one level in. */
export const SECTION_KEYWORD = "section";

/** Opens a task — an item with a duration, drawn as a bar. */
export const TASK_KEYWORD = "task";

/** Opens a milestone — a zero-duration instant, drawn as a diamond. A
 * separate keyword rather than `task … 0d`, because the two draw differently
 * and read differently, and `0d` would make the distinction a value the eye
 * has to find rather than a word at the start of the line. */
export const MILESTONE_KEYWORD = "milestone";

/** Introduces an explicit start, in whole days from the document origin. */
export const AT_KEYWORD = "at";

/** Introduces the dependency list — comma-separated ids. */
export const AFTER_KEYWORD = "after";

/** The header line that gives day 0 a calendar date. Optional: without it the
 * axis draws `W1, W2, W3` and the SAME document is otherwise unchanged. */
export const STARTS_KEYWORD = "starts";

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The closed reporting vocabulary, verbatim and lowercase. Bare words, not
 * quoted strings, BECAUSE the vocabulary is closed — the same call the ER
 * grammar makes for `pk`/`fk`/`uk` and the dictionary for its flags.
 *
 * Order matters here only for the check script's exhaustiveness assertion;
 * the parser matches by set membership.
 *
 * `planned` IS spellable even though it is the default. A closed vocabulary
 * whose most common value cannot be written is a vocabulary with a hole in
 * it, and an author moving a task back from `active` should be able to type
 * the word rather than delete one. The serializer omits it — see
 * `STATE_IS_DEFAULT` — so writing it is idempotent, not sticky.
 */
export const ITEM_STATES: readonly GanttItemState[] = [
  "planned",
  "active",
  "done",
  "at-risk",
];

/** Membership test for the parser's one-word state read. */
export const ITEM_STATE_SET: ReadonlySet<string> = new Set(ITEM_STATES);

/**
 * The state the serializer omits, and the state the parser assumes when no
 * word is present. ONE constant read by both directions, which is what makes
 * the omission symmetric: a model with `state: "planned"` writes no word, and
 * text with no word parses back to `undefined` rather than to the word.
 *
 * Note the asymmetry that follows, and that it is intended: `state:
 * "planned"` and an absent `state` are the same diagram and serialize
 * identically, so the round trip is byte-stable in both directions but the
 * MODEL normalises. `check:gantt` pins this rather than leaving it to be
 * rediscovered.
 */
export const STATE_IS_DEFAULT: GanttItemState = "planned";

/* -------------------------------------------------------------------------- */
/* Token classes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A duration: whole days, written with a `d` suffix.
 *
 * THE SUFFIX IS REQUIRED and is not decoration. Without it a bare `5` sits on
 * the line next to `at 5` and a reader has to remember which position means
 * which; with it, `5d` says "five days long" and `at 5` says "starts on day
 * five" and neither can be misread as the other. It also leaves room for a
 * future unit without a grammar break — though the model's rule that a day is
 * a CALENDAR day is what would actually have to change first.
 *
 * Zero is refused: a zero-duration task is a milestone, and there is a keyword
 * for that. Leading zeroes are refused so `05d` and `5d` cannot be two
 * spellings of one duration, which would break the byte-identical round trip.
 */
export const DURATION_RE = /^(0|[1-9]\d*)d$/;

/** `DURATION_RE` without its anchors, for the parser — which matches against
 * the rest of the line and needs the token's extent, not a verdict on the
 * whole remainder. Derived, so the two can never describe different tokens. */
export const DURATION_PREFIX_RE = /^(0|[1-9]\d*)d/;

/**
 * The `starts` value: an ISO calendar date, `YYYY-MM-DD`, no time and no
 * zone.
 *
 * NO TIME COMPONENT, deliberately. A plan expressed in whole days has no hour
 * and no timezone, and accepting one would let two documents that draw
 * identically differ in bytes — and would make a diagram render a day earlier
 * for readers west of its author. Interpreted as UTC midnight by
 * `ganttDateAt`, which is the only reader.
 *
 * Shape only. Whether the date exists — `2026-02-31` matches this and is not
 * a day — is checked by the parser, which has an error message and a line
 * number to complain with.
 */
export const ORIGIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Words that open a construct at the start of a body line, or that carry
 * meaning in the middle of an item line, and so may not be used as a BARE
 * item id — an item literally named `after` must be quoted
 * (`task "after" "…" 3d`). Same contract as the flowchart grammar's
 * `RESERVED_FLOWCHART_WORDS` and the dictionary's `RESERVED_DICT_WORDS`: one
 * set feeding both the parser's dispatch and the serializer's quoting
 * decision, which is what keeps the round trip unambiguous.
 *
 * The STATE WORDS ARE NOT RESERVED, and this is the one non-obvious entry in
 * the file. A state can only appear where a duration has already been read,
 * and an id can only appear where one has not, so `task done "…" 3d` is
 * unambiguous — `done` is in the id slot. Reserving them would force quotes
 * on four perfectly ordinary ids (a task called `done` is a thing people
 * write) to prevent an ambiguity the grammar does not have.
 */
export const RESERVED_GANTT_WORDS: ReadonlySet<string> = new Set([
  "desc",
  SECTION_KEYWORD,
  TASK_KEYWORD,
  MILESTONE_KEYWORD,
  AT_KEYWORD,
  AFTER_KEYWORD,
]);
