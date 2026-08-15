import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type InputProps = ComponentProps<"input">;

/**
 * Text input primitive. Frozen after Batch 1 — the inspector,
 * icon picker and quick-add menu all build on this exact surface. It is a thin
 * wrapper over the native element: every native prop (including `ref`, which
 * React 19 passes as a normal prop) flows through unchanged.
 */
export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
