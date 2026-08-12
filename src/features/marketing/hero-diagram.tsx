import type { CSSProperties, SVGProps } from "react";

import { cn } from "@/lib/utils";
import { GolangIcon } from "@/features/editor/lib/icons/svg/golang";
import { NextjsIcon } from "@/features/editor/lib/icons/svg/nextjs";
import { PersonIcon } from "@/features/editor/lib/icons/svg/person";
import { PostgresqlIcon } from "@/features/editor/lib/icons/svg/postgresql";
import { RedisIcon } from "@/features/editor/lib/icons/svg/redis";

/**
 * Decorative hero visual: one card that ALTERNATES between the two document
 * kinds this product reads — a miniature Container-level C4 diagram drawn with
 * the editor's real stack icons, and a miniature sequence flow — stacked over
 * two ghost "sheets" that hint at the levels beneath (the Context→Container
 * drill-down). The `C4 / Sequence` labels in its header say which is showing.
 *
 * WHY IT ALTERNATES rather than showing one: the banner is the first thing a
 * reader sees, and a single C4 diagram made the sequence viewer look like a
 * footnote to a C4 product. Naming both kinds in the header without ever
 * showing the second was worse — a switch that never switched.
 *
 * The swap is pure CSS: both panels occupy the same fixed 350×336 box,
 * absolutely positioned, cross-fading on one shared keyframe with the sequence
 * side offset half a cycle (`af-hero-kind` / `af-hero-kind-alt` in
 * globals.css). No timer, no client state, so this stays a SERVER component.
 *
 * Each panel assembles itself on load — sheets settle, boxes land one at a
 * time, connectors draw toward their arrowheads — and the C4 panel then keeps a
 * slow current running along its edges, so the arrows read as traffic rather
 * than decoration. The motion is pure CSS (see the "Hero diagram motion" block
 * in globals.css); this file only owns the choreography, as `animationDelay`
 * values on the elements themselves, so the running order can be read top to
 * bottom here. That keeps the component a server component — no client
 * bundle, no hydration — and the global `prefers-reduced-motion` rule plus
 * the explicit opt-outs in that CSS block settle everything onto its final
 * frame for anyone who asks for less movement: the swap parks on the C4 panel
 * rather than cycling.
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
          {/* The document KINDS, and which one is on screen. These are not
              decoration and not a control: the card ALTERNATES between a C4
              diagram and a sequence flow, and each label lights while its panel
              is showing. They used to sit here as a static pair — which read as
              a switch that never switched, and rightly got called out.

              Each label is layered: a muted base that is always there, with the
              lit copy on top running the same swap keyframe as its panel. That
              keeps the two in lockstep by construction and needs no colour
              keyframes. */}
          <p
            style={delay(BEAT.header + 180)}
            className="af-hero-fade flex shrink-0 items-center gap-1.5 font-mono text-[10px]"
          >
            <span className="relative">
              <span className="text-muted-foreground/60">C4</span>
              <span className="af-hero-kind absolute inset-0 -mx-1.5 -my-0.5 rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">
                C4
              </span>
            </span>
            <span className="relative">
              <span className="text-muted-foreground/60">Sequence</span>
              <span className="af-hero-kind af-hero-kind-alt absolute inset-0 -mx-1.5 -my-0.5 rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
                Sequence
              </span>
            </span>
          </p>
        </div>

        {/* Diagram area: fixed 350×336 coordinate space, shared by BOTH panels.
            They are absolutely positioned on top of each other and cross-fade,
            so the card's height never changes and neither diagram shifts as the
            other arrives. Same coordinate box for both is what makes that
            free. */}
        <div className="relative m-4 h-[336px]">
          <div className="af-hero-kind absolute inset-0">
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

          {/* The other kind, same box, offset half a cycle. */}
          <div className="af-hero-kind af-hero-kind-alt absolute inset-0">
            <SequencePanel />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The sequence panel                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The card's other half: a miniature sequence flow, in the same fixed 350×336
 * space as the C4 panel so the two can cross-fade without either moving.
 *
 * Four lifelines and six messages — the shortest flow that still shows what the
 * real viewer shows: a call going out, a reply coming back dashed, and the round
 * trip closing where it started. Fewer participants and it is not recognisably a
 * sequence diagram; more, and the labels stop fitting at this size.
 *
 * Built from the same parts as the C4 panel deliberately: `af-hero-node` for the
 * cards, `af-hero-draw` for the arrows, `af-hero-fade` for everything else, all
 * choreographed by inline `animationDelay` so the running order reads top to
 * bottom in this file. It stays a server component for the same reason.
 */

