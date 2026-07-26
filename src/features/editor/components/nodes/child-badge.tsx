"use client";

/**
 * "Has children" corner badge (AF-E2-S2 affordance, rendered by T2-A).
 * Presentation only — navigation is wired by the canvas's double-click
 * handler and T2-C's drill-down flows. `data-child-badge` is the stable hook
 * for those flows.
 */

import { cn } from "@/lib/utils";

export interface ChildBadgeProps {
  count: number;
  className?: string;
}

export function ChildBadge({
  count,
  className,
}: ChildBadgeProps): React.JSX.Element {
  const label = `Contains ${count} element${count === 1 ? "" : "s"} — double-click to open`;
  return (
    <span
      data-child-badge
      aria-label={label}
      title={label}
      className={cn(
        "absolute -top-2 -right-2 z-[2] flex h-5 min-w-5 items-center justify-center rounded-full border border-node-border bg-secondary px-1 text-[10px] leading-none font-semibold text-secondary-foreground shadow-sm",
        className,
      )}
    >
      {count}
    </span>
  );
}
