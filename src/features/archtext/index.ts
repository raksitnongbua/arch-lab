/**
 * arch-lab text format (`.alab`) — public API.
 *
 * A pure, dependency-free, framework-agnostic library (no DOM, no I/O):
 *
 *   - `parseArchText(source)` — `.alab` text → `ArchLabFile`. The result
 *     passes the editor's `validateArchLabFile` unchanged. Throws
 *     `ArchTextParseError` with a 1-based line and column on malformed
 *     input; a parse is all-or-nothing.
 *   - `serializeArchText(file)` — `ArchLabFile` → canonical `.alab` text.
 *     Deterministic (same model ⇒ byte-identical text) and lossless:
 *     `parseArchText(serializeArchText(file))` reproduces every field,
 *     including geometry, viewports, `realizes`, `externalRef`, `childRef`,
 *     tags, `tagColors`, and unknown forward-compatible fields in position.
 *   - `ArchTextParseError` / `ArchTextIssue` — the error contract, shaped
 *     like the Mermaid feature's `MermaidParseError` so a UI can treat both
 *     uniformly.
 *   - `ARCHTEXT_EXTENSION` — `".alab"`.
 *
 * The full syntax is documented in `./README.md`. UIs (e.g. a two-pane
 * text ⇄ canvas editor) should consume this feature only through this
 * barrel.
 */

/*
 * The feature carries BOTH `.alab` document types — the C4 grammar and the
 * sequence grammar (`./lib/sequence/`). They share the header line, the
 * `!` escape, the cursor, the error type and the token classes, which is
 * why the sequence grammar lives here rather than as a sibling feature:
 *
 *   - `parseSequenceText` / `serializeSequenceText` — `.alab` sequence
 *     text ⇄ `SequenceLabFile`, lossless both ways, same error contract.
 *   - `detectAlabKind` — which grammar a source belongs to, from its first
 *     meaningful line ("archlab 1.0" = C4, "archlab 1.0 sequence" = sequence).
 */

export { parseArchText } from "./lib/parse";
export { serializeArchText } from "./lib/serialize";
export { ArchTextParseError } from "./lib/errors";
export type { ArchTextIssue } from "./lib/errors";
export {
  ARCHTEXT_EXTENSION,
  KEYWORD_BY_NODE_TYPE,
  NODE_TYPE_BY_KEYWORD,
} from "./lib/keywords";
export {
  DEFAULT_TIMESTAMP,
  defaultPositions,
  defaultSizeFor,
} from "./lib/defaults";
export type { DefaultLayoutEdge } from "./lib/defaults";
export { parseSequenceText } from "./lib/sequence/parse";
export { serializeSequenceText } from "./lib/sequence/serialize";
export { detectAlabKind } from "./lib/sequence/detect";
export type { AlabDocumentKind } from "./lib/sequence/detect";
export {
  SEQUENCE_ARROWS,
  ARROW_BY_MESSAGE_KIND,
  FRAGMENT_KIND_BY_KEYWORD,
  PARTICIPANT_KIND_BY_KEYWORD,
} from "./lib/sequence/keywords";
