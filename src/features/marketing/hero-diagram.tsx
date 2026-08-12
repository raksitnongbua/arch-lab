import type { CSSProperties, SVGProps } from "react";

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
 * It assembles itself on load — sheets settle, boxes land one at a time,
 * connectors draw toward their arrowheads — and then keeps a slow current
 * running along the edges, so the arrows read as traffic rather than
 * decoration. The motion is pure CSS (see the "Hero diagram motion" block in
 * globals.css); this file only owns the choreography, as `animationDelay`
 * values on the elements themselves, so the running order can be read top to
 * bottom here. That keeps the component a server component — no client
 * bundle, no hydration — and the global `prefers-reduced-motion` rule plus
 * the explicit opt-outs in that CSS block settle everything onto its final
 * frame for anyone who asks for less movement.
 *
 * Purely presentational — everything it depicts (levels, drill-down, JSON on
 * disk) is stated in the page copy — so the whole thing is `aria-hidden`.
 * It is fixed-size (24rem card) and only rendered at `lg:` and up; ghost
 * layers offset up/left only, so it can never introduce horizontal overflow.
 */

/** One beat of the assembly, in ms — everything below is expressed in these. */
const BEAT = {
  sheets: 0,
  card: 80,
  header: 320,
  /** Nodes land in reading order: the actor first, then down the stack. */
  nodes: [420, 500, 580, 660, 740],
  /** Each connector starts as its target lands, so the box "pulls" the line. */
  edges: [560, 700, 840, 920],
  /** The arrowhead appears as the line reaches it: edge delay + draw time. */
  drawMs: 620,
  /** The ambient current only begins once the drawing has finished. */
  flow: 1800,
} as const;

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

