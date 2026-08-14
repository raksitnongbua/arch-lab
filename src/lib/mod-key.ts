"use client";

/**
 * What to CALL the modifier key in front of a reader — `⌘` on Apple
 * platforms, `Ctrl` everywhere else.
 *
 * One definition because there are now three consumers and they must agree:
 * the editor's canvas hint strip, its shortcut sheet, and the zoom pill's
 * preset menu (which is shared by all three canvases). The first two each
 * carried their own copy of the platform sniff, and a hint that says `Ctrl`
 * beside a sheet that says `⌘` is worse than either alone.
 *
 * This is the DISPLAY name only. The key MATCHING lives in
 * `editor/hooks/use-keyboard-shortcuts.ts`, which resolves the same `mod`
 * token against the real event — so the sheet cannot promise a key the
 * binding does not listen for.
 *
 * SSR-SAFE by construction. The obvious version — reading `navigator` during
 * render — makes the server say `Ctrl` and a Mac client say `⌘`, which is a
 * hydration mismatch on every page carrying a hint. `useSyncExternalStore` is
 * the primitive built for exactly this: it renders the SERVER snapshot during
 * hydration and re-renders with the real value immediately after, so the two
 * trees agree and the Mac reader still gets `⌘`.
 *
 * The store never changes (a platform does not change under a running tab),
 * so `subscribe` is a no-op that returns an unsubscribe. That is not laziness
 * — a store with no updates is still the correct shape for "a client-only
 * value React must not read during hydration".
 */

import { useSyncExternalStore } from "react";

/** The Ctrl-family label. Also the server snapshot: the safer guess, since
 * naming Ctrl to a Mac reader is a wrong label while naming ⌘ to a Windows
 * reader is a key they do not have. */
const CTRL = "Ctrl";
const COMMAND = "⌘";

function subscribe(): () => void {
  return () => {};
}

function readModKey(): string {
  /* `userAgentData.platform` where it exists, `platform` behind it: the latter
     is deprecated and still the only signal in Safari and Firefox, which is
     most of the Mac audience this branch is for. */
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? COMMAND : CTRL;
}

/** The modifier's display name for this reader's platform. */
export function useModKey(): string {
  return useSyncExternalStore(subscribe, readModKey, () => CTRL);
}
