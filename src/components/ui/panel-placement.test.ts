import { describe, expect, it } from "vitest";

import {
  PANEL_GAP,
  PANEL_MIN_USEFUL,
  placePanel,
} from "@/components/ui/panel-placement";

/**
 * THE BUG THIS FUNCTION EXISTS FOR, as a fixture: the theme dial in the strip
 * under an immersive diagram. A `h-8` control at the bottom of a 900px window
 * has plenty of room above it; the same control on a 320px-tall window has 260px
 * above and nothing below, and the static `bottom-full` it used to carry placed
 * a ~380px panel there either way.
 */
const footerTrigger = (viewportHeight: number) => ({
  trigger: { top: viewportHeight - 40, bottom: viewportHeight - 8, right: 800 },
  viewport: { width: 820, height: viewportHeight },
  preferred: "up" as const,
});

describe("placePanel — the side it chooses", () => {
  it("honours the preferred side when there is room for a useful list", () => {
    const { side, style } = placePanel(footerTrigger(900));
    expect(side).toBe("up");
    // Anchored by its BOTTOM edge, which is what opening upward means.
    expect(style.bottom).toBe(900 - (900 - 40) + PANEL_GAP);
    expect(style.top).toBeUndefined();
  });

  it("keeps the preferred side even when the other has more room", () => {
    // A dial near the TOP of the window, still asking to open upward. There is
    // more room below, but 260px above is enough for a list you can use — and a
    // panel that flips sides between openings is harder to use than one that
    // scrolls.
    const { side } = placePanel({
      trigger: { top: 300, bottom: 332, right: 800 },
      viewport: { width: 820, height: 900 },
      preferred: "up",
    });
    expect(300 - PANEL_GAP).toBeGreaterThanOrEqual(PANEL_MIN_USEFUL);
    expect(side).toBe("up");
  });

  it("flips when the preferred side cannot hold a useful list", () => {
    // The reported failure: no usable room above, so the panel goes below
    // rather than being placed where it cannot be seen.
    const { side, style } = placePanel({
      trigger: { top: 60, bottom: 92, right: 800 },
      viewport: { width: 820, height: 900 },
      preferred: "up",
    });
    expect(side).toBe("down");
    expect(style.top).toBe(92 + PANEL_GAP);
    expect(style.bottom).toBeUndefined();
  });

  it("takes the larger side when both are cramped", () => {
    // 260px tall — a phone in landscape with browser chrome. The dial at the
    // bottom leaves 214px above and 2px below: neither side clears the floor,
    // so the answer is the one with more room, and the panel scrolls inside it
    // rather than being placed where it cannot be seen.
    const { side, style } = placePanel(footerTrigger(260));
    expect(side).toBe("up");
    expect(style.maxHeight).toBe(260 - 40 - PANEL_GAP);
    expect(style.maxHeight).toBeLessThan(PANEL_MIN_USEFUL);
  });
});

describe("placePanel — the box it asks for", () => {
  it("caps the height at the room actually available", () => {
    // This is the half that fixes the clipping rather than the placement: an
    // uncapped panel inside an `overflow-hidden` pane loses its far rows with
    // no scrollbar to say so.
    expect(placePanel(footerTrigger(900)).style.maxHeight).toBe(
      900 - 40 - PANEL_GAP,
    );
  });

  it("aligns the panel's right edge with the trigger's", () => {
    // Both of this control's homes put it at the right end of a row, so a
    // left-aligned panel would hang off the one edge with no room to spare.
    expect(placePanel(footerTrigger(900)).style.right).toBe(820 - 800);
  });

  it("never asks for a negative box", () => {
    // A trigger can sit outside the viewport mid-scroll or mid-transition. A
    // negative `max-height` is not a smaller panel: the browser drops the
    // declaration, leaving a full-height panel hanging off the edge — this
    // function's own bug, arriving through the fix.
    const { style } = placePanel({
      trigger: { top: -400, bottom: -368, right: 1200 },
      viewport: { width: 820, height: 900 },
      preferred: "up",
    });
    expect(style.right).toBeGreaterThanOrEqual(0);
    expect(style.maxHeight).toBeGreaterThanOrEqual(0);
    expect(style.top ?? style.bottom ?? 0).toBeGreaterThanOrEqual(0);
  });
});
