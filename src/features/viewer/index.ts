/**
 * Public surface of the viewer feature. Everything outside
 * `src/features/viewer` imports from here and nowhere deeper.
 *
 * The playground UI itself no longer lives in this feature — the merged
 * `/view` page is `features/playground`, which consumes the C4 machinery
 * below (the pane sync engine, the share codec, the download helpers)
 * through this barrel. That is why this file exports more than components:
 * the alternative was the playground deep-importing `viewer/input/*` and
 * `viewer/share/*`, the exact cross-feature debt `dry.md` says not to add to.
 */
export { ViewerShell } from "./components/viewer-shell";
/* The shell's editable-canvas contract. Exported because the playground is
 * the one host that passes it, and it does so through this barrel — see the
 * note above about not deep-importing `viewer/components/*`. */
export type {
  CanvasEditHandlers,
  NodeMoveHandler,
} from "./components/viewer-canvas";
export { ViewerBundledView } from "./components/viewer-bundled-view";
export {
  listViewerModelIds,
  listViewerModels,
  loadViewerModel,
  type ViewerModelListing,
  type ViewerModelResult,
  type ViewerModelSummary,
} from "./service/model-service";
export type { ViewerModel } from "./lib/model";

/* The C4 pane sync engine — parse either representation, canonical text for
 * both, the lossy Mermaid import, and the seed model. */
export {
  canonicalizePane,
  importMermaid,
  MERMAID_LOSSY_NOTICE,
  PANE_LABEL,
  parsePane,
  SEED_MODEL,
  type AftErrorDetail,
  type JsonPaneErrorDetail,
  type MermaidImportError,
  type PaneErrorDetail,
  type PaneId,
  type SyncedModel,
} from "./input/sync";
export { detectFormat } from "./input/detect";

/* The share codec — the one fragment format every `#m=…` link uses. */
export {
  canEncodeShare,
  decodeShareFragment,
  dropUrlFragment,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_FORWARD_ATTRIBUTE,
} from "./share/codec";

export { downloadBlob, sourceFileStem } from "./export/download";
