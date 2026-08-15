"use client";

/**
 * Switches the stack icons between their brand colours and a single ink.
 *
 * WHY IT SITS BESIDE THE ZOOM PILL rather than in the site header next to the
 * theme toggle, which is its closest sibling in kind: the preference only
 * means something where a diagram is on screen. In the header it would ride
 * along to `/mcp`, `/syntax` and `/validate` and do nothing on any of them,
 * which is how a control teaches people to stop reading the toolbar. The three
 * canvases that already show a zoom pill are exactly the three surfaces where
 * icons are drawn.
 *
 * IT IS A BUTTON, NOT A MENU. There are two states and no third one coming, so
 * a popover would add a click to every switch in order to present a choice the
 * label already makes. `aria-pressed` carries the state, and the label names
 * the DESTINATION rather than the current value — "Colour icons" on a button
 * that turns colour on — because a toggle labelled with its current state is
 * the classic ambiguity where nobody can tell whether it is a status or an
 * action.
 *
 * The count of marks that cannot go mono is disclosed in the tooltip rather
 * than hidden: a reader who switches to mono and still sees a few logos in
 * colour is looking at a licence boundary (registry.ts), not a bug, and being
 * told so costs one clause.
 */

import { Contrast, Palette } from "lucide-react";
import { useSyncExternalStore } from "react";

import { ZOOM_READOUT_CLASSES } from "@/components/ui/zoom-pill";
import { iconsWithoutMono } from "@/features/editor/lib/icons/registry";
import { useIconStyle } from "@/lib/icon-style";
import { cn } from "@/lib/utils";

const NOOP_SUBSCRIBE = () => () => {};

/**
 * `false` during SSR and the hydration render (same rationale as
 * `theme-toggle.tsx`). The BUTTON is live either way — only the tooltip waits,
 * because until hydration the stored preference is unknown and a tooltip
 * describing the wrong destination is worse than a plain one.
 */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );
}

export function IconStyleToggle({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  const [style, setStyle] = useIconStyle();
  const hydrated = useIsHydrated();

  const goingMono = style === "colour";
  const label = goingMono ? "Mono icons" : "Colour icons";

  /* Computed per render rather than at module scope: the registry throws on a
     duplicate slug while it initialises, and doing that work inside a
     component keeps the failure on the page that caused it. The list is 54
     entries — filtering it is cheaper than the memo would be. */
  const stranded = goingMono ? iconsWithoutMono().length : 0;
  const title = !hydrated
    ? label
    : goingMono && stranded > 0
      ? `${label} — ${stranded} marks stay in colour (no monochrome artwork is published for them)`
      : label;

  return (
    <button
      type="button"
      onClick={() => setStyle(goingMono ? "mono" : "colour")}
      aria-pressed={style === "mono"}
      aria-label={label}
      title={title}
      className={cn(
        ZOOM_READOUT_CLASSES,
        "inline-flex items-center gap-1.5 px-2",
        className,
      )}
    >
      {style === "mono" ? (
        <Contrast aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <Palette aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span>{style === "mono" ? "Mono" : "Colour"}</span>
    </button>
  );
}
