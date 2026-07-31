"use client";

/**
 * Canvas overlay: the way back up. A back control plus a breadcrumb that both
 * climbs the path and states the C4 altitude of each hop.
 *
 * One control, not two. The breadcrumb IS the level path — `Coffee Shop ▸ Web
 * App` is L1 ▸ L2 — so the level rides on each crumb as an `L<n>` badge rather
 * than in a separate readout that repeated the same fact.
 */

import { ChevronRight, CornerLeftUp } from "lucide-react";

import { C4_LEVEL_META } from "@/lib/constants";

import type { Crumb } from "../lib/model";

export interface ViewerToolbarProps {
  /** Root-first trail; the last entry is the current diagram. */
  crumbs: Crumb[];
  /** Climb to an ancestor diagram. */
  onNavigate: (diagramId: string) => void;
}

export function ViewerToolbar({
  crumbs,
  onNavigate,
}: ViewerToolbarProps): React.JSX.Element {
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

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
              const meta = C4_LEVEL_META.find(
                (entry) => entry.level === crumb.level,
              );
              // `L2` rides inside the crumb's own text so it is part of the
              // accessible name — the level is information, not decoration, and
              // it replaces the readout that used to carry it separately.
              const badge =
                meta === undefined ? null : (
                  <span className="ml-1 shrink-0 font-mono text-[10px] text-muted-foreground/70">
                    L{meta.order}
                  </span>
                );
              const title =
                meta === undefined
                  ? crumb.label
                  : `${crumb.label} — ${meta.label} (level ${meta.order.toString()} of 4)`;
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
                      title={title}
                      className="flex min-w-0 items-baseline rounded-md px-1.5 py-0.5 font-medium text-foreground"
                    >
                      <span className="truncate">{crumb.label}</span>
                      {badge}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate(crumb.diagramId)}
                      title={title}
                      className="flex min-w-0 items-baseline rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="truncate">{crumb.label}</span>
                      {badge}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* The four-pill level indicator that used to sit here is gone. It read
          as a tab strip — pill container, current one filled, the rest greyed —
          but every pill was a `<span>`, so clicking did nothing. Worse, it
          could not become tabs: below Context a C4 level is not one diagram
          (there is a component view per container), so "L3 Component" has no
          unique destination in any model with two containers.

          It also duplicated the breadcrumb beside it. `Coffee Shop ▸ Web App`
          IS L1 ▸ L2, and those crumbs were already buttons that navigate. The
          level now rides on each crumb, so one control carries the path, the
          altitude and the navigation, and nothing on screen invites a click it
          cannot honour. */}
    </div>
  );
}
