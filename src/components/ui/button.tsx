import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 shadow-sm shadow-primary/25",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-secondary/60 hover:border-foreground/25",
  ghost: "bg-transparent text-muted-foreground hover:text-foreground",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-base gap-2",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * The button's class string on its own, for elements that must stay a different
 * tag — most often `next/link`. Keeps us off a Slot/`asChild` dependency.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], className);
}

const BUTTON_BASE = [
  "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-all duration-200",
  "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:pointer-events-none disabled:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
].join(" ");

/**
 * Minimal button primitive. Deliberately hand-rolled rather than pulled from a
 * component library — it uses the same semantic tokens shadcn/ui expects, so a
 * real shadcn `button` can replace this file later without touching callers.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
