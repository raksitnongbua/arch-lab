"use client";

import {
  BookOpen,
  Check,
  Contrast,
  Layers,
  Monitor,
  Moon,
  MoonStar,
  Palette,
  Ruler,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  placePanel,
  type PanelPlacement,
} from "@/components/ui/panel-placement";
import { THEMES, type Theme } from "@/lib/constants";
import { themeForScheme } from "@/lib/theme-default";
import {
  useFollowSystem,
  usePrefersDark,
  writeFollowSystem,
} from "@/lib/theme-follow";
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
    /* NO LONGER "The default · stronger outlines". It was the default for
       everybody; it is now the default for a reader whose system prefers dark
       (`lib/theme-default.ts`), and the `light` row above has the same claim on
       the word for everybody else. A row that says "The default" to half its
       readers is worse than a row that describes itself, which is all any of
       these need to do. */
    hint: "Stronger outlines",
    Icon: Contrast,
  },
  blueprint: {
    label: "Blueprint",
    hint: "Drafting sheet, ruled grid",
    Icon: Ruler,
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
 * button is not a dialog. That Escape is CONSUMED, which is what lets this
 * control sit inside immersive mode without arming a trap: one press shuts the
 * menu, the next reaches the viewer's own Escape ladder and leaves the mode.
 *
 * IT OFFERS NINE ROWS FOR EIGHT THEMES. The first hands the decision back to
 * the machine (`System`) and the rest name a palette; `lib/theme-default.ts`
 * owns that preference and explains why it is a flag beside the theme rather
 * than an eighth entry in `THEMES`. Only one row is ever ticked: a followed
 * palette is named in the System row's hint, never by a second tick.
 *
 * ITS PANEL IS MEASURED, not placed by a class, and that is a deliberate
 * exception to the convention `ui/tooltip.tsx` states ("no positioning library,
 * no portal — callers place it where overflow allows"). That convention holds
 * for a control with one home. This one has two, at opposite ends of the
 * viewport, and the reader can be on a window shorter than the panel is tall —
 * so "where overflow allows" is not a property of the class list, it is a
 * property of the moment the menu opens. A static `bottom-full` places the
 * panel above the trigger whether or not there is room above the trigger; when
 * there is not, the rows above the fold are simply not there, with no scrollbar
 * to say so. `panelSide` stays as the PREFERENCE and the measurement overrides
 * it only when the preferred side cannot hold a useful amount of the list.
 *
 * No library and no portal even so: `position: fixed` off the trigger's own
 * rect, which escapes an `overflow-hidden` ancestor — and the five-notation
 * pane is `overflow-hidden` — because nothing between this control and the
 * viewport captures a fixed descendant.
 *
 * THAT LAST CLAUSE IS MAINTAINED BY HAND, and it is the assumption the whole
 * placement rests on: a `transform`, `filter`, `backdrop-filter`, `will-change`
 * or `contain` on any ancestor makes THAT element the containing block for a
 * fixed descendant, and the panel would be clipped to the pane again. The
 * ancestors are `viewer-shell.tsx`'s root, the two pane `<section>`s in
 * `view-playground.tsx`, and `ui/split-workbench.tsx`; none carries one today.
 * It is not pinned by a check because the utilities in question also appear
 * legitimately on LEAF elements in those same files (a chevron's
 * `transition-transform`), and a scan that cannot tell an ancestor from a leaf
 * would either miss the case or cry wolf — a check that does neither would have
 * to parse the JSX tree, which is more machinery than this one assumption is
 * worth. If a pane ever needs a blur, place the panel from a portal instead.
 *
 * IT HAS TWO HOMES. The site header is one; the other is the strip under an
 * immersive diagram, where the header is behind a fixed canvas and the theme
 * would otherwise be unreachable in the one mode meant for presenting — the
 * mode where a reader is most likely to want a different ground, because the
 * diagram is on somebody else's projector. `triggerClassName` and `panelSide`
 * exist for that second home; nothing else about the control changes.
 */
export function ThemeToggle({
  className,
  triggerClassName,
  panelSide = "down",
}: {
  className?: string;
  /* THE HOST'S METRICS, because this control has two homes with different
     ones. In the site header it is a 36px square beside a 36px nav toggle
     (`layout/header.tsx` forces that button's height for the same reason). In
     the strip under an immersive diagram it stands in a row of `h-8` controls,
     ghost on the playground's strip and outline on the C4 shell's — so the
     host passes the size and, where it matters, the border. One prop rather
     than a `variant` union: there are two callers, and neither wants a name
     for its combination. */
  triggerClassName?: string;
  /* Which way the menu opens, the same prop and the same reason as
     `viewer/share/share-button.tsx`: opened from a footer strip, a menu
     anchored `top-full` opens off the bottom of the pane. */
  panelSide?: "up" | "down";
}) {
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();
  const follows = useFollowSystem();
  const prefersDark = usePrefersDark();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /* MEASURED ON THE GESTURE, not in an effect. The click is the moment the
     trigger's position is known and the panel does not exist yet, so placing it
     here means the first frame the panel is painted in is already the right one
     — no hidden pass, no cascading render (which is also what
     `react-hooks/set-state-in-effect` asks for; measuring in a layout effect
     trips it). A keyboard Enter or Space arrives as a click too, so this covers
     both ways in. */
  const measure = useCallback(() => {
    const trigger = wrapperRef.current;
    if (trigger === null) return;
    const rect = trigger.getBoundingClientRect();
    setPlacement(
      placePanel({
        trigger: { top: rect.top, bottom: rect.bottom, right: rect.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        preferred: panelSide,
      }),
    );
  }, [panelSide]);

  /* RE-MEASURED WHILE OPEN, because the trigger moves under both of these and a
     panel left at last frame's coordinates is worse than one that never opened.
     Scroll is captured, so a scroll in any container between the trigger and
     the document is heard — the immersive footer does not scroll, the header's
     page does. */
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

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

  const following = hydrated ? follows : false;
  /* THE PINNED THEME, or `undefined` while the reader is following. Both rows
     cannot be ticked at once — the group is `menuitemradio` and there is one
     answer to "what did you choose" — so a followed palette is named in the
     System row's own hint rather than by a second tick further down the list. */
  const current =
    hydrated && !following ? (theme as Theme | undefined) : undefined;
  const resolved = THEME_META[themeForScheme(prefersDark)].label;
  /* WHAT THE TRIGGER ANNOUNCES, and it has to distinguish the two states: a
     reader on VoiceOver who is following the system and one who pinned high
     contrast both used to hear the same palette name, so the button gave no way
     to tell whether anything would change when the machine did. */
  const label = !hydrated
    ? "Theme"
    : following
      ? `Theme — follows your system (${resolved})`
      : current === undefined
        ? "Theme"
        : `Theme — ${THEME_META[current]?.label ?? current}`;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          if (!open) measure();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        className={cn(
          "af-theme-toggle relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground backdrop-blur",
          "transition-colors duration-200 hover:border-foreground/25 hover:bg-card hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
          triggerClassName,
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
          /* `fixed`, and every coordinate comes from `placement` — see the note
             on the module. `max-height` is the room actually available on the
             chosen side, so the list scrolls exactly when it does not fit and
             never spills past an edge. */
          style={placement?.style}
          className={cn(
            "af-glass fixed z-50 min-w-52 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg",
            /* HIDDEN FOR THE UNMEASURED FRAME rather than absent: the rows have
               to be in the DOM for the layout effect to have something to place,
               and `invisible` keeps them out of sight without taking them out of
               the tab order for the one frame nobody can interact with anyway. */
            placement === null && "invisible",
          )}
        >
          {/* FIRST, AND SEPARATED, because it is a different KIND of answer:
              every row below names a palette, this one hands the decision back
              to the machine. It is also the row a reader arrives already on —
              the default follows the system (`lib/theme-default.ts`) — so a
              menu that opened with `Light` ticked would have misrepresented the
              page on a first visit.

              ITS HINT NAMES WHAT IT CURRENTLY RESOLVES TO, which is the whole
              reason this row can exist without a `.system` palette: the class
              on <html> is always a real theme, so the row has something true to
              say instead of a mode nobody can see the value of. */}
          <ThemeRow
            Icon={Monitor}
            label="System"
            hint={`Follows your system · ${resolved.toLowerCase()} right now`}
            checked={following}
            onSelect={() => {
              writeFollowSystem(true);
              setTheme(themeForScheme(prefersDark));
              setOpen(false);
            }}
          />
          <span aria-hidden="true" className="my-1 block h-px bg-border" />
          {THEMES.map((name) => {
            const meta = THEME_META[name];
            return (
              <ThemeRow
                key={name}
                Icon={meta.Icon}
                label={meta.label}
                hint={meta.hint}
                checked={current === name}
                /* PINS, and the order matters: the flag has to be cleared
                   before `setTheme`, because the root's `FollowSystemTheme`
                   effect reads the flag when the OS changes and a reader who
                   has just chosen a palette must not have it overwritten at
                   sunset. */
                onSelect={() => {
                  writeFollowSystem(false);
                  setTheme(name);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One row of the menu.
 *
 * EXTRACTED WHEN THE SECOND KIND OF ROW ARRIVED, rather than copied: `System`
 * and a palette differ only in what selecting them does, and the markup carries
 * the radio semantics, the tick's reserved space (`invisible`, not absent, so
 * the label column does not shift as the choice moves) and the two-line label.
 * Two copies of that would be two places to keep a menu looking like one menu.
 */
function ThemeRow({
  Icon,
  label,
  hint,
  checked,
  onSelect,
}: {
  Icon: typeof Sun;
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
        checked ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[11px] leading-tight opacity-70">{hint}</span>
      </span>
      <Check
        aria-hidden="true"
        className={cn("ml-auto size-3.5 shrink-0", !checked && "invisible")}
      />
    </button>
  );
}
