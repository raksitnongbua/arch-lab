/**
 * Public surface of the GANTT feature — the view-mode renderer for
 * `GanttLabFile` documents. Everything outside `src/features/gantt`
 * imports from here and nowhere deeper (the barrel rule every feature
 * follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` gantt text belongs to `features/archtext` (`parseGanttText` /
 * `serializeGanttText` on its barrel). This feature consumes a parsed file
 * and owns only the schedule, the layout and the rendering.
 *
 * NOTE FOR CHECK SCRIPTS AND MCP TOOLS: this barrel re-exports `.tsx`, which
 * Node's type stripping cannot read — anything that must load headless
 * deep-imports `./lib/layout`, `./input/parse` or `./input/example` PAST this
 * barrel, the same documented exception the flowchart's MCP tool and every
 * layout check use.
 */

export { GanttViewer } from "./components/gantt-viewer";
export type { GanttViewerProps } from "./components/gantt-viewer";
export { GanttDiagram } from "./components/gantt-diagram";
export type { GanttDiagramProps } from "./components/gantt-diagram";
export { GanttExampleView } from "./components/gantt-example-view";
export {
  listGanttExampleIds,
  listGanttExamples,
  loadGanttExample,
  type GanttExampleListing,
  type GanttExampleResult,
  type GanttExampleSummary,
} from "./service/example-service";
export {
  MERMAID_GANTT_CAVEAT,
  GANTT_FORMAT_LABEL,
  parseGanttInput,
  type ParsedGantt,
  type GanttInputError,
  type GanttParseErrorDetail,
  type GanttSourceFormat,
} from "./input/parse";
export { GANTT_EXAMPLE } from "./input/example";
export { GANTT, layoutGantt } from "./lib/layout";
export type {
  LaidGanttDependency,
  LaidGanttItem,
  LaidGanttSection,
  LaidGanttTick,
  GanttLayout,
} from "./lib/layout";
export { arrowPoints, axisCaption, axisLabel } from "./lib/axis";
export { GanttShareButton } from "./share/share-button";
export { renderGanttSvg } from "./export/render-svg";
