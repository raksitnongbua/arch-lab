/**
 * Turning a `.alab` parse failure into a rewrite the reader can click.
 *
 * THE MODEL. A fix is a list of `TextEdit`s in the same 1-based line/column
 * the issue already carries, never a whole rewritten document. That choice is
 * the whole point of the module and it is not a stylistic one: every editing
 * surface in this repo is a plain controlled `<textarea>`, and the only
 * caret- and undo-preserving way to change one is
 * `el.setRangeText(text, start, end, "end")` over a character range — the path
 * Tab-to-indent already uses. Whole-value `setText(...)` swaps, which is what
 * the pane did for the indent repair, destroy the caret and create no native
 * undo entry, so the reader cannot Cmd-Z a fix they did not want. Handing the
 * UI ranges rather than a document is what buys both back.
 *
 * WHY THE PARSER OWNS THIS. Only the parser holds the data a fix needs: the
 * exact expected indent, the declared id sets, the closed keyword tables, and
 * above all the LEVEL-FILTERED valid-types list it already computes to write
 * the message. A UI-side fixer would have to re-derive every one of those from
 * prose, and the two halves would drift — `codebase.md` §4. It also pays three
 * times over: the playground, `/validate` and `/api/mcp` all read the same
 * candidates.
 *
 * `indentRepairFor` in `playground/input/parse.ts` is the precedent being
 * generalised: it loops candidate dedents and returns only one that REPARSES,
 * so an offer is a proof rather than a guess. This module keeps that standard —
 * the parser proposes, and `scripts/quickfix-check.mjs` proves every `safe`
 * candidate both minimal and strictly advancing before it is allowed to be
 * one click.
 *
 * Imported by `scripts/quickfix-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { sourceLines } from "@/lib/source-text";

/** A location in the source, in the same 1-based counting an issue uses. */
export interface SourcePos {
  line: number;
  column: number;
}

/**
 * One replacement over a character range of the source.
 *
 * Expressed in 1-based line/column so it composes with the issue it came from
 * without a second coordinate system to keep in step. The UI converts once
 * with `offsetOf` and calls `setRangeText`. `end` equal to `start` is a pure
 * insertion; a column one past the end of a line means "at the line break",
 * which is how a whole line is deleted or one is inserted after another.
 */
export interface TextEdit {
  start: SourcePos;
  end: SourcePos;
  text: string;
}

/** One rewrite offered for an issue. */
export interface FixCandidate {
  /** Imperative and ≤40 chars, because it is the button's own label. */
  title: string;
  /** Applied atomically — all of them, or none. */
  edits: readonly TextEdit[];
  kind: "safe" | "choice";
  /**
   * 0 is the best guess, and being best is NOT permission to apply it: a
   * `choice` candidate ranked 0 is preselected in the radio list and still
   * waits for an explicit Apply.
   */
  rank?: number;
}

/* -------------------------------------------------------------------------- */
/* Coordinates                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The 0-based character offset of `pos` in `text`.
 *
 * Built on `sourceLines` rather than its own `split`, because that module is
 * the single owner of the trailing-newline rule and `check:source-gutter`
 * already proves it — a private re-split here would be the second half of a
 * pair that can disagree, and it would disagree exactly on the last line of
 * every well-formed file. The separator WIDTH is read back off the source
 * instead of assumed to be 1: a CRLF document would otherwise have every
 * offset below line 1 short by one per line, which lands the edit inside the
 * previous token instead of on it.
 *
 * Out-of-range positions clamp rather than throw. A fix is offered on text
 * that is already broken, and a caret quote that lands one character past the
 * end of a line is not worth failing a parse over.
 */
export function offsetOf(text: string, pos: SourcePos): number {
  const lines = sourceLines(text);
  const index = Math.min(Math.max(pos.line, 1), lines.length) - 1;
  let offset = 0;
  for (let i = 0; i < index; i += 1) {
    offset += lines[i].length;
    offset += text.startsWith("\r\n", offset) ? 2 : 1;
  }
  const width = lines[index]?.length ?? 0;
  const column = Math.min(Math.max(pos.column, 1), width + 1);
  return offset + column - 1;
}

