/**
 * Parsing the playground pane's GANTT content — either dialect — through
 * the REAL readers only: `.alab` gantt text through `parseGanttText`
 * and Mermaid `gantt` code through `parseMermaidGantt`. Nothing here is read
 * by a bespoke parser, the rule every input layer in this repo follows, and
 * for the same reason — the pane can never disagree with what a saved file
 * means.
 *
 * TWO READS AND TWO WRITES, with ONE DOCUMENT CARVED OUT. Both entries in
 * `GANTT_FORMAT_LABEL` are real in both directions: a pasted Mermaid `gantt`
 * parses, and a plan written here writes back out as `gantt`. The carve-out
 * is the origin-less plan — the one whose axis reads `W1, W2, W3` — because
 * Mermaid `gantt` has no relative axis and every chart anchors to a calendar
 * through `dateFormat`. `serializeMermaidGantt` refuses that document by
 * name rather than inventing a day 0, and the pane's format toggle disables
 * its Mermaid half for exactly that document, carrying the emitter's own
 * sentence as the title. The argument in full is on
 * `src/features/mermaid/lib/gantt-mapping.ts`.
 *
 * DETECTION IS THE EXACT KIND on both sides, with no heuristic that could
 * steal a document from another canvas: `archlab 1.0 gantt` via
 * `detectAlabKind`, and the single header word `gantt` via
 * `detectMermaidGantt` (Mermaid has a real Gantt document type, so there is
 * no convention to infer — contrast the flowchart pane, which has to sniff
 * two header words and hand a use-case reading off).
 *
 * Errors keep the parser's own precision: a 1-based line/column and the
 * offending source line quoted alongside, so the UI renders the caret format
 * the rest of the site uses.
 *
 * PURE — no component imports. The playground's reader is loaded by
 * `scripts/view-input-check.mjs` through Node's type stripping, which cannot
 * read `.tsx`; this module sits below it and must stay loadable the same way.
 */

import type { GanttLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseGanttText,
} from "@/features/archtext";
import {
  MERMAID_GANTT_CAVEAT,
  MERMAID_GANTT_EXPORT_CAVEAT,
  MERMAID_GANTT_ORIGIN_REFUSAL,
  MermaidParseError,
  detectMermaidGantt,
  parseMermaidGantt,
} from "@/features/mermaid";
import { sourceLineAt } from "@/lib/source-text";

/* Re-exported so the gantt feature's own surfaces — the share wrapper and the
   playground's toggle — take the wording from one place rather than each
   holding its own sentence about the same conversion. */
export {
  MERMAID_GANTT_CAVEAT,
  MERMAID_GANTT_EXPORT_CAVEAT,
  MERMAID_GANTT_ORIGIN_REFUSAL,
};

/** The two input languages the gantt canvas accepts. */
export type GanttSourceFormat = "alab" | "mermaid";

export const GANTT_FORMAT_LABEL: Record<GanttSourceFormat, string> = {
  alab: ".alab gantt",
  mermaid: "Mermaid gantt",
};

export interface ParsedGantt {
  format: GanttSourceFormat;
  file: GanttLabFile;
}

/** A located parse failure — line, column, and the quotable source line.
 * Same `kind: "parse"` shape as its six siblings, deliberately: the
 * playground renders all of them through one caret-quote branch. */
export interface GanttParseErrorDetail {
  kind: "parse";
  format: GanttSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
}

/** Neither gantt dialect plausibly matches the first meaningful line. */
export interface UnknownGanttFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type GanttInputError = GanttParseErrorDetail | UnknownGanttFormatDetail;

export type GanttParseResult =
  | { status: "ok"; value: ParsedGantt }
  | { status: "error"; error: GanttInputError };

/**
 * Parses the text as a gantt document. Never throws for bad input; every
 * failure mode comes back typed, located where the parser located it.
 */
export function parseGanttInput(text: string): GanttParseResult {
  if (detectAlabKind(text) === "gantt") {
    try {
      return {
        status: "ok",
        value: { format: "alab", file: parseGanttText(text) },
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
          },
        };
      }
      throw error;
    }
  }

  if (detectMermaidGantt(text)) {
    try {
      return {
        status: "ok",
        // The importer's fixed default timestamp keeps re-parsing the same
        // source deterministic — the playground re-parses on every debounce,
        // and a fresh `new Date()` per keystroke would make every parse a
        // "change" (the contract the other Mermaid importers state).
        value: { format: "mermaid", file: parseMermaidGantt(text) },
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
        "Could not read this as a gantt: the first line neither reads " +
        "`archlab 1.0 gantt` nor is `gantt` on its own.",
    },
  };
}
