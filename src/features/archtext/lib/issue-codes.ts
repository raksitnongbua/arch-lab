/**
 * The machine-readable name of every `.alab` parse failure, and how fixable
 * each one is.
 *
 * WHY A CODE AT ALL. Until this registry existed the only thing an issue
 * carried was prose, and prose cannot be a discriminator here: nine call
 * sites share `duplicate "!" line for "…"` byte for byte, and
 * `indentation must use spaces, not tabs` appears in all three main grammars.
 * A UI that wanted to offer a fix would have had to pattern-match sentences
 * that ~150 substring assertions across `scripts/*-check.mjs` are free to
 * reword, seven of which are byte-locked into `skills/alab/SKILL.md`. So the
 * code is the contract and THE MESSAGE IS NOT: adding a code to a site is
 * free, changing its sentence is not.
 *
 * WHY FIXABILITY LIVES HERE rather than beside each `failAt`. This table is
 * what `scripts/quickfix-check.mjs` reads — it is the source of that script's
 * assertions, not documentation beside them. Declaring a code `safe` obliges
 * the parser to attach only `safe` candidates and obliges the mutation corpus
 * to be able to seed it; the check fails on either being missing. A
 * hand-written list inside the check script could not notice a code it had
 * never heard of, which is the failure `codebase.md` §4 exists for.
 *
 * Imported by `scripts/quickfix-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

/**
 * How much the parser knows about the repair.
 *
 * The line between `safe` and `choice` is PROVABILITY, not confidence. A
 * closed-set near-match is `choice` even when exactly one candidate sits
 * within edit distance 1 — `sistem` is probably `system`, but "probably" must
 * not be one click away from rewriting the author's text. The single exception
 * is a candidate set of size one, which is `safe` by construction because
 * there is nothing left to be wrong about.
 */
export type Fixability =
  /** Exactly one correct rewrite. One click, and eligible for fix-all. */
  | "safe"
  /** Two or more plausible rewrites, or one that is a guess. A person picks. */
  | "choice"
  /** The parser knows what is wrong, not what the author meant. */
  | "none";

export interface IssueCodeMeta {
  readonly fixability: Fixability;
  /** What the failure is, for a reader of this table. Never shown to a user. */
  readonly summary: string;
}

/**
 * Every code the `.alab` grammars can report.
 *
 * Prefixes name the surface, not the file: `alab.` for what every grammar
 * shares (the header line, the `!` escape, indentation), `cursor.` for the
 * generic token failures `LineCursor` raises on behalf of all nine, and
 * `c4.` / `seq.` / `flow.` for a grammar's own productions. A grammar with no
 * prefix of its own inherits the shared and cursor codes and nothing else,
 * which is the ratchet working as intended: those sites are uncoded, not
 * miscoded.
 */
