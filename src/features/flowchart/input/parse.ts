/**
 * Parsing the playground pane's FLOWCHART content — either dialect — through
 * the REAL readers only: `.alab` flowchart text goes through
 * `parseFlowchartText` and Mermaid `flowchart` / `graph` code through
 * `parseMermaidFlowchart`. Nothing is parsed with a bespoke parser here; the
 * same rule `sequence/input/parse.ts` follows, and for the same reason — the
 * playground can never disagree with what a saved file means.
 *
 * Detection is by the first meaningful line, mirroring the sequence reader:
 *   - `archlab 1.0 flowchart`  → the `.alab` flowchart grammar
 *   - `flowchart …` / `graph …` (from `MERMAID_FLOWCHART_HEADER_WORDS`,
 *     the importer's own table) → the Mermaid importer (one-way; the caveat
 *     is `MERMAID_FLOWCHART_CAVEAT`, surfaced by the playground's disclosure)
 *
 * In the merged playground this reader is reached as ROUTING, not as a
 * detector of its own: `parseSequenceInput`'s detect already names every
 * first line, and its `flowchart-detected` verdict is what sends the text
 * here (`playground/input/parse.ts` explains the ordering). The detection is
 * still repeated locally so this module stands alone — a check script or a
 * future caller can hand it raw text without first consulting the sequence
 * reader.
 *
 * Errors keep their native precision: both parsers throw with a 1-based
 * line/column, and the offending source line is quoted alongside so the UI
 * can render the caret format the rest of the site uses.
 *
 * PURE — no component imports. The playground's reader is loaded by
 * `scripts/view-input-check.mjs` through Node's type stripping, which cannot
 * read `.tsx`; this module sits below it and must stay loadable the same way.
 */

import type { FlowchartLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseFlowchartText,
} from "@/features/archtext";
import type { ArchTextIssue } from "@/features/archtext";
import {
  MERMAID_FLOWCHART_CAVEAT,
  MERMAID_FLOWCHART_HEADER_WORDS,
  MermaidParseError,
  parseMermaidFlowchart,
  stripMermaidFrontmatter,
} from "@/features/mermaid";
import { sourceLineAt } from "@/lib/source-text";

export { MERMAID_FLOWCHART_CAVEAT };

/** The two input languages the flowchart canvas accepts. */
export type FlowchartSourceFormat = "alab" | "mermaid";

export const FLOWCHART_FORMAT_LABEL: Record<FlowchartSourceFormat, string> = {
  alab: ".alab flowchart",
  mermaid: "Mermaid flowchart",
};

export interface ParsedFlowchart {
  format: FlowchartSourceFormat;
  file: FlowchartLabFile;
}

/** A located parse failure — line, column, and the quotable source line.
 * Same `kind: "parse"` shape as `SequenceParseErrorDetail`, deliberately:
 * the playground renders both through one caret-quote branch. */
export interface FlowchartParseErrorDetail {
  kind: "parse";
  format: FlowchartSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
  /** The `.alab` issue this was flattened from — carried whole, for the
   *  reasons `SequenceParseErrorDetail.issue` states. Absent for a Mermaid
   *  failure, which has its own error type and no fix candidates. */
  issue?: ArchTextIssue;
}

/** Neither flowchart dialect plausibly matches the first meaningful line. */
export interface UnknownFlowchartFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type FlowchartInputError =
  FlowchartParseErrorDetail | UnknownFlowchartFormatDetail;

export type FlowchartParseResult =
  | { status: "ok"; value: ParsedFlowchart }
  | { status: "error"; error: FlowchartInputError };

function detect(text: string): FlowchartSourceFormat | "usecase" | null {
  const alab = detectAlabKind(text);
  if (alab === "flowchart") return "alab";
  // Named rather than folded into null: a use-case header is a recognisable
  // `.alab` document, and "the first line neither reads …" would be a
  // misleading answer to text whose first line reads perfectly well.
  if (alab === "usecase") return "usecase";
  // Sniff BEHIND any YAML frontmatter: the emitter writes the title as
  // frontmatter and `parseMermaidFlowchart` reads it back, so a detector
  // stopping at `---` would refuse the very text the format toggle writes
  // (the shipped can't-switch-to-Mermaid bug; see stripMermaidFrontmatter).
  for (const rawLine of stripMermaidFrontmatter(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("%%") || line.startsWith("//")) {
      continue;
    }
    const firstWord = line.split(/[\s({;]/, 1)[0];
    if (
      (MERMAID_FLOWCHART_HEADER_WORDS as readonly string[]).includes(firstWord)
    ) {
      return "mermaid";
    }
    return null;
  }
  return null;
}

/**
 * Parses the text as a flowchart, auto-detecting the dialect. Never throws;
 * every failure mode comes back typed, located where the parser located it.
 */
export function parseFlowchartInput(text: string): FlowchartParseResult {
  const format = detect(text);

  if (format === "usecase") {
    // Worded to stand alone (the MCP flowchart tool renders it verbatim);
    // the merged playground never shows it — its own dispatch routes an
    // `.alab` use-case header into the use-case reader before reaching here.
    return {
      status: "error",
      error: {
        kind: "unknown-format",
        message:
          "This is a use-case document (`archlab 1.0 usecase`), not a flowchart — the /live playground renders it.",
      },
    };
  }

  if (format === null) {
    return {
      status: "error",
      error: {
        kind: "unknown-format",
        message:
          "Could not read this as a flowchart: the first line neither reads " +
          "`archlab 1.0 flowchart` nor starts with `flowchart` or `graph`.",
      },
    };
  }

  if (format === "alab") {
    try {
      return {
        status: "ok",
        value: { format, file: parseFlowchartText(text) },
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

            issue: error.issues[0],
          },
        };
      }
      throw error;
    }
  }

  try {
    return {
      status: "ok",
      // The importer's fixed default timestamp keeps re-parsing the same
      // source deterministic — the playground re-parses on every debounce,
      // and a fresh `new Date()` per keystroke would make every parse a
      // "change" (the same contract the sequence importer states).
      value: { format, file: parseMermaidFlowchart(text) },
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
