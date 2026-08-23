/**
 * Public surface of the use-case feature — the view-mode renderer for
 * `UseCaseLabFile` documents. Everything outside `src/features/usecase`
 * imports from here and nowhere deeper (the barrel rule every feature
 * follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` use-case text belongs to `features/archtext`
 * (`parseUseCaseText` / `serializeUseCaseText` on its barrel). This feature
 * consumes a parsed file and owns only layout, the focus interaction, and
 * export.
 *
 * What the `/live` wiring needs: the viewer to mount, the pure layout for
 * anything that measures, the export pair (SVG string + PNG blob) with its
 * rendered-result type, the Share/Export toolbar buttons, and the input
 * layer (reader + seed example). No GIF exporter exists, deliberately — the
 * one animation is the first-paint reveal and the diagram then holds still
 * (`lib/motion.ts` carries the argument), so there is no loop to encode.
 *
 * NOTE FOR CHECK SCRIPTS AND MCP TOOLS: this barrel re-exports `.tsx`,
 * which Node's type stripping cannot read — anything that must load
 * headless deep-imports `./lib/layout` (and `./lib/shapes`,
 * `./lib/motion`, `./export/render-svg`) PAST this barrel, the same
 * documented exception the flowchart's MCP tool and every layout check use.
 * The playground's own reader deep-imports `./input/parse` and
 * `./input/example` for the same reason.
 */

export { UseCaseViewer } from "./components/usecase-viewer";
export { UseCaseShareButton } from "./share/share-button";
export { UseCaseExportButton } from "./export/export-button";
export {
  MERMAID_USECASE_CAVEAT,
  parseUseCaseInput,
  USECASE_FORMAT_LABEL,
  type ParsedUseCase,
  type UseCaseInputError,
  type UseCaseParseErrorDetail,
  type UseCaseSourceFormat,
} from "./input/parse";
export { USECASE_EXAMPLE } from "./input/example";
export {
  resolveUseCaseFocus,
  USECASE_EDGE_KIND_LABEL,
  UseCaseDiagram,
  type UseCaseFocus,
} from "./components/usecase-diagram";
export { layoutUseCase, UC } from "./lib/layout";
export type {
  LaidUseCaseActor,
  LaidUseCaseBoundary,
  LaidUseCaseEdge,
  LaidUseCaseElement,
  LaidUseCaseEllipse,
  UseCaseLayout,
} from "./lib/layout";
export {
  renderUseCasePngBlob,
  renderUseCaseSvg,
  type RenderedUseCaseSvg,
} from "./export/render-svg";
