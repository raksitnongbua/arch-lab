/**
 * Whether the playground's source rail is folded away, remembered across
 * visits.
 *
 * WHY IT PERSISTS AT ALL. Folding the rail is not a passing gesture like
 * scrolling — it is a statement about how you use this page. A reader who has
 * a document they only want to LOOK at folds the text away, and before this
 * the page handed it back on every visit. Nothing else here has that shape:
 * the JSON pane opens to answer a question and closes when it is answered,
 * and immersive mode is explicitly a mode you leave.
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
 * ONE KEY FOR ALL THREE PLAYGROUND ROUTES. `/view`, `/view/c4` and
 * `/view/seq` mount the same workbench, and "give me more canvas" is about
 * how you read a diagram rather than which kind you opened. (Same argument as
 * `lib/idle-motion.ts`, whose key is unscoped for the same reason.)
 *
 * IMMERSIVE MODE IS NOT STORED HERE and must not be folded into it. Immersive
 * also hides the rail, but it is a mode with an announced exit, and
 * persisting it would strand a reader on a page whose way out they have to
 * remember from a previous session.
 */

/** The cookie the server reads and the toggle writes. */
export const SOURCE_FOLD_COOKIE = "af-source-collapsed";

const COLLAPSED = "collapsed";

/**
 * A year, in seconds. Long enough that the preference outlives the reason
 * someone set it; a session cookie would forget on every browser restart,
 * which is the same annoyance in slower motion.
 */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The server's read, from a cookie value it already has. Takes the VALUE
 * rather than reaching for `next/headers` itself, so this module stays a pure
 * function the check scripts can exercise and the caller keeps the choice of
 * how it obtained the request.
 */
export function isCollapsedCookie(value: string | undefined): boolean {
  return value === COLLAPSED;
}

/** The client's read, from `document.cookie`. */
export function readSourceCollapsed(): boolean {
  try {
    return document.cookie
      .split(";")
      .some((part) => part.trim() === `${SOURCE_FOLD_COOKIE}=${COLLAPSED}`);
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

/**
 * `SameSite=Lax` and no `Secure`: this is a layout preference, not a
 * credential, and forcing `Secure` would silently drop it on `http://localhost`
 * during development — a preference that works everywhere except the machine
 * it is developed on is worse than none. `path=/` because all three playground
 * routes share it.
 */
export function writeSourceCollapsed(collapsed: boolean): void {
  try {
    document.cookie =
      `${SOURCE_FOLD_COOKIE}=${collapsed ? COLLAPSED : "expanded"};` +
      `path=/;max-age=${MAX_AGE_SECONDS};samesite=lax`;
  } catch {
    /* A browser refusing cookies still gets a working toggle for this
       session — it just forgets on reload. */
  }
  for (const listener of listeners) listener();
}

/**
 * No `storage` event exists for cookies, so this notifies only the tab that
 * wrote. Two tabs disagreeing about a pane's fold until one reloads is a
 * non-event; inventing a polling loop for it would not be.
 */
export function subscribeSourceCollapsed(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
