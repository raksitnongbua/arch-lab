/**
 * A single-line token cursor for the `.alab` parser. The format is
 * line-structured (significant indentation, one statement per line), so the
 * tokenizer works one line at a time and every token knows its 1-based
 * line and column for error reporting.
 *
 * THE CURSOR IS WHERE QUICK FIXES PAY BEST. Nine grammars reach it, so the
 * codes and the fix candidates attached here cover dozens of throw sites in
 * one place — and they are attached GENERICALLY, from what the method already
 * knows: `expect` holds the token it wanted, `readQuoted` holds the tail it
 * could not read. Nothing here inspects a message or a grammar. A production
 * that needs a fix the cursor cannot derive raises it through `fail` with its
 * own code instead, which is how the C4, sequence and flowchart parsers carry
 * the ones only they have the data for.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { failAt } from "./errors";
import type { IssueDetail } from "./errors";
import { bareTail, commentStart, quoteTail, replaceOnLine } from "./fix";
import type { FixCandidate } from "./fix";
import { NUMBER_RE } from "./text";
import { describeError } from "@/lib/errors";

export class LineCursor {
  readonly text: string;
  readonly line: number;
  pos: number;

  constructor(text: string, line: number, pos = 0) {
    this.text = text;
    this.line = line;
    this.pos = pos;
  }

  /** 1-based column of the current position. */
  get column(): number {
    return this.pos + 1;
  }

  /** The character at the cursor, or "" at end of line. */
  peek(): string {
    return this.pos < this.text.length ? this.text.charAt(this.pos) : "";
  }

  /** Whether only whitespace remains on the line. */
  atEnd(): boolean {
    return this.text.slice(this.pos).trim() === "";
  }

  skipSpaces(): void {
    while (this.peek() === " ") this.pos += 1;
  }

  /** Consumes `token` if it appears verbatim at the cursor. */
  eat(token: string): boolean {
    if (this.text.startsWith(token, this.pos)) {
      this.pos += token.length;
      return true;
    }
    return false;
  }

  /**
   * Consumes `token` or fails, offering its insertion as the fix.
   *
   * SAFE FOR A STRUCTURAL REASON rather than a statistical one, which is what
   * lets one generic candidate stand in for every `expect` in the feature:
   * every call site passes a single punctuation character the grammar demands
   * at exactly this position — `:`, `=`, `]`, `)`, `,`, `#`, `x`, `/` — so
   * there is nothing to guess about what belongs there, and inserting it moves
   * the cursor strictly past the column that failed. A later error is still
   * possible; a repeat of THIS error at THIS column is not.
   */
  expect(token: string, what: string): void {
    if (!this.eat(token)) {
      this.fail(`expected ${what}`, this.foundHere(), {
        code: "cursor.expected-token",
        fixes: [
          {
            title: `Insert "${token}"`,
            edits: [replaceOnLine(this.line, this.column, this.column, token)],
            kind: "safe",
          },
        ],
      });
    }
  }

  /** The rest of the line from the cursor, for `found` in errors. */
  foundHere(): string | undefined {
    const rest = this.text.slice(this.pos).trimEnd();
    return rest === "" ? undefined : rest.slice(0, 40);
  }

  fail(message: string, found?: string, detail?: IssueDetail): never {
    return failAt(this.line, this.column, message, found, detail);
  }

  /**
   * The candidates for a value the grammar wanted quoted and found bare.
   *
   * Two codes come out of one situation and the `//` is what separates them.
   * With no comment on the line there is one rewrite and it is provable, so
   * the fix is one click. With a comment there are two readings — the author
   * meant the value to stop at the comment, or they meant the whole line
   * including a `//` inside a name — and neither is provable, so BOTH are
   * offered and neither is applied without a person choosing. Guessing here
   * would rewrite a comment, which is the one place in a `.alab` file where
   * the author's text is none of the parser's business.
   */
  private quoteTailFixes(what: string): IssueDetail {
    const rest = this.text.slice(this.pos);
    const untilNextToken = bareTail(rest);
    const wholeTail = rest.trimEnd();
    const quoteUpTo = (value: string): FixCandidate => ({
      title: `Quote ${what}`.slice(0, 40),
      edits: [
        replaceOnLine(
          this.line,
          this.column,
          this.column + value.length,
          quoteTail(value),
        ),
      ],
      kind: commentStart(rest) === -1 ? "safe" : "choice",
    });

    if (untilNextToken === "") {
      // Nothing to wrap — the value is simply absent, and inventing an empty
      // string here would replace a legible error with an illegible model.
      return { code: "cursor.expected-value" };
    }
    if (commentStart(rest) === -1) {
      return {
        code: "cursor.quote-missing",
        fixes: [quoteUpTo(untilNextToken)],
      };
    }
    return {
      code: "cursor.quote-ambiguous",
      fixes: [
        { ...quoteUpTo(untilNextToken), rank: 0 },
        {
          title: "Quote the rest of the line",
          edits: [
            replaceOnLine(
              this.line,
              this.column,
              this.column + wholeTail.length,
              quoteTail(wholeTail),
            ),
          ],
          kind: "choice",
          rank: 1,
        },
      ],
    };
  }

  /**
   * Reads a run matched by `re` (anchored via ^) or fails.
   *
   * NO FIX, on purpose. The regex says what shape was wanted and not which
   * word — a bare id, a number, a keyword prefix all arrive here — so the
   * parser has no candidate to offer and pretending otherwise would put a
   * guess one click from the author's text. The productions that DO know the
   * candidate set (a node type, an arrow, a participant id) rank it themselves
   * before reaching the cursor.
   */
  readBare(re: RegExp, what: string): string {
    const match = re.exec(this.text.slice(this.pos));
    if (match === null || match.index !== 0 || match[0] === "") {
      this.fail(`expected ${what}`, this.foundHere(), {
        code: "cursor.expected-value",
      });
    }
    this.pos += match[0].length;
    return match[0];
  }

  /**
   * Reads a JSON string literal starting at `"`. Uses `JSON.parse` for the
   * escape semantics, so `\n`, `\"`, `\uXXXX` all behave exactly like the
   * JSON file format.
   */
  readQuoted(what: string): string {
    if (this.peek() !== '"') {
      this.fail(
        `expected ${what} — a JSON string like "…"`,
        this.foundHere(),
        this.quoteTailFixes(what),
      );
    }
    let i = this.pos + 1;
    while (i < this.text.length) {
      const ch = this.text.charAt(i);
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') break;
      i += 1;
    }
    if (i >= this.text.length) {
      /* WHERE THE QUOTE GOES IS THE WHOLE QUESTION, and the caret is the one
         place it must not go: everything after the opening quote is text the
         author typed inside the string, so closing at the caret closes it
         before it starts. End of line is the obvious answer and is wrong
         mid-line — `api:system "Payments API [Go 1.22] (400,320 320x120)`
         would become a node NAMED `Payments API [Go 1.22] (400,320 320x120)`,
         which parses, renders, and has eaten two fields. So the string closes
         at the first following attribute token, by the same `bareTail`
         boundary the missing-quote fix uses. Truncating a value that
         genuinely contained a bracket fails LOUDLY one column later, which is
         the direction to err in. */
      const body = bareTail(this.text.slice(this.pos + 1));
      this.fail(
        `the string for ${what} opened here is never closed — expected a closing '"'`,
        this.foundHere(),
        {
          code: "cursor.quote-unclosed",
          fixes: [
            {
              title: "Close the string",
              edits: [
                replaceOnLine(
                  this.line,
                  this.pos + body.length + 2,
                  this.pos + body.length + 2,
                  '"',
                ),
              ],
              kind: "safe",
            },
          ],
        },
      );
    }
    const raw = this.text.slice(this.pos, i + 1);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.fail(
        `the ${what} string contains an invalid escape sequence`,
        raw.slice(0, 40),
        { code: "cursor.quote-escape" },
      );
    }
    /* The SAME SENTENCE as the bare-tail branch above and a different code —
       which is the case that makes the code the contract rather than the
       message. Here a `"…"` was read and parsed to something that is not a
       string, so there is no tail to wrap and no fix to offer. */
    if (typeof value !== "string") {
      this.fail(`expected ${what} — a JSON string like "…"`, raw.slice(0, 40), {
        code: "cursor.expected-value",
      });
    }
    this.pos = i + 1;
    return value;
  }

  /** Reads an id-like token: bare (`BARE_ID_RE` shape) or JSON-quoted. */
  readIdToken(what: string): string {
    if (this.peek() === '"') {
      const value = this.readQuoted(what);
      if (value === "")
        this.fail(`the ${what} must not be empty`, undefined, {
          code: "cursor.expected-value",
        });
      return value;
    }
    return this.readBare(/^[A-Za-z0-9_][A-Za-z0-9_.-]*/, what);
  }

  /** Reads a finite number token. */
  readNumber(what: string): number {
    const raw = this.readBare(NUMBER_RE, `${what} — a number`);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      this.fail(`"${raw}" is not a finite number for ${what}`, raw, {
        code: "cursor.number-invalid",
      });
    }
    return value;
  }

  /** Reads the remainder of the line as one JSON value. */
  readJsonToEnd(what: string): unknown {
    this.skipSpaces();
    const column = this.column;
    const raw = this.text.slice(this.pos).trimEnd();
    if (raw === "") {
      failAt(this.line, column, `expected ${what} — a JSON value`, undefined, {
        code: "cursor.expected-value",
      });
    }
    try {
      const value: unknown = JSON.parse(raw);
      this.pos = this.text.length;
      return value;
    } catch (error) {
      const detail = describeError(error);
      return failAt(
        this.line,
        column,
        `expected ${what} — a JSON value (${detail})`,
        raw.slice(0, 40),
        { code: "cursor.json-invalid" },
      );
    }
  }

  /**
   * Fails if anything but whitespace remains on the line.
   *
   * NO FIX, and this one is a refusal rather than an absence: the only rewrite
   * that makes this line parse DELETES text the author typed. A quick fix that
   * throws away input is not a quick fix, it is a data-loss button one click
   * from a caret quote, so the reader is told where the statement ended and
   * left to decide.
   */
  expectEnd(context: string): void {
    this.skipSpaces();
    if (!this.atEnd()) {
      this.fail(`unexpected text after ${context}`, this.foundHere(), {
        code: "cursor.trailing-text",
      });
    }
  }
}
