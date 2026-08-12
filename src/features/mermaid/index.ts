/**
 * Mermaid C4 ⇄ arch-lab converter — public API.
 *
 * A pure, dependency-free, framework-agnostic library:
 *
 *   - `parseMermaidC4(source, options?)` — Mermaid C4 code → `ArchLabFile`
 *     (validator-clean, deterministic layout). Throws `MermaidParseError`
 *     with line/column on malformed input.
 *   - `serializeMermaidC4(file, options?)` — `ArchLabFile` → Mermaid C4
 *     code for one diagram (default: the diagram the source described).
 *   - `parseMermaidSequence(source, options?)` — Mermaid `sequenceDiagram`
 *     code → `SequenceLabFile`. One-way; what it drops is named by
 *     `MERMAID_SEQUENCE_CAVEAT`.
 *
 * Both the viewer and the editor consume this feature only through this
 * barrel.
 */

export { parseMermaidC4 } from "./lib/parse";
export { serializeMermaidC4, serializeDiagramToMermaid } from "./lib/emit";
export type { SerializeMermaidOptions } from "./lib/emit";
export { MermaidParseError } from "./lib/errors";
export type { MermaidIssue } from "./lib/errors";
export {
  MERMAID_DIAGRAM_TYPES,
  LEVEL_BY_DIAGRAM_TYPE,
  DIAGRAM_TYPE_BY_LEVEL,
} from "./lib/mapping";
export type { MermaidDiagramType, BoundaryKind } from "./lib/mapping";
export { parseMermaidSequence, MERMAID_SEQUENCE_CAVEAT } from "./lib/sequence";
export type { ParseMermaidSequenceOptions } from "./lib/sequence";
export { MERMAID_EXTENSION_KEY, readMermaidExtension } from "./lib/toModel";
export type {
  MermaidBoundary,
  MermaidExtension,
  ParseMermaidOptions,
} from "./lib/toModel";
