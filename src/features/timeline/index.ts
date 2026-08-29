/**
 * Public surface of the TIMELINE feature — the view-mode renderer for
 * `TimelineLabFile` documents. Everything outside `src/features/timeline`
 * imports from here and nowhere deeper (the barrel rule every feature
 * follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` timeline text belongs to `features/archtext` (`parseTimelineText` /
 * `serializeTimelineText` on its barrel). This feature consumes a parsed file
 * and owns only the layout and the rendering.
 *
 * NOTE FOR CHECK SCRIPTS AND MCP TOOLS: this barrel re-exports `.tsx`, which
 * Node's type stripping cannot read — anything that must load headless
 * deep-imports `./lib/layout`, `./input/parse` or `./input/example` PAST this
 * barrel, the same documented exception the gantt's MCP tool and every layout
 * check use.
 */

export { TimelineViewer } from "./components/timeline-viewer";
export type { TimelineViewerProps } from "./components/timeline-viewer";
export { TimelineDiagram } from "./components/timeline-diagram";
export type { TimelineDiagramProps } from "./components/timeline-diagram";
export { TimelineExampleView } from "./components/timeline-example-view";
export {
  listTimelineExampleIds,
  listTimelineExamples,
  loadTimelineExample,
  type TimelineExampleListing,
  type TimelineExampleResult,
  type TimelineExampleSummary,
} from "./service/example-service";
export {
  MERMAID_TIMELINE_CAVEAT,
  MERMAID_TIMELINE_EXPORT_CAVEAT,
  TIMELINE_FORMAT_LABEL,
  parseTimelineInput,
  type ParsedTimeline,
  type TimelineInputError,
  type TimelineParseErrorDetail,
  type TimelineSourceFormat,
} from "./input/parse";
export { TIMELINE_EXAMPLE } from "./input/example";
export { TIMELINE, layoutTimeline } from "./lib/layout";
export type {
  LaidTimelineEvent,
  LaidTimelinePeriod,
  TimelineLayout,
} from "./lib/layout";
export { TimelineShareButton } from "./share/share-button";
export { renderTimelineSvg } from "./export/render-svg";