/**
 * `text` with `edits` applied, all of them or none.
 *
 * Applied back to front so an earlier edit cannot move a later one's offsets,
 * and overlapping ranges are refused rather than silently resolved — a fix
 * whose halves fight is a bug in the parser that built it, and swallowing it
 * here would produce a document neither half meant.
 *
 * This is the same arithmetic the UI performs through `setRangeText`, which is
 * why it lives beside the edits rather than in the component: the check script
 * proves minimality against THIS function, and the component and the proof
 * must be looking at the same rewrite.
 */
export function applyTextEdit(
  text: string,
  edits: readonly TextEdit[],
): string {
  const ranges = edits
    .map((edit) => ({
      from: offsetOf(text, edit.start),
      to: offsetOf(text, edit.end),
      text: edit.text,
    }))
    .sort((a, b) => b.from - a.from);

  let last = Number.POSITIVE_INFINITY;
  for (const range of ranges) {
    if (range.to > last) {
      throw new Error("overlapping text edits in one fix candidate");
    }
    if (range.to < range.from) {
      throw new Error("a text edit ends before it starts");
    }
    last = range.from;
  }

  let out = text;
  for (const range of ranges) {
    out = out.slice(0, range.from) + range.text + out.slice(range.to);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Near-match ranking                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Damerau-Levenshtein distance — Levenshtein plus the transposition, which is
 * the whole reason to prefer it here: `sytem` for `system` and `flwo` for
 * `flow` are the two typos a keyword actually attracts, and plain Levenshtein
 * scores both 2, far enough to lose to an unrelated word of the same length.
 */
function editDistance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) {
    rows.push(new Array<number>(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      let best = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charAt(i - 1) === b.charAt(j - 2) &&
        a.charAt(i - 2) === b.charAt(j - 1)
      ) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = best;
    }
  }
  return rows[a.length][b.length];
}

/**
 * The members of `candidates` closest to `word`, nearest first, capped at
 * `limit`.
 *
 * THE CUTOFF IS `max(1, floor(len/3))` — a third of the word, floored, with a
 * floor of one so a three-letter keyword can still be one letter wrong. A flat
 * distance of 2 was rejected: on the two-letter and three-letter tokens this
 * format is full of (`->`, `..>`, `db`) it matches almost everything in the
 * set, and a list of near-misses that are not near is worse than no list —
 * it makes the reader audit the suggestions instead of the document.
 *
 * TIES BREAK BY DECLARED ORDER, never alphabetically. The keyword tables are
 * written in the order the format documents them, which is the order a reader
 * expects to see them ranked; sorting the tie by name would put `component`
 * above `container` for reasons no reader can see. `Array.prototype.sort` is
 * stable, so passing the table's own order in is all it takes.
 *
 * Case-insensitive on purpose: `System` for `system` is a near match at
 * distance 0, and reporting it at distance 6 would drop it below unrelated
 * words.
 */
