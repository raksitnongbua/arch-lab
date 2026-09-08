/**
 * Geometry an author may state, shared by the notations that solve their own
 * layout but let one element out of it.
 *
 * WHY THIS FILE EXISTS. Three grammars — flowchart, use-case and ER — carry an
 * OPTIONAL `(x,y)` that overrides the solver for one element. They arrived one
 * at a time, and the flowchart's `FlowchartPoint` was the first, named for the
 * notation that happened to need it first. When the third wanted the same two
 * numbers, `dry.md`'s rule applied: identical bodies get one definition, and
 * the question it asks before extracting — what would the copies have to do
 * differently in future? — has the answer "nothing". A point is a point.
 *
 * NOT `C4Node.position`, which is a `Point` in `c4.ts` and stays there. That
 * one is REQUIRED on every element and rides a `(x,y w×h)` token carrying a
 * size, because a C4 box is the author's to size. The three notations here
 * measure their elements from their own contents, so a size would be
 * meaningless in all three. Two identical shapes that mean different things,
 * argued rather than merged — the distinction dry.md's "what NOT to
 * deduplicate" section asks for.
 */

/**
 * A pinned element's top-left corner, in the same user units its layout works
 * in.
 *
 * ABSENT IS THE NORMAL CASE wherever this appears, and that is the whole
 * design: an element with no point is solved from the document's structure
 * exactly as it was before the field existed, which is what let all three
 * notations grow one without a breaking change.
 *
 * Its own interface rather than an inline shape so that the parser, the
 * serializer, the layout and the canvas all name one thing.
 */
export interface PinnedPoint {
  x: number;
  y: number;
}
