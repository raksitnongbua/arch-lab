/**
 * Public surface of the viewer feature. Everything outside
 * `src/features/viewer` imports from here and nowhere deeper.
 */
export { ViewerShell } from "./components/viewer-shell";
export { ViewerBundledView } from "./components/viewer-bundled-view";
export { ViewerPlayground } from "./components/viewer-playground";
export {
  listViewerModelIds,
  listViewerModels,
  loadViewerModel,
  type ViewerModelListing,
  type ViewerModelResult,
  type ViewerModelSummary,
} from "./service/model-service";
export type { ViewerModel } from "./lib/model";
