/**
 * The decomposition-tree feature's barrel. Nothing outside this directory
 * imports past it (`codebase.md`).
 */

export { TreeDiagram } from "./components/tree-diagram";
export { TreeExampleView } from "./components/tree-example-view";
export { TreeViewer } from "./components/tree-viewer";
export type { TreeDiagramProps } from "./components/tree-diagram";
export { TREE_EXAMPLE } from "./input/example";
export {
  parseTreeInput,
  TREE_FORMAT_LABEL,
  type ParsedTree,
  type TreeInputError,
  type TreeParseErrorDetail,
  type TreeParseResult,
  type TreeSourceFormat,
  type UnknownTreeFormatDetail,
} from "./input/parse";
export { layoutTree, TREE_METRICS } from "./lib/layout";
export type { TreeConnector, TreeLayout, TreePlacement } from "./lib/layout";
export {
  listTreeExampleIds,
  listTreeExamples,
  loadTreeExample,
  type TreeExampleListing,
  type TreeExampleResult,
  type TreeExampleSummary,
} from "./service/example-service";
