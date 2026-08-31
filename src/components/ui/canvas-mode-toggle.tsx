"use client";

/**
 * The drag-mode toggle: what a bare drag on the canvas BACKGROUND does on an
 * EDITABLE canvas — Select (drag draws the marquee) or Pan (drag moves the
 * camera). Select is the default: the toggle exists only where the canvas can
 * be edited, and a reader who unlocked it did so to edit.
 *
 * SHARED BY TWO CANVASES, which is why it sits in `components/ui` rather than
 * inside the C4 feature it was written for. The flowchart canvas grew the same
 * marquee-then-group gesture, and `dry.md` puts code two features use here —
 * the move `DockRow` already made. A second copy would have been the third
 * thing on this canvas to drift.
 *
 * AN EXPLICIT MODE, NOT A HELD KEY. This replaced hold-Space-to-pan, which was
 * reported broken three times and survived two attempted fixes, because a held
 * key depends on keyboard state and focus — a flag mirrored from window
 * listeners, released by keyup and by blur, yielded to whichever control
 * happened to hold focus. A visible mode depends on neither, is discoverable
 * where a hidden keystroke is not, and works on touch, which has no Space key.
 *
 * A RADIO GROUP, not two `aria-pressed` buttons, because the two modes are
 * mutually exclusive states and exactly one is always active — which is
 * precisely what `role="radio"` + `aria-checked` says. Two pressed-state
 * buttons can both honestly read "not pressed" for a moment mid-update, and a
 * screen reader hearing "Select, toggle button, not pressed" has to infer the
 * active mode from the OTHER button. (The canvas lock deliberately avoids
 * `aria-pressed` because its name is an ACTION; these names are STATES, so the
 * checked semantics are the honest ones here.) Roving tabindex per the radio
 * pattern: one Tab stop, arrows switch — and the arrow handler prevents the
 * default so the canvas's nudge listener, which respects `defaultPrevented`,
 * never moves a selected node while the reader is switching modes.
 *
 * ICONS REPORT THE STATE, unlike the icon-only lock beside the details panel,
 * whose faces had to carry an action: a mode is a state, so the checked
 * highlight IS the answer to "which mode am I in" — and the pane's cursor
 * (crosshair / grab) repeats it on the canvas itself.
 */

import { useRef } from "react";
import { Hand, MousePointer2 } from "lucide-react";

import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_PILL_CLASSES,
} from "@/components/ui/zoom-pill";
import { cn } from "@/lib/utils";

/** What a bare drag on the pane does. The canvas owns the state; the toggle
 * only draws and switches it. */
export type CanvasDragMode = "select" | "pan";

/* Name = the mode word plus what dragging then does, one string for
 * `aria-label` and `title` (the lock's rule: hover and assistive tech must
 * not drift apart). The state word leads so a screen reader scanning the
 * group hears the two choices before their explanations. */
const MODE_NAME: Record<CanvasDragMode, string> = {
  select: "Select — drag draws a selection box",
  pan: "Pan — drag moves the view",
};

export function CanvasModeToggle({
  mode,
  onModeChange,
}: {
  mode: CanvasDragMode;
  onModeChange: (mode: CanvasDragMode) => void;
}): React.JSX.Element {
  const selectRef = useRef<HTMLButtonElement>(null);
  const panRef = useRef<HTMLButtonElement>(null);

  /* The radio pattern's arrow behaviour: any arrow moves to and SELECTS the
     other option (there are only two, so next and previous are the same
     button). Focus follows explicitly — the roving tabindex below re-aims
     Tab, but does not move focus by itself. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }
    event.preventDefault();
    const next: CanvasDragMode = mode === "select" ? "pan" : "select";
    onModeChange(next);
    (next === "pan" ? panRef : selectRef).current?.focus();
  };

  const option = (
    value: CanvasDragMode,
    ref: React.RefObject<HTMLButtonElement | null>,
    Icon: typeof MousePointer2,
  ) => {
    const checked = mode === value;
    return (
      <button
        type="button"
        ref={ref}
        role="radio"
        aria-checked={checked}
        tabIndex={checked ? 0 : -1}
        onClick={() => onModeChange(value)}
        aria-label={MODE_NAME[value]}
        title={MODE_NAME[value]}
        className={cn(
          ZOOM_BUTTON_CLASSES,
          /* The checked face is the primary tint the canvas's other "you are
             here" affordances use (the marquee's fill, the selection ring),
             and it must survive hover: `cn` resolves the conflict with the
             base hover in favour of these, so pointing at the active option
             never repaints it as inactive. */
          checked &&
            "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
    );
  };

  return (
    <div
      role="radiogroup"
      aria-label="What dragging the canvas does"
      onKeyDown={handleKeyDown}
      className={ZOOM_PILL_CLASSES}
    >
      {option("select", selectRef, MousePointer2)}
      {option("pan", panRef, Hand)}
    </div>
  );
}
