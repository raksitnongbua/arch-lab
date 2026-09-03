"use client";

/**
 * The resting announcement that a diagram has paths — one pill at the bottom
 * of the canvas, wearing the breadcrumb's skin, opening a menu of the walks
 * the author wrote.
 *
 * It sits exactly where the player will, because entering a path should
 * expand a control in place rather than send a reader hunting for a new one.
 * The menu therefore opens UPWARDS.
 *
 * A CONTROL, NOT PROSE. The alternative shapes all put sentences on the
 * drawing permanently: a bar naming every path, numbered chips along the top,
 * caption cards below the canvas. The commit before this feature deleted a
 * hint strip for exactly that reason — prose resting over a drawing whose
 * whole argument is that it is worth presenting. So the existence of paths is
 * announced by a control the size of the zoom cluster, and every word waits
 * until it is asked for.
 *
 * A diagram with no paths renders nothing at all, not a disabled control.
 */

import { Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { C4Path } from "@/types";

interface ViewerPathsPillProps {
  paths: readonly C4Path[];
  onEnter: (pathId: string) => void;
}

export function ViewerPathsPill({ paths, onEnter }: ViewerPathsPillProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dismissed by a click anywhere else and by Escape — but Escape is stopped
  // here rather than allowed to bubble, or one press would close the menu AND
  // take a rung off the canvas's ladder behind it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target) === true) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  if (paths.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // The count is part of the name, not a decoration beside it: "Paths"
        // alone does not tell a screen-reader user whether opening the menu is
        // worth the trip.
        aria-label={`Paths (${paths.length.toString()})`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-card/80 px-2 text-sm shadow-sm backdrop-blur transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Route aria-hidden="true" className="size-4 text-muted-foreground" />
        <span>Paths</span>
        <span
          aria-hidden="true"
          className="font-mono text-[10px] text-muted-foreground/70"
        >
          {paths.length}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          /* Upwards, and centred on the pill: the pill sits on the canvas's
             bottom edge, so a menu below it would open off-screen. */
          className="absolute bottom-full left-1/2 z-10 mb-1 flex max-w-[min(20rem,calc(100vw-2rem))] min-w-56 -translate-x-1/2 flex-col rounded-lg border border-border/70 bg-card/95 p-1 shadow-md backdrop-blur"
        >
          {paths.map((path) => (
            <button
              key={path.id}
              type="button"
              role="menuitem"
              // Beat count, not the "+N −N" the sketch carried: how much of the
              // diagram a path covers is unanswerable as a delta with nothing
              // to compare against, and the dim answers it one click later
              // anyway. How LONG the walk is, is the thing a reader wants
              // before committing to it.
              aria-label={`${path.title}, ${path.beats.length.toString()} beats`}
              onClick={() => {
                setOpen(false);
                onEnter(path.id);
              }}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="min-w-0 truncate">{path.title}</span>
              <span
                aria-hidden="true"
                className="shrink-0 font-mono text-[10px] text-muted-foreground/70"
              >
                {path.beats.length}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
