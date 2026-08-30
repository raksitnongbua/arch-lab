/**
 * The timeline's JS-side motion timings — the two waits that decide WHEN the
 * canvas is "at rest", and nothing else.
 *
 * WHY THIS IS A `.ts` MODULE RATHER THAN CONSTANTS IN THE VIEWER. The
 * durations themselves live in `../styles/timeline-motion.css`, because a
 * first-paint animation cannot wait for a script to write a custom property.
 * These two are the opposite case: nothing in CSS reads them, they gate a
 * `setTimeout`, and one of them has to be checkable against the stylesheet.
 * `check:timeline-motion` reads this file through Node's type stripping, which
 * cannot parse `.tsx` — so a constant that needs pinning cannot live in the
 * viewer component. Same shape as `gantt/lib/motion.ts`, and an independent
 * leaf in the same way: it imports from no sibling feature and no sibling
 * imports it.
 *
 * THE TWO WAITS WERE NOT THE SAME QUESTION, and conflating them was a shipped
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
 * THERE IS NO IDLE WAIT ANY MORE, and the empty space here is deliberate.
 *
 * `IDLE_AFTER_MS` used to live in this file: 3200ms of quiet after an
 * interaction before the ambient resumed. It answered a real question while
 * POINTING at a row selected it — the pointer moved continuously, so "has the
 * reader stopped fiddling" needed a timer. Selecting is a discrete press now,
 * and this canvas has no camera: no pan, no zoom, no drag. Nothing a reader can
 * do here is sustained, so there is nothing for the ambient to yield to, and
 * yielding to a click meant deselecting killed every moving mark for three
 * seconds.
 *
 * Keeping the constant with nothing reading it would be a dead line that reads
 * as a guarantee — the same fault as a floor that can never bind. It is gone,
 * and `check:*-motion` no longer compares against it.
 */

/**
 * How long the canvas waits ON FIRST RENDER before it counts as at rest.
 *
 * A PAGE THAT HAS JUST LOADED AND HAS NEVER BEEN TOUCHED IS AT REST. Arming
 * the first transition with `IDLE_AFTER_MS` says otherwise, and on the gantt
 * canvas that was visible on every cold load: the entrance played, then a long
 * flat pause, then the ambient arrived from nowhere.
 *
 * NOT ZERO, THOUGH. Starting the sweep at mount would run a travelling mark
 * down a spine whose dots are still arriving — two motions competing for the
 * one moment the entrance owns. So the wait is the ENTRANCE, and then the
 * ambient picks it up.
 *
 * PINNED TO THE STYLESHEET, NOT GUESSED. The number is the reveal's worst case
 * as the stylesheet's own custom properties compute it — the last event rising
 * after the full capped stagger — plus a small margin so the final frame has
 * landed before anything starts travelling over it. CSS cannot be imported
 * here, so `check:timeline-motion` recomputes that budget FROM THE STYLESHEET
 * and fails if this constant is below it: raising any reveal timing therefore
 * breaks the build rather than quietly reintroducing an ambient that starts on
 * top of the entrance.
 */
export const TIMELINE_SETTLE_MS = 760;