export const ISSUE_CODES = {
  /* ---------------------------------------------------------------------- */
  /* Shared by every grammar                                                */
  /* ---------------------------------------------------------------------- */

  "alab.indent-tabs": {
    fixability: "safe",
    summary: "A leading tab where the format only accepts spaces.",
  },
  "alab.indent-unexpected": {
    fixability: "safe",
    summary:
      "An indent that is not a rung of the ladder, where exactly one legal rung is adjacent.",
  },
  "alab.indent-ambiguous": {
    fixability: "choice",
    summary:
      "An odd indent reached before any context exists, so the rung below and the rung above are equally plausible.",
  },
  "alab.header-missing": {
    fixability: "none",
    summary: "The document does not begin with an `archlab` line.",
  },
  "alab.header-kind-missing": {
    fixability: "safe",
    summary:
      "An `archlab 1.0` line in a document whose body needs the kind word appended.",
  },
  "alab.header-kind-mismatch": {
    fixability: "none",
    summary:
      "The header names a different notation than the parser being run. The fix is to route to the other parser, never to rewrite the header — `detect.ts` already refuses to guess, and the message says why.",
  },
  "alab.header-version": {
    fixability: "none",
    summary: "An unsupported format version.",
  },
  "alab.header-unknown-keyword": {
    fixability: "choice",
    summary: "A header keyword outside the closed header set.",
  },
  "alab.header-duplicate": {
    fixability: "safe",
    summary: "A second `archlab` line. Deleting the later one is the only fix.",
  },
  "alab.header-late": {
    fixability: "safe",
    summary: "A header keyword written below the first block that opened.",
  },
  "alab.escape-duplicate": {
    fixability: "none",
    summary:
      "A repeated `!` line. Which of the two the author meant to keep is semantic.",
  },

  /* ---------------------------------------------------------------------- */
  /* LineCursor — raised on behalf of all nine grammars                     */
  /* ---------------------------------------------------------------------- */

  "cursor.expected-token": {
    fixability: "safe",
    summary:
      "A required literal token is absent at the cursor. The token is known, so inserting it is the one rewrite.",
  },
  "cursor.expected-value": {
    fixability: "none",
    summary:
      "A required value (bare word, number, JSON) is absent or malformed, and the parser has no candidate for what it should have been.",
  },
  "cursor.quote-missing": {
    fixability: "safe",
    summary:
      "A quoted string was expected and the tail is bare. Wrapping the tail is the one rewrite — provided it carries no `//`.",
  },
  "cursor.quote-ambiguous": {
    fixability: "choice",
    summary:
      "As `cursor.quote-missing`, but the bare tail contains `//`: quoting up to the comment and quoting the whole tail are both plausible.",
  },
  "cursor.quote-unclosed": {
    fixability: "safe",
    summary: "A string opened and never closed. The fix appends the quote.",
  },
  "cursor.quote-escape": {
    fixability: "none",
    summary: "An invalid escape sequence inside a string.",
  },
  "cursor.number-invalid": {
    fixability: "none",
    summary: "A number token that is not finite.",
  },
  "cursor.json-invalid": {
    fixability: "none",
    summary: "A malformed JSON value.",
  },
  "cursor.trailing-text": {
    fixability: "none",
    summary:
      "Text after a complete statement. The only rewrite deletes what the author wrote.",
  },

  /* ---------------------------------------------------------------------- */
  /* C4                                                                     */
  /* ---------------------------------------------------------------------- */

  "c4.node-type-spaced": {
    fixability: "safe",
    summary:
      "`id : type` written with spaces around the colon. Closing the gap is the one rewrite.",
  },
  "c4.node-type-unknown": {
    fixability: "choice",
    summary: "A node keyword outside the eight-keyword set.",
  },
  "c4.node-type-illegal-at-level": {
    fixability: "choice",
    summary:
      "A real node keyword this diagram's level does not admit. Ranked against the level-filtered list the message already builds — which is exactly why this cannot be decided in the UI. A list of length one makes it safe.",
  },
  "c4.node-name-missing": {
    fixability: "none",
    summary: "A node declared with no name.",
  },
  "c4.technology-unclosed": {
    fixability: "safe",
    summary: "A `[…]` technology bracket that never closes.",
  },
  /*
   * A missing `#` before a tag and a missing `:` before a JSON value had
   * codes of their own here and lost them: both raise through
   * `cursor.expect`, which already offers the insertion, and a second code
   * for the same throw would have been a key no parser mentions —
   * `check:quickfix` closes the registry both ways and would have said so.
   * The generic code is not a loss of precision: `expect` is passed the
   * literal it wanted, so the fix names the character either way.
   */
  "c4.level-unknown": {
    fixability: "choice",
    summary: "An `@…` word outside the four C4 levels.",
  },
  "c4.arrow-unknown": {
    fixability: "choice",
    summary:
      "An arrow-shaped token that is neither `->` nor `..>`. Mostly Mermaid spellings, so both arch-lab arrows are offered rather than one being guessed at.",
  },
  "c4.endpoint-unresolved": {
    fixability: "choice",
    summary:
      "An edge naming an id no node declares. Rename candidates only — the C4 type of a node the author never declared is an eight-way, level-dependent guess, so no `declare it` candidate is offered.",
  },
  "c4.endpoint-other-diagram": {
    fixability: "none",
    summary:
      "The id is declared, in another diagram. The right fix is a `^D/X` cross-diagram reference, which is authorial.",
  },
  "c4.attribute-unknown": {
    fixability: "choice",
    summary: "A node or edge attribute key outside the closed set.",
  },
  "c4.attribute-not-boolean": {
    fixability: "choice",
    summary: "`pin=` or `style=` given something that is not its flag.",
  },
  "c4.frame-unresolved": {
    fixability: "choice",
    summary:
      "`in=X` naming no declared frame: rename to a frame that exists, or declare `X`.",
  },
  "c4.style-contradicts-direction": {
    fixability: "choice",
    summary:
      "`style=solid` on a dashed arrow. Two candidates, neither ranked first — only the author knows which half they meant.",
  },
  "c4.root-missing": {
    fixability: "none",
    summary: "No `root` line, or a title the document needs and lacks.",
  },
  "c4.root-ambiguous": {
    fixability: "choice",
    summary:
      "Two parentless `@context` diagrams. One candidate per id, tiebroken by declaration order.",
  },
  "c4.duplicate-id": {
    fixability: "none",
    summary:
      "A second declaration of an id. Which one wins is semantic, not textual.",
  },
  "c4.duplicate-attribute": {
    fixability: "none",
    summary: "An attribute given twice on one line.",
  },
  "c4.tint-unknown": {
    fixability: "choice",
    summary: "A tint name outside `NAMED_TINTS`.",
  },

  /* ---------------------------------------------------------------------- */
  /* Sequence                                                               */
  /* ---------------------------------------------------------------------- */

  "seq.block-missing": {
    fixability: "safe",
    summary:
      "An indented line, or a body, with no `@sequence` block above it. Inserting the block is the one rewrite.",
  },
  "seq.indent-expected": {
    fixability: "safe",
    summary:
      "An item at the wrong depth inside a block whose expected width the parser is holding.",
  },
  "seq.reserved-word": {
    fixability: "safe",
    summary:
      "A participant id colliding with a keyword. The message already names the exact rewrite (quote it), which is what makes this safe rather than a guess.",
  },
  "seq.participant-late": {
    fixability: "safe",
    summary:
      "A participant declared after the first message, or inside a fragment. Relocating it above the body is the one rewrite.",
  },
  "seq.participant-unresolved": {
    fixability: "choice",
    summary:
      "A message naming an undeclared participant: rename candidates, plus one that declares it above the first message. Unlike C4 there are only two participant kinds, so declaring is offerable.",
  },
  "seq.participant-kind-unknown": {
    fixability: "choice",
    summary: "A participant keyword outside the two-keyword set.",
  },
  "seq.arrow-unknown": {
    fixability: "choice",
    summary:
      "An arrow token outside `SEQUENCE_ARROW_TOKENS`. The highest-value near-match in the format: `->>`, `-->`, `-x`, `--x` and `-)` are all Mermaid spellings of arrows arch-lab spells differently.",
  },
  "seq.activation-duplicate": {
    fixability: "safe",
    summary: "A repeated `+` or `-` activation suffix.",
  },
  "seq.box-late": {
    fixability: "safe",
    summary: "A `box` opened after the first message.",
  },
  "seq.box-body": {
    fixability: "safe",
    summary:
      "A message, note or fragment written inside a `box`, which groups participants only. Dedent and relocate.",
  },
  "seq.desc-indent": {
    fixability: "safe",
    summary: "A `desc` line that is not indented under its owner.",
  },
  "seq.fragment-branch-keyword": {
    fixability: "safe",
    summary:
      "The wrong branch keyword for the open fragment. The message names the one right token, so the rewrite is not a guess.",
  },
  "seq.fragment-branch-unopened": {
    fixability: "none",
    summary: "A branch keyword with no fragment open, or one `loop` rejects.",
  },
  "seq.note-placement-unknown": {
    fixability: "choice",
    summary: "A note placement outside the three-word set.",
  },
  "seq.note-arity": {
    fixability: "none",
    summary:
      "`note over` given the wrong number of participants. Which to add or drop is authorial.",
  },
  "seq.autonumber-invalid": {
    fixability: "choice",
    summary: "`autonumber` given something outside its word set.",
  },
  "seq.empty-block": {
    fixability: "none",
    summary: "An empty box, fragment or label.",
  },
  "seq.duplicate-id": {
    fixability: "none",
    summary: "A second declaration of a participant id.",
  },

  /* ---------------------------------------------------------------------- */
  /* Flowchart                                                              */
  /* ---------------------------------------------------------------------- */

  "flow.arrow-unknown": {
    fixability: "safe",
    summary:
      "THE STRONGEST AUTO-FIX IN THE FORMAT, and safe for a structural reason rather than a statistical one: `FLOWCHART_ARROW` is the single legal arrow, so any arrow-shaped token — `-->`, `->>`, `=>`, `→`, `..>` — has exactly one destination.",
  },
  "flow.indent-expected": {
    fixability: "safe",
    summary:
      "Every flowchart indent error is safe: the legal indents are only {0,2,4} and `itemIndent` is single-valued once the open group is known.",
  },
  "flow.node-unresolved": {
    fixability: "choice",
    summary:
      "An edge naming an undeclared node: rename candidates, plus a declare candidate with `step` ranked first.",
  },
  "flow.shape-unknown": {
    fixability: "choice",
    summary: "A node shape keyword outside the closed set.",
  },
  "flow.duplicate-id": {
    fixability: "none",
    summary: "A second declaration of a node id.",
  },
} as const satisfies Record<string, IssueCodeMeta>;

export type IssueCode = keyof typeof ISSUE_CODES;

/** Whether `code` is a registered issue code — for the check script and for I/O boundaries. */
export function isIssueCode(code: string): code is IssueCode {
  return Object.hasOwn(ISSUE_CODES, code);
}

/** The declared fixability of `code`. */
export function fixabilityOf(code: IssueCode): Fixability {
  return ISSUE_CODES[code].fixability;
}
