/**
 * The system-preference DEFAULT: the mapping, and the pre-paint script that
 * applies it.
 *
 * NO REACT IN THIS FILE, and that is load-bearing rather than tidy. The root
 * layout is a SERVER component and imports `THEME_DEFAULT_SCRIPT` from here to
 * render into <head>; a module that so much as imports `useSyncExternalStore`
 * cannot be imported by one (Turbopack fails the build, which is how this file
 * came to be split). The reader's follow-the-system PREFERENCE — a store, its
 * writer, and the hooks over both — lives in `lib/theme-follow.ts`, which is a
 * client module for exactly that reason.
 */

import {
  DEFAULT_THEME_BY_SCHEME,
  THEME_FOLLOW_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/constants";

/** The media query both halves ask, named once so they cannot ask two things. */
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/**
 * The theme a system preference resolves to.
 *
 * The one place the mapping is applied in TypeScript — the pre-paint script
 * below inlines the same two names because it cannot import anything, and both
 * read them from `DEFAULT_THEME_BY_SCHEME` so neither can drift alone.
 */
export function themeForScheme(prefersDark: boolean): Theme {
  return prefersDark
    ? DEFAULT_THEME_BY_SCHEME.dark
    : DEFAULT_THEME_BY_SCHEME.light;
}

/**
 * The blocking script that resolves the system preference into a real theme
 * name before anything paints.
 *
 * WHY A SCRIPT AND NOT A PROP. next-themes stamps the theme class onto <html>
 * from its own blocking script, using `localStorage` if there is a value there
 * and its static `defaultTheme` if there is not. That prop is serialised on the
 * server, so it cannot depend on a preference only the reader's browser knows —
 * and by the time React could compute one, the wrong palette has already been
 * painted. Writing the resolved name into storage BEFORE that script runs is
 * what makes the answer available at the only moment it matters. Ordering is
 * why this is `beforeInteractive` in the root layout: Next injects it into
 * <head>, and next-themes' script is in <body>.
 *
 * IT RUNS ON EVERY LOAD, not once. Two conditions bring it in:
 *
 *   1. **Nothing stored** — a first visit. It resolves the preference AND
 *      writes the follow flag, which is what makes "no flag" mean a deliberate
 *      choice from then on rather than "never asked".
 *   2. **The flag is set** — the reader chose `System` in the picker and the OS
 *      may have changed since. Resolving again is how a machine switched to
 *      dark overnight is honoured on the next load, with the live
 *      `matchMedia` listener in `app/providers.tsx` covering the change while
 *      a tab is open.
 *
 * A PINNED THEME IS NEVER TOUCHED. The flag is absent, so neither condition
 * holds, and a reader who picked `paper` on a dark machine keeps `paper`.
 *
 * WHAT IT REFUSES TO DO IS THROW. A pre-paint script that raises aborts the
 * rest of the parse, so a blocked `localStorage` (Safari's private mode among
 * others) or a browser with no `matchMedia` has to end in the same place as a
 * reader with nothing stored: next-themes' own `defaultTheme`, which is
 * `DEFAULT_THEME`. That is the same palette this script's dark branch chooses,
 * so the failure mode is the behaviour that shipped before any of this.
 *
 * The resolve is computed BEFORE either write, so a missing `matchMedia` leaves
 * storage exactly as it found it rather than a flag with no theme beside it.
 */
export const THEME_DEFAULT_SCRIPT =
  `try{var t=${JSON.stringify(THEME_STORAGE_KEY)},` +
  `f=${JSON.stringify(THEME_FOLLOW_STORAGE_KEY)},s=localStorage.getItem(t);` +
  `if(s===null||localStorage.getItem(f)==="1"){` +
  `var v=matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)}).matches?` +
  `${JSON.stringify(DEFAULT_THEME_BY_SCHEME.dark)}:` +
  `${JSON.stringify(DEFAULT_THEME_BY_SCHEME.light)};` +
  `localStorage.setItem(t,v);if(s===null)localStorage.setItem(f,"1")}}catch(e){}`;
