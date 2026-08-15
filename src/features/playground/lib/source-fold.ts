/* THE STORE, WITHOUT THE HOOK, and that split is forced rather than chosen:
   `SOURCE_FOLD_SCRIPT` is read by the ROOT LAYOUT, a server component, and
   Next refuses to let one import any module that so much as imports
   `useSyncExternalStore`. So the React binding lives next door in
   `use-source-fold.ts`; everything either side of the boundary shares the
   constants here rather than restating them. */

/**
 * Whether the playground's source rail is folded away, remembered across
 * visits.
 *
 * WHY IT PERSISTS AT ALL. Folding the rail is not a passing gesture like
 * scrolling — it is a statement about how you use this page. A reader who has
 * a document they only want to LOOK at folds the text away, and before this
 * the page handed it back on every visit, so the fold had to be redone every
 * single time. Nothing else on the page has that shape: the JSON pane opens
 * to answer a question and closes when it is answered, and immersive mode is
 * explicitly a mode you leave.
 *
 * ONE KEY FOR EVERY PLAYGROUND ROUTE, not one per route. `/view`, `/view/c4`
 * and `/view/seq` mount the same workbench, and "give me more canvas" is a
 * statement about how you read a diagram rather than about which kind you
 * happened to open. Scoping it per route would mean folding the rail three
 * times to get one preference. (Same argument as `lib/idle-motion.ts`, whose
 * key is unscoped for exactly this reason.)
 *
 * EXPANDED IS THE DEFAULT, because the server cannot read localStorage. That
 * used to mean a reader who preferred it folded watched the rail appear and
 * then vanish on every load — a whole-pane layout shift, which is far more
 * jarring than the icon swaps this codebase accepts elsewhere. So the fold is
 * applied BEFORE FIRST PAINT by `SOURCE_FOLD_SCRIPT`, which stamps
 * `SOURCE_FOLD_ATTRIBUTE` on <html>; `globals.css` hides the pane on that
 * attribute alone, with no JavaScript and no React involved.
 *
 * The attribute is kept in sync on every write, not just at boot, so the CSS
 * rule and React's own `hidden` class can never disagree. React still owns
 * the state — the attribute is how the FIRST paint learns what React will
 * conclude a moment later. One frame of `aria-expanded` still reads the
 * default before hydration corrects it; that is invisible and self-healing,
 * where the layout shift was neither.
 *
 * IMMERSIVE MODE IS NOT STORED HERE and must not be folded into it. Immersive
 * also hides the rail, but it is a mode with an announced exit (Escape), and
 * persisting it would strand a reader on a page whose way out they have to
 * remember from a previous session. `view-playground.tsx` keeps them separate
 * and passes `sourceCollapsed || isImmersive` to the workbench.
 *
 * localStorage failures (private mode, quota) degrade to session-only state:
 * reads fall back to the default and writes still notify this tab, so the
 * toggle keeps working — it just forgets on reload. The `storage` event fires
 * only in OTHER tabs, so writes notify a local listener set too; both paths
 * funnel through the one subscribe.
 */

const SOURCE_FOLD_KEY = "arch-lab:source-collapsed";

/**
 * Stamped on <html> before first paint, and kept current on every write.
 * `globals.css` is the only reader — the value is deliberately the same
 * "collapsed" string stored in localStorage so the script can copy it across
 * without interpreting it.
 *
 * PINNED TO THE STYLESHEET by `pnpm check:viewer-motion`: CSS cannot import a
 * constant, so the selector in globals.css is a hand-maintained twin of this
 * name and a check script asserts the two still match.
 */
export const SOURCE_FOLD_ATTRIBUTE = "data-af-source-fold";
const COLLAPSED = "collapsed";

/**
 * The pre-paint script. Built from the constants above so the key, the
 * attribute and the value are each defined once, and wrapped in try/catch for
 * the same reason the share-flag script is: a throwing pre-paint script aborts
 * the rest of the parse, and no layout preference is worth a blank page.
 */
export const SOURCE_FOLD_SCRIPT =
  `try{if(localStorage.getItem(${JSON.stringify(SOURCE_FOLD_KEY)})===${JSON.stringify(COLLAPSED)})` +
  `document.documentElement.setAttribute(${JSON.stringify(SOURCE_FOLD_ATTRIBUTE)},${JSON.stringify(COLLAPSED)})}catch(e){}`;
const listeners = new Set<() => void>();

export function readSourceCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SOURCE_FOLD_KEY) === COLLAPSED;
  } catch {
    return false;
  }
}

export function writeSourceCollapsed(collapsed: boolean): void {
  /* The attribute first, and OUTSIDE the try: it is what the stylesheet reads,
     so it must track the toggle even where storage is denied — otherwise a
     private-mode reader folds the rail and the CSS keeps showing it. */
  if (collapsed) {
    document.documentElement.setAttribute(SOURCE_FOLD_ATTRIBUTE, COLLAPSED);
  } else {
    document.documentElement.removeAttribute(SOURCE_FOLD_ATTRIBUTE);
  }
  try {
    window.localStorage.setItem(
      SOURCE_FOLD_KEY,
      collapsed ? COLLAPSED : "expanded",
    );
  } catch {
    /* Session-only degradation — see the module comment. */
  }
  for (const listener of listeners) listener();
}

export function subscribeSourceCollapsed(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
