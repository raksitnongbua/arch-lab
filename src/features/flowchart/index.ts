/**
 * Public surface of the flowchart feature — the view-mode renderer for
 * `FlowchartLabFile` documents. Everything outside `src/features/flowchart`
 * imports from here and nowhere deeper (the same barrel rule every feature
 * follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` flowchart text belongs to `features/archtext`. This feature
 * consumes a parsed file and owns only layout, the focus interaction, and
 * export.
 *
 * What the `/live` wiring needs: the viewer to mount, the pure layout for
 * anything that measures, the export pair (SVG string + PNG blob) with its
 * rendered-result type, the Share/Export toolbar buttons, and the input
 * layer (reader + seed example).
 *
 * The playground's own reader deep-imports `./input/parse` and
 * `./input/example` PAST this barrel, deliberately — this barrel exports
 * React components, and `playground/input/parse.ts` must stay loadable by
 * the check scripts through Node's type stripping, which cannot read `.tsx`
 * (the same exception it documents for the sequence feature's input layer).
 */

export { FlowchartViewer } from "./components/flowchart-viewer";
export type { FlowchartEditHandlers } from "./components/flowchart-viewer";
export { FlowchartShareButton } from "./share/share-button";
export { FlowchartExportButton } from "./export/export-button";
export {
  FLOWCHART_FORMAT_LABEL,
  MERMAID_FLOWCHART_CAVEAT,
  parseFlowchartInput,
  type FlowchartInputError,
  type FlowchartParseErrorDetail,
  type FlowchartSourceFormat,
  type ParsedFlowchart,
} from "./input/parse";
export { FLOWCHART_EXAMPLE } from "./input/example";
export {
  FlowchartDiagram,
  resolveFlowFocus,
  type FlowchartFocus,
} from "./components/flowchart-diagram";
export { FLOW, layoutFlowchart } from "./lib/layout";
export type {
  FlowchartLayout,
  LaidFlowEdge,
  LaidFlowGroup,
  LaidFlowNode,
} from "./lib/layout";
export {
  renderFlowchartPngBlob,
  renderFlowchartSvg,
  type RenderedFlowchartSvg,
} from "./export/render-svg";
