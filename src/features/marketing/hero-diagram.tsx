import type { SVGProps } from "react";

import { cn } from "@/lib/utils";
import { GolangIcon } from "@/features/editor/lib/icons/svg/golang";
import { NextjsIcon } from "@/features/editor/lib/icons/svg/nextjs";
import { PersonIcon } from "@/features/editor/lib/icons/svg/person";
import { PostgresqlIcon } from "@/features/editor/lib/icons/svg/postgresql";
import { RedisIcon } from "@/features/editor/lib/icons/svg/redis";

/**
 * Decorative hero visual: a miniature Container-level C4 diagram rendered
 * with the editor's real stack icons, stacked over two ghost "sheets" that
 * hint at the levels beneath (the Context→Container drill-down).
 *
 * Purely presentational — everything it depicts (levels, drill-down, JSON on
 * disk) is stated in the page copy — so the whole thing is `aria-hidden`.
 * It is fixed-size (24rem card) and only rendered at `lg:` and up; ghost
 * layers offset up/left only, so it can never introduce horizontal overflow.
 */
export function HeroDiagram({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative select-none", className)}>
      {/* Ghost sheets behind the card — the levels above the one in view. */}
      <div className="absolute inset-0 -translate-x-5 -translate-y-5 rounded-xl border border-dashed border-border/70 bg-card/30" />
      <div className="absolute inset-0 -translate-x-2.5 -translate-y-2.5 rounded-xl border border-border/60 bg-card/50" />

      {/* The sheet in view: Container level of a small system. */}
      <div className="relative w-96 overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-primary/5">
        {/* Faint canvas grid, matching the editor surface. */}
        <div
          className="absolute inset-0 opacity-[0.4] dark:opacity-[0.55]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 90% 90% at 50% 30%, black 30%, transparent 95%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 90% at 50% 30%, black 30%, transparent 95%)",
          }}
        />

        {/* Header: level breadcrumb + the file the model lives in. */}
        <div className="relative flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <p className="flex items-center gap-1.5 font-mono text-[10px]">
            <span className="text-muted-foreground">L1 Context</span>
            <span className="text-muted-foreground/50">›</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
              L2 Container
            </span>
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground/70">
            web-shop.c4.json
          </p>
        </div>

        {/* Diagram area: fixed 350×336 coordinate space. */}
        <div className="relative m-4 h-[336px]">
          <Edges className="absolute inset-0 h-full w-full text-muted-foreground/70" />

          {/* Person, outside the boundary. */}
          <div className="absolute top-0 left-[280px] flex w-[72px] flex-col items-center gap-1">
            <span className="grid size-9 place-items-center rounded-full border border-border bg-secondary/70 text-muted-foreground">
              <PersonIcon className="size-4.5" />
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              Customer
            </span>
          </div>

          <MiniNode
            icon={NextjsIcon}
            name="Web App"
            tech="Next.js · SSR"
            className="top-[46px] left-0"
          />
          <MiniNode
            icon={GolangIcon}
            name="API Service"
            tech="Go · REST"
            className="top-[128px] left-[184px]"
          />
          <MiniNode
            icon={PostgresqlIcon}
            name="Orders DB"
            tech="PostgreSQL"
            className="top-[224px] left-0"
          />
          <MiniNode
            icon={RedisIcon}
            name="Session Cache"
            tech="Redis"
            className="top-[252px] left-[184px]"
          />
        </div>
      </div>
    </div>
  );
}

function MiniNode({
  icon: Icon,
  name,
  tech,
  className,
}: {
  icon: React.FC<SVGProps<SVGSVGElement>>;
  name: string;
  tech: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute w-36 rounded-lg border border-border bg-card p-2.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs leading-4 font-medium text-foreground">
            {name}
          </p>
          <p className="truncate font-mono text-[10px] leading-4 text-muted-foreground">
            {tech}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Connecting arrows, drawn in the same fixed 350×336 space as the nodes so
 * they meet node edges exactly at every rendering (the card never scales).
 */
function Edges(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 350 336" fill="none" {...props}>
      <defs>
        <marker
          id="hero-diagram-arrow"
          viewBox="0 0 8 8"
          refX="6.5"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M1.5 1 L6.5 4 L1.5 7"
            stroke="currentColor"
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
      <g
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        markerEnd="url(#hero-diagram-arrow)"
      >
        {/* Customer → Web App */}
        <path d="M 276 22 C 232 28 192 42 152 64" />
        {/* Web App → API Service */}
        <path d="M 72 102 C 72 138 130 150 176 153" />
        {/* API Service → Orders DB */}
        <path d="M 212 188 C 212 220 182 244 152 250" />
        {/* API Service → Session Cache */}
        <path d="M 276 188 L 276 244" />
      </g>
    </svg>
  );
}
