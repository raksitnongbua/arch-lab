"use client";

/**
 * The reader's icon-style preference as a subscribable store.
 *
 * SPLIT OUT OF `icon-style.ts`, which now holds only the type and the
 * default. That file claimed to be server-renderable and was not: importing
 * `useSyncExternalStore` puts a module in the client graph on its own, with or
 * without a `"use client"` directive, so `/api/render` could not read
 * `DEFAULT_ICON_STYLE` without the whole store coming along and failing to
 * compile. The type and the default are wanted on the server; the store never
 * is. Two modules is what that costs.
 */

import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_ICON_STYLE, type IconStyle } from "./icon-style";

/** Namespaced so it cannot collide with next-themes' own key. */
const STORAGE_KEY = "arch-lab:icon-style";

/**
 * Subscribers are notified through a plain callback set rather than only the
 * `storage` event: `storage` fires in OTHER tabs, never the one that wrote,
 * so a toggle would leave its own page stale. Both are wired — the set for
 * this tab, the event so a second tab follows along.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored(): IconStyle {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "colour" || raw === "mono" ? raw : DEFAULT_ICON_STYLE;
  } catch {
    /* Private-mode Safari throws on localStorage access. A reader who cannot
       persist a preference should still get a diagram, not a blank page. */
    return DEFAULT_ICON_STYLE;
  }
}

/**
 * Cached because `useSyncExternalStore` requires a snapshot that is
 * referentially stable between changes — returning a fresh read on every call
 * is fine for a string, but the cache also keeps `localStorage` off the hot
 * path of every icon render.
 */
let snapshot: IconStyle | null = null;

function getSnapshot(): IconStyle {
  snapshot ??= readStored();
  return snapshot;
}

/**
 * The style the SERVER renders, and therefore the one React hydrates against.
 * It must be the default rather than the stored value — the server cannot see
 * localStorage — so a reader who prefers colour gets one mono frame and then
 * a swap. That is the accepted cost of not putting the style in the document;
 * the alternative (an inline pre-hydration script, as next-themes uses for
 * the theme) buys a flash-free first paint at the price of shipping both
 * artworks to every reader.
 */
function getServerSnapshot(): IconStyle {
  return DEFAULT_ICON_STYLE;
}

export function setIconStyle(style: IconStyle): void {
  snapshot = style;
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    /* Unpersisted is still switched — the preference just will not survive a
       reload. Failing the toggle outright would be worse. */
  }
  for (const listener of listeners) listener();
}

/** The current icon style, and a setter that persists it. */
export function useIconStyle(): [IconStyle, (style: IconStyle) => void] {
  const style = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((next: IconStyle) => setIconStyle(next), []);
  return [style, set];
}
