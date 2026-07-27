/**
 * A single-line token cursor for the `.aft` parser. The format is
 * line-structured (significant indentation, one statement per line), so the
 * tokenizer works one line at a time and every token knows its 1-based
 * line and column for error reporting.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { failAt } from "./errors";
import { NUMBER_RE } from "./text";

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

  expect(token: string, what: string): void {
    if (!this.eat(token)) {
      this.fail(`expected ${what}`, this.foundHere());
    }
  }

  /** The rest of the line from the cursor, for `found` in errors. */
  foundHere(): string | undefined {
    const rest = this.text.slice(this.pos).trimEnd();
    return rest === "" ? undefined : rest.slice(0, 40);
  }

  fail(message: string, found?: string): never {
    return failAt(this.line, this.column, message, found);
  }

  /** Reads a run matched by `re` (anchored via ^) or fails. */
  readBare(re: RegExp, what: string): string {
    const match = re.exec(this.text.slice(this.pos));
    if (match === null || match.index !== 0 || match[0] === "") {
      this.fail(`expected ${what}`, this.foundHere());
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
      this.fail(`expected ${what} — a JSON string like "…"`, this.foundHere());
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
      this.fail(
        `the string for ${what} opened here is never closed — expected a closing '"'`,
        this.foundHere(),
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
      );
    }
    if (typeof value !== "string") {
      this.fail(`expected ${what} — a JSON string like "…"`, raw.slice(0, 40));
    }
    this.pos = i + 1;
    return value;
  }

  /** Reads an id-like token: bare (`BARE_ID_RE` shape) or JSON-quoted. */
  readIdToken(what: string): string {
    if (this.peek() === '"') {
      const value = this.readQuoted(what);
      if (value === "") this.fail(`the ${what} must not be empty`);
      return value;
    }
    return this.readBare(/^[A-Za-z0-9_][A-Za-z0-9_.-]*/, what);
  }

  /** Reads a finite number token. */
  readNumber(what: string): number {
    const raw = this.readBare(NUMBER_RE, `${what} — a number`);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      this.fail(`"${raw}" is not a finite number for ${what}`, raw);
    }
    return value;
  }

  /** Reads the remainder of the line as one JSON value. */
  readJsonToEnd(what: string): unknown {
    this.skipSpaces();
    const column = this.column;
    const raw = this.text.slice(this.pos).trimEnd();
    if (raw === "") {
      failAt(this.line, column, `expected ${what} — a JSON value`);
    }
    try {
      const value: unknown = JSON.parse(raw);
      this.pos = this.text.length;
      return value;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return failAt(
        this.line,
        column,
        `expected ${what} — a JSON value (${detail})`,
        raw.slice(0, 40),
      );
    }
  }

  /** Fails if anything but whitespace remains on the line. */
  expectEnd(context: string): void {
    this.skipSpaces();
    if (!this.atEnd()) {
      this.fail(`unexpected text after ${context}`, this.foundHere());
    }
  }
}
