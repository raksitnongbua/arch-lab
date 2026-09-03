/**
 * Parsing the playground pane's USE-CASE content — either dialect — through
 * the REAL readers only: `.alab` use-case text goes through
 * `parseUseCaseText` and Mermaid `flowchart` / `graph` code that reads as a
 * use-case diagram through `parseMermaidUseCase`. Nothing is parsed with a
 * bespoke parser here; the same rule the sequence and flowchart input layers
 * follow, and for the same reason — the playground can never disagree with
 * what a saved file means.
 *
 * Detection differs from its siblings in ONE deliberate way. The `.alab`
 * side is the usual first-line sniff (`archlab 1.0 usecase`, via
 * `detectAlabKind`). The Mermaid side has no header of its own — the
 * use-case convention rides Mermaid's flowchart grammar — so the decision is
 * `detectMermaidUseCase`, which runs the strict use-case parser and answers
 * true only when the whole document parses AND reads as a use-case diagram.
 * That is the ONLY sniff allowed here: a second heuristic over the same text
 * is exactly how this reader and the flowchart reader would start
 * disagreeing about who owns a paste (the essay in
 * `mermaid/lib/usecase-mapping.ts` argues why detection must be the parser).
 * Detector-false means the flowchart importer keeps the document, which is
 * the documented fallback — a genuine flowchart is never stolen.
 *
 * Errors keep their native precision: the `.alab` parser throws with a
 * 1-based line/column, and the offending source line is quoted alongside so
 * the UI can render the caret format the rest of the site uses. The Mermaid
 * arm cannot fail by construction — detector-true guarantees the parse — so
 * a throw there is a programming error and is rethrown, never swallowed.
 *
 * PURE — no component imports. The playground's reader is loaded by
 * `scripts/view-input-check.mjs` through Node's type stripping, which cannot
 * read `.tsx`; this module sits below it and must stay loadable the same way.
 */

import type { UseCaseLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseUseCaseText,
} from "@/features/archtext";
import type { ArchTextIssue } from "@/features/archtext";
import {
  detectMermaidUseCase,
  MERMAID_USECASE_CAVEAT,
  parseMermaidUseCase,
} from "@/features/mermaid";
import { sourceLineAt } from "@/lib/source-text";

export { MERMAID_USECASE_CAVEAT };

/** The two input languages the use-case canvas accepts. */
export type UseCaseSourceFormat = "alab" | "mermaid";

export const USECASE_FORMAT_LABEL: Record<UseCaseSourceFormat, string> = {
  alab: ".alab use case",
  mermaid: "Mermaid flowchart, use-case reading",
};

export interface ParsedUseCase {
  format: UseCaseSourceFormat;
  file: UseCaseLabFile;
}

/** A located parse failure — line, column, and the quotable source line.
 * Same `kind: "parse"` shape as its sequence and flowchart siblings,
 * deliberately: the playground renders all of them through one caret-quote
 * branch. */
export interface UseCaseParseErrorDetail {
  kind: "parse";
  format: UseCaseSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
  /** The `.alab` issue this was flattened from — carried whole, for the
   *  reasons `SequenceParseErrorDetail.issue` states. Absent for a Mermaid
   *  failure, which has its own error type and no fix candidates. */
  issue?: ArchTextIssue;
}

/** Neither reading plausibly matches: not an `.alab` use-case header, and
 * not a Mermaid flowchart the strict use-case parser accepts. */
export interface UnknownUseCaseFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type UseCaseInputError =
  UseCaseParseErrorDetail | UnknownUseCaseFormatDetail;

export type UseCaseParseResult =
  | { status: "ok"; value: ParsedUseCase }
  | { status: "error"; error: UseCaseInputError };

/**
 * Parses the text as a use-case document, auto-detecting the dialect. Never
 * throws for bad input; every failure mode comes back typed, located where
 * the parser located it.
 */
export function parseUseCaseInput(text: string): UseCaseParseResult {
  if (detectAlabKind(text) === "usecase") {
    try {
      return {
        status: "ok",
        value: { format: "alab", file: parseUseCaseText(text) },
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

  if (detectMermaidUseCase(text)) {
    return {
      status: "ok",
      // Cannot throw: `detectMermaidUseCase` IS this parser succeeding (its
      // doc comment states the guarantee), so no catch — a throw here would
      // be the two disagreeing, a programming error to surface, not an input
      // to explain. The importer's fixed default timestamp keeps re-parsing
      // the same source deterministic across the playground's debounces.
      value: { format: "mermaid", file: parseMermaidUseCase(text) },
    };
  }

  return {
    status: "error",
    error: {
      kind: "unknown-format",
      message:
        "Could not read this as a use-case document: the first line does " +
        "not read `archlab 1.0 usecase`, and the text is not a Mermaid " +
        "flowchart that reads as a use-case diagram (((circle)) actors, " +
        "([stadium]) use cases, a subgraph boundary).",
    },
  };
}
