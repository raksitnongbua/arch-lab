/**
 * Recursive-descent parser for Mermaid C4 source, producing a small AST
 * (`MermaidDocument`) that `toModel.ts` then converts into the arch-flow
 * model. Grammar (statements are newline-terminated):
 *
 *   document  := newline* diagramType statement*
 *   statement := title | boundary | element | rel | ignoredCall
 *   title     := "title" <rest of line>
 *   boundary  := BoundaryForm args "{" statement* "}"
 *   element   := ElementForm args
 *   rel       := RelForm args
 *   args      := "(" (value | $name = value) ("," …)* ")"
 *
 * Pure, no I/O. All errors are `MermaidParseError`s carrying line/column and
 * the offending text; a failed parse never returns a partial document.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { failAt } from "./errors";
import {
  BOUNDARY_FORMS,
  ELEMENT_FORMS,
  IGNORED_CALLS,
  MERMAID_DIAGRAM_TYPES,
  REL_FORMS,
} from "./mapping";
import type {
  BoundaryFormSpec,
  ElementFormSpec,
  MermaidDiagramType,
  RelFormSpec,
} from "./mapping";
import { Scanner } from "./scanner";
import type { Token } from "./scanner";
import { decodeInlineBreaks } from "./text";

/* -------------------------------------------------------------------------- */
/* AST                                                                         */
/* -------------------------------------------------------------------------- */

export interface SourcePosition {
  line: number;
  column: number;
}

export interface TitleStmt extends SourcePosition {
  kind: "title";
  text: string;
}

export interface ElementStmt extends SourcePosition {
  kind: "element";
  form: string;
  spec: ElementFormSpec;
  alias: string;
  label: string;
  technology?: string;
  description?: string;
}

export interface RelStmt extends SourcePosition {
  kind: "rel";
  form: string;
  spec: RelFormSpec;
  from: string;
  to: string;
  label?: string;
  technology?: string;
}

export interface BoundaryStmt extends SourcePosition {
  kind: "boundary";
  form: string;
  spec: BoundaryFormSpec;
  alias: string;
  label: string;
  typeLabel?: string;
  children: MermaidStatement[];
}

export type MermaidStatement = TitleStmt | ElementStmt | RelStmt | BoundaryStmt;

export interface MermaidDocument {
  diagramType: MermaidDiagramType;
  statements: MermaidStatement[];
}

/* -------------------------------------------------------------------------- */
/* Argument lists                                                              */
/* -------------------------------------------------------------------------- */

interface Arg extends SourcePosition {
  /** Whether the lexeme was a bare identifier (usable as an alias). */
  isIdent: boolean;
  value: string;
}

