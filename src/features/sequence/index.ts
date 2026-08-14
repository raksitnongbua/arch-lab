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
 * The playground UI no longer lives here either — the merged `/view` page is
 * `features/playground`, which is why the input layer, the share wrapper and
 * the export button are exported below rather than staying internal.
 */

export { SequenceViewer } from "./components/sequence-viewer";
export { layoutSequence, SEQ } from "./lib/layout";
export type { SequenceLayout } from "./lib/layout";
export { SEQUENCE_EXAMPLE } from "./input/example";
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
