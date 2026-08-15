import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** Tooltip body. Plain text keeps it accessible; short nodes are fine too. */
  content: ReactNode;
  side?: TooltipSide;
  /** The trigger. Rendered inline; hover or keyboard focus reveals the tip. */
  children: ReactNode;
  className?: string;
}

const SIDE_CLASSES: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
};

/**
 * CSS-only tooltip primitive. Frozen after Batch 1. Reveals
 * on hover and on keyboard focus within the trigger; no positioning library,
 * no portal — callers place it where overflow allows. The transition collapses
 * to an instant change under `prefers-reduced-motion` via globals.css.
 */
export function Tooltip({
  content,
  side = "top",
  children,
  className,
}: TooltipProps) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-40 w-max max-w-64 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
          "opacity-0 transition-opacity duration-150",
          "group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100",
          SIDE_CLASSES[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