export function closestMatches(
  word: string,
  candidates: readonly string[],
  limit = 3,
): string[] {
  const needle = word.toLowerCase();
  const cutoff = Math.max(1, Math.floor(needle.length / 3));
  return candidates
    .map((candidate, order) => ({
      candidate,
      order,
      distance: editDistance(needle, candidate.toLowerCase()),
    }))
    .filter((entry) => entry.distance <= cutoff)
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/* -------------------------------------------------------------------------- */
/* Edit builders — the shapes a fix takes in this format                      */
/* -------------------------------------------------------------------------- */

/**
 * A single-line replacement over `[fromColumn, toColumn)`.
 *
 * The one-line case is almost every fix in this format, because `.alab` is
 * line-structured: a wrong arrow, a missing colon, a misspelled keyword all
 * live inside one line. Spelling it once stops each parser from re-deriving
 * the two-`SourcePos` shape and getting the half-open convention wrong in a
 * way only a mangled document would reveal.
 */
export function replaceOnLine(
  line: number,
  fromColumn: number,
  toColumn: number,
  text: string,
): TextEdit {
  return {
    start: { line, column: fromColumn },
    end: { line, column: toColumn },
    text,
  };
}

/** An insertion at one point. `end === start`, spelled out so a caller cannot forget. */
export function insertAt(line: number, column: number, text: string): TextEdit {
  return { start: { line, column }, end: { line, column }, text };
}

/** Spaces per level of indentation. One value across all nine grammars. */
export const INDENT_WIDTH = 2;

/**
 * An edit setting the leading indent of line `line`, whose text is `body`, to
 * `spaces`.
 *
 * Replaces the WHOLE run of leading whitespace rather than adding to or
 * removing from it, which is what makes one function correct for the tab case
 * and the wrong-rung case at once: a tab-indented line has one character
 * standing for a depth the format cannot read, and an edit that inserted two
 * spaces before it would leave the tab behind and fail again at the same
 * column.
 *
 * Takes the LINE rather than the document because the parsers do: a grammar
 * raising an indent error is holding the line it is looking at, not the source
 * it came from. `reindentLine` is the same edit for a caller that has the
 * document instead.
 */
export function setIndent(
  line: number,
  body: string,
  spaces: number,
): TextEdit {
  const run = /^[ \t]*/.exec(body)?.[0].length ?? 0;
  return replaceOnLine(line, 1, run + 1, " ".repeat(spaces));
}

/** `setIndent` for a caller holding the whole document rather than one line. */
export function reindentLine(
  text: string,
  line: number,
  spaces: number,
): TextEdit {
  return setIndent(line, sourceLines(text)[line - 1] ?? "", spaces);
}

/**
 * The depth, in spaces, that `body`'s leading whitespace was reaching for.
 *
 * Each tab counts as one level, because that is what the author's editor drew
 * — a tab-indented document is not wrongly indented, it is indented in a
 * character this format does not read, and the repair that keeps its SHAPE is
 * the one that keeps its levels. Rounding a tab down to a single space instead
 * would fix the tab error by creating an odd-indent error one line later.
 */
export function expandedIndent(body: string): number {
  const run = /^[ \t]*/.exec(body)?.[0] ?? "";
  let spaces = 0;
  for (const ch of run) spaces += ch === "\t" ? INDENT_WIDTH : 1;
  return spaces;
}

/**
 * Fix candidates moving line `line` to the legal indent nearest below `indent`
 * and the one nearest above it — at most two, nearest first, always `choice`.
 *
 * NEVER SAFE, however few candidates come back, and that is the whole reason
 * this is one function rather than a rule per grammar. A line indented 7 in a
 * ladder of {0,2,4,6} has exactly one rung within a space of it, and snapping
 * it to 6 is provable as TEXT and wrong as MEANING whenever the author meant
 * 2 — the document then parses and serialises to a different model, which is
 * the silent deformation the mutation corpus refuses. Where the grammar
 * genuinely knows the width (a body inside an open block) the parser offers a
 * safe fix directly and does not come here.
 */
export function indentChoices(
  line: number,
  body: string,
  indent: number,
  rungs: readonly number[],
): FixCandidate[] {
  const below = rungs.filter((rung) => rung < indent).at(-1);
  const above = rungs.find((rung) => rung > indent);
  return [below, above]
    .filter((rung): rung is number => rung !== undefined)
    .map((rung, rank) => ({
      title: `Indent ${rung} space${rung === 1 ? "" : "s"}`,
      edits: [setIndent(line, body, rung)],
      kind: "choice" as const,
      rank,
    }));
}

/**
 * One `choice` candidate per near match of `word` in `candidates`, each
 * replacing `word` where it sits, nearest first.
 *
 * Shared because the three header grammars build the same offer over three
 * different closed sets, and the candidate differs only in the set — the
 * "same body, one definition" case in `dry.md`. The SETS stay separate on
 * purpose (a sequence header has no `tagcolor`; the flowchart set's equality
 * with it is coincidental), and only the shape of the offer is shared, so a
 * grammar can never rank a keyword another grammar owns.
 *
 * NEVER SAFE, however few come back, for the reason `retypeTo` in the C4
 * node-type production spells out at length: a closed-set near match is a
 * guess even at edit distance 1, and `tagcodlor` → `tagcolor` must be offered
 * rather than taken.
 */
export function retypeChoices(
  at: SourcePos,
  word: string,
  candidates: readonly string[],
): FixCandidate[] {
  return closestMatches(word, candidates).map((match, rank) => ({
    title: `Change "${word}" to "${match}"`.slice(0, 40),
    edits: [replaceOnLine(at.line, at.column, at.column + word.length, match)],
    kind: "choice" as const,
    rank,
  }));
}

/**
 * Whether a `dedentProof` reparse is already in flight.
 *
 * The proof re-enters the parser it was called from, and the nested parse can
 * reach the same gate on a LATER orphan line and start a proof of its own.
 * Nothing about that recurses forever — each nesting dedents a line strictly
 * further down — but the nested proof's answer is thrown away either way,
 * since the outer caller only reads whether the reparse threw. So the flag
 * makes the cost exactly one extra parse instead of one per orphan line.
 * Sound because parsing is synchronous: there is no second parse in flight to
 * see this half-set.
 */
let proving = false;

/**
 * A `safe` candidate dedenting line `line` to column 1 — offered ONLY if
 * `reparse` then accepts the whole document, and otherwise nothing at all.
 *
 * THE PROOF IS THE OFFER, which is `indentRepairFor`'s standard in
 * `playground/input/parse.ts` moved inside the parser: dedent, re-read, and
 * hand the reader the result only if the real reader accepts it. That is what
 * earns `safe` on a rewrite that would be a guess otherwise. An indented
 * header line is USUALLY a stray indent and sometimes a line the author meant
 * to put inside a diagram they have not opened yet; the parser cannot tell
 * those apart by looking, and does not have to — if the dedent does not make
 * the document parse, no candidate is built and the reader keeps the plain
 * error.
 *
 * Costs one extra parse, on a keystroke where the parse has already failed —
 * the same trade `indentRepairFor` documents.
 */
export function dedentProof(
  source: string,
  line: number,
  body: string,
  reparse: (text: string) => unknown,
): FixCandidate[] {
  if (proving) return [];
  const edits = [setIndent(line, body, 0)];
  proving = true;
  try {
    reparse(applyTextEdit(source, edits));
  } catch {
    return [];
  } finally {
    proving = false;
  }
  return [{ title: "Remove the indent", edits, kind: "safe" }];
}

/**
 * The arrow-shaped token at the start of `rest`, or "".
 *
 * Deliberately generous — every ASCII run of `-`, `=`, `.` or `~` followed by
 * any of `>`, `x`, `)`, `o`, plus the Unicode arrows — because the point is to
 * recognise a token the author MEANT as an arrow, not to enumerate the
 * dialects. `-->`, `->>`, `=>`, `..>`, `-x`, `-)` and `→` are all Mermaid or
 * PlantUML spellings that arrive in pasted text; a run this matches is one the
 * grammar has already refused, so a false positive costs nothing but a fix
 * offer the reader declines.
 *
 * Returns "" for anything else, which is what keeps a bare label or an id from
 * being handed an arrow fix.
 */
export function arrowShapeAt(rest: string): string {
  return /^(?:[-=.~]+[>x)o]*|[→⇒⟶↦⇢])/.exec(rest)?.[0] ?? "";
}

