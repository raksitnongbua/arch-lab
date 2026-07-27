/**
 * arch-lab text format (`.aft`) — public API.
 *
 * A pure, dependency-free, framework-agnostic library (no DOM, no I/O):
 *
 *   - `parseArchText(source)` — `.aft` text → `ArchLabFile`. The result
 *     passes the editor's `validateArchLabFile` unchanged. Throws
 *     `ArchTextParseError` with a 1-based line and column on malformed
 *     input; a parse is all-or-nothing.
 *   - `serializeArchText(file)` — `ArchLabFile` → canonical `.aft` text.
 *     Deterministic (same model ⇒ byte-identical text) and lossless:
 *     `parseArchText(serializeArchText(file))` reproduces every field,
 *     including geometry, viewports, `realizes`, `externalRef`, `childRef`,
 *     tags, `tagColors`, and unknown forward-compatible fields in position.
 *   - `ArchTextParseError` / `ArchTextIssue` — the error contract, shaped
 *     like the Mermaid feature's `MermaidParseError` so a UI can treat both
 *     uniformly.
 *   - `ARCHTEXT_EXTENSION` — `".aft"`.
 *
 * The full syntax is documented in `./README.md`. UIs (e.g. a two-pane
 * text ⇄ canvas editor) should consume this feature only through this
 * barrel.
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
export { DEFAULT_TIMESTAMP } from "./lib/defaults";
