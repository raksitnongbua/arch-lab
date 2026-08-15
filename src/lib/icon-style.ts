import { useCallback, useSyncExternalStore } from "react";

/* No "use client" directive, deliberately. The hook below is only ever called
   from components that carry their own, while `IconStyle` and
   `DEFAULT_ICON_STYLE` are wanted in places that must stay server-renderable
   — the SVG exporter takes the default when there is no reader to ask. The
   directive would drag every one of those into the client bundle. */

/**
 * How stack icons are painted: the reader's preference, not the document's.
 *
 * WHY THIS IS NOT IN THE MODEL. It was offered as an `.alab` directive and
 * deliberately rejected: it is a rendering choice, in the same class as the
 * light/dark theme, and putting it in the format would mean a grammar
 * keyword, a serializer branch, round-trip coverage, MCP docs and the VS Code
 * grammar — all to record something no diagram is ABOUT. The cost of that
 * choice is real and worth stating: a share link does not carry the style, so
 * a recipient sees their own preference rather than the sender's. If that
 * ever needs to travel, the directive is the change to make — deliberately,
 * and with the format work it implies.
 *
 * MONO IS THE DEFAULT because it is the only setting that makes the whole
 * board agree: the 59 hand-authored marks are `currentColor` and have no
 * coloured artwork, so colour mode is always a MIXTURE of coloured brand
 * logos and monochrome house icons. Mono renders every icon in one ink that
 * follows the theme.
 */
export type IconStyle = "mono" | "colour";

export const DEFAULT_ICON_STYLE: IconStyle = "mono";

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
