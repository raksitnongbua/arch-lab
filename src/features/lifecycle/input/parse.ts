/**
 * Parsing the playground pane's LIFECYCLE content through the REAL reader
 * only: `.alab` lifecycle text through `parseLifecycleText`. Nothing here is
 * read by a bespoke parser, the rule every input layer in this repo follows,
 * and for the same reason — the pane can never disagree with what a saved file
 * means.
 *
 * ONE DIALECT, AND THAT IS A FINDING RATHER THAN A GAP. `new-diagram-type.md`
 * asks for a Mermaid check BEFORE the grammar is designed, and the answer here
 * was that Mermaid has no equivalent notation:
 *
 *   - `stateDiagram-v2` is a state MACHINE. It draws every transition that
 *     COULD happen, from any state to any other, which is precisely the
 *     arbitrary graph this notation exists without — and it has no notion of
 *     one subject's actual ordered history, no main track, and no way to say
 *     that a branch is a departure rather than a peer. Importing one would
 *     mean inventing a main track that its author never wrote, and emitting
 *     one would present a subtraction as a superset. Both are the "lossy
 *     import that presents as lossless" the rule names as a bug people only
 *     find after they lose work.
 *   - `journey` scores satisfaction against tasks. It shares the word
 *     "journey" and nothing else.
 *
 * So there is no converter and no `mermaid/lib/lifecycle*.ts`, per the rule's
 * own instruction: say so and skip it rather than inventing a dialect. That
 * absence is stated in the MCP tool descriptions, the changelog and the
 * pane's format toggle, so a reader is never left wondering whether it was
 * forgotten.
 *
 * DETECTION IS THE EXACT KIND, with no heuristic that could steal a document
 * from another canvas: `archlab 1.0 lifecycle` via `detectAlabKind`.
 *
 * Errors keep the parser's own precision: a 1-based line/column and the
 * offending source line quoted alongside, so the UI renders the caret format
 * the rest of the site uses.
 *
 * PURE — no component imports. The playground's reader is loaded by
 * `scripts/view-input-check.mjs` through Node's type stripping, which cannot
 * read `.tsx`; this module sits below it and must stay loadable the same way.
 */

import type { LifecycleLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseLifecycleText,
} from "@/features/archtext";
import type { ArchTextIssue } from "@/features/archtext";
import { sourceLineAt } from "@/lib/source-text";

/**
 * The one input language the lifecycle canvas accepts.
 *
 * A ONE-MEMBER UNION rather than a bare `"alab"`, and it is not ceremony: the
 * pane's error rendering, the MCP tools' `VALID as …` line and the format
 * label table are all written against `Record<Format, …>` for eight other
 * kinds, and a notation that opted out of the shape would need each of those
 * to grow a special case. The data dictionary made the same call for the same
 * reason.
 */
export type LifecycleSourceFormat = "alab";

export const LIFECYCLE_FORMAT_LABEL: Record<LifecycleSourceFormat, string> = {
  alab: ".alab lifecycle",
};

export interface ParsedLifecycle {
  format: LifecycleSourceFormat;
  file: LifecycleLabFile;
}

/** A located parse failure — line, column, and the quotable source line.
 * Same `kind: "parse"` shape as its eight siblings, deliberately: the
 * playground renders all of them through one caret-quote branch. */
export interface LifecycleParseErrorDetail {
  kind: "parse";
  format: LifecycleSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
  /** The `.alab` issue this was flattened from — carried whole, for the
   *  reasons `SequenceParseErrorDetail.issue` states. Absent for a Mermaid
   *  failure, which has its own error type and no fix candidates. */
  issue?: ArchTextIssue;
}

/** The first meaningful line is not a lifecycle header. */
export interface UnknownLifecycleFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type LifecycleInputError =
  LifecycleParseErrorDetail | UnknownLifecycleFormatDetail;

export type LifecycleParseResult =
  | { status: "ok"; value: ParsedLifecycle }
  | { status: "error"; error: LifecycleInputError };

/**
 * Parses the text as a lifecycle document. Never throws for bad input; every
 * failure mode comes back typed, located where the parser located it.
 */
export function parseLifecycleInput(text: string): LifecycleParseResult {
  if (detectAlabKind(text) === "lifecycle") {
    try {
      return {
        status: "ok",
        value: { format: "alab", file: parseLifecycleText(text) },
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

  return {
    status: "error",
    error: {
      kind: "unknown-format",
      message:
        "Could not read this as a lifecycle: the first line does not read " +
        "`archlab 1.0 lifecycle`. There is no Mermaid dialect for this " +
        "notation — `stateDiagram-v2` draws a state machine (every " +
        "transition that could happen) rather than one subject's history, " +
        "so none was invented.",
    },
  };
}
