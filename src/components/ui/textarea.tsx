import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = ComponentProps<"textarea">;

/**
 * Multiline text primitive. Frozen after Batch 1. Same
 * pass-through philosophy as `Input`: all native props (and `ref`) flow
 * through, so `maxLength`, `rows`, controlled value etc. need no wrapper API.
 */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