/** Lifeline x centres, and the card that sits on each. */
const LANES: readonly { id: string; name: string; x: number }[] = [
  { id: "cust", name: "Customer", x: 38 },
  { id: "web", name: "Web App", x: 130 },
  { id: "api", name: "API", x: 222 },
  { id: "db", name: "Orders DB", x: 312 },
];

/**
 * The flow. `reply` draws dashed with an open head, which is the one visual
 * distinction the real renderer treats as load-bearing — a return that looks
 * like a call is a different diagram.
 */
const STEPS: readonly {
  id: string;
  from: number;
  to: number;
  y: number;
  label: string;
  reply?: boolean;
}[] = [
  { id: "place", from: 0, to: 1, y: 92, label: "Place order" },
  { id: "post", from: 1, to: 2, y: 132, label: "POST /orders" },
  { id: "insert", from: 2, to: 3, y: 172, label: "INSERT order" },
  { id: "stored", from: 3, to: 2, y: 212, label: "ok", reply: true },
  { id: "created", from: 2, to: 1, y: 252, label: "201 Created", reply: true },
  { id: "receipt", from: 1, to: 0, y: 292, label: "Receipt" },
];

/** Beats for the sequence panel, mirroring BEAT's shape. */
const SEQ_BEAT = {
  lanes: 420,
  lifelines: 560,
  steps: 660,
  stepGap: 90,
} as const;

function SequencePanel() {
  return (
    <div className="absolute inset-0">
      {/* Lifelines and arrows share one SVG so the arrowheads meet the
          lifelines exactly, at every rendering — the card never scales. */}
      <svg
        viewBox="0 0 350 336"
        fill="none"
        className="absolute inset-0 h-full w-full"
      >
        {LANES.map((lane, index) => (
          <line
            key={lane.id}
            style={delay(SEQ_BEAT.lifelines + index * 60)}
            className="af-hero-fade"
            x1={lane.x}
            y1={56}
            x2={lane.x}
            y2={318}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 4"
            strokeOpacity={0.35}
            // `currentColor` so one class on the wrapper tints every lifeline.
            color="var(--muted-foreground)"
          />
        ))}

        {STEPS.map((step, index) => {
          const from = LANES[step.from].x;
          const to = LANES[step.to].x;
          const dir = to > from ? 1 : -1;
          const tip = to - 7 * dir;
          return (
            <g key={step.id}>
              {/* Solid arrows DRAW (`af-hero-edge` normalises pathLength so
                  every one takes the same time whatever its span); replies FADE
                  IN dashed instead. That split is not a shortcut — it is the
                  same constraint the real renderer documents at length:
                  `af-hero-edge` sets `stroke-dasharray: 1` to draw with, and a
                  reply's dashes ARE its dasharray, so one property cannot serve
                  both. A reply that drew would arrive solid, which reads as a
                  call. */}
              <path
                style={delay(SEQ_BEAT.steps + index * SEQ_BEAT.stepGap)}
                className={step.reply ? "af-hero-fade" : "af-hero-edge"}
                d={`M ${from} ${step.y} L ${tip} ${step.y}`}
                pathLength={1}
                stroke="var(--edge)"
                strokeWidth={1.5}
                strokeDasharray={step.reply ? "5 4" : undefined}
              />
              <path
                style={delay(
                  SEQ_BEAT.steps + index * SEQ_BEAT.stepGap + BEAT.drawMs,
                )}
                className="af-hero-fade"
                d={`M ${tip} ${step.y} l ${-7 * dir} -4 v 8 Z`}
                fill={step.reply ? "none" : "var(--edge)"}
                stroke="var(--edge)"
                strokeWidth={step.reply ? 1.2 : 0}
              />
            </g>
          );
        })}
      </svg>

      {/* Participant cards, above the lines. */}
      {LANES.map((lane, index) => (
        <div
          key={lane.id}
          style={{
            ...delay(SEQ_BEAT.lanes + index * 70),
            left: `${lane.x}px`,
          }}
          className="af-hero-node absolute top-[34px] -translate-x-1/2 rounded-md border border-primary/25 bg-card px-2 py-1 shadow-sm"
        >
          <p className="truncate text-[10px] leading-4 font-medium text-foreground">
            {lane.name}
          </p>
        </div>
      ))}

      {/* Message labels, riding just above their arrows. */}
      {STEPS.map((step, index) => {
        const mid = (LANES[step.from].x + LANES[step.to].x) / 2;
        return (
          <p
            key={step.id}
            style={{
              ...delay(SEQ_BEAT.steps + index * SEQ_BEAT.stepGap + 200),
              left: `${mid}px`,
              top: `${step.y - 16}px`,
            }}
            className="af-hero-fade absolute -translate-x-1/2 font-mono text-[9px] whitespace-nowrap text-muted-foreground"
          >
            {step.label}
          </p>
        );
      })}
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
