/**
 * Keyword tables of the `.alab` LIFECYCLE grammar — the ninth document type of
 * the arch-lab text format, next to the C4 grammar in `../keywords.ts`, the
 * sequence grammar in `../sequence/keywords.ts`, the flowchart grammar in
 * `../flowchart/keywords.ts`, the use-case grammar in `../usecase/keywords.ts`,
 * the ER grammar in `../er/keywords.ts`, the dictionary grammar in
 * `../dict/keywords.ts`, the gantt grammar in `../gantt/keywords.ts` and the
 * timeline grammar in `../timeline/keywords.ts`. One table per mapping, used
 * by both directions, so parser and serializer can never disagree.
 *
 * It lives inside `src/features/archtext/` for the reason every other grammar
 * here does: all nine document types are the SAME text format — same `archlab`
 * header, same header keywords, same `!` escape, same `LineCursor`, same
 * `ArchTextParseError`, same `#tag` micro-grammar — and owning the family in
 * one feature keeps every shared rule imported, never copied.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line — see `../sequence/detect.ts`):
 *
 *   archlab 1.0            → a C4 document
 *   archlab 1.0 sequence   → a sequence document
 *   archlab 1.0 flowchart  → a flowchart document
 *   archlab 1.0 usecase    → a use-case document
 *   archlab 1.0 er         → an ER document
 *   archlab 1.0 dict       → a data dictionary
 *   archlab 1.0 gantt      → a gantt
 *   archlab 1.0 timeline   → a milestone timeline
 *   archlab 1.0 lifecycle  → a lifecycle
 *
 * This parser demands the `lifecycle` word, so the nine grammars stay mutually
 * exclusive from line 1.
 *
 * THE WHOLE GRAMMAR, which is four words and two markers:
 *
 *   @lifecycle
 *     subject "Order"
 *       desc "One customer order, from checkout to the doormat."
 *     state placed "Placed"
 *       desc "Checkout finished. Nothing has been charged."
 *       exit "Cancelled" ends
 *         when "the customer changes their mind before paying"
 *     state paid "Paid"
 *     state packed "Packed"
 *     state shipped "Shipped"
 *       exit "Returned" rejoins packed
 *         when "the parcel comes back unopened"
 *     state delivered "Delivered" ends
 *
 * WHAT IS DELIBERATELY ABSENT, and why each absence is load-bearing. This
 * notation sits ONE KEYWORD away from being a worse flowchart at all times
 * (`src/types/lifecycle.ts` records that the overlap was waived rather than
 * argued away), so the refusals are the design:
 *
 *   - NO `to` / `next` / `then` BETWEEN STATES. The main track is consecutive
 *     declaration order. Give an author one edge keyword and they can write
 *     `placed -> shipped`, and a set of arbitrary state-to-state edges IS the
 *     flowchart — the single change that would make this notation redundant.
 *   - NO FORWARD REJOIN. `rejoins` may only name a state declared strictly
 *     EARLIER. A forward rejoin is a shortcut along the spine, which is the
 *     same arbitrary edge wearing a different keyword.
 *   - NO EXIT OFF AN EXIT. Branch depth is one. A tree of alternatives is a
 *     decision graph, and a decision graph is what `archlab 1.0 flowchart`
 *     draws with guards on its edges.
 *   - NO SECOND SUBJECT. A lifecycle is ONE thing moving. Two would be a
 *     graph of two things, i.e. a flowchart with lanes.
 *   - NO DECISION SHAPE. A branch's condition is prose on a `when` line, not
 *     a diamond with outgoing guards. The moment a state can hold outgoing
 *     alternatives that are themselves states, the spine stops existing.
 *
 * If a future change finds itself adding any of the five, the honest move is
 * to write a flowchart, not to widen this.
 *
 * COLLISION CHECK against the other eight grammars' tokens, done once so
 * nobody has to redo it:
 *
 *   - `lifecycle` appears in no other grammar as a header word, and never has
 *     — unlike `timeline`, which headed the gantt before the rename. So there
 *     is no stale-document case here and `check:lifecycle` asserts none.
 *   - `subject`, `state` and `exit` appear in no other grammar. `state` is
 *     the near miss worth naming: the GANTT has a state VOCABULARY
 *     (`done`/`active`/`at-risk`) but no `state` keyword, and those three
 *     words are refused here by name for exactly that reason — a reader
 *     arriving from a plan will try them.
 *   - `ends` and `rejoins` appear in no other grammar.
 *   - `when` appears in no other grammar. The flowchart spells an edge guard
 *     `when` in prose but writes it as a bracketed label on the edge line,
 *     never as a keyword, so there is no token to collide with.
 *   - `desc` is the shared prose continuation, spelled and nested exactly as
 *     it is everywhere else in the family.
 *
 * Imported by `scripts/lifecycle-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

/** The word after the version that marks a lifecycle document. */
export const LIFECYCLE_HEADER_WORD = "lifecycle";

