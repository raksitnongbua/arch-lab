import { DEFAULT_THEME_BY_SCHEME, THEME_STORAGE_KEY } from "@/lib/constants";

/**
 * The pre-paint script that gives a first-time visitor the theme their system
 * asked for.
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
 * IT SEEDS ONCE, and that is the trade this feature makes. The preference is
 * read on the first visit and the resolved theme is then the reader's stored
 * choice like any other, so switching the OS to dark a month later does not
 * move a diagram that is already set to light. What it buys is that the picker
 * never disagrees with the page: the stored value is always a real theme with a
 * tick beside it, never a "system" pseudo-entry whose row cannot say what it
 * currently resolves to. A reader who wants the other one is one click away,
 * and that click is remembered — which is the behaviour anyone who has touched
 * the picker already has.
 *
 * WHAT IT REFUSES TO DO IS THROW. A pre-paint script that raises aborts the
 * rest of the parse, so a blocked `localStorage` (Safari's private mode among
 * others) or a browser with no `matchMedia` has to end in the same place as a
 * reader with nothing stored: next-themes' own `defaultTheme`, which is
 * `DEFAULT_THEME`. That is the same fallback this file's dark branch chooses,
 * so the failure mode is the behaviour that shipped before it.
 */
export const THEME_DEFAULT_SCRIPT =
  `try{var k=${JSON.stringify(THEME_STORAGE_KEY)};` +
  `if(!localStorage.getItem(k))localStorage.setItem(k,` +
  `matchMedia("(prefers-color-scheme: dark)").matches?` +
  `${JSON.stringify(DEFAULT_THEME_BY_SCHEME.dark)}:` +
  `${JSON.stringify(DEFAULT_THEME_BY_SCHEME.light)})}catch(e){}`;
