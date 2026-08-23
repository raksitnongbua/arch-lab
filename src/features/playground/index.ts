/**
 * Public surface of the playground feature — the merged `/live` editor that
 * auto-detects and renders every document kind. Everything outside
 * `src/features/playground` imports from here and nowhere deeper.
 */
export { ViewPlayground } from "./components/view-playground";
export type { SeedKind } from "./input/parse";
