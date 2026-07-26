/**
 * The state barrel — the ONLY path other tickets import from (dev-handoff D8,
 * §4.1). Everything exported here is the frozen shared contract; internals
 * (`history.ts`, `model.ts`) stay private to `state/`.
 */

export { useEditorStore } from "./store";

export type {
  BreadcrumbSegment,
  DeleteResult,
  EditorActions,
  EditorModel,
  EditorState,
  EditorStore,
  LabelEditTarget,
  Selection,
} from "./store";

export {
  selectActiveDiagram,
  selectActiveLevel,
  selectBreadcrumb,
  selectChildCount,
  selectParallelEdgeGroups,
  selectValidNodeTypes,
} from "./selectors";

export {
  CrossDiagramEdgeError,
  InvalidNodeTypeError,
  MaxDepthError,
} from "./errors";
