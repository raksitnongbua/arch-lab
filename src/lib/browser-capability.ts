import { useSyncExternalStore } from "react";

/**
 * Reads a browser capability that CANNOT CHANGE once the page is running —
 * "can this browser copy a PNG?", "can it compress a share link?", "does it
 * support fullscreen?" — without making the server render and the first client
 * render disagree.
 *
 * The problem this solves: calling the predicate directly during render makes
 * the server HTML claim one thing and hydration claim another, so a menu row
 * appears, disappears or logs a mismatch. Doing it in an effect costs a second
 * render and a flicker. `useSyncExternalStore` with a server snapshot of
 * `false` is the shape that gets it right in one pass: absent on the server,
 * true on the client the moment it can be known.
 *
 * `subscribe` is deliberately a no-op. This is for facts that are settled by
 * the time the client runs — a capability, not a state. Anything that can
 * CHANGE while the page is open (whether the document is *currently*
 * fullscreen, for instance) needs a real subscription and must not use this;
 * `viewer-shell.tsx` keeps its own for exactly that reason.
 *
 * Seven components had this three-line incantation inlined before it moved
 * here, several under a comment explaining the hydration trap to the next
 * reader. The explanation now lives once, where the code does.
 */

/* Never emits, so the snapshot is read once per commit and never invalidated. */
const subscribeToNothing = (): (() => void) => () => {};
const readFalse = (): boolean => false;

export function useBrowserCapability(read: () => boolean): boolean {
  return useSyncExternalStore(subscribeToNothing, read, readFalse);
}
