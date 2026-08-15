"use client";

import { ThemeProvider } from "next-themes";

import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from "@/lib/constants";

/**
 * Client-side providers, mounted once in the root layout.
 *
 * `enableSystem={false}` is deliberate: arch-lab is dark by default because
 * that is the right canvas for diagram work, not because the OS
 * happens to be dark. Light stays one click away.
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
