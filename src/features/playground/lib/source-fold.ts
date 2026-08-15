"use client";

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
 * EXPANDED IS THE DEFAULT, and the server renders that. A reader who prefers
 * it folded therefore gets one expanded frame before the stored preference
 * applies — the D17 mounted-guard trade this codebase already makes for
 * `useIdleMotion` and `useReducedMotion`. The alternative is worse than the
 * flash: rendering nothing until hydration replaces a brief layout shift with
 * a brief blank page, and an inline pre-hydration script to set it is a lot
 * of machinery for one pane.
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

import { useCallback, useSyncExternalStore } from "react";

const SOURCE_FOLD_KEY = "arch-lab:source-collapsed";
const listeners = new Set<() => void>();

export function readSourceCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SOURCE_FOLD_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function writeSourceCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      SOURCE_FOLD_KEY,
      collapsed ? "collapsed" : "expanded",
    );
  } catch {
    /* Session-only degradation — see the module comment. */
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The remembered fold, and a setter that persists it — same shape as
 * `useState<boolean>`, so the call site reads as it did before it was stored.
 */
export function useSourceCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    readSourceCollapsed,
    () => false,
  );
  return [
    collapsed,
    useCallback((next: boolean) => writeSourceCollapsed(next), []),
  ];
}
