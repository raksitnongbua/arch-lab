import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "outline" | "accent";

const VARIANTS: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground border-transparent",
  outline: "bg-transparent text-muted-foreground border-border",
  accent: "bg-accent/12 text-accent border-accent/25",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