/**
 * An edit inserting `body` as a whole new line above `line`.
 *
 * Column 1 to column 1 with a trailing newline, rather than appending after
 * the previous line's break: the previous line may not exist (inserting an
 * `@sequence` block above line 1 is a real fix) and reaching backwards for a
 * break that is not there is the off-by-one that would eat the first
 * character of the document.
 */
export function insertLineBefore(line: number, body: string): TextEdit {
  return insertAt(line, 1, `${body}\n`);
}

/**
 * An edit deleting the whole of `line`, its line break included.
 *
 * Deleting through to column 1 of the NEXT line rather than to the end of this
 * one, because stopping at the end of the line leaves a blank row behind — and
 * for the two fixes that use this (a duplicate `archlab` line, a relocated
 * participant) a blank row is a visible scar on a document the reader asked to
 * have repaired, not fixed.
 */
export function deleteLine(line: number): TextEdit {
  return {
    start: { line, column: 1 },
    end: { line: line + 1, column: 1 },
    text: "",
  };
}

/**
 * `raw` as a JSON string literal, for the fix that wraps a bare tail in quotes.
 *
 * `JSON.stringify` rather than `"` + raw + `"`, because a tail containing a
 * quote or a backslash — a Windows path, an inch mark — would otherwise be
 * wrapped into something that fails at a NEW column, and a fix that trades one
 * error for another is worse than no fix. `readQuoted` parses with `JSON.parse`,
 * so `JSON.stringify` is its exact inverse.
 */
