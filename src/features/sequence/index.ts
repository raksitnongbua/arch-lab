/**
 * Public surface of the sequence feature — the view-mode renderer and
 * playground for `SequenceLabFile` documents. Everything outside
 * `src/features/sequence` imports from here and nowhere deeper (the same
 * barrel rule every feature follows).
 *
 * The FORMAT layer deliberately does not live here: parsing/serializing
 * `.alab` sequence text belongs to `features/archtext`, the Mermaid importer
 * to `features/mermaid`. This feature consumes both and owns only layout,
 * playback and the playground UI.
 */

export { SequencePlayground } from "./components/sequence-playground";
export { SequencePlayer } from "./components/sequence-player";
export { layoutSequence, SEQ } from "./lib/layout";
export type { SequenceLayout } from "./lib/layout";
export { SEQUENCE_EXAMPLE } from "./input/example";
