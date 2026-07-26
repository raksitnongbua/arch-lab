"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const NOOP_SUBSCRIBE = () => () => {};

/**
 * `false` during SSR and the hydration render, `true` afterwards.
 *
 * useSyncExternalStore is the sanctioned way to read "am I hydrated yet" — the
 * server snapshot is what React uses while hydrating, so the markup matches and
 * there is no mismatch warning. (An `useEffect(() => setMounted(true))` would do
 * the same thing but trips `react-hooks/set-state-in-effect`.)
 */
function useIsHydrated() {
  return useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );
}

/**
 * Light/dark switch.
 *
 * Two details worth keeping:
 *
 *  - **Which icon shows is decided by CSS, not JS** (`dark:` variants on both
 *    icons). next-themes stamps `.dark` on <html> before first paint, so the
 *    correct icon is already correct on the very first frame — no post-hydration
 *    swap. Both icons are always in the DOM and cross-fade, so the button box
 *    never changes size: zero layout shift.
 *  - **The label needs the resolved theme**, which only exists client-side
 *    (it lives in localStorage). Until hydration the button is inert with a
 *    neutral label, so a screen reader is never told the wrong action.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useIsHydrated();

  const next = resolvedTheme === "dark" ? "light" : "dark";
  const label = hydrated ? `Switch to ${next} theme` : "Theme";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      disabled={!hydrated}
      aria-label={label}
      title={hydrated ? label : undefined}
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground backdrop-blur",
        "transition-colors duration-200 hover:border-foreground/25 hover:bg-card hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        "disabled:cursor-default",
        className,
      )}
    >
      {/* Sun is visible in light, Moon in dark. Driven purely by the .dark class. */}
      <Sun
        aria-hidden="true"
        className="absolute size-4 scale-100 rotate-0 opacity-100 transition-all duration-300 dark:scale-50 dark:-rotate-90 dark:opacity-0"
      />
      <Moon
        aria-hidden="true"
        className="absolute size-4 scale-50 rotate-90 opacity-0 transition-all duration-300 dark:scale-100 dark:rotate-0 dark:opacity-100"
      />
    </button>
  );
}
