"use client";

/**
 * Canvas overlay: the way back up. A back control + breadcrumb (both climb),
 * and the C4 level indicator showing where in the four altitudes you are.
 */

import { ChevronRight, CornerLeftUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { C4_LEVEL_META } from "@/lib/constants";
import type { C4Level } from "@/types";

import type { Crumb } from "../lib/model";

export interface ShowcaseToolbarProps {
  /** Root-first trail; the last entry is the current diagram. */
  crumbs: Crumb[];
  currentLevel: C4Level;
  /** Climb to an ancestor diagram. */
  onNavigate: (diagramId: string) => void;
}

export function ShowcaseToolbar({
  crumbs,
  currentLevel,
  onNavigate,
}: ShowcaseToolbarProps): React.JSX.Element {
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const currentMeta = C4_LEVEL_META.find((meta) => meta.level === currentLevel);

  return (
    <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2">
      {/* ---- back + breadcrumb ---- */}
      <div className="flex min-w-0 items-center gap-1 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          disabled={parent === null}
          onClick={() => parent !== null && onNavigate(parent.diagramId)}
          aria-label={
            parent !== null
              ? `Zoom out to ${parent.label} (Escape)`
              : "Already at the top level"
          }
          title={
            parent !== null ? `Zoom out to ${parent.label} (Esc)` : undefined
          }
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <CornerLeftUp aria-hidden="true" className="size-4" />
        </button>
        <nav aria-label="Diagram path" className="min-w-0">
          <ol className="flex min-w-0 items-center overflow-x-auto text-sm whitespace-nowrap">
            {crumbs.map((crumb, index) => {
              const isCurrent = index === crumbs.length - 1;
              return (
                <li key={crumb.diagramId} className="flex min-w-0 items-center">
                  {index > 0 ? (
                    <ChevronRight
                      aria-hidden="true"
                      className="mx-0.5 size-3.5 shrink-0 text-muted-foreground/50"
                    />
                  ) : null}
                  {isCurrent ? (
                    <span
                      aria-current="page"
                      className="truncate rounded-md px-1.5 py-0.5 font-medium text-foreground"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate(crumb.diagramId)}
                      className="truncate rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {crumb.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* ---- level indicator ---- */}
      <div
        role="status"
        aria-label={
          currentMeta !== undefined
            ? `C4 level ${currentMeta.order} of 4 — ${currentMeta.label}`
            : undefined
        }
        className="flex items-center gap-1 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur"
      >
        {C4_LEVEL_META.map((meta) => {
          const isActive = meta.level === currentLevel;
          return (
            <span
              key={meta.level}
              aria-hidden="true"
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground/60",
              )}
            >
              <span className="font-mono">L{meta.order}</span>
              <span
                className={cn("ml-1", isActive ? "inline" : "hidden md:inline")}
              >
                {meta.label}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
