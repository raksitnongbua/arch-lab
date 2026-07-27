/**
 * Reader for `.archflow.json` text (T3-A, AF-E5-S2). Parses, validates the
 * eight load-time hard errors (see `./validate.ts`), and reshapes the file
 * into the store's `EditorModel` — diagrams keyed by id, unknown top-level
 * fields hoisted verbatim into `unknownFields`.
 *
 * Nothing is normalised or repaired here: diagram/node/edge objects are kept
 * verbatim (including unknown keys from newer minor versions and their key
 * insertion order), which is what makes the open → save round-trip
 * byte-identical.
 *
 * Throws `FileValidationError` — with the offending JSON path named — and
 * never returns a half-built model, so the caller's previous model stays
 * intact on any failure.
 *
 * Imported by `scripts/roundtrip-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { C4Diagram } from "@/types";
import type { EditorModel } from "../state";

import { FileValidationError, validateArchFlowFile } from "./validate";

const KNOWN_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "version",
  "metadata",
  "rootDiagramId",
  "diagrams",
]);

/**
 * Parses and validates `.archflow.json` text into an `EditorModel`, ready
 * for `replaceModel`. Throws `FileValidationError` on malformed JSON, a
 * newer major `version`, or any of the schema's load-time hard errors.
 */
export function deserializeModel(text: string): EditorModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new FileValidationError([
      { path: "(file)", message: `the file is not valid JSON — ${detail}` },
    ]);
  }

  const file = validateArchFlowFile(parsed);

  const diagrams: Record<string, C4Diagram> = {};
  for (const diagram of file.diagrams) {
    diagrams[diagram.id] = diagram;
  }

  // `$schema` is intentionally kept here too: EditorModel has no field for
  // it, and the serializer re-emits it first from `unknownFields`.
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
