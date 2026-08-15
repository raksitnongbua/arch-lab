import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectProps = ComponentProps<"select">;

/**
 * Native-`<select>` primitive with consistent chrome. Frozen after Batch 1
 *. Deliberately native rather than a listbox re-
 * implementation: the inspector's `type` / `direction` / `style` fields need
 * keyboard and screen-reader behaviour that the platform already gets right.
 * Options are passed as regular `<option>` children.
 */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <span className={cn("relative inline-flex w-full", className)}>
      <select
        className={cn(
          "h-9 w-full cursor-pointer appearance-none rounded-md border border-input bg-transparent pr-8 pl-3 text-sm text-foreground shadow-sm transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&>option]:bg-popover [&>option]:text-popover-foreground",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
