/**
 * Public parse entry point: Mermaid C4 source text → `ArchLabFile`.
 * Composes the recursive-descent parser (`parser.ts`) with the model
 * converter (`toModel.ts`). Pure, no I/O; throws `MermaidParseError` with a
 * line and column on any malformed input, never returning a partial model.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { ArchLabFile } from "@/types";

import { parseMermaidDocument } from "./parser";
import { mermaidDocumentToArchLab } from "./toModel";
import type { ParseMermaidOptions } from "./toModel";

/**
 * Parses Mermaid C4 code (`C4Context`, `C4Container`, `C4Component`,
 * `C4Dynamic`, `C4Deployment`) into a complete, validator-clean arch-lab
 * file. Deterministic: the same source (and options) always yields the same
 * model, including node positions.
 */
export function parseMermaidC4(
  source: string,
  options?: ParseMermaidOptions,
): ArchLabFile {
  return mermaidDocumentToArchLab(parseMermaidDocument(source), options);
}
