/**
 * Public surface of the ER feature — the view-mode renderer for `ErLabFile`
 * documents. Everything outside `src/features/er` imports from here and
 * nowhere deeper (the barrel rule every feature follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` ER text belongs to `features/archtext` (`parseErText` /
 * `serializeErText` on its barrel). This feature consumes a parsed file and
 * owns only layout and rendering.
 *
 * NOTE FOR CHECK SCRIPTS AND MCP TOOLS: this barrel re-exports `.tsx`, which
 * Node's type stripping cannot read — anything that must load headless
 * deep-imports `./lib/layout` PAST this barrel, the same documented
 * exception the flowchart's MCP tool and every layout check use. The
 * playground's own reader deep-imports `./input/parse` and `./input/example`
 * for the same reason.
 */

export { ErViewer } from "./components/er-viewer";
export { ErDiagram } from "./components/er-diagram";
export type { ErFocus } from "./components/er-diagram";
export { ErExampleView } from "./components/er-example-view";
export {
  listErExampleIds,
  listErExamples,
  loadErExample,
  type ErExampleListing,
  type ErExampleResult,
  type ErExampleSummary,
} from "./service/example-service";
export {
  ER_FORMAT_LABEL,
  MERMAID_ER_CAVEAT,
  parseErInput,
  type ErInputError,
  type ErParseErrorDetail,
  type ErSourceFormat,
  type ParsedEr,
} from "./input/parse";
export { ER_EXAMPLE } from "./input/example";
export { ER, layoutEr } from "./lib/layout";
export type {
  ErLayout,
  LaidErAttribute,
  LaidErEnd,
  LaidErEntity,
  LaidErRelationship,
} from "./lib/layout";
export { ErShareButton } from "./share/share-button";
export { renderErSvg } from "./export/render-svg";
