"use client";

import { ThemeProvider } from "next-themes";

import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from "@/lib/constants";

/**
 * Client-side providers, mounted once in the root layout.
 *
 * `enableSystem={false}` STILL, even though the default now follows the
 * reader's system preference, and the two facts are not in tension. Turning it
 * on would add a "system" entry to `themes` and resolve it to the literal names
 * "light" and "dark" — so the dark side could not be high contrast without
 * repainting the `dark` theme, which is a palette a reader can choose outright
 * and some already have stored. The preference is therefore read once, before
 * anything paints, and written as a REAL theme name: `lib/theme-default.ts`
 * does that, and by the time next-themes' script runs there is a stored choice
 * for it to honour like any other. Everything below sees seven named themes and
 * nothing else, which is what keeps the picker's tick truthful.
 *
 * `DEFAULT_THEME` is what remains of the old unconditional default: it is where
 * a reader ends up when the preference cannot be read at all — a blocked
 * `localStorage`, a browser with no `matchMedia` — which is the same palette
 * that file's dark branch chooses anyway.
 *
 * next-themes injects a tiny blocking script that stamps the theme class on
 * <html> before first paint, so there is no flash of the wrong theme. That
 * script is also why <html> needs `suppressHydrationWarning`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      themes={[...THEMES]}
      enableSystem={false}
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      {children}
    </ThemeProvider>
  );
}
