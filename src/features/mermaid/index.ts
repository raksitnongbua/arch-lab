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
 *     code → `SequenceLabFile`; what it drops is named by
 *     `MERMAID_SEQUENCE_CAVEAT`.
 *   - `serializeMermaidSequence(file)` — the way back out, added once the
 *     model could hold every block Mermaid draws. Lossy in the other
 *     direction (`MERMAID_SEQUENCE_EXPORT_CAVEAT`): `desc`, `[technology]`
 *     and the header beyond the title have no Mermaid equivalent.
 *   - `parseMermaidFlowchart(source, options?)` — Mermaid `flowchart` /
 *     `graph` code → `FlowchartLabFile`; what it drops is named by
 *     `MERMAID_FLOWCHART_CAVEAT`.
 *   - `serializeMermaidFlowchart(file, options?)` — the way back out, lossy
 *     per `MERMAID_FLOWCHART_EXPORT_CAVEAT`: `desc`, `[technology]`,
 *     `#tag`s, a group's tint and the header beyond the title have no
 *     Mermaid equivalent.
 *   - `parseMermaidEr(source, options?)` / `serializeMermaidEr(file)` —
 *     Mermaid `erDiagram` ⇄ `ErLabFile`. The only dialect here whose
 *     detection is EXACT rather than heuristic: Mermaid has a real ER
 *     document type, so `detectMermaidEr` tests one header word.
 *   - `parseMermaidUseCase(source, options?)` — Mermaid `flowchart` /
 *     `graph` code read under the USE-CASE convention (circles = actors,
 *     stadiums = use cases, subgraph = system boundary) →
 *     `UseCaseLabFile`; what it drops is named by `MERMAID_USECASE_CAVEAT`.
 *     `detectMermaidUseCase(source)` decides whether a flowchart-headed
 *     document gets this reading — narrow by design, with the flowchart
 *     importer as the fallback (the essay in `lib/usecase-mapping.ts`).
 *   - `serializeMermaidUseCase(file, options?)` — the way back out, lossy
 *     per `MERMAID_USECASE_EXPORT_CAVEAT`: no stick figures, generalization
 *     has no notation (it rides a `|generalizes|` label), stereotypes
 *     become edge labels, and `desc`, `[technology]`, `#tag`s, a boundary's
 *     tint and the header beyond the title have no Mermaid equivalent.
 *
 *   - `parseMermaidGantt(source, options?)` — Mermaid `gantt` code →
 *     `GanttLabFile`; what it drops is named by `MERMAID_GANTT_CAVEAT`,
 *     and `detectMermaidGantt` is exact for the same reason `detectMermaidEr`
 *     is (Mermaid has a real `gantt` document type). THE ONE DIALECT WITH NO
 *     `serializeMermaid*` PARTNER, deliberately: `at-risk` has no Mermaid tag
 *     and arch-lab's critical path is computed rather than typed, so an emit
 *     would downgrade the first and misrepresent the second. The argument is
 *     written out in `lib/gantt-mapping.ts`; do not add `gantt-emit.ts`
 *     without answering it.
 *
 *   - `parseMermaidTimeline(source, options?)` /
 *     `serializeMermaidTimeline(file, options?)` — Mermaid `timeline` ⇄
 *     `TimelineLabFile`. TWO-WAY, and the contrast with the gantt above is
 *     the reason it is spelled out: a timeline has no state vocabulary and
 *     derives nothing, so Mermaid holds everything it says and the emit
 *     cannot misrepresent anything. `detectMermaidTimeline` is exact, like
 *     `detectMermaidEr` and `detectMermaidGantt`. What each direction gives
 *     up is named by `MERMAID_TIMELINE_CAVEAT` and
 *     `MERMAID_TIMELINE_EXPORT_CAVEAT`; the one construct refused rather
 *     than approximated is Mermaid's `section`, which groups periods a level
 *     above the period and has no arch-lab counterpart.
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
export {
  serializeMermaidSequence,
  MERMAID_SEQUENCE_EXPORT_CAVEAT,
} from "./lib/sequence-emit";
export {
  parseMermaidFlowchart,
  MERMAID_FLOWCHART_CAVEAT,
} from "./lib/flowchart";
export type { ParseMermaidFlowchartOptions } from "./lib/flowchart";
export {
  serializeMermaidFlowchart,
  MERMAID_FLOWCHART_EXPORT_CAVEAT,
} from "./lib/flowchart-emit";
export type { SerializeMermaidFlowchartOptions } from "./lib/flowchart-emit";
export { MERMAID_FLOWCHART_HEADER_WORDS } from "./lib/flowchart-mapping";
export { stripMermaidFrontmatter } from "./lib/text";
export type { MermaidFlowchartDirection } from "./lib/flowchart-mapping";
export {
  detectMermaidUseCase,
  parseMermaidUseCase,
  MERMAID_USECASE_CAVEAT,
} from "./lib/usecase";
export type { ParseMermaidUseCaseOptions } from "./lib/usecase";
export {
  serializeMermaidUseCase,
  MERMAID_USECASE_EXPORT_CAVEAT,
} from "./lib/usecase-emit";
export type { SerializeMermaidUseCaseOptions } from "./lib/usecase-emit";
export {
  detectMermaidGantt,
  parseMermaidGantt,
  MERMAID_GANTT_CAVEAT,
} from "./lib/gantt";
export type { ParseMermaidGanttOptions } from "./lib/gantt";
export { MERMAID_GANTT_HEADER_WORD } from "./lib/gantt-mapping";
export {
  detectMermaidTimeline,
  parseMermaidTimeline,
  MERMAID_TIMELINE_CAVEAT,
} from "./lib/timeline";
export type { ParseMermaidTimelineOptions } from "./lib/timeline";
export {
  serializeMermaidTimeline,
  MERMAID_TIMELINE_EXPORT_CAVEAT,
} from "./lib/timeline-emit";
export type { SerializeMermaidTimelineOptions } from "./lib/timeline-emit";
export {
  MERMAID_TIMELINE_HEADER_WORD,
  REFUSED_TIMELINE_CONSTRUCTS,
} from "./lib/timeline-mapping";
export { detectMermaidEr, parseMermaidEr } from "./lib/er";
export type { ParseMermaidErOptions } from "./lib/er";
export { serializeMermaidEr } from "./lib/er-emit";
export type { SerializeMermaidErOptions } from "./lib/er-emit";
export {
  MERMAID_ER_CAVEAT,
  MERMAID_ER_EXPORT_CAVEAT,
  MERMAID_ER_HEADER_WORD,
} from "./lib/er-mapping";
export { MERMAID_EXTENSION_KEY, readMermaidExtension } from "./lib/toModel";
export type {
  MermaidBoundary,
  MermaidExtension,
  ParseMermaidOptions,
} from "./lib/toModel";
