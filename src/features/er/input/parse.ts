/**
 * Parsing the playground pane's ER content — either dialect — through the
 * REAL readers only: `.alab` ER text goes through `parseErText`, and Mermaid
 * `erDiagram` code through `parseMermaidEr`. Nothing is parsed with a bespoke
 * parser here; the same rule the sequence, flowchart and use-case input
 * layers follow, and for the same reason — the playground can never disagree
 * with what a saved file means.
 *
 * DETECTION IS THE SIMPLEST OF THE FIVE, and that is worth saying because the
 * use-case reader's is the most complicated. Both sides have a real header:
 * `archlab 1.0 er` via `detectAlabKind`, and `erDiagram` via
 * `detectMermaidEr`. There is no heuristic, nothing to steal a document from
 * another canvas, and no caveat about a reading that might be wrong.
 *
 * Errors keep their native precision: both parsers throw with a 1-based
 * line/column, and the offending source line is quoted alongside so the UI
 * can render the caret format the rest of the site uses.
 *
 * PURE — no component imports. The playground's reader is loaded by
 * `scripts/view-input-check.mjs` through Node's type stripping, which cannot
 * read `.tsx`; this module sits below it and must stay loadable the same way.
 */

import type { ErLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseErText,
} from "@/features/archtext";
import type { ArchTextIssue } from "@/features/archtext";
import {
  detectMermaidEr,
  MERMAID_ER_CAVEAT,
  parseMermaidEr,
} from "@/features/mermaid";
import { MermaidParseError } from "@/features/mermaid";
import { sourceLineAt } from "@/lib/source-text";

export { MERMAID_ER_CAVEAT };

/** The two input languages the ER canvas accepts. */
export type ErSourceFormat = "alab" | "mermaid";

export const ER_FORMAT_LABEL: Record<ErSourceFormat, string> = {
  alab: ".alab er",
  mermaid: "Mermaid erDiagram",
};

export interface ParsedEr {
  format: ErSourceFormat;
  file: ErLabFile;
}

/** A located parse failure — line, column, and the quotable source line.
 * Same `kind: "parse"` shape as its four siblings, deliberately: the
 * playground renders all of them through one caret-quote branch. */
export interface ErParseErrorDetail {
  kind: "parse";
  format: ErSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
  /** The `.alab` issue this was flattened from — carried whole, for the
   *  reasons `SequenceParseErrorDetail.issue` states. Absent for a Mermaid
   *  failure, which has its own error type and no fix candidates. */
  issue?: ArchTextIssue;
}

/** Neither reading matches: no `archlab 1.0 er` header and no `erDiagram`. */
export interface UnknownErFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type ErInputError = ErParseErrorDetail | UnknownErFormatDetail;

export type ErParseResult =
  { status: "ok"; value: ParsedEr } | { status: "error"; error: ErInputError };

/**
 * Parses the text as an ER document, auto-detecting the dialect. Never throws
 * for bad input; every failure mode comes back typed, located where the
 * parser located it.
 */
export function parseErInput(text: string): ErParseResult {
  if (detectAlabKind(text) === "er") {
    try {
      return {
        status: "ok",
        value: { format: "alab", file: parseErText(text) },
      };
    } catch (error) {
      if (error instanceof ArchTextParseError) {
        return {
          status: "error",
          error: {
            kind: "parse",
            format: "alab",
            message: error.message,
            line: error.line,
            column: error.column,
            lineText: sourceLineAt(text, error.line),
            issue: error.issues[0],
          },
        };
      }
      throw error;
    }
  }

  if (detectMermaidEr(text)) {
    /* UNLIKE the use-case arm, this CAN fail: `detectMermaidEr` tests one
       header word rather than running the parser, so a document that opens
       `erDiagram` and then says something malformed reaches here. That is the
       normal case for a person typing, so it is reported, not rethrown. */
    try {
      return {
        status: "ok",
        value: { format: "mermaid", file: parseMermaidEr(text) },
      };
    } catch (error) {
      if (error instanceof MermaidParseError) {
        return {
          status: "error",
          error: {
            kind: "parse",
            format: "mermaid",
            message: error.message,
            line: error.line,
            column: error.column,
            lineText: sourceLineAt(text, error.line),
          },
        };
      }
      throw error;
    }
  }

  return {
    status: "error",
    error: {
      kind: "unknown-format",
      message:
        "Could not read this as an ER document: the first line does not " +
        "read `archlab 1.0 er`, and it is not Mermaid `erDiagram` code.",
    },
  };
}
