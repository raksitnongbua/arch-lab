/**
 * The state barrel — the ONLY path other tickets import from (dev-handoff D8,
 * §4.1). Everything exported here is the frozen shared contract; internals
 * (`history.ts`, `model.ts`) stay private to `state/`.
 */

export { useEditorStore } from "./store";

/**
 * The blank document, as the store's own initial state builds it. Exported
 * because "New" has to produce exactly that and must not hand-roll a second
 * definition of empty — a purely additive export; `model.ts` otherwise stays
 * private to `state/`.
 */
export { createEmptyModel } from "./model";

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
