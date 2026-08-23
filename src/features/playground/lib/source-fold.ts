/**
 * Whether the playground's source rail is folded away, remembered across
 * visits.
 *
 * WHY IT PERSISTS AT ALL. Where the rail stands is not a passing gesture like
 * scrolling — it is a statement about how you use this page, in either
 * direction: someone who only wants to LOOK at a document folds the text
 * away, and someone who came to write keeps it open. Before this was stored,
 * the page overruled both on every visit. Nothing else here has that shape:
 * the JSON pane opens to answer a question and closes when it is answered,
 * and immersive mode is explicitly a mode you leave.
 *
 * FOLDED IS THE DEFAULT, and the reason is `purpose.md`: presentation is the
 * product, so the first thing this page should show is the drawing. An absent
 * cookie used to read as expanded, which meant a reader arriving at `/live` —
 * or opening somebody's share link — met a monospace editor before they had
 * seen what the product draws.
 *
 * MEASURED, because "half the screen" was the complaint and above `lg` it is
 * not literally true: at a 1440px window the rail is 30% of the workbench
 * (~413px, against the canvas's ~951px) and the full height of it. Folding it
 * hands the canvas the whole width, which is worth most to the drawing that
 * spends width — a sequence diagram's participants spread horizontally, the
 * argument `components/ui/split-workbench.tsx` opens with.
 *
 * BELOW `lg` THIS PREFERENCE DOES NOTHING, and that is deliberate rather than
 * an oversight. There the panes stack and the workbench renders no toggle at
 * all, so a folded rail would be an editor with no way back — the reader
 * would have to find a wider window to reach the text. The stacked layout
 * gives the diagram the opening moment a different way, by putting the canvas
 * FIRST; see `split-workbench.tsx`, which scopes the fold to `lg` for exactly
 * this reason.
 *
 * THE COST, stated plainly, because it must not be paid quietly: the two-pane
 * live edit is what this page IS, and the text format is one of the two things
 * a drawing tool cannot do (`purpose.md`). A reader who never notices the rail
 * has been shown less product, beautifully. So this default is only defensible
 * while the control that opens it is an INVITATION naming what is behind it —
 * "Edit the text", labelled at every width the rail exists at, not a bare
 * chevron. The canvas lock made the same trade and answers it the same way
 * (`canvas-lock.ts`: "the objection is answered by the control, not by the
 * default"). If that control regresses to an unlabelled icon, this default is
 * wrong again.
 *
 * A STORED CHOICE STILL WINS, and the default moved by changing only what an
 * ABSENT cookie means. Both spellings mean exactly what they meant —
 * `expanded` open, `collapsed` folded — so a reader who deliberately opened
 * the rail under the old default keeps it open. Inverting a spelling would
 * have reversed every reader who had already chosen; see `whenUnset` in
 * `preference-cookie.ts`, which exists for this and arrived with the lock's
 * own default change.
 *
 * WHY A COOKIE AND NOT localStorage, which is what this used first. The
 * server renders this page, and localStorage is invisible to it — so the
 * server always rendered the rail EXPANDED and the client folded it a moment
 * later. That is a whole-pane layout shift on every single load, and it is
 * exactly what a reader who folds the rail sees most.
 *
 * Two attempts to paper over it are worth recording so neither is tried
 * again. Rendering nothing until hydration swaps a flash for a blank page. A
 * pre-paint script stamping an attribute for CSS to read LOOKS right and is
 * not: `next/script` with `strategy="beforeInteractive"` does not emit an
 * executable inline tag at all — it pushes the source into `self.__next_s`
 * for Next's runtime to run once the framework bundle is up, which is after
 * first paint. The script was in the HTML and the flash was still there.
 *
 * A cookie travels WITH THE REQUEST, so the server knows the answer before it
 * renders a byte and there is nothing to correct afterwards. No script, no
 * flash, no hydration mismatch — the markup is right the first time.
 *
 * THE COST, stated plainly: reading a cookie opts these routes out of static
 * rendering. That is the honest price of server-rendering a per-reader
 * preference, and it is confined to the three playground routes; nothing else
 * on the site reads it.
 *
 * ONE KEY FOR ALL THREE PLAYGROUND ROUTES. `/live`, `/live/c4` and
 * `/live/seq` mount the same workbench, and "give me more canvas" is about
 * how you read a diagram rather than which kind you opened. (Same argument as
 * `lib/idle-motion.ts`, whose key is unscoped for the same reason.)
 *
 * IMMERSIVE MODE IS NOT STORED HERE and must not be folded into it. Immersive
 * also hides the rail, but it is a mode with an announced exit, and
 * persisting it would strand a reader on a page whose way out they have to
 * remember from a previous session.
 *
 * THE MECHANISM now lives in `preference-cookie.ts`, extracted when the
 * editable canvas needed a second preference of the same shape. The named
 * exports below are unchanged and remain the API every caller uses.
 */

import { booleanPreference } from "./preference-cookie";

/**
 * What a reader who has never touched the toggle gets. Named and exported
 * rather than written as a bare `true` here and a second one at the
 * playground's prop default: that is exactly how the server comes to send one
 * answer while a host that omits the prop renders the other, and it is the
 * trap `canvas-lock.ts` names for its own default.
 */
export const SOURCE_FOLDED_BY_DEFAULT = true;

/** Module-level, because `useSyncExternalStore` resubscribes if `subscribe`
 * changes identity — see `use-preference.ts`. */
export const sourceFoldPreference = booleanPreference({
  cookie: "af-source-collapsed",
  onValue: "collapsed",
  offValue: "expanded",
  whenUnset: SOURCE_FOLDED_BY_DEFAULT,
});

/** The cookie the server reads and the toggle writes. */
export const SOURCE_FOLD_COOKIE = sourceFoldPreference.cookie;

/**
 * The server's read. Anything that is not the reader's explicit `expanded`
 * reads as folded, so a first visit — and a value left over from some future
 * rename — gets the default without the server having to know what the
 * default is.
 */
export const isCollapsedCookie = sourceFoldPreference.fromCookie;
