"use client";

import {
  BookOpen,
  Check,
  Contrast,
  Layers,
  Moon,
  MoonStar,
  Palette,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { THEMES, type Theme } from "@/lib/constants";
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
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );
}

/**
 * How each theme presents itself. Keyed by `Theme`, so adding a name to THEMES
 * without describing it here is a type error rather than a menu row reading
 * "midnight" with no icon — the compiler is the reminder.
 */
const THEME_META: Record<
  Theme,
  { label: string; hint: string; Icon: typeof Sun }
> = {
  light: { label: "Light", hint: "Cool white", Icon: Sun },
  paper: { label: "Paper", hint: "Like a printed document", Icon: BookOpen },
  pastel: {
    label: "Pastel",
    hint: "Colourful, between the two",
    Icon: Palette,
  },
  glass: { label: "Liquid glass", hint: "Translucent surfaces", Icon: Layers },
  dark: { label: "Dark", hint: "Tuned dark grey", Icon: Moon },
  midnight: { label: "Midnight", hint: "True black, for OLED", Icon: MoonStar },
  contrast: {
    label: "High contrast",
    /* Names what it IS as well as that it is the default: "The default" alone
       told a reader which row they would land on and nothing about why. */
    hint: "The default · stronger outlines",
    Icon: Contrast,
  },
};

/**
 * The theme picker.
 *
 * IT WAS A TWO-STATE BUTTON, and could not survive a third theme: one click
 * meant one destination, so a fourth entry would have made "toggle" a cycle
 * nobody can aim. It is a menu now, and the menu is where a reader chooses
 * rather than guesses what comes next.
 *
 * The list is THEMES, not a copy: `lib/constants.ts` already drives the
 * provider, and a second list here is how a theme ends up available in one and
 * absent from the other.
 *
 * WHAT THE OLD BUTTON GOT RIGHT AND THIS KEEPS. The trigger icon is decided by
 * CSS variants, not by JavaScript reading the theme — next-themes stamps the
 * class on <html> before first paint, so the right icon is right on the very
 * first frame with no post-hydration swap. The menu ROWS are a different case:
 * they need the resolved name to mark the current one, which only exists on the
 * client, so the tick appears after hydration. That is invisible — the menu is
 * shut until someone opens it.
 *
 * Dismissal is the `ui/zoom-menu.tsx` arrangement: Escape closes,
 * pointerdown-outside closes, no focus trap. A short list of radio rows under a
 * button is not a dialog.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Consumed, so this Escape does not also act on the page underneath —
      // one press, one step.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const current = hydrated ? (theme as Theme | undefined) : undefined;
  const label =
    current === undefined
      ? "Theme"
      : `Theme — ${THEME_META[current]?.label ?? current}`;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        className={cn(
          "af-theme-toggle relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground backdrop-blur",
          "transition-colors duration-200 hover:border-foreground/25 hover:bg-card hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        )}
      >
        {/* Both icons are always mounted and cross-fade on the `dark:` variant,
            so the button box never changes size and the correct one is correct
            in the first frame. The dark-family themes (dark, midnight,
            contrast) all carry `.dark`-adjacent grounds, so the moon is right
            for every one of them — the specific theme is named in the menu,
            which is where the distinction matters. */}
        {/* A WRAPPER carries the hover gesture, not the icons themselves: they
            already animate `rotate` for the `dark:` cross-fade, and a second
            rotation on the same property would fight it mid-transition. The
            dial turns as a whole — the control reads as something you twist,
            which is what choosing a theme feels like — while the two icons keep
            swapping inside it, untouched. */}
        <span
          aria-hidden="true"
          className="af-theme-dial relative grid size-4 place-items-center"
        >
          <Sun
            aria-hidden="true"
            className="absolute size-4 scale-100 rotate-0 opacity-100 transition-all duration-300 dark:scale-50 dark:-rotate-90 dark:opacity-0"
          />
          <Moon
            aria-hidden="true"
            className="absolute size-4 scale-50 rotate-90 opacity-0 transition-all duration-300 dark:scale-100 dark:rotate-0 dark:opacity-100"
          />
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="af-glass absolute top-full right-0 z-50 mt-1.5 min-w-52 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {THEMES.map((name) => {
            const meta = THEME_META[name];
            const isCurrent = current === name;
            return (
              <button
                key={name}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                onClick={() => {
                  setTheme(name);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <meta.Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium">{meta.label}</span>
                  <span className="text-[11px] leading-tight opacity-70">
                    {meta.hint}
                  </span>
                </span>
                <Check
                  aria-hidden="true"
                  className={cn(
                    "ml-auto size-3.5 shrink-0",
                    !isCurrent && "invisible",
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
