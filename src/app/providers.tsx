"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";

import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY } from "@/lib/constants";
import { themeForScheme } from "@/lib/theme-default";
import { readFollowSystem, usePrefersDark } from "@/lib/theme-follow";

/**
 * Client-side providers, mounted once in the root layout.
 *
 * `enableSystem={false}` STILL, even though the default now follows the
 * reader's system preference, and the two facts are not in tension. Turning it
 * on would add a "system" entry to `themes` and resolve it to the literal names
 * "light" and "dark" — so the dark side could not be high contrast without
 * repainting the `dark` theme, which is a palette a reader can choose outright
 * and some already have stored. The preference is therefore resolved before
 * anything paints and written as a REAL theme name: `lib/theme-default.ts` does
 * that on every load, and by the time next-themes' script runs there is a
 * stored choice for it to honour like any other. Everything below sees seven
 * named themes and nothing else, which is what keeps the picker's tick
 * truthful — the "follow my system" state is a flag beside the theme
 * (`lib/theme-follow.ts`), not an eighth palette.
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
      /* NEXT-THEMES' OWN BLOCKING SCRIPT IS MADE INERT HERE, and the work it
         did now happens in `THEME_DEFAULT_SCRIPT`, which already runs before
         it and already reads the same key.

         WHY: `ThemeProvider` renders a script ELEMENT and offers no prop to
         suppress it, and React logs "Encountered a script tag while rendering
         React component" for every script it renders on the client — which the
         root layout does on each Fast Refresh. The two scripts this repo owns
         dodge that by being injected as raw HTML; a dependency's cannot.

         A `type` React does not recognise as JavaScript is the escape react-dom
         documents (`isScriptDataBlock`): it skips the warning precisely because
         the browser will not execute the tag. That is the whole point here —
         the tag must not run, because the stamping already happened.

         `scriptProps` is spread FIRST inside next-themes, so this survives
         while its own `dangerouslySetInnerHTML` and `nonce` still win. The
         provider's React runtime is untouched and keeps managing theme changes
         after hydration. */
      scriptProps={{ type: "text/x-arch-lab-inert" }}
    >
      <FollowSystemTheme />
      {children}
    </ThemeProvider>
  );
}

/**
 * Follows the OS while the reader has asked it to, for the length of an open
 * tab. Renders nothing.
 *
 * THE PRE-PAINT SCRIPT COVERS EVERY LOAD; this covers the change that happens
 * with the page already on screen — the machine going dark at sunset while a
 * diagram is up on a second monitor. Without it the reader would have to
 * reload to see the mode they asked to follow.
 *
 * ONE INSTANCE, AT THE ROOT, which is why it is here and not in the picker.
 * `ThemeToggle` mounts twice on a playground route (the site header and the
 * strip under an immersive diagram), and two listeners would race to write the
 * same value on every change — harmless but meaningless, and the sort of thing
 * that stops being harmless the first time someone gives the effect more to do.
 *
 * IT READS THE FLAG AT THE MOMENT IT FIRES, through `readFollowSystem()` rather
 * than the `useFollowSystem()` hook. The hook would re-run this effect every
 * time the reader touched the picker, and the only question that matters is
 * whether they were following WHEN the OS changed.
 */
function FollowSystemTheme(): null {
  const prefersDark = usePrefersDark();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!readFollowSystem()) return;
    setTheme(themeForScheme(prefersDark));
  }, [prefersDark, setTheme]);

  return null;
}
