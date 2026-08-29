/**
 * Public surface of the LIFECYCLE feature — the view-mode renderer for
 * `LifecycleLabFile` documents. Everything outside `src/features/lifecycle`
 * imports from here and nowhere deeper (the barrel rule every feature
 * follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` lifecycle text belongs to `features/archtext` (`parseLifecycleText`
 * / `serializeLifecycleText` on its barrel). This feature consumes a parsed
 * file and owns only the layout and the rendering.
 *
 * NOTE FOR CHECK SCRIPTS AND MCP TOOLS: this barrel re-exports `.tsx`, which
 * Node's type stripping cannot read — anything that must load headless
 * deep-imports `./lib/layout`, `./input/parse` or `./input/example` PAST this
 * barrel, the same documented exception the gantt's and timeline's MCP tools
 * and every layout check use.
 */

export { LifecycleViewer } from "./components/lifecycle-viewer";
export type { LifecycleViewerProps } from "./components/lifecycle-viewer";
export { LifecycleDiagram, stateKey } from "./components/lifecycle-diagram";
export type { LifecycleDiagramProps } from "./components/lifecycle-diagram";
export { LifecycleExampleView } from "./components/lifecycle-example-view";
export {
  listLifecycleExampleIds,
  listLifecycleExamples,
  loadLifecycleExample,
  type LifecycleExampleListing,
  type LifecycleExampleResult,
  type LifecycleExampleSummary,
} from "./service/example-service";
export {
  LIFECYCLE_FORMAT_LABEL,
  parseLifecycleInput,
  type LifecycleInputError,
  type LifecycleParseErrorDetail,
  type LifecycleSourceFormat,
  type ParsedLifecycle,
} from "./input/parse";
export { LIFECYCLE_EXAMPLE } from "./input/example";
export { LIFECYCLE, layoutLifecycle } from "./lib/layout";
export type {
  LaidLifecycleExit,
  LaidLifecycleState,
  LaidLifecycleSubject,
  LifecycleLayout,
  RejoinPath,
} from "./lib/layout";
export { LifecycleShareButton } from "./share/share-button";
export { renderLifecycleSvg } from "./export/render-svg";