export function HeroDiagram({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative select-none", className)}>
      {/* Ambient bloom under the whole stack, so the card sits in light rather
          than on a flat panel. `blur-3xl` on a static element is painted once
          and never re-rasterised — nothing here animates, unlike the edges. */}
      {/* Painted first, so DOM order alone puts it behind the sheets and the
          card. A negative z-index would risk dropping it behind an ancestor's
          background instead of merely behind its siblings. */}
      <div className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-gradient-to-br from-primary/12 via-transparent to-accent/12 blur-3xl" />

      {/* Ghost sheets behind the card — the levels above the one in view. */}
      <div
        style={delay(BEAT.sheets + 90)}
        className="af-hero-sheet absolute inset-0 -translate-x-5 -translate-y-5 rounded-xl border border-dashed border-border/70 bg-card/30"
      />
      <div
        style={delay(BEAT.sheets)}
        className="af-hero-sheet absolute inset-0 -translate-x-2.5 -translate-y-2.5 rounded-xl border border-border/60 bg-card/50"
      />

      {/* The sheet in view: Container level of a small system. */}
      <div
        style={delay(BEAT.card)}
        className="af-hero-card relative w-96 overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-primary/5"
      >
        {/* Faint canvas grid, matching the editor surface. Drifting by exactly
            one cell keeps the loop seamless — the pattern repeats onto itself. */}
        <div
          className="af-hero-grid absolute inset-0 opacity-[0.4] dark:opacity-[0.55]"
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

        {/* Sheen over the grid: the faintest diagonal tint, enough to stop the
            card reading as a flat rectangle without competing with the nodes. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/6 via-transparent to-accent/8" />

        {/* Header: level breadcrumb + the file the model lives in. */}
        <div className="relative flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <p className="flex items-center gap-1.5 font-mono text-[10px]">
            <span
              style={delay(BEAT.header)}
              className="af-hero-fade text-muted-foreground"
            >
              L1 Context
            </span>
            <span
              style={delay(BEAT.header + 60)}
              className="af-hero-fade text-muted-foreground/50"
            >
              ›
            </span>
            <span
              style={delay(BEAT.header + 120)}
              className="af-hero-node rounded bg-gradient-to-r from-primary/22 to-accent/16 px-1.5 py-0.5 font-medium text-primary"
            >
              L2 Container
            </span>
          </p>
          {/* The document KINDS, with the one on screen lit. The card used to
              end in `web-shop.c4.json` — an extension this project has never
              had (models are `.alab` or `.archlab.json`), and a filename says
              nothing a reader needs anyway. Naming both kinds instead is what
              stops the banner reading as a C4-only product now that sequence
              diagrams ship. Decorative, like the rest of this card: the whole
              thing is aria-hidden, and the copy beside it carries the claim. */}
          <p
            style={delay(BEAT.header + 180)}
            className="af-hero-fade flex shrink-0 items-center gap-1.5 font-mono text-[10px]"
          >
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">
              C4
            </span>
            <span className="text-muted-foreground/60">Sequence</span>
          </p>
        </div>

        {/* Diagram area: fixed 350×336 coordinate space. */}
        <div className="relative m-4 h-[336px]">
          <Edges className="absolute inset-0 h-full w-full text-muted-foreground/70" />

          {/* Person, outside the boundary. */}
          <div
            style={delay(BEAT.nodes[0])}
            className="af-hero-node absolute top-0 left-[280px] flex w-[72px] flex-col items-center gap-1"
          >
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
            delayMs={BEAT.nodes[1]}
            className="top-[46px] left-0"
          />
          <MiniNode
            icon={GolangIcon}
            name="API Service"
            tech="Go · REST"
            delayMs={BEAT.nodes[2]}
            className="top-[128px] left-[184px]"
          />
          <MiniNode
            icon={PostgresqlIcon}
            name="Orders DB"
            tech="PostgreSQL"
            delayMs={BEAT.nodes[3]}
            className="top-[224px] left-0"
          />
          <MiniNode
            icon={RedisIcon}
            name="Session Cache"
            tech="Redis"
            delayMs={BEAT.nodes[4]}
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
  delayMs,
  className,
}: {
  icon: React.FC<SVGProps<SVGSVGElement>>;
  name: string;
  tech: string;
  delayMs: number;
  className?: string;
}) {
  return (
    <div
      style={delay(delayMs)}
      className={cn(
        "af-hero-node absolute w-36 rounded-lg border border-border bg-card p-2.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-primary/25 bg-gradient-to-br from-primary/20 to-accent/12 text-primary">
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
 * The four connectors, in the same fixed 350×336 space as the nodes so they
 * meet node edges exactly at every rendering (the card never scales).
 *
 * `flowMs` staggers the ambient current so the four packets never set off in
 * lockstep, which would read as a progress bar rather than as traffic.
 */
const EDGES: readonly { id: string; d: string; flowMs: number }[] = [
  { id: "customer-web", d: "M 276 22 C 232 28 192 42 152 64", flowMs: 0 },
  { id: "web-api", d: "M 72 102 C 72 138 130 150 176 153", flowMs: 700 },
  { id: "api-db", d: "M 212 188 C 212 220 182 244 152 250", flowMs: 1400 },
  { id: "api-cache", d: "M 276 188 L 276 244", flowMs: 2100 },
];

/**
 * The comet, one entry per pass over the curve, painted in this order.
 *
 * Every layer runs the identical animation at the identical speed; the only
 * thing separating them is `lagMs`, so each rides a fixed distance behind the
 * head and the group reads as one tapering streak rather than as three dots.
 * Fading and narrowing together is what sells the taper — opacity alone looks
 * like a dotted line, width alone looks like a tadpole.
 *
 * `lagMs` has to clear the head's own length or the layers simply stack on top
 * of it and there is no visible tail: at FLOW_MS = 3200 the 0.08-long head
 * occupies 256ms of travel, so the first tail starts at 230ms (a deliberate
 * sliver of overlap, to keep the streak continuous) and the second at 430ms.
 *
 * The halo is a wide, faint copy rather than a blur filter. A filter would
 * re-rasterise every path on every frame of a permanent animation — precisely
 * the per-frame paint cost that makes motion stutter — while a wide round
 * stroke at low alpha buys the same bloom for nothing.
 */
const TRAIL: readonly {
  key: string;
  /** Lit fraction of the curve. */
  len: number;
  width: number;
  opacity: number;
  /** How far behind the head this layer rides, in ms of travel. */
  lagMs: number;
}[] = [
  { key: "halo", len: 0.18, width: 6, opacity: 0.18, lagMs: 0 },
  { key: "tail-far", len: 0.14, width: 1.2, opacity: 0.2, lagMs: 980 },
  { key: "tail-near", len: 0.16, width: 1.6, opacity: 0.45, lagMs: 520 },
  { key: "head", len: 0.18, width: 1.9, opacity: 1, lagMs: 0 },
];

function Edges(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 350 336" fill="none" {...props}>
      <defs>
        {/* The current's colour. `userSpaceOnUse` over the whole 350×336 board
            rather than per-path object bounds: one gradient laid across the
            diagram means a comet's hue depends on WHERE it is, so the four
            edges are related instead of four copies of the same effect.
            Running it corner to corner puts primary at the top-right, where
            traffic enters from the Customer, and accent at the bottom-left,
            where it settles into the data stores. */}
        <linearGradient
          id="hero-flow-gradient"
          gradientUnits="userSpaceOnUse"
          x1="350"
          y1="0"
          x2="0"
          y2="336"
        >
          {/* The stops sit at 25% and 60% rather than at the ends because the
              four curves only occupy that slice of the axis — projected onto
              it they land at t = 0.27, 0.42, 0.53 and 0.56. Ramping across the
              full 0→100% put every edge in the first quarter and painted the
              whole diagram one colour; ramping across the band they actually
              occupy is what makes the Customer edge read purple and the two
              lower ones read accent. */}
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="25%" stopColor="var(--primary)" />
          <stop offset="60%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>

        {/* One marker per edge rather than one shared def: marker content is
            cloned per use and every clone runs the same animation timeline, so
            a single shared marker would pop all four arrowheads in at once
            instead of each as its own line arrives. */}
        {EDGES.map((edge, index) => (
          <marker
            key={edge.id}
            id={`hero-edge-head-${edge.id}`}
            viewBox="0 0 8 8"
            refX="6.5"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              className="af-hero-head"
              style={delay(BEAT.edges[index] + BEAT.drawMs)}
              d="M1.5 1 L6.5 4 L1.5 7"
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        ))}
      </defs>

      <g stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
        {EDGES.map((edge, index) => (
          <path
            key={edge.id}
            className="af-hero-edge"
            style={delay(BEAT.edges[index])}
            d={edge.d}
            pathLength={1}
            markerEnd={`url(#hero-edge-head-${edge.id})`}
          />
        ))}
      </g>

      {/* The current: each curve drawn several times over, one pass per layer
          of the comet. See TRAIL for how the taper is built. */}
      {TRAIL.map((layer) => (
        <g
          key={layer.key}
          stroke="url(#hero-flow-gradient)"
          strokeWidth={layer.width}
          opacity={layer.opacity}
        >
          {EDGES.map((edge) => (
            <path
              key={edge.id}
              className="af-hero-flow"
              /* `len (1 - len)` — one lit stretch, one dark one, summing to
                 exactly one pathLength so the wrap is invisible. */
              strokeDasharray={`${layer.len} ${1 - layer.len}`}
              /* The lag is what separates this layer from the head: same
                 speed, started later, so it rides a fixed distance behind. */
              style={delay(BEAT.flow + edge.flowMs + layer.lagMs)}
              d={edge.d}
              pathLength={1}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