/** The single body block opener (`@lifecycle`, no id: one per file). */
export const LIFECYCLE_BLOCK = "@lifecycle";

/** Declares the one thing the document is about. Exactly once, first. */
export const SUBJECT_KEYWORD = "subject";

/** Opens one state on the main track. */
export const STATE_KEYWORD = "state";

/** Opens one departure from the track, nested under the state it leaves. */
export const EXIT_KEYWORD = "exit";

/** Marks a terminal state or a terminal exit — the subject stops there. */
export const ENDS_KEYWORD = "ends";

/** Marks a returning exit: `rejoins <state id>`, always an earlier state. */
export const REJOINS_KEYWORD = "rejoins";

/** The exit's condition line, nested under it. */
export const WHEN_KEYWORD = "when";

/**
 * Words that open a construct at the start of a body line, plus the two
 * markers that may follow a quoted label on one.
 *
 * IT FEEDS BOTH THE PARSER'S DISPATCH AND THE SERIALIZER'S QUOTING, unlike
 * the timeline's set which feeds only dispatch. This grammar HAS a bare-token
 * slot — a state's id — so `state ends "Ended"` is a line that must not be
 * written bare: `ends` in the id position would be read back as the terminal
 * marker on a state whose id is missing. The serializer QUOTES such an id
 * (`state "ends" "Ended"`) and the parser reads a quoted id back, exactly the
 * `RESERVED_GANTT_WORDS` arrangement next door — and `check:lifecycle`
 * asserts the pair, because a bare/quoted asymmetry is this family's oldest
 * round-trip bug class.
 */
export const RESERVED_LIFECYCLE_WORDS: ReadonlySet<string> = new Set([
  "desc",
  SUBJECT_KEYWORD,
  STATE_KEYWORD,
  EXIT_KEYWORD,
  ENDS_KEYWORD,
  REJOINS_KEYWORD,
  WHEN_KEYWORD,
]);

/**
 * The gantt's state vocabulary, refused HERE by name.
 *
 * A reader arriving from `archlab 1.0 gantt` has just written
 * `task audit "Schema audit" 5d done`, meets a keyword called `state`, and
 * reaches for the same three words. `done` on a lifecycle state line would be
 * a plausible spelling of `ends` — so the refusal names `ends` rather than
 * listing what the line accepts, which is what stops the second attempt.
 */
export const GANTT_STATE_WORDS: readonly string[] = [
  "done",
  "active",
  "at-risk",
];

/**
 * Edge keywords a reader might reach for to join two states, refused by name.
 *
 * THIS IS THE LIST THAT DEFENDS THE NOTATION. Every one of them would turn
 * the main track into an arbitrary graph, which is the flowchart — see the
 * file header. They are refused with a message naming
 * `archlab 1.0 flowchart`, because a reader who is told "not valid here"
 * tries another spelling and a reader who is told "write a flowchart" stops.
 */
export const REFUSED_EDGE_WORDS: readonly string[] = [
  "to",
  "next",
  "then",
  "goes",
  "after",
];
