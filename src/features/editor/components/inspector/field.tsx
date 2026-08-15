"use client";

/**
 * Layout primitives for the inspector: a titled section and a
 * labelled field row. Every control in the panel renders through `Field`, so
 * labels, spacing and the label→control `htmlFor` wiring stay consistent.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function InspectorSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Field({
  id,
  label,
  hint,
  children,
}: {
  /** The control's element id — the label points at it. */
  id: string;
  label: string;
  /** Right-aligned helper next to the label (e.g. a character counter). */
  hint?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
        </label>
        {hint !== undefined ? (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
