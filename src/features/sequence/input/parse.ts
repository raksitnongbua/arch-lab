/**
 * Parsing the sequence playground's single text pane — either format —
 * through the REAL readers only: `.alab` sequence text goes through
 * `parseSequenceText` and Mermaid `sequenceDiagram` code through
 * `parseMermaidSequence`. Nothing is parsed with a bespoke parser here; the
 * same rule `viewer/input/parse-input.ts` follows for C4, and for the same
 * reason — the playground can never disagree with what a saved file means.
 *
 * Detection is by the first meaningful line, mirroring `viewer/input/detect`:
 *   - `archlab 1.0 sequence` → the `.alab` sequence grammar
 *   - `sequenceDiagram`      → the Mermaid importer (one-way; the caveat is
 *                              carried on the result so the UI states the loss)
 *   - `archlab 1.0` (C4) or a Mermaid C4 header → a typed redirect error
 *     pointing at `/view/c4` instead of a misleading "line 1" parse error
 *
 * Errors keep their native precision: both parsers throw with a 1-based
 * line/column, and the offending source line is quoted alongside so the UI
 * can render the caret format the rest of the site uses.
 */

import type { SequenceLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseSequenceText,
} from "@/features/archtext";
import {
  MERMAID_DIAGRAM_TYPES,
  MERMAID_SEQUENCE_CAVEAT,
  MermaidParseError,
  parseMermaidSequence,
} from "@/features/mermaid";
import { sourceLineAt } from "@/lib/source-text";

export { MERMAID_SEQUENCE_CAVEAT };

/** The two input languages the sequence pane accepts. */
export type SequenceSourceFormat = "alab" | "mermaid";

export const SEQUENCE_FORMAT_LABEL: Record<SequenceSourceFormat, string> = {
  alab: ".alab sequence",
  mermaid: "Mermaid sequenceDiagram",
};

export interface ParsedSequence {
  format: SequenceSourceFormat;
  file: SequenceLabFile;
}

/** A located parse failure — line, column, and the quotable source line. */
export interface SequenceParseErrorDetail {
  kind: "parse";
  format: SequenceSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
}

/** The text is a recognisable C4 document — belongs on `/view/c4`. */
export interface WrongDocumentDetail {
  kind: "c4-detected";
  message: string;
}

/** Neither grammar plausibly matches the first meaningful line. */
export interface UnknownSequenceFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type SequenceInputError =
  SequenceParseErrorDetail | WrongDocumentDetail | UnknownSequenceFormatDetail;

export type SequenceParseResult =
  | { status: "ok"; value: ParsedSequence }
  | { status: "error"; error: SequenceInputError };

function detect(text: string): SequenceSourceFormat | "c4" | null {
  const alab = detectAlabKind(text);
  if (alab === "sequence") return "alab";
  if (alab === "c4") return "c4";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("%%") || line.startsWith("//")) {
      continue;
    }
    const firstWord = line.split(/[\s({]/, 1)[0];
    if (firstWord === "sequenceDiagram") return "mermaid";
    if ((MERMAID_DIAGRAM_TYPES as readonly string[]).includes(firstWord)) {
      return "c4"; // Mermaid, but the C4 family — also /view/c4's business.
    }
    return null;
  }
  return null;
}

/**
 * Parses the pane's content, auto-detecting the format. Never throws; every
 * failure mode comes back typed, located where the parser located it.
 */
export function parseSequenceInput(text: string): SequenceParseResult {
  const format = detect(text);

  if (format === "c4") {
    return {
      status: "error",
      error: {
        kind: "c4-detected",
        message:
          "This is a C4 model, not a sequence diagram — the C4 playground at /view/c4 renders it.",
      },
    };
  }

  if (format === null) {
    return {
      status: "error",
      error: {
        kind: "unknown-format",
        message:
          text.trim() === ""
            ? "Nothing to render yet — write .alab sequence text (starting `archlab 1.0 sequence`) or paste a Mermaid `sequenceDiagram`."
            : "Could not detect the format: the first line neither reads `archlab 1.0 sequence` nor starts with `sequenceDiagram`.",
      },
    };
  }

  if (format === "alab") {
    try {
      return {
        status: "ok",
        value: { format, file: parseSequenceText(text) },
      };
    } catch (error) {
      if (error instanceof ArchTextParseError) {
        return {
          status: "error",
          error: {
            kind: "parse",
            format,
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

  try {
    return {
      status: "ok",
      value: {
        format,
        // A fixed timestamp keeps re-parsing the same source deterministic —
        // the playground re-parses on every debounce, and a fresh `new Date()`
        // per keystroke would make every parse a "change".
        file: parseMermaidSequence(text),
      },
    };
  } catch (error) {
    if (error instanceof MermaidParseError) {
      return {
        status: "error",
        error: {
          kind: "parse",
          format,
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
