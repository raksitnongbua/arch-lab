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
 *   - `parseArchTextWithSpans(source)` — the same parse, plus the LINE SPAN
 *     each node and edge came from, and `canonicalNodeLine(file, …)` /
 *     `canonicalNodeBlock(file, …)` — the declaration line, or the whole
 *     block continuations included, the serializer would write for a node.
 *     Together these let a caller splice lines into the author's own text
 *     instead of re-emitting the file, which is lossy in a way canonical text
 *     hides: it has no `//` comments, no author blank lines and no field the
 *     author wrote out that canonical form omits at its default. The editable
 *     C4 canvas is the caller (`playground/input/canvas-edit.ts`).
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
 * The feature carries ALL NINE `.alab` document types — the C4 grammar,
 * the sequence grammar (`./lib/sequence/`), the flowchart grammar
 * (`./lib/flowchart/`), the use-case grammar (`./lib/usecase/`) and the ER
 * grammar (`./lib/er/`). They share the header line, the `!` escape, the
 * cursor, the error type and the token classes, which is why the four newer
 * grammars live here rather than as sibling features:
 *
 *   - `parseSequenceText` / `serializeSequenceText` — `.alab` sequence
 *     text ⇄ `SequenceLabFile`, lossless both ways, same error contract.
 *   - `parseSequenceTextWithSpans(source)` — the same sequence parse, plus
 *     the LINE SPAN each participant and item came from, and
 *     `canonicalParticipantBlock` / `canonicalMessageBlock` — the lines the
 *     serializer would write for one of them. Together these let a caller
 *     splice one element's own block into the author's own text instead of
 *     re-emitting the file, which is lossy in a way canonical text hides: no
 *     `//` comments, no author blank lines, and no field written out that
 *     canonical form omits at its default. The editable sequence canvas is
 *     the caller (`playground/input/sequence-edit.ts`).
 *   - `parseFlowchartText` / `serializeFlowchartText` — `.alab` flowchart
 *     text ⇄ `FlowchartLabFile`, same lossless and error contract.
 *   - `parseUseCaseText` / `serializeUseCaseText` — `.alab` use-case
 *     text ⇄ `UseCaseLabFile`, same lossless and error contract.
 *   - `parseErText` / `serializeErText` — `.alab` ER text ⇄ `ErLabFile`,
 *     same lossless and error contract.
 *   - `parseDictText` / `serializeDictText` — `.alab` dictionary text ⇄
 *     `DictLabFile`, same lossless and error contract.
 *   - `parseGanttText` / `serializeGanttText` — `.alab` gantt text ⇄
 *     `GanttLabFile`, same lossless and error contract.
 *   - `parseTimelineText` / `serializeTimelineText` — `.alab` timeline text ⇄
 *     `TimelineLabFile`, same lossless and error contract.
 *   - `parseLifecycleText` / `serializeLifecycleText` — `.alab` lifecycle text
 *     ⇄ `LifecycleLabFile`, same lossless and error contract. It has NO
 *     Mermaid counterpart, deliberately: `stateDiagram-v2` is a state MACHINE
 *     (every transition that COULD happen) rather than one subject's ordered
 *     history, and `journey` scores satisfaction — so there is no dialect to
 *     convert to and none was invented (`new-diagram-type.md`).
 *   - `detectAlabKind` — which grammar a source belongs to, from its first
 *     meaningful line ("archlab 1.0" = C4, "archlab 1.0 sequence" =
 *     sequence, "archlab 1.0 flowchart" = flowchart, "archlab 1.0 usecase"
 *     = use-case, "archlab 1.0 er" = ER,
 *     "archlab 1.0 dict" = data dictionary,
 *     "archlab 1.0 gantt" = gantt,
 *     "archlab 1.0 timeline" = milestone timeline,
 *     "archlab 1.0 lifecycle" = lifecycle).
 */

export { parseArchText, parseArchTextWithSpans, spanKey } from "./lib/parse";
export type { ArchTextSpans, HeaderSpans, LineSpan } from "./lib/parse";
export {
  canonicalDiagramBlock,
  canonicalEdgeBlock,
  canonicalFrameDeclaration,
  canonicalFrameLine,
  canonicalNodeBlock,
  canonicalNodeLine,
  canonicalTagColorLine,
  serializeArchText,
} from "./lib/serialize";
export { ArchTextParseError } from "./lib/errors";
export type { ArchTextIssue } from "./lib/errors";
export {
  ARCHTEXT_EXTENSION,
  KEYWORD_BY_NODE_TYPE,
  NODE_TYPE_BY_KEYWORD,
} from "./lib/keywords";
export {
  DEFAULT_TIMESTAMP,
  defaultEdgeId,
  defaultPositions,
  defaultSizeFor,
} from "./lib/defaults";
export type { DefaultLayoutEdge } from "./lib/defaults";
export {
  parseSequenceText,
  parseSequenceTextWithSpans,
} from "./lib/sequence/parse";
export type { SequenceSpans } from "./lib/sequence/parse";
export {
  canonicalMessageBlock,
  canonicalParticipantBlock,
  serializeSequenceText,
} from "./lib/sequence/serialize";
export { detectAlabKind } from "./lib/sequence/detect";
export type { AlabDocumentKind } from "./lib/sequence/detect";
export {
  FRAGMENT_KIND_BY_KEYWORD,
  PARTICIPANT_KIND_BY_KEYWORD,
  SEQUENCE_ARROW_MATCH_ORDER,
  SEQUENCE_ARROW_MENU,
  SEQUENCE_ARROW_TOKENS,
  sequenceArrowToken,
} from "./lib/sequence/keywords";
export { parseFlowchartText } from "./lib/flowchart/parse";
export { serializeFlowchartText } from "./lib/flowchart/serialize";
export { NODE_SHAPE_BY_KEYWORD } from "./lib/flowchart/keywords";
export { parseUseCaseText } from "./lib/usecase/parse";
export { serializeUseCaseText } from "./lib/usecase/serialize";
export {
  DEPENDENCY_STEREOTYPES,
  ELEMENT_KIND_BY_KEYWORD,
} from "./lib/usecase/keywords";
export { parseErText } from "./lib/er/parse";
export { serializeErText } from "./lib/er/serialize";
export {
  ATTRIBUTE_KEYS,
  ER_HEADER_WORD,
  LEFT_CARDINALITY,
  RIGHT_CARDINALITY,
} from "./lib/er/keywords";
export { parseDictText } from "./lib/dict/parse";
export { serializeDictText } from "./lib/dict/serialize";
export { DICT_HEADER_WORD, FIELD_FLAGS } from "./lib/dict/keywords";
export { parseGanttText } from "./lib/gantt/parse";
export { serializeGanttText } from "./lib/gantt/serialize";
export { ITEM_STATES, GANTT_HEADER_WORD } from "./lib/gantt/keywords";
export { parseTimelineText } from "./lib/timeline/parse";
export { serializeTimelineText } from "./lib/timeline/serialize";
export {
  EVENT_KEYWORD,
  PERIOD_KEYWORD,
  TIMELINE_HEADER_WORD,
} from "./lib/timeline/keywords";
export { parseLifecycleText } from "./lib/lifecycle/parse";
export { serializeLifecycleText } from "./lib/lifecycle/serialize";
export {
  ENDS_KEYWORD,
  EXIT_KEYWORD,
  LIFECYCLE_HEADER_WORD,
  REJOINS_KEYWORD,
  STATE_KEYWORD,
  SUBJECT_KEYWORD,
  WHEN_KEYWORD,
} from "./lib/lifecycle/keywords";
