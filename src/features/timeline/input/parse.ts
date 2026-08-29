/**
 * Parsing the playground pane's TIMELINE content — either dialect — through
 * the REAL readers only: `.alab` timeline text through `parseTimelineText` and
 * Mermaid `timeline` code through `parseMermaidTimeline`. Nothing here is read
 * by a bespoke parser, the rule every input layer in this repo follows, and
 * for the same reason — the pane can never disagree with what a saved file
 * means.
 *
 * TWO READS AND TWO WRITES, unlike the gantt beside it. Mermaid `timeline`
 * joins as a full second language rather than as an import: a timeline has no
 * state vocabulary and derives nothing, so Mermaid holds everything it says
 * and an emit cannot misrepresent anything. `MERMAID_TIMELINE_EXPORT_CAVEAT`
 * names what the emit drops (`desc`, `#tag`s, the header beyond the title) —
 * metadata around the diagram, never a claim the diagram makes. The argument
 * in full is on `src/features/mermaid/lib/timeline-mapping.ts`.
 *
 * DETECTION IS THE EXACT KIND on both sides, with no heuristic that could
 * steal a document from another canvas: `archlab 1.0 timeline` via
 * `detectAlabKind`, and the single header word `timeline` via
 * `detectMermaidTimeline` (Mermaid has a real timeline document type, so there
 * is no convention to infer — contrast the flowchart pane, which has to sniff
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

import type { TimelineLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseTimelineText,
} from "@/features/archtext";
import {
  MERMAID_TIMELINE_CAVEAT,
  MERMAID_TIMELINE_EXPORT_CAVEAT,
  MermaidParseError,
  detectMermaidTimeline,
  parseMermaidTimeline,
} from "@/features/mermaid";
import { sourceLineAt } from "@/lib/source-text";

export { MERMAID_TIMELINE_CAVEAT, MERMAID_TIMELINE_EXPORT_CAVEAT };

/** The two input languages the timeline canvas accepts. */
export type TimelineSourceFormat = "alab" | "mermaid";

export const TIMELINE_FORMAT_LABEL: Record<TimelineSourceFormat, string> = {
  alab: ".alab timeline",
  mermaid: "Mermaid timeline",
};

export interface ParsedTimeline {
  format: TimelineSourceFormat;
  file: TimelineLabFile;
}

/** A located parse failure — line, column, and the quotable source line.
 * Same `kind: "parse"` shape as its seven siblings, deliberately: the
 * playground renders all of them through one caret-quote branch. */
export interface TimelineParseErrorDetail {
  kind: "parse";
  format: TimelineSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
}

/** Neither timeline dialect plausibly matches the first meaningful line. */
export interface UnknownTimelineFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type TimelineInputError =
  TimelineParseErrorDetail | UnknownTimelineFormatDetail;

export type TimelineParseResult =
  | { status: "ok"; value: ParsedTimeline }
  | { status: "error"; error: TimelineInputError };

/**
 * Parses the text as a timeline document. Never throws for bad input; every
 * failure mode comes back typed, located where the parser located it.
 */
export function parseTimelineInput(text: string): TimelineParseResult {
  if (detectAlabKind(text) === "timeline") {
    try {
      return {
        status: "ok",
        value: { format: "alab", file: parseTimelineText(text) },
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

  if (detectMermaidTimeline(text)) {
    try {
      return {
        status: "ok",
        // The importer's fixed default timestamp keeps re-parsing the same
        // source deterministic — the playground re-parses on every debounce,
        // and a fresh `new Date()` per keystroke would make every parse a
        // "change" (the contract the other Mermaid importers state).
        value: { format: "mermaid", file: parseMermaidTimeline(text) },
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
        "Could not read this as a timeline: the first line neither reads " +
        "`archlab 1.0 timeline` nor is `timeline` on its own.",
    },
  };
}
