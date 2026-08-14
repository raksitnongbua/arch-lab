/**
 * Mermaid → `.alab` conversion as its own errand — public API.
 *
 * `convertMermaid` is the whole feature: pure, synchronous, and composed
 * entirely from the readers the playgrounds already use, so this page can
 * never disagree with what pasting the same source into `/view/c4` or
 * `/view/sequence` would produce. `Converter` is the page's UI around it.
 */

export { Converter } from "./components/converter";
export {
  CONVERT_KIND_LABEL,
  CONVERT_PLAYGROUND_PATH,
  convertMermaid,
} from "./lib/convert";
export type {
  ConvertFailed,
  ConvertIdle,
  ConvertKind,
  ConvertOk,
  ConvertResult,
} from "./lib/convert";
export { CONVERT_SAMPLES } from "./content/samples";
export type { ConvertSample } from "./content/samples";
