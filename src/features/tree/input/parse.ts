/**
 * Parsing the playground pane's TREE content through the REAL reader only:
 * `.alab` tree text through `parseTreeText`. Nothing here is read by a
 * bespoke parser, the rule every input layer in this repo follows, and for the
 * same reason — the pane can never disagree with what a saved file means.
 *
 * ONE DIALECT TODAY, AND THE MERMAID ANSWER IS NOT THE LIFECYCLE'S.
 * `new-diagram-type.md` asks for a Mermaid check BEFORE the grammar is
 * designed. Unlike the lifecycle, which found no equivalent notation at all,
 * Mermaid DOES have a tree: `mindmap`. The honest reading of it is:
 *
 *   - It carries a label hierarchy and nothing else — no ids, and no columns.
 *     A document of ours with a `columns` line cannot round-trip through it,
 *     so a two-way conversion would be the "lossy import that presents as
 *     lossless" the rule names as a bug people only find after they lose work.
 *   - A ONE-WAY IMPORT is therefore the only honest shape: read a `mindmap`
 *     in, answer in `.alab`, and refuse by name what it can express and we
 *     cannot (its shape syntax, `::icon()`, and class styling).
 *
 * That import is NOT BUILT YET, and this comment is the record of the decision
 * rather than of the work. Until it lands, the pane accepts `.alab` only and
 * the refusal below says so in those words — an absence a reader can see beats
 * one they have to discover.
 *
 * DETECTION IS THE EXACT KIND, with no heuristic that could steal a document
 * from another canvas: `archlab 1.0 tree` via `detectAlabKind`.
 *
 * PURE — no component imports. The playground's reader is loaded by
 * `scripts/view-input-check.mjs` through Node's type stripping, which cannot
 * read `.tsx`; this module sits below it and must stay loadable the same way.
 */

import type { TreeLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseTreeText,
} from "@/features/archtext";
import type { ArchTextIssue } from "@/features/archtext";
import { sourceLineAt } from "@/lib/source-text";

/**
 * The one input language the tree canvas accepts today.
 *
 * A ONE-MEMBER UNION rather than a bare `"alab"`, for the reason the lifecycle
 * and the data dictionary both give: the pane's error rendering, the MCP
 * tools' `VALID as …` line and the format label table are all written against
 * `Record<Format, …>`, and a notation that opted out of the shape would need
 * each of those to grow a special case. It is also the slot a `"mermaid"`
 * member drops into on the day the `mindmap` import above is built.
 */
export type TreeSourceFormat = "alab";

export const TREE_FORMAT_LABEL: Record<TreeSourceFormat, string> = {
  alab: ".alab tree",
};

export interface ParsedTree {
  format: TreeSourceFormat;
  file: TreeLabFile;
}

/** A located parse failure — line, column, and the quotable source line.
 * Same `kind: "parse"` shape as its nine siblings, deliberately: the
 * playground renders all of them through one caret-quote branch. */
export interface TreeParseErrorDetail {
  kind: "parse";
  format: TreeSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
  issue?: ArchTextIssue;
}

/** The first meaningful line is not a tree header. */
export interface UnknownTreeFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type TreeInputError = TreeParseErrorDetail | UnknownTreeFormatDetail;

export type TreeParseResult =
  | { status: "ok"; value: ParsedTree }
  | { status: "error"; error: TreeInputError };

/**
 * Parses the text as a tree document. Never throws for bad input; every
 * failure mode comes back typed, located where the parser located it.
 */
export function parseTreeInput(text: string): TreeParseResult {
  if (detectAlabKind(text) === "tree") {
    try {
      return {
        status: "ok",
        value: { format: "alab", file: parseTreeText(text) },
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
        "Could not read this as a tree: the first line does not read " +
        "`archlab 1.0 tree`. Mermaid `mindmap` is a tree too, but importing " +
        "it is not built yet — it carries labels with no ids and no columns, " +
        "so it can only ever be a one-way import.",
    },
  };
}
