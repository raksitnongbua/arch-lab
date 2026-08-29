/**
 * The gantt's JS-side motion timings — the two waits that decide WHEN the
 * canvas is "at rest", and nothing else.
 *
 * WHY THIS IS A `.ts` MODULE RATHER THAN CONSTANTS IN THE VIEWER. The durations
 * themselves live in `../styles/gantt-motion.css`, because a first-paint
 * animation cannot wait for a script to write a custom property. These two are
 * the opposite case: nothing in CSS reads them, they gate a `setTimeout`, and
 * one of them has to be checkable against the stylesheet. `check:gantt
 * -motion` reads this file through Node's type stripping, which cannot parse
 * `.tsx` — so a constant that needs pinning cannot live in the viewer
 * component. Same shape as `usecase/lib/motion.ts`, and an independent leaf in
 * the same way: it imports from no sibling feature and no sibling imports it.
 *
 * THE TWO WAITS ARE NOT THE SAME QUESTION, and conflating them was a shipped
 * bug. "The reader has stopped fiddling" and "the page has just arrived" are
 * different states that happen to share an outcome, and answering both with
 * `IDLE_AFTER_MS` meant a freshly loaded page spent over three seconds
 * pretending someone was busy with it.
 */

/**
 * How long the reader must be quiet, AFTER AN INTERACTION, before the ambient
 * motions resume. Long enough that they never fire mid-scroll, short enough
 * that a reader who stops to look sees them without waiting.
 */
export const IDLE_AFTER_MS = 3200;

/**
 * How long the canvas waits ON FIRST RENDER before it counts as at rest.
 *
 * A PAGE THAT HAS JUST LOADED AND HAS NEVER BEEN TOUCHED IS AT REST. Arming
 * the first transition with `IDLE_AFTER_MS` said otherwise, and the defect was
 * visible on every cold load: the axis sweep is gated on the idle TOGGLE alone
 * and started immediately, while the hatch march and the connector current wait
 * on `data-idle="1"` and were dead for 3.2 seconds. A reader saw the entrance,
 * then a long flat pause, then two more motions arriving from nowhere. The
 * countdown is the right rule for "the reader stopped fiddling"; it was never
 * the right rule for "the page just arrived".
 *
 * NOT ZERO, THOUGH, and that is the other half of the fix. Starting the ambient
 * motions at mount would run the connector current along a line still drawing
 * itself and march the hatch under rows still fading in — three motions
 * competing for the one moment the entrance owns. So the wait is the ENTRANCE,
 * and then the ambient picks it up.
 *
 * PINNED TO THE STYLESHEET, NOT GUESSED. The number is the reveal's worst case
 * as the stylesheet's own custom properties compute it — the later of the last
 * row rising and the last connector finishing its draw, 780ms at the timings in
 * `gantt-motion.css` — plus a small margin so the final frame has landed
 * before anything starts crawling over it. CSS cannot be imported here, so
 * `check:gantt-motion` recomputes that budget FROM THE STYLESHEET and fails
 * if this constant is below it: raising any reveal timing therefore breaks the
 * build rather than quietly reintroducing an ambient motion that starts on top
 * of the entrance.
 */
export const GANTT_SETTLE_MS = 820;
