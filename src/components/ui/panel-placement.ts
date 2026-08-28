/**
 * Where a menu panel goes when a class list cannot say.
 *
 * `ui/tooltip.tsx` states this repo's convention — "no positioning library, no
 * portal — callers place it where overflow allows" — and it holds for every
 * control with ONE home. The theme dial has two, at opposite ends of the
 * viewport, and a reader can be on a window shorter than its panel is tall. A
 * static `bottom-full` places the panel above the trigger whether or not there
 * is room above the trigger; when there is not, the rows past the edge are
 * simply not there, with no scrollbar to say anything is missing.
 *
 * So the side is a QUESTION ABOUT THE MOMENT, not about the class list. This is
 * that question, as arithmetic over two rectangles: pure, so the answer can be
 * asserted rather than eyeballed (`panel-placement.test.ts`), and dependency-
 * free, so the convention above is bent exactly as far as one control needed
 * and no further.
 *
 * WHAT IT DOES NOT DO is collision-detect against anything but the viewport,
 * flip horizontally, or reposition on its own. Callers re-measure on resize and
 * scroll; anything more is the positioning library this deliberately is not.
 */

/** The gap between trigger and panel — the `mb-1.5`/`mt-1.5` this replaced. */
export const PANEL_GAP = 6;

/**
 * How much of a list has to fit for a side to be worth using: roughly five rows
 * of the theme menu's eight.
 *
 * IT IS A FLOOR, NOT A TARGET, and the asymmetry is the point. Above it the
 * PREFERRED side wins even when the other side has more room, because a panel
 * that jumps from above the trigger to below it between two openings is harder
 * to use than one that scrolls. Below it the panel would read as a scrap of a
 * menu, and the other side — even a cramped one — is the better answer.
 */
export const PANEL_MIN_USEFUL = 240;

export interface PanelPlacement {
  /** Which side of the trigger the panel ended up on. */
  side: "up" | "down";
  /**
   * Coordinates for a `position: fixed` panel, in px. `right` aligns the
   * panel's right edge with the trigger's — both of this control's homes put it
   * at the right end of a row, so a left-aligned panel would hang off the one
   * edge with no room to spare. `maxHeight` is the room actually available on
   * the chosen side, which is what makes the list scroll exactly when it does
   * not fit and never spill past an edge.
   */
  style: {
    right: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  };
}

/**
 * Place a panel against its trigger inside a viewport.
 *
 * `trigger` and `viewport` are plain numbers rather than a `DOMRect` and a
 * `Window` so this can be exercised without a DOM — the caller reads both off
 * the browser and hands them over.
 */
export function placePanel({
  trigger,
  viewport,
  preferred,
}: {
  trigger: { top: number; bottom: number; right: number };
  viewport: { width: number; height: number };
  preferred: "up" | "down";
}): PanelPlacement {
  const room = {
    up: trigger.top - PANEL_GAP,
    down: viewport.height - trigger.bottom - PANEL_GAP,
  };
  const other = preferred === "up" ? "down" : "up";
  const side =
    room[preferred] >= PANEL_MIN_USEFUL || room[preferred] >= room[other]
      ? preferred
      : other;

  /* CLAMPED AT ZERO, all three. A trigger can sit partly outside the viewport
     mid-scroll or mid-transition, and a negative `max-height` is not a smaller
     panel — it is an invalid declaration the browser drops, which is a panel at
     its full height hanging off the edge: the bug this function exists to fix,
     arriving through the fix. */
  return {
    side,
    style: {
      right: Math.max(0, viewport.width - trigger.right),
      maxHeight: Math.max(0, room[side]),
      ...(side === "up"
        ? { bottom: Math.max(0, viewport.height - trigger.top + PANEL_GAP) }
        : { top: Math.max(0, trigger.bottom + PANEL_GAP) }),
    },
  };
}
