"use client";

/**
 * The minimap's switch, first in the navigation cluster — Miro puts its map
 * control in the same place, at the same end.
 *
 * IT IS THE ROUTE TO THE FEATURE, not a convenience beside one. The map is
 * closed on arrival (`use-minimap.ts` argues why), so with no button there is
 * nothing on screen saying a map exists and `m` is a secret. The accessible
 * name is therefore the STATE plus the action, and `aria-pressed` carries the
 * state for a screen reader rather than leaving it to the icon.
 *
 * The key is named in the tooltip for the reason the zoom buttons name their
 * gesture: a shortcut a reader can only learn from a sheet is a shortcut most
 * readers never learn, and this viewer has no sheet.
 */

import { Map as MapIcon } from "lucide-react";

import { ZOOM_BUTTON_CLASSES } from "./zoom-pill";
import { cn } from "@/lib/utils";

export function MinimapToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={open}
        aria-label={open ? "Hide the minimap" : "Show the minimap"}
        title={open ? "Hide the minimap (M)" : "Show the minimap (M)"}
        className={cn(
          ZOOM_BUTTON_CLASSES,
          open && "bg-secondary text-foreground",
        )}
      >
        <MapIcon aria-hidden="true" className="size-4" />
      </button>
      {/* A hairline, for the reason the icon-style toggle has one at the other
          end: showing a map is a different KIND of act from stepping the zoom,
          and without a divider it reads as another zoom control. */}
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/70" />
    </>
  );
}
