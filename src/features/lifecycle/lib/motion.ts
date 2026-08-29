/**
 * The lifecycle's JS-side motion timings — the two waits that decide WHEN the
 * canvas is "at rest", and nothing else.
 *
 * WHY THIS IS A `.ts` MODULE RATHER THAN CONSTANTS IN THE VIEWER. The
 * durations themselves live in `../styles/lifecycle-motion.css`, because a
 * first-paint animation cannot wait for a script to write a custom property.
 * These two are the opposite case: nothing in CSS reads them, they gate a
 * `setTimeout`, and one of them has to be checkable against the stylesheet.
 * `check:lifecycle-motion` reads this file through Node's type stripping,
 * which cannot parse `.tsx` — so a constant that needs pinning cannot live in
 * the viewer component. Same shape as `timeline/lib/motion.ts`, and an
 * independent leaf in the same way: it imports from no sibling feature and no
 * sibling imports it.
 *
 * THE TWO WAITS ARE NOT THE SAME QUESTION, and conflating them was a shipped
 * bug on the gantt canvas: "the reader has stopped fiddling" and "the page has
 * just arrived" are different states that happen to share an outcome, and
 * answering both with `IDLE_AFTER_MS` meant a freshly loaded page spent over
 * three seconds pretending someone was busy with it. Both constants are
 * carried here rather than imported from that feature — a cross-feature deep
 * import for two numbers would couple two canvases whose entrances have
 * nothing to do with each other, and `dry.md` names per-feature motion
 * constants as a deliberate non-duplication (the three `motion.ts` files).
 */

/**
 * How long the reader must be quiet, AFTER AN INTERACTION, before the ambient
 * spine sweep resumes. Long enough that it never fires mid-scroll, short
 * enough that a reader who stops to look sees it without waiting.
 */
export const IDLE_AFTER_MS = 3200;

/**
 * How long the canvas waits ON FIRST RENDER before it counts as at rest.
 *
 * A PAGE THAT HAS JUST LOADED AND HAS NEVER BEEN TOUCHED IS AT REST. Arming
 * the first transition with `IDLE_AFTER_MS` says otherwise, and on the gantt
 * canvas that was visible on every cold load: the entrance played, then a long
 * flat pause, then the ambient arrived from nowhere.
 *
 * NOT ZERO, THOUGH. Starting the sweep at mount would run a travelling mark
 * down a spine whose states are still arriving — two motions competing for the
 * one moment the entrance owns. So the wait is the ENTRANCE, and then the
 * ambient picks it up.
 *
 * LONGER THAN THE TIMELINE'S, AND THE DIFFERENCE IS THE REJOIN PATHS. This
 * canvas has connectors and the timeline has none, so its entrance is two
 * stages rather than one — the spine draws, then the returning branches draw
 * along it — and the ambient must not start over the second stage. The number
 * is that whole budget as the stylesheet's own custom properties compute it,
 * plus a small margin. CSS cannot be imported here, so
 * `check:lifecycle-motion` recomputes it FROM THE STYLESHEET and fails if this
 * constant is below it: raising any reveal timing therefore breaks the build
 * rather than quietly reintroducing an ambient that starts on top of the
 * entrance.
 */
export const LIFECYCLE_SETTLE_MS = 940;
