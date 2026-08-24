/**
 * Public surface of the sequence feature — the view-mode renderer for
 * `SequenceLabFile` documents. Everything outside `src/features/sequence`
 * imports from here and nowhere deeper (the same barrel rule every feature
 * follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` sequence text belongs to `features/archtext`, the Mermaid importer
 * to `features/mermaid`. This feature consumes both and owns only layout,
 * the focus interaction, and the sequence-specific controls.
 *
 * The playground UI no longer lives here either — the merged `/live` page is
 * `features/playground`, which is why the input layer, the share wrapper and
 * the export button are exported below rather than staying internal.
 */

export { SequenceViewer } from "./components/sequence-viewer";
export type { SequenceEditHandlers } from "./components/sequence-viewer";
export { layoutSequence, SEQ } from "./lib/layout";
export type { SequenceLayout } from "./lib/layout";
export { SEQUENCE_EXAMPLE } from "./input/example";
/* The gesture list the canvas's own strip renders, exported so the /live
   page's "what you can do on the canvas" disclosure names the same gestures
   from the same record — a second hand-written list is how the page and the
   canvas came to disagree about what could be edited (`check:canvas-edit`
   section 8's history). */
export { SEQUENCE_MOUSE_GESTURES } from "./lib/mouse-guide";
export type { SequenceMouseGesture } from "./lib/mouse-guide";
export {
  MERMAID_SEQUENCE_CAVEAT,
  parseSequenceInput,
  SEQUENCE_FORMAT_LABEL,
  type ParsedSequence,
  type SequenceInputError,
  type SequenceParseErrorDetail,
  type SequenceSourceFormat,
} from "./input/parse";
export { SequenceShareButton } from "./share/share-button";
export { SequenceExportButton } from "./export/export-button";
