/**
 * Public surface of the dictionary feature. Everything outside
 * `src/features/dict` imports from here and nowhere deeper.
 *
 * The FORMAT layer lives in `features/archtext` (`parseDictText` /
 * `serializeDictText`); this feature consumes a parsed file and owns only
 * layout and rendering.
 *
 * NOTE FOR CHECK SCRIPTS AND MCP TOOLS: this barrel re-exports `.tsx`, which
 * Node's type stripping cannot read — anything headless deep-imports
 * `./lib/layout`, `./input/parse` or `./input/example` past this barrel, the
 * documented exception every other kind uses.
 */

export { DictViewer } from "./components/dict-viewer";
export { DictDiagram } from "./components/dict-diagram";
export { DictExampleView } from "./components/dict-example-view";
export {
  listDictExampleIds,
  listDictExamples,
  loadDictExample,
  type DictExampleListing,
  type DictExampleResult,
  type DictExampleSummary,
} from "./service/example-service";
export {
  DICT_FORMAT_LABEL,
  parseDictInput,
  type DictInputError,
  type DictParseErrorDetail,
  type DictSourceFormat,
  type ParsedDict,
} from "./input/parse";
export { DICT_EXAMPLE } from "./input/example";
export {
  BADGE,
  badgeRunWidth,
  COLUMN_LABEL,
  DICT,
  layoutDict,
  wrapToWidth,
} from "./lib/layout";
export type {
  DictColumn,
  DictLayout,
  LaidDictField,
  LaidDictSection,
} from "./lib/layout";
