/**
 * The two on-disk forms of a model, and the one place that decides which is
 * which.
 *
 * `.alab` is the format the product asks people to write — it is what the
 * syntax reference documents, what share links carry, and what reads as a
 * sentence in a code review. `.archlab.json` is the same model in the shape
 * every other tool can read without implementing a grammar. They are lossless
 * twins in both directions, asserted on every build by `pnpm check:archtext`,
 * so which one a file uses is a presentation choice and never a data one.
 *
 * Two rules the callers depend on:
 *
 *   - A NEW model saves as `.alab` (`DEFAULT_SAVE_FORMAT`).
 *   - A model that came FROM a file saves back in that file's format. Opening
 *     `payments.archlab.json`, editing and pressing save must produce
 *     `payments.archlab.json` — silently converting somebody's file to
 *     another syntax because we prefer it is not ours to do.
 *
 * Reading is deliberately more permissive than writing: both formats open,
 * whatever the app would have written itself.
 */

import type { ArchLabFile } from "@/types";

import {
  ARCHTEXT_EXTENSION,
  parseArchText,
  serializeArchText,
} from "@/features/archtext";

import { deserializeModel } from "./deserialize";
import { serializeModel, type SerializeOptions } from "./serialize";
import type { EditorModel } from "../state";

export type ModelFormat = "alab" | "json";

/** What `Save` produces for a model that has never been written to disk. */
export const DEFAULT_SAVE_FORMAT: ModelFormat = "alab";

export const JSON_EXTENSION = ".archlab.json";
export { ARCHTEXT_EXTENSION };

export const FORMAT_LABEL: Record<ModelFormat, string> = {
  alab: "arch-lab text",
  json: "arch-lab JSON",
};

/** The extension a freshly named file of this format gets. */
export const FORMAT_EXTENSION: Record<ModelFormat, string> = {
  alab: ARCHTEXT_EXTENSION,
  json: JSON_EXTENSION,
};

/**
 * The format of an existing file, from its name. Anything that is not clearly
 * `.alab` is treated as JSON, because JSON is what every earlier version of
 * this app wrote — an unrecognised extension is far more likely to be a
 * `.json` variant than a text model.
 */
export function formatForFileName(fileName: string): ModelFormat {
  return fileName.toLowerCase().endsWith(ARCHTEXT_EXTENSION) ? "alab" : "json";
}

/** File-picker / `<input accept>` filter covering BOTH readable formats. */
export const OPEN_ACCEPT = `${ARCHTEXT_EXTENSION},.json,application/json,text/plain`;

/** True for a file this app can open, by name. */
export function isOpenableFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(ARCHTEXT_EXTENSION) || lower.endsWith(".json");
}

/* -------------------------------------------------------------------------- */
/* Conversion                                                                  */
/* -------------------------------------------------------------------------- */

const KNOWN_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "version",
  "metadata",
  "rootDiagramId",
  "diagrams",
]);

/** `EditorModel` (diagrams keyed) → `ArchLabFile` (diagrams as an array). */
function fileFromModel(model: EditorModel): ArchLabFile {
  const file: ArchLabFile = {
    version: model.version,
    metadata: model.metadata,
    rootDiagramId: model.rootDiagramId,
    diagrams: Object.values(model.diagrams),
  };
  for (const [key, value] of Object.entries(model.unknownFields)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) file[key] = value;
  }
  return file;
}

/**
 * Model → the text to write. `overrides` reaches the JSON serializer as it
 * always did (it is how `updatedAt` is bumped only on a real change); the
 * `.alab` writer applies the same override to the metadata before emitting,
 * so both formats stamp identically.
 */
export function serializeModelAs(
  model: EditorModel,
  format: ModelFormat,
  overrides?: SerializeOptions,
): string {
  if (format === "json") return serializeModel(model, overrides);
  const stamped: EditorModel =
    overrides?.updatedAt === undefined
      ? model
      : {
          ...model,
          metadata: { ...model.metadata, updatedAt: overrides.updatedAt },
        };
  return serializeArchText(fileFromModel(stamped));
}

/**
 * Text → model, for either format. `.alab` is parsed by the real
 * `parseArchText` and then pushed through the SAME validator JSON goes
 * through, so a text file cannot open a model that a JSON file could not —
 * one definition of a valid document, not two.
 *
 * Throws `ArchTextParseError` (line/column) or `FileValidationError`
 * (JSON-path); callers already handle both shapes.
 */
export function deserializeModelFrom(
  text: string,
  format: ModelFormat,
): EditorModel {
  if (format === "json") return deserializeModel(text);
  return deserializeModel(JSON.stringify(parseArchText(text)));
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                      */
/* -------------------------------------------------------------------------- */

/** `"ShopFlow Platform"` → `"shopflow-platform"`. */
export function slugForTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "untitled-model" : slug;
}

/** `"ShopFlow Platform"` → `"shopflow-platform.alab"` (AF-E5-S1). */
export function deriveFileNameFor(title: string, format: ModelFormat): string {
  return `${slugForTitle(title)}${FORMAT_EXTENSION[format]}`;
}