function isDiagramType(value: string): value is MermaidDiagramType {
  return (MERMAID_DIAGRAM_TYPES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                      */
/* -------------------------------------------------------------------------- */

class Parser {
  private readonly scanner: Scanner;

  constructor(source: string) {
    this.scanner = new Scanner(source);
  }

  parseDocument(): MermaidDocument {
    this.skipNewlines();
    const head = this.scanner.next();
    if (head.kind === "eof") {
      failAt(
        head.line,
        head.column,
        "the source is empty — expected a diagram type on the first line, e.g. C4Context",
      );
    }
    if (head.kind !== "ident" || !isDiagramType(head.value)) {
      failAt(
        head.line,
        head.column,
        `"${head.value}" is not a Mermaid C4 diagram type — expected one of ${MERMAID_DIAGRAM_TYPES.join(", ")}`,
        head.value,
      );
    }
    const statements = this.parseStatements(null);
    const trailing = this.scanner.next();
    if (trailing.kind === "}") {
      failAt(
        trailing.line,
        trailing.column,
        'unmatched "}" — there is no open boundary block to close',
        "}",
      );
    }
    return { diagramType: head.value, statements };
  }

  /** Parses statements until EOF (root) or the matching `}` (boundary body). */
  private parseStatements(openBrace: Token | null): MermaidStatement[] {
    const statements: MermaidStatement[] = [];
    for (;;) {
      this.skipNewlines();
      const token = this.scanner.peek();
      if (token.kind === "eof") {
        if (openBrace !== null) {
          failAt(
            token.line,
            token.column,
            `the boundary block opened at line ${openBrace.line}, column ${openBrace.column} is never closed — expected "}"`,
          );
        }
        return statements;
      }
      if (token.kind === "}") {
        if (openBrace !== null) this.scanner.next();
        return statements;
      }
      if (token.kind !== "ident") {
        failAt(
          token.line,
          token.column,
          `unexpected "${token.value}" — expected a C4 statement (an element such as Person or System, a boundary, a relationship such as Rel or BiRel, or "title")`,
          token.value,
        );
      }
      this.scanner.next();
      if (IGNORED_CALLS.has(token.value)) {
        // Styling/layout directives carry no model content — parse and drop.
        this.parseArgs(token);
        continue;
      }
      statements.push(this.parseStatement(token));
    }
  }

  private parseStatement(keyword: Token): MermaidStatement {
    const name = keyword.value;
    if (name === "title") {
      const text = this.scanner.restOfLine();
      if (text === "") {
        failAt(
          keyword.line,
          keyword.column,
          '"title" is missing its text — expected e.g. `title System Context diagram`',
          "title",
        );
      }
      return {
        kind: "title",
        text,
        line: keyword.line,
        column: keyword.column,
      };
    }

    const elementSpec = ELEMENT_FORMS[name] as ElementFormSpec | undefined;
    if (elementSpec !== undefined) {
      return this.parseElement(keyword, elementSpec);
    }
    const boundarySpec = BOUNDARY_FORMS[name] as BoundaryFormSpec | undefined;
    if (boundarySpec !== undefined) {
      return this.parseBoundary(keyword, boundarySpec);
    }
    const relSpec = REL_FORMS[name] as RelFormSpec | undefined;
    if (relSpec !== undefined) {
      return this.parseRel(keyword, relSpec);
    }
    failAt(
      keyword.line,
      keyword.column,
      `"${name}" is not a recognised C4 statement — expected an element (Person, System, Container, Component, their Db/Queue/_Ext variants), a boundary (Enterprise_Boundary, System_Boundary, Container_Boundary, Boundary), a relationship (Rel, BiRel, Rel_U/D/L/R), or "title"`,
      name,
    );
  }

  private parseElement(keyword: Token, spec: ElementFormSpec): ElementStmt {
    const args = this.parseArgs(keyword);
    const alias = this.requireAlias(keyword, args, "element");
    const label = this.requireLabel(keyword, args, alias);
    const stmt: ElementStmt = {
      kind: "element",
      form: keyword.value,
      spec,
      alias,
      label,
      line: keyword.line,
      column: keyword.column,
    };
    if (spec.argStyle === "tech") {
      const technology = optionalText(args[2]);
      const description = optionalText(args[3]);
      if (technology !== undefined) stmt.technology = technology;
      if (description !== undefined) stmt.description = description;
    } else {
      const description = optionalText(args[2]);
      if (description !== undefined) stmt.description = description;
    }
    return stmt;
  }

  private parseBoundary(keyword: Token, spec: BoundaryFormSpec): BoundaryStmt {
    const args = this.parseArgs(keyword);
    const alias = this.requireAlias(keyword, args, "boundary");
    const label = this.requireLabel(keyword, args, alias);
    this.skipNewlines();
    const brace = this.scanner.next();
    if (brace.kind !== "{") {
      failAt(
        brace.line,
        brace.column,
        `expected "{" to open the body of boundary "${alias}", found ${describeToken(brace)}`,
        brace.value,
      );
    }
    const children = this.parseStatements(brace);
    const stmt: BoundaryStmt = {
      kind: "boundary",
      form: keyword.value,
      spec,
      alias,
      label,
      children,
      line: keyword.line,
      column: keyword.column,
    };
    if (spec.hasTypeArg) {
      const typeLabel = optionalText(args[2]);
      if (typeLabel !== undefined) stmt.typeLabel = typeLabel;
    }
    return stmt;
  }

  private parseRel(keyword: Token, spec: RelFormSpec): RelStmt {
    const args = this.parseArgs(keyword);
    const from = args[0] as Arg | undefined;
    const to = args[1] as Arg | undefined;
    if (from === undefined || to === undefined) {
      failAt(
        keyword.line,
        keyword.column,
        `${keyword.value} needs at least a source and a target alias — e.g. Rel(customerA, SystemAA, "Uses")`,
        keyword.value,
      );
    }
    const stmt: RelStmt = {
      kind: "rel",
      form: keyword.value,
      spec,
      from: from.value,
      to: to.value,
      line: keyword.line,
      column: keyword.column,
    };
    const label = optionalText(args[2]);
    const technology = optionalText(args[3]);
    if (label !== undefined) stmt.label = label;
    if (technology !== undefined) stmt.technology = technology;
    return stmt;
  }

  /** Parses `( value, value, $name = value, … )` after a keyword. */
  private parseArgs(keyword: Token): Arg[] {
    const open = this.scanner.next();
    if (open.kind !== "(") {
      failAt(
        open.line,
        open.column,
        `expected "(" after ${keyword.value}, found ${describeToken(open)}`,
        open.value,
      );
    }
    const args: Arg[] = [];
    for (;;) {
      let token = this.nextInsideParens(open);
      if (token.kind === ")") {
        return args;
      }
      if (token.kind === ",") {
        if (args.length === 0) {
          failAt(
            token.line,
            token.column,
            `unexpected "," — expected an argument after "(" in ${keyword.value}(…)`,
            ",",
          );
        }
        token = this.nextInsideParens(open);
      } else if (args.length > 0) {
        failAt(
          token.line,
          token.column,
          `expected "," or ")" between the arguments of ${keyword.value}(…), found ${describeToken(token)}`,
          token.value,
        );
      }
      if (token.kind === "ident" && token.value.startsWith("$")) {
        // Named argument ($sprite=…, $tags=…, $link=…): parse and drop.
        const eq = this.nextInsideParens(open);
        if (eq.kind !== "=") {
          failAt(
            eq.line,
            eq.column,
            `expected "=" after the named argument ${token.value}, found ${describeToken(eq)}`,
            eq.value,
          );
        }
        const value = this.nextInsideParens(open);
        if (value.kind !== "string" && value.kind !== "ident") {
          failAt(
            value.line,
            value.column,
            `expected a value for ${token.value}=…, found ${describeToken(value)}`,
            value.value,
          );
        }
        continue;
      }
      if (token.kind !== "string" && token.kind !== "ident") {
        failAt(
          token.line,
          token.column,
          `unexpected ${describeToken(token)} in the arguments of ${keyword.value}(…) — expected an alias or a quoted string`,
          token.value,
        );
      }
      args.push({
        isIdent: token.kind === "ident",
        value: token.value,
        line: token.line,
        column: token.column,
      });
    }
  }

  /** Next token inside `(...)`; newlines are insignificant, EOF is an error. */
  private nextInsideParens(open: Token): Token {
    for (;;) {
      const token = this.scanner.next();
      if (token.kind === "newline") continue;
      if (token.kind === "eof") {
        failAt(
          token.line,
          token.column,
          `the argument list opened at line ${open.line}, column ${open.column} is never closed — expected ")"`,
        );
      }
      return token;
    }
  }

  private requireAlias(keyword: Token, args: Arg[], what: string): string {
    const first = args[0] as Arg | undefined;
    if (first === undefined) {
      failAt(
        keyword.line,
        keyword.column,
        `${keyword.value} needs an alias and a label — e.g. ${keyword.value}(alias, "Label")`,
        keyword.value,
      );
    }
    if (!first.isIdent) {
      failAt(
        first.line,
        first.column,
        `"${first.value}" cannot be used as the ${what} alias — the first argument must be a bare identifier, not a quoted string`,
        first.value,
      );
    }
    return first.value;
  }

  private requireLabel(keyword: Token, args: Arg[], alias: string): string {
    const second = args[1] as Arg | undefined;
    const label =
      second === undefined ? "" : decodeInlineBreaks(second.value).trim();
    if (label === "") {
      failAt(
        second?.line ?? keyword.line,
        second?.column ?? keyword.column,
        `"${alias}" has no name — the second argument of ${keyword.value}(…) must be a non-empty label`,
        keyword.value,
      );
    }
    return label;
  }

  private skipNewlines(): void {
    while (this.scanner.peek().kind === "newline") this.scanner.next();
  }
}

function optionalText(arg: Arg | undefined): string | undefined {
  if (arg === undefined) return undefined;
  const decoded = decodeInlineBreaks(arg.value);
  return decoded === "" ? undefined : decoded;
}

function describeToken(token: Token): string {
  if (token.kind === "eof") return "end of input";
  if (token.kind === "newline") return "end of line";
  if (token.kind === "string") return `the string "${token.value}"`;
  return `"${token.value}"`;
}

/** Parses Mermaid C4 source into an AST. Throws `MermaidParseError`. */
export function parseMermaidDocument(source: string): MermaidDocument {
  return new Parser(source).parseDocument();
}
