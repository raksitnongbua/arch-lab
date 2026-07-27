/**
 * Parsing pasted model text — either format — into the one viewer model,
 * through the REAL readers only: arch-lab JSON goes through the editor's
 * `deserializeModel` (full schema validation, JSON-path errors) and Mermaid
 * C4 goes through `parseMermaidC4` (line/column errors). Nothing is parsed
 * with a bespoke parser, and nothing leaves the browser.
 *
 * A successful parse carries every representation the UI needs:
 *   - `model`     — the `ViewerModel` the canvas renders;
 *   - `file`      — the `ArchLabFile`, for Mermaid emission per diagram;
 *   - `jsonText`  — canonical `.archlab.json` text via the editor's real
 *                   deterministic serializer (the "convert to code" output
 *                   when the input was Mermaid).
 *
 * Errors keep their native precision: JSON errors carry the validator's
 * JSON-path issues; Mermaid errors carry line, column and the quoted
 * offending line so the UI can point at the exact character.
 */

import type { ArchLabFile } from "@/types";

import { deserializeModel } from "@/features/editor/io/deserialize";
import { serializeModel } from "@/features/editor/io/serialize";
import {
  FileValidationError,
  type ValidationIssue,
} from "@/features/editor/io/validate";
import type { EditorModel } from "@/features/editor/state";
import {
  MermaidParseError,
  parseMermaidC4,
  serializeMermaidC4,
  type MermaidIssue,
} from "@/features/mermaid";

import type { ViewerModel } from "../lib/model";
import { detectFormat, type FormatChoice, type PastedFormat } from "./detect";

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export interface PastedModel {
  /** The language the text was actually parsed as. */
  format: PastedFormat;
  /** True when `format` came from auto-detection rather than the user. */
  autoDetected: boolean;
  /** What the canvas renders. */
  model: ViewerModel;
  /** The validated file — the source for per-diagram Mermaid emission. */
  file: ArchLabFile;
  /** Canonical `.archlab.json` text (editor's deterministic serializer). */
  jsonText: string;
}

/** A Mermaid error located against the pasted source. */
export interface MermaidErrorDetail {
  kind: "mermaid";
  /** `line <n>, column <n>: …` — the parser's own message. */
  message: string;
  issues: readonly MermaidIssue[];
  line: number;
  column: number;
  /** The offending source line, verbatim, when it exists. */
  lineText: string | null;
}

/** A JSON error with the validator's JSON-path issues. */
export interface JsonErrorDetail {
  kind: "json";
  message: string;
  issues: readonly ValidationIssue[];
}

/** Auto-detection failed — neither language matched the first line. */
export interface UnknownFormatDetail {
  kind: "unknown-format";
  message: string;
}

export type PastedErrorDetail =
  MermaidErrorDetail | JsonErrorDetail | UnknownFormatDetail;

export type PastedParseResult =
  | { status: "ok"; value: PastedModel }
  | { status: "error"; error: PastedErrorDetail };

/* -------------------------------------------------------------------------- */
/* Conversions between the three shapes                                        */
/* -------------------------------------------------------------------------- */

const KNOWN_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "version",
  "metadata",
  "rootDiagramId",
  "diagrams",
]);

/** `ArchLabFile` (diagrams as array) → `EditorModel` (diagrams keyed). */
function editorModelFromFile(file: ArchLabFile): EditorModel {
  const diagrams: EditorModel["diagrams"] = {};
  for (const diagram of file.diagrams) diagrams[diagram.id] = diagram;
  const unknownFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(file)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) unknownFields[key] = value;
  }
  return {
    version: file.version,
    metadata: file.metadata,
    rootDiagramId: file.rootDiagramId,
    diagrams,
    unknownFields,
  };
}

/** `EditorModel` → `ArchLabFile`, unknown fields re-attached verbatim. */
export function fileFromEditorModel(editorModel: EditorModel): ArchLabFile {
  const file: ArchLabFile = {
    version: editorModel.version,
    metadata: editorModel.metadata,
    rootDiagramId: editorModel.rootDiagramId,
    diagrams: Object.values(editorModel.diagrams),
  };
  for (const [key, value] of Object.entries(editorModel.unknownFields)) {
    file[key] = value;
  }
  return file;
}

/** The id every pasted model renders under — never a registry id. */
export const PASTED_MODEL_ID = "pasted";

function viewerModelFromEditorModel(editorModel: EditorModel): ViewerModel {
  return {
    id: PASTED_MODEL_ID,
    title: editorModel.metadata.title,
    description: editorModel.metadata.description ?? "",
    rootDiagramId: editorModel.rootDiagramId,
    diagrams: editorModel.diagrams,
  };
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

function sourceLineAt(text: string, line: number): string | null {
  return text.split(/\r?\n/)[line - 1] ?? null;
}

/**
 * Parses pasted text under the user's format choice (`auto` runs
 * `detectFormat` first). Never throws; every failure mode comes back as a
 * typed error carrying its native location detail.
 */
export function parsePastedText(
  text: string,
  choice: FormatChoice,
): PastedParseResult {
  const detected = choice === "auto" ? detectFormat(text) : null;
  const format: PastedFormat | null = choice === "auto" ? detected : choice;

  if (format === null) {
    return {
      status: "error",
      error: {
        kind: "unknown-format",
        message:
          text.trim() === ""
            ? "Nothing to render yet — paste an arch-lab JSON document or Mermaid C4 code first."
            : "Could not detect the format: the first line neither opens a JSON object ({…}) nor starts with a Mermaid C4 header (C4Context, C4Container, C4Component, C4Dynamic, C4Deployment). Pick the format explicitly if this is intentional.",
      },
    };
  }

  if (format === "json") {
    try {
      const editorModel = deserializeModel(text);
      return {
        status: "ok",
        value: {
          format,
          autoDetected: choice === "auto",
          model: viewerModelFromEditorModel(editorModel),
          file: fileFromEditorModel(editorModel),
          jsonText: serializeModel(editorModel),
        },
      };
    } catch (error) {
      if (error instanceof FileValidationError) {
        return {
          status: "error",
          error: { kind: "json", message: error.message, issues: error.issues },
        };
      }
      throw error;
    }
  }

  try {
    const file = parseMermaidC4(text, {
      timestamp: new Date().toISOString(),
    });
    const editorModel = editorModelFromFile(file);
    return {
      status: "ok",
      value: {
        format,
        autoDetected: choice === "auto",
        model: viewerModelFromEditorModel(editorModel),
        file,
        jsonText: serializeModel(editorModel),
      },
    };
  } catch (error) {
    if (error instanceof MermaidParseError) {
      return {
        status: "error",
        error: {
          kind: "mermaid",
          message: error.message,
          issues: error.issues,
          line: error.line,
          column: error.column,
          lineText: sourceLineAt(text, error.line),
        },
      };
    }
    throw error;
  }
}

/** Canonical `.archlab.json` text for a validated file. */
export function canonicalJsonText(file: ArchLabFile): string {
  return serializeModel(editorModelFromFile(file));
}

/** The `ViewerModel` the canvas renders, straight from a validated file. */
export function viewerModelFromFile(file: ArchLabFile): ViewerModel {
  return viewerModelFromEditorModel(editorModelFromFile(file));
}

/**
 * Mermaid code for ONE diagram of a parsed model — Mermaid C4 represents a
 * single diagram at a time, so multi-level models are emitted per level and
 * the UI names which diagram this text describes.
 */
export function mermaidTextForDiagram(
  file: ArchLabFile,
  diagramId: string,
): string {
  return serializeMermaidC4(file, { diagramId });
}