export function quoteTail(raw: string): string {
  return JSON.stringify(raw.trimEnd());
}

/**
 * Where a `//` comment starts in `body`, or -1.
 *
 * Used for two separate refusals, which is why it is shared: a bare tail
 * containing `//` cannot be quoted in one provable way (quote up to the
 * comment, or quote the lot — both are plausible, so the code is `choice`),
 * and NO safe fix may be auto-applied over a range that overlaps a comment,
 * because a comment is the one place in a `.alab` file where the author's text
 * is not the parser's business.
 *
 * Deliberately naive — it does not skip `//` inside a quoted string. That
 * errs toward calling a fix ambiguous when it is not, which costs the reader
 * one extra click; the opposite error rewrites their comment.
 */
export function commentStart(body: string): number {
  return body.indexOf("//");
}

/**
 * Where the next token after a bare value begins in `rest`, or `rest.length`.
 *
 * `rest` is the line from the cursor onward. It ends at the first token that
 * can FOLLOW a value on a `.alab` line — `//`, `[technology]`, `(geometry)`,
 * `#tag`, `@icon`, `>child`, `^diagram/node`, `~realizes` or `key=` — because
 * those are what a "quote the tail" fix must not swallow. The `@icon` and the
 * three sigils were added after `check:quickfix`'s corpus caught a real
 * deformation: `"Cache Adapter" @redis [Go / go-redis] (168,528 176x88)` with
 * its closing quote dropped came back as a node named `Cache Adapter @redis`,
 * which parses and draws a wrong label. Any sigil added to the grammar needs
 * a line here.
 *
 * THE BOUNDARY IS THE WHOLE POINT and it is worth being explicit about the
 * trade. `api:system Payments API [Go 1.22]` is missing its quotes; wrapping
 * everything to end of line produces a node NAMED `Payments API [Go 1.22]`,
 * which parses, renders, and has quietly eaten the technology field — the
 * silent deformation `check:quickfix`'s mutation corpus exists to catch.
 * Stopping at the bracket instead can truncate a value that genuinely
 * contained one (`desc A note [see below]` loses its tail), and that case
 * fails LOUDLY at a later column with `unexpected text after …`. Erring
 * toward another visible error rather than toward silent damage is the whole
 * of the rule; do not "improve" this by extending to end of line.
 */
const TAIL_BOUNDARY_RE = /\/\/| \[| \(| [#@>^~]| [A-Za-z][A-Za-z0-9_-]*=/;

/** The bare value at the start of `rest`, cut at the first following token. */
export function bareTail(rest: string): string {
  const match = TAIL_BOUNDARY_RE.exec(rest);
  return rest.slice(0, match ? match.index : rest.length).trimEnd();
}
