"use client";

/**
 * The zoom READOUT, as a menu rather than a one-shot button.
 *
 * It used to be a button that reset to 100%, which is the least useful thing
 * a percentage can do: it told you where you were and offered exactly one
 * place to go. Every drawing tool people already use — Figma, Sketch, a PDF
 * reader — makes the readout the control, and the reason is that "show me
 * this at 200%" is a destination, not a number of `+` presses. The `+`/`−`
 * buttons stay for nudging; this is for arriving.
 *
 * PRESETS ARE FILTERED BY THE CANVAS'S OWN CLAMP, not shared: the editor
 * reaches 400% and the C4 viewer stops at 250% (each argued in its
 * `canvas-constants.ts`), and offering a menu item that silently lands
 * somewhere else would be worse than not offering it. Pass `maxZoom` and any
 * preset above it is dropped.
 *
 * Keyboard and dismissal are deliberately plain: a `<details>`-free popover
 * with Escape-to-close, click-outside-to-close, and real `<button>` rows, so
 * it works with the keyboard without owning a focus trap. It is a five-item
 * menu over a canvas, not a dialog.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";

import { ZOOM_READOUT_CLASSES } from "@/components/ui/zoom-pill";
import { cn } from "@/lib/utils";

/**
 * The scales worth one click. `null` is "fit" — always first, because it is
 * the only entry that depends on the diagram rather than on a number, and it
 * is what you want after getting lost.
 */
const PRESETS: readonly { label: string; scale: number | null }[] = [
  { label: "Fit", scale: null },
  { label: "50%", scale: 0.5 },
  { label: "100%", scale: 1 },
  { label: "200%", scale: 2 },
  { label: "400%", scale: 4 },
];

export function ZoomMenu({
  percent,
  isFit,
  maxZoom,
  onFit,
  onZoomTo,
  title,
}: {
  /** Current zoom, already rounded to a percentage. */
  percent: number;
  /** True when the canvas is in its fitted state rather than at a scale. */
  isFit: boolean;
  /** The canvas's own upper clamp, as a multiplier (2.5 = 250%). */
  maxZoom: number;
  onFit: () => void;
  onZoomTo: (scale: number) => void;
  /** Tooltip for the readout button. */
  title: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /* One listener pair while open, none while closed. `pointerdown` rather
     than `click` so the menu is gone before the canvas beneath it reacts —
     otherwise dismissing the menu also pans or clears a selection. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Consumed, so this Escape does not also clear the canvas's selection
      // or leave immersive mode — one press, one step, same ladder rule the
      // sequence playground documents.
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

  const choose = (scale: number | null): void => {
    setOpen(false);
    if (scale === null) onFit();
    else onZoomTo(scale);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={`Zoom ${isFit ? "fitted to view" : `${percent} percent`} — choose a zoom level`}
        title={title}
        className={ZOOM_READOUT_CLASSES}
      >
        {isFit ? "Fit" : `${percent}%`}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Zoom level"
          /* Opens UPWARD: the pill is pinned to the bottom-left of a canvas,
             so a downward menu would open off the bottom edge. */
          className="absolute bottom-full left-0 z-20 mb-1.5 min-w-28 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {PRESETS.filter(
            (preset) => preset.scale === null || preset.scale <= maxZoom,
          ).map((preset) => {
            const current =
              preset.scale === null
                ? isFit
                : !isFit && percent === Math.round(preset.scale * 100);
            return (
              <button
                key={preset.label}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onClick={() => choose(preset.scale)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                  current
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Check
                  aria-hidden="true"
                  className={cn("size-3 shrink-0", !current && "invisible")}
                />
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
