/**
 * Tokenizer for Mermaid C4 source. Pure and dependency-free: turns raw text
 * into a stream of located tokens for the recursive-descent parser in
 * `parser.ts`. Every token carries a 1-based line and column so parse errors
 * can always name their location (see `errors.ts`).
 *
 * Lexical rules implemented here:
 *   - `%%` starts a comment running to end of line.
 *   - Strings are double-quoted; `\"` and `\\` are decoded, any other
 *     backslash is kept verbatim. An unterminated string is an error at the
 *     opening quote.
 *   - Identifiers cover element keywords, aliases and `$named` argument
 *     names: `[A-Za-z_$][A-Za-z0-9_.$-]*`.
 *   - Newlines are significant (they end statements) and are emitted as
 *     tokens; consecutive blank lines collapse into one token.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums, no parameter properties).
 */

import { failAt } from "./errors";

export type TokenKind =
  "ident" | "string" | "(" | ")" | "{" | "}" | "," | "=" | "newline" | "eof";

export interface Token {
  kind: TokenKind;
  /** Decoded value for strings; the lexeme itself for everything else. */
  value: string;
  line: number;
  column: number;
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_.$-]/.test(ch);
}

export class Scanner {
  private readonly src: string;
  private pos: number;
  private line: number;
  private column: number;
  private peeked: Token | null;

  constructor(source: string) {
    this.src = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.peeked = null;
  }

  /** Returns the next token without consuming it. */
  peek(): Token {
    if (this.peeked === null) this.peeked = this.scan();
    return this.peeked;
  }

  /** Consumes and returns the next token. */
  next(): Token {
    const token = this.peek();
    this.peeked = null;
    return token;
  }

  /**
   * Consumes the rest of the current physical line as raw text (trimmed),
   * used for `title`, whose argument is unquoted free text.
   */
  restOfLine(): string {
    // A peeked token would already have consumed leading whitespace, which is
    // fine — it can only have been peeked, never scanned past the newline,
    // because callers invoke this immediately after consuming an ident.
    this.peeked = null;
    let out = "";
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === "\n" || ch === "\r") break;
      out += ch;
      this.advance(ch);
    }
    return out.trim();
  }

  private advance(ch: string): void {
    this.pos += 1;
    if (ch === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
  }

  private scan(): Token {
    // Skip spaces, tabs, carriage returns and %% comments.
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.advance(ch);
        continue;
      }
      if (ch === "%" && this.src[this.pos + 1] === "%") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") {
          this.advance(this.src[this.pos]);
        }
        continue;
      }
      break;
    }

    const line = this.line;
    const column = this.column;

    if (this.pos >= this.src.length) {
      return { kind: "eof", value: "", line, column };
    }

    const ch = this.src[this.pos];

    if (ch === "\n") {
      // Collapse a run of newlines (and blank/comment-only lines) into one.
      while (this.pos < this.src.length) {
        const c = this.src[this.pos];
        if (c === "\n" || c === "\r" || c === " " || c === "\t") {
          this.advance(c);
        } else if (c === "%" && this.src[this.pos + 1] === "%") {
          while (this.pos < this.src.length && this.src[this.pos] !== "\n") {
            this.advance(this.src[this.pos]);
          }
        } else {
          break;
        }
      }
      return { kind: "newline", value: "\n", line, column };
    }

    if (
      ch === "(" ||
      ch === ")" ||
      ch === "{" ||
      ch === "}" ||
      ch === "," ||
      ch === "="
    ) {
      this.advance(ch);
      return { kind: ch, value: ch, line, column };
    }

    if (ch === '"') {
      this.advance(ch);
      let value = "";
      for (;;) {
        if (this.pos >= this.src.length || this.src[this.pos] === "\n") {
          failAt(
            line,
            column,
            'the string starting here is never closed — expected a closing `"` before the end of the line',
            `"${value}`,
          );
        }
        const c = this.src[this.pos];
        if (c === '"') {
          this.advance(c);
          break;
        }
        if (c === "\\") {
          const escaped = this.src[this.pos + 1];
          if (escaped === '"' || escaped === "\\") {
            value += escaped;
            this.advance(c);
            this.advance(escaped);
            continue;
          }
        }
        value += c;
        this.advance(c);
      }
      return { kind: "string", value, line, column };
    }

    if (isIdentStart(ch)) {
      let value = "";
      while (this.pos < this.src.length && isIdentPart(this.src[this.pos])) {
        value += this.src[this.pos];
        this.advance(this.src[this.pos]);
      }
      return { kind: "ident", value, line, column };
    }

    failAt(
      line,
      column,
      `unexpected character "${ch}" — expected an element keyword, alias, string, or punctuation`,
      ch,
    );
  }
}
