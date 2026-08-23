/**
 * The sequence card, re-exported rather than re-drawn.
 *
 * `/live/sequence` is an alias that forwards to `/live/seq` (see `./page.tsx`),
 * and the card itself lives beside the real page — but a nested route inherits
 * the NEAREST `opengraph-image`, so `/live/sequence/[exampleId]` would fall
 * back to the root "C4 architecture diagrams" card without this file. That is
 * the same wrong-kind preview the sequence card was created to fix, so the
 * one thing this must not become is a second copy of it: one card, two
 * mounting points.
 *
 * A crawler that reaches the alias itself also gets the right preview, which
 * costs nothing and is one less way for a stale link to look wrong.
 */

export { default, alt, size, contentType } from "../seq/opengraph-image";
