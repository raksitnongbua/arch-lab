/**
 * The live text pane's sync engine: the editor's in-memory `EditorModel` on
 * one side, `.alab` text on the other, one model behind both. Shaped after
 * `src/features/viewer/input/sync.ts` — same guarantee, one side of it
 * replaced by the canvas.
 *
 *   - `renderModel(model)` — the canvas's model as canonical `.alab` text.
 *     Never throws: a model the text format cannot express becomes a typed
 *     error, because a crash here takes the whole editor down with it.
 *   - `parseModelText(source)` — parse the pane and hand back a model ready
 *     for `replaceModel`, plus the canonical text of what was parsed. The
 *     text that was parsed is never handed back reformatted; canonicalising
 *     the user's own pane is an explicit action (`canonicalizeModelText`).
 *   - Errors keep the parser's native precision — 1-based line and column
 *     plus the offending source line, verbatim — so the pane can put a caret
 *     under the exact character.
 *
 * The parsed file reaches the store through the editor's REAL reader
 * (`deserializeModel`) rather than a private reshaper: it is the same code
 * path a file opened from disk takes, so text editing can never introduce a
 * model that opening a saved file would have rejected, and the `$schema` /
 * unknown-field hoisting rules stay in exactly one place. `parseArchText`
 * already promises a file that validates, so the `model` error branch is a
 * guard against future drift, not an expected outcome.
 *
 * The opposite conversion (`fileFromModel`) is spelled out here rather than
 * imported from `@/features/viewer/input/parse-input`: the viewer already
 * imports the editor, so importing it back would close a feature-level cycle
 * and drag the Mermaid parser into the editor bundle for a seven-line
 * reshape.
 */

import type { ArchLabFile } from "@/types";

import {
  ArchTextParseError,
  parseArchText,
  serializeArchText,
  type ArchTextIssue,
} from "@/features/archtext";
import { sourceLineAt } from "@/lib/source-text";
import { describeError } from "@/lib/errors";

import { deserializeModel } from "../io/deserialize";
import { serializeModel } from "../io/serialize";
import { FileValidationError, type ValidationIssue } from "../io/validate";
import type { EditorModel } from "../state";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** A syntax failure — located to a line and column in the pane's text. */
export interface SyntaxErrorDetail {
  kind: "syntax";
  message: string;
  issues: readonly ArchTextIssue[];
  line: number;
  column: number;
  /** The offending source line, verbatim, when it exists. */
  lineText: string | null;
}

/**
 * The text parsed, but the model it describes is not one the editor will
 * load. Unreachable while the text parser holds its contract; surfaced
 * anyway so a future divergence shows up as an error instead of a canvas
 * that quietly stops following the text.
 */
export interface ModelErrorDetail {
  kind: "model";
  message: string;
  issues: readonly ValidationIssue[];
}

export type ModelTextError = SyntaxErrorDetail | ModelErrorDetail;

/** One successfully parsed model, in every representation the pane needs. */
export interface ParsedModelText {
  /** Ready for `replaceModel` — already through the editor's real reader. */
  model: EditorModel;
  /** Canonical `.alab` text for that model; the pane's echo fingerprint. */
  text: string;
  /** "2 diagrams · 7 nodes · 6 edges" — the valid-state summary. */
  summary: string;
}

export type ModelTextParseResult =
  | { status: "ok"; value: ParsedModelText }
  | { status: "error"; error: ModelTextError };

/** The canvas's model as text, or why it cannot be shown as text. */
export type ModelRenderResult =
  | { status: "ok"; text: string; summary: string }
  | { status: "error"; message: string };

/* -------------------------------------------------------------------------- */
/* Model → text                                                                */
/* -------------------------------------------------------------------------- */

/** `EditorModel` (diagrams keyed) → `ArchLabFile` (diagrams as an array). */
function fileFromModel(model: EditorModel): ArchLabFile {
  const file: ArchLabFile = {
    version: model.version,
    metadata: model.metadata,
    rootDiagramId: model.rootDiagramId,
    diagrams: Object.values(model.diagrams),
  };
  for (const [key, value] of Object.entries(model.unknownFields)) {
    file[key] = value;
  }
  return file;
}

function summarize(file: ArchLabFile): string {
  let nodes = 0;
  let edges = 0;
  for (const diagram of file.diagrams) {
    nodes += diagram.nodes.length;
    edges += diagram.edges.length;
  }
  return [
    `${file.diagrams.length} ${plural(file.diagrams.length, "diagram")}`,
    `${nodes} ${plural(nodes, "node")}`,
    `${edges} ${plural(edges, "edge")}`,
  ].join(" · ");
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/** The canvas's current model as canonical `.alab` text. Never throws. */
export function renderModel(model: EditorModel): ModelRenderResult {
  try {
    const file = fileFromModel(model);
    return {
      status: "ok",
      text: serializeArchText(file),
      summary: summarize(file),
    };
  } catch (error) {
    return {
      status: "error",
      message: describeError(error),
    };
  }
}

/** The canvas's current model as canonical `.archlab.json`, or `null`. */
export function modelJsonText(model: EditorModel): string | null {
  try {
    return serializeModel(model);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Text → model                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parses the pane's text. Never throws; every failure comes back as a typed,
 * located error so the caller can keep rendering the last good model.
 */
export function parseModelText(source: string): ModelTextParseResult {
  let file: ArchLabFile;
  try {
    file = parseArchText(source);
  } catch (error) {
    if (error instanceof ArchTextParseError) {
      return {
        status: "error",
        error: {
          kind: "syntax",
          message: error.message,
          issues: error.issues,
          line: error.line,
          column: error.column,
          lineText: sourceLineAt(source, error.line),
        },
      };
    }
    throw error;
  }

  try {
    return {
      status: "ok",
      value: {
        model: deserializeModel(JSON.stringify(file)),
        text: serializeArchText(file),
        summary: summarize(file),
      },
    };
  } catch (error) {
    if (error instanceof FileValidationError) {
      return {
        status: "error",
        error: { kind: "model", message: error.message, issues: error.issues },
      };
    }
    throw error;
  }
}

/**
 * The canonical text for the pane's own content — the explicit "Format"
 * action, never applied automatically while the user is typing. Returns
 * `null` when the content does not currently parse (the pane's live error
 * already says why).
 */
export function canonicalizeModelText(source: string): string | null {
  const result = parseModelText(source);
  return result.status === "ok" ? result.value.text : null;
}
