/**
 * Parsing the playground pane's DICTIONARY content through the REAL reader
 * only: `.alab` dictionary text through `parseDictText`.
 *
 * ONE DIALECT, unlike every other kind here, and that is the honest situation
 * rather than an omission: Mermaid has no data dictionary. Inventing a Mermaid
 * spelling for one would be inventing a dialect nothing else on earth reads,
 * which `.claude/rules/new-diagram-type.md` names as the thing not to do.
 *
 * PURE — no component imports, so `scripts/view-input-check.mjs` can load it
 * through Node's type stripping.
 */

import type { DictLabFile } from "@/types";

import {
  ArchTextParseError,
  detectAlabKind,
  parseDictText,
} from "@/features/archtext";
import { sourceLineAt } from "@/lib/source-text";

export type DictSourceFormat = "alab";

export const DICT_FORMAT_LABEL: Record<DictSourceFormat, string> = {
  alab: ".alab dict",
};

export interface ParsedDict {
  format: DictSourceFormat;
  file: DictLabFile;
}

export interface DictParseErrorDetail {
  kind: "parse";
  format: DictSourceFormat;
  message: string;
  line: number;
  column: number;
  lineText: string | null;
}

export interface UnknownDictFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type DictInputError = DictParseErrorDetail | UnknownDictFormatDetail;

export type DictParseResult =
  | { status: "ok"; value: ParsedDict }
  | { status: "error"; error: DictInputError };

export function parseDictInput(text: string): DictParseResult {
  if (detectAlabKind(text) === "dict") {
    try {
      return {
        status: "ok",
        value: { format: "alab", file: parseDictText(text) },
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
  return {
    status: "error",
    error: {
      kind: "unknown-format",
      message:
        "Could not read this as a data dictionary: the first line does not " +
        "read `archlab 1.0 dict`. Mermaid has no dictionary notation, so " +
        "there is no second dialect to try.",
    },
  };
}
