import { ICONS } from "@/features/editor/lib/icons/registry";

import type { CSSProperties, SVGProps } from "react";

import { cn } from "@/lib/utils";

/* The hero borrows the registry's own artwork rather than importing icon
   files: there are no icon files any more (brand.tsx / generic.tsx), and a
   marketing page drawing its own copies is exactly how the two drift. Mono,
   because this is decorative chrome tinted by the section's palette. */
const PersonIcon = ICONS["person"].byStyle.mono;
const NextjsIcon = ICONS["nextjs"].byStyle.mono;
const GolangIcon = ICONS["golang"].byStyle.mono;
const PostgresqlIcon = ICONS["postgresql"].byStyle.mono;
const RedisIcon = ICONS["redis"].byStyle.mono;

/**
 * Decorative hero visual: one card that CYCLES THROUGH ALL FOUR document kinds
 * this product reads — a Container-level C4 diagram drawn with the editor's real
 * stack icons, a sequence flow, a flowchart, and a use-case diagram — stacked
 * over two ghost "sheets" that hint at the levels beneath (the Context→Container
 * drill-down). The kind strip in its header says which is showing, and the
 * header's LEFT side swaps with it: a level breadcrumb over the C4 panel, each
 * other document's own subtitle over its own panel — only a C4 model has levels,
 * so a breadcrumb left standing over a flowchart would be the header asserting
 * something that format cannot express.
 *
 * WHY IT CYCLES rather than showing one: the banner is the first thing a reader
 * sees, and a single C4 diagram made the other three viewers look like footnotes
 * to a C4 product. Naming the kinds in the header without ever showing them
 * would be worse — a switch that never switches. It began as two kinds for
 * exactly this reason, and grew to four as the flowchart and use-case types
 * shipped; a kind that exists in the product and not here is the same bug
 * again.
 *
 * The swap is pure CSS: all four panels occupy the same fixed 350×336 box,
 * absolutely positioned, cycling on one shared keyframe with each panel after
 * the first offset by whole quarter-cycles (`af-hero-kind` plus
 * `af-hero-kind-2/-3/-4` in globals.css). No timer, no client state, so this
 * stays a SERVER component.
 *
 * Each panel assembles itself on load — sheets settle, boxes land one at a
 * time, connectors draw toward their arrowheads — and then keeps something
 * moving: the C4 panel runs a slow current along its edges, the other three a
 * travelling band along theirs, so the arrows read as traffic rather than
 * decoration. Every panel keeps moving because a still one beside a live one
 * looks like a screenshot of the product rather than the product. The motion is pure CSS (see the "Hero diagram motion" block
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

/**
 * A panel's entrance, for shapes drawn as SVG rather than as HTML boxes.
 *
 * `af-hero-node` scales as well as translating, and a CSS `scale()` on an SVG
 * element takes the SVG's own origin — (0, 0), the panel's top-left corner —
 * so every shape would swing in from the corner instead of settling in place.
 * `transform-box: fill-box` re-bases it on the shape's own bounding box, which
 * is what makes one class serve both the C4 panel's divs and the three SVG
 * panels' rects.
 */
function riseAt(ms: number): CSSProperties {
  return {
    animationDelay: `${ms}ms`,
    transformBox: "fill-box",
    transformOrigin: "center",
  };
}

/**
 * The four kinds, in cycle order, each paired with the phase class that puts it
 * at its own quarter of the swap. THE FIRST HAS NO CLASS on purpose: it runs the
 * bare `af-hero-kind` clock at zero offset, and inventing an `af-hero-kind-1`
 * that sets `animation-delay: 0s` would be a class whose only job is to restate
 * the default — and one more place for the set to fall out of step with
 * globals.css.
 *
 * This list is the header strip. The PANELS are written out longhand in the
 * markup below rather than mapped from it, because each one is a different
 * component with different artwork; the shared thing is the order, and the order
 * is here.
 */
const KINDS: readonly { name: string; phase: string }[] = [
  { name: "C4", phase: "" },
  { name: "Sequence", phase: "af-hero-kind-2" },
  { name: "Flowchart", phase: "af-hero-kind-3" },
  { name: "Use case", phase: "af-hero-kind-4" },
];

/**
 * What the header says on its left for the three kinds that have no C4 levels:
 * the document's own name, and the one count that tells you its size. The C4
 * breadcrumb is written out in the markup instead of living here, because it is
 * not a name and a count — it is two altitudes and a separator, and flattening it
 * into this shape would lose the lit `L2 Container` pill that says which level
 * the diagram below is actually drawn at.
 */
const SUBTITLES: readonly { name: string; meta: string; phase: string }[] = [
  { name: "Place an order", meta: "4 participants", phase: "af-hero-kind-2" },
  { name: "Order fulfilment", meta: "6 steps", phase: "af-hero-kind-3" },
  { name: "Food delivery", meta: "2 actors", phase: "af-hero-kind-4" },
];

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

        {/* Header: what the panel below is, and which kind is showing.
            THE LEFT SIDE SWAPS WITH THE PANEL. It used to be a fixed
            `L1 Context › L2 Container` breadcrumb, which stayed put while the
            card alternated — so for half of every cycle the header labelled a
            sequence flow with C4 altitudes. A sequence document has no levels
            at all: the drill-down is a C4 idea, and claiming one over a flow
            is not a cosmetic mismatch but the header saying something untrue.

            Both labels sit in ONE grid cell and cross-fade on the same
            `af-hero-kind` clock the panels use, so they cannot drift out of
            step, and the header keeps its height whichever is showing. */}
        <div className="relative flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <div className="grid min-w-0">
            <p className="af-hero-kind col-start-1 row-start-1 flex items-center gap-1.5 font-mono text-[10px]">
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
            {/* The other three name the DOCUMENT, because that is what they
                have where a C4 model has a level: a sequence flow's title, a
                flowchart's name, a use-case system's boundary. Each is the one
                thing the real viewer stamps above that kind of diagram. */}
            {/* NO INLINE `delay()` ON THESE ELEMENTS, and that is load-bearing:
                `af-hero-kind-2/-3/-4` are nothing but an `animation-delay`,
                the quarter-cycle offset that puts each one at its own point in
                the cycle. An inline `animationDelay` wins over the class, so a
                staged entrance here silently put two halves on the same phase
                and printed the C4 breadcrumb and the flow title over each
                other. That shipped once. The children carry the entrance
                instead — they have no swap clock of their own to overwrite,
                and `check:hero` now fails if this file grows one back. */}
            {SUBTITLES.map((subtitle) => (
              <p
                key={subtitle.name}
                className={cn(
                  "af-hero-kind col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px]",
                  subtitle.phase,
                )}
              >
                <span
                  style={delay(BEAT.header)}
                  className="af-hero-fade truncate text-muted-foreground"
                >
                  {subtitle.name}
                </span>
                <span
                  style={delay(BEAT.header + 60)}
                  className="af-hero-fade shrink-0 text-muted-foreground/50"
                >
                  ·
                </span>
                <span
                  style={delay(BEAT.header + 120)}
                  className="af-hero-fade shrink-0 text-muted-foreground/70"
                >
                  {subtitle.meta}
                </span>
              </p>
            ))}
          </div>
          {/* The document KINDS, and which one is on screen. Not decoration and
              not a control: the card cycles through four diagrams, and this says
              how many there are and where in the set you are.

              IT WAS FOUR NAMED PILLS, one per kind, greyed until its turn —
              which is the honest design and does not fit. Four names in a
              10px mono strip is ~206px, and the breadcrumb beside it wants
              ~160px inside a 384px card: the two collided. Widening the card
              to fit a legend would be letting the label set the size of the
              artwork.

              So the SET became dots and the NAME became singular. Four dots
              answers "how many kinds" in 28px, the lit one answers "which",
              and the name spells that one out. Every lit element runs the same
              swap keyframe as its own panel, so dot, name and diagram cannot
              disagree — there are no colour keyframes and nothing to
              synchronise by hand.

              The names share ONE GRID CELL, so the strip is as wide as the
              longest of them and never resizes mid-cycle. `visibility: hidden`
              still occupies its grid area, which is exactly why that is the
              property the swap uses. */}
          <p
            style={delay(BEAT.header + 180)}
            className="af-hero-fade flex shrink-0 items-center gap-2 font-mono text-[10px]"
          >
            <span className="flex items-center gap-1">
              {KINDS.map((kind) => (
                <span
                  key={kind.name}
                  className="relative grid size-1.5 place-items-center rounded-full bg-muted-foreground/30"
                >
                  <span
                    className={cn(
                      "af-hero-kind absolute inset-0 rounded-full bg-primary",
                      kind.phase,
                    )}
                  />
                </span>
              ))}
            </span>
            <span className="grid">
              {KINDS.map((kind) => (
                <span
                  key={kind.name}
                  className={cn(
                    "af-hero-kind col-start-1 row-start-1 text-right font-medium text-primary",
                    kind.phase,
                  )}
                >
                  {kind.name}
                </span>
              ))}
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

          {/* The other three kinds, same box, each offset whole quarters. */}
          <div className="af-hero-kind af-hero-kind-2 absolute inset-0">
            <SequencePanel />
          </div>
          <div className="af-hero-kind af-hero-kind-3 absolute inset-0">
            <FlowchartPanel />
          </div>
          <div className="af-hero-kind af-hero-kind-4 absolute inset-0">
            <UseCasePanel />
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
                  call.

                  Once arrived, the panel KEEPS MOVING — it used to assemble and
                  then sit perfectly still while the C4 panel beside it ran its
                  comets, which made the sequence half look like a screenshot.
                  Replies march their own dash from here; calls get the
                  travelling highlight below. */}
              <path
                style={delay(SEQ_BEAT.steps + index * SEQ_BEAT.stepGap)}
                className={step.reply ? "af-hero-seq-reply" : "af-hero-edge"}
                d={`M ${from} ${step.y} L ${tip} ${step.y}`}
                pathLength={step.reply ? undefined : 1}
                stroke="var(--edge)"
                strokeWidth={1.5}
                strokeDasharray={step.reply ? "6 5" : undefined}
              />

              {/* The call's travelling highlight: a short bright band over the
                  unbroken stroke, so a sync arrow moves without ever looking
                  dashed. Delayed past the draw, or it would race a line that is
                  not there yet. `pathLength=100` makes the 9/91 dash a
                  percentage, so one keyframe fits every span. */}
              {step.reply === undefined ? (
                <path
                  style={delay(
                    SEQ_BEAT.steps + index * SEQ_BEAT.stepGap + BEAT.drawMs,
                  )}
                  className="af-hero-trace"
                  d={`M ${from} ${step.y} L ${tip} ${step.y}`}
                  pathLength={100}
                  stroke={`var(--seq-lane-${step.from + 1})`}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              ) : null}
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

/* -------------------------------------------------------------------------- */
/* The flowchart panel                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The card's third face: a miniature flowchart, in the same fixed 350×336 space
 * as the panels either side of it.
 *
 * SIX NODES, and the count is the point: it is the smallest chart that shows all
 * of what makes this a flowchart rather than a box-and-arrow drawing — both
 * terminators, a guarded decision that actually branches, a symbol on each of the
 * two branches, the branches rejoining, and a loop hooking back up the flank. Cut
 * any one of those and it stops being recognisable as the notation; add a rank
 * and the labels stop fitting at this size.
 *
 * The SILHOUETTES are drawn here rather than imported from
 * `features/flowchart/lib/shapes.ts`, which is a deliberate exception to the rule
 * the icons follow. That module's geometry is driven by the real layout engine —
 * measured text, computed ranks, orthogonal routing — and none of that exists on
 * a marketing page with six hardcoded positions. What is shared is the thing
 * that would actually be wrong if it drifted: the COLOURS, every one a
 * `--flow-*` token, so a theme that repaints the product repaints the hero and
 * `check:flowchart-palette` still governs the contrast.
 */

type MiniFlowShape = "start" | "end" | "step" | "decision" | "io" | "call";

const FLOW_NODES: readonly {
  id: string;
  shape: MiniFlowShape;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}[] = [
  {
    id: "placed",
    shape: "start",
    label: "Order placed",
    cx: 140,
    cy: 24,
    w: 122,
    h: 32,
  },
  {
    id: "validate",
    shape: "step",
    label: "Validate cart",
    cx: 140,
    cy: 88,
    w: 128,
    h: 36,
  },
  {
    id: "stock",
    shape: "decision",
    label: "In stock?",
    cx: 140,
    cy: 154,
    w: 132,
    h: 56,
  },
  {
    id: "reserve",
    shape: "io",
    label: "Reserve items",
    cx: 76,
    cy: 232,
    w: 128,
    h: 36,
  },
  {
    id: "backorder",
    shape: "call",
    label: "Back-order",
    cx: 250,
    cy: 232,
    w: 120,
    h: 36,
  },
  {
    id: "confirmed",
    shape: "end",
    label: "Confirmed",
    cx: 140,
    cy: 306,
    w: 122,
    h: 32,
  },
];

/**
 * The connectors, orthogonal with rounded corners, exactly as the real renderer
 * routes them. `trace` marks the HAPPY PATH — the four edges the ambient band
 * retraces once everything has arrived, which is the same choice the real
 * viewer's idle pulse makes: the resting motion follows the route the chart is
 * about, not every line on it. Running a band down all seven would light the
 * failure branch and the retry loop as busily as the path that succeeds.
 *
 * `head` is absent on the second edge into the end terminator: both arrive at the
 * same point, so two arrowheads would be two copies of one triangle.
 */
const FLOW_EDGES: readonly {
  id: string;
  d: string;
  head?: { x: number; y: number; dir: "down" | "left" };
  trace?: true;
}[] = [
  {
    id: "placed-validate",
    d: "M 140 40 V 70",
    head: { x: 140, y: 70, dir: "down" },
    trace: true,
  },
  {
    id: "validate-stock",
    d: "M 140 106 V 126",
    head: { x: 140, y: 126, dir: "down" },
    trace: true,
  },
  {
    id: "stock-reserve",
    d: "M 140 182 V 192 Q 140 200 132 200 H 84 Q 76 200 76 208 V 214",
    head: { x: 76, y: 214, dir: "down" },
    trace: true,
  },
  {
    id: "stock-backorder",
    d: "M 206 154 H 242 Q 250 154 250 162 V 214",
    head: { x: 250, y: 214, dir: "down" },
  },
  {
    id: "reserve-confirmed",
    d: "M 76 250 V 274 Q 76 282 84 282 H 132 Q 140 282 140 290",
    head: { x: 140, y: 290, dir: "down" },
    trace: true,
  },
  {
    id: "backorder-confirmed",
    d: "M 250 250 V 274 Q 250 282 242 282 H 148 Q 140 282 140 290",
  },
  {
    id: "backorder-validate",
    d: "M 310 232 H 322 Q 330 232 330 224 V 96 Q 330 88 322 88 H 204",
    head: { x: 204, y: 88, dir: "left" },
  },
];

/** Guard labels, beside the segment each one governs — never on top of it. */
const FLOW_GUARDS: readonly { label: string; x: number; y: number }[] = [
  { label: "yes", x: 108, y: 193 },
  { label: "no", x: 224, y: 147 },
  { label: "retry", x: 272, y: 81 },
];

/** Beats for the flowchart panel, mirroring BEAT's shape. */
const FLOW_BEAT = {
  nodes: 420,
  nodeGap: 80,
  edges: 540,
  edgeGap: 80,
  trace: 1900,
  traceGap: 170,
} as const;

/** One node's silhouette — the classic symbol, in its shape's own colours. */
function MiniFlowShapeOutline({
  node,
  delayMs,
}: {
  node: (typeof FLOW_NODES)[number];
  delayMs: number;
}) {
  const { cx, cy, w, h, shape } = node;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const fill = `var(--flow-${shape})`;
  const stroke = `var(--flow-${shape}-border)`;
  const common = {
    className: "af-hero-node",
    style: riseAt(delayMs),
    fill,
    stroke,
    strokeWidth: 1.25,
  };

  if (shape === "decision") {
    return (
      <path
        {...common}
        d={`M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`}
      />
    );
  }

  if (shape === "io") {
    // The parallelogram's slant, in user units. Matched to the real symbol's
    // proportions rather than picked: a shallower one stops reading as input.
    const slant = 11;
    return (
      <path
        {...common}
        d={`M ${x + slant} ${y} H ${x + w} L ${x + w - slant} ${y + h} H ${x} Z`}
      />
    );
  }

  return (
    <>
      <rect
        {...common}
        x={x}
        y={y}
        width={w}
        height={h}
        // A terminator is a stadium — fully round ends. Everything else keeps
        // the product's own 8px box corner.
        rx={shape === "start" || shape === "end" ? h / 2 : 8}
      />
      {/* `call`'s double-struck rails: the one shape whose meaning ("defined
          elsewhere") lives in a marking rather than in an outline. */}
      {shape === "call" ? (
        <path
          className="af-hero-node"
          style={riseAt(delayMs)}
          d={`M ${x + 6} ${y} V ${y + h} M ${x + w - 6} ${y} V ${y + h}`}
          stroke={stroke}
          strokeWidth={1.25}
          fill="none"
        />
      ) : null}
    </>
  );
}

function FlowchartPanel() {
  return (
    <svg
      viewBox="0 0 350 336"
      fill="none"
      className="absolute inset-0 h-full w-full"
    >
      {/* Connectors UNDER the symbols, so a line that stops a hair inside a
          node's outline is hidden by it rather than crossing into the label. */}
      <g stroke="var(--edge)" strokeWidth={1.4} strokeLinecap="round">
        {FLOW_EDGES.map((edge, index) => (
          <path
            key={edge.id}
            className="af-hero-edge"
            style={delay(FLOW_BEAT.edges + index * FLOW_BEAT.edgeGap)}
            d={edge.d}
            pathLength={1}
          />
        ))}
      </g>

      {FLOW_EDGES.map((edge, index) =>
        edge.head === undefined ? null : (
          <path
            key={edge.id}
            className="af-hero-fade"
            style={delay(
              FLOW_BEAT.edges + index * FLOW_BEAT.edgeGap + BEAT.drawMs,
            )}
            d={
              edge.head.dir === "down"
                ? `M ${edge.head.x} ${edge.head.y} l -4 -7 h 8 Z`
                : `M ${edge.head.x} ${edge.head.y} l 7 -4 v 8 Z`
            }
            fill="var(--edge)"
          />
        ),
      )}

      {/* The ambient band, over the finished line. `pathLength=100` makes the
          9/91 dash a percentage, so one keyframe fits every span however the
          route bends — the same trick the sequence panel's calls use. */}
      {FLOW_EDGES.filter((edge) => edge.trace).map((edge, index) => (
        <path
          key={edge.id}
          className="af-hero-trace"
          style={delay(FLOW_BEAT.trace + index * FLOW_BEAT.traceGap)}
          d={edge.d}
          pathLength={100}
          stroke="var(--primary)"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ))}

      {FLOW_NODES.map((node, index) => {
        const delayMs = FLOW_BEAT.nodes + index * FLOW_BEAT.nodeGap;
        return (
          <g key={node.id}>
            <MiniFlowShapeOutline node={node} delayMs={delayMs} />
            {/* `--node-foreground`, not `--foreground`: this text sits ON a role
                fill, and that is the token whose contrast against those fills is
                the measured one. */}
            <text
              className="af-hero-fade font-medium"
              style={delay(delayMs + 120)}
              x={node.cx}
              y={node.cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fill="var(--node-foreground)"
            >
              {node.label}
            </text>
          </g>
        );
      })}

      {FLOW_GUARDS.map((guard, index) => (
        <text
          key={guard.label}
          className="af-hero-fade font-mono"
          style={delay(FLOW_BEAT.edges + BEAT.drawMs + index * 120)}
          x={guard.x}
          y={guard.y}
          textAnchor="middle"
          fontSize={9}
          fill="var(--muted-foreground)"
        >
          {guard.label}
        </text>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* The use-case panel                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The card's fourth face: a miniature use-case diagram, same fixed 350×336 box.
 *
 * The three things this notation means and no other kind can say, all present:
 * actors OUTSIDE a system boundary, use cases INSIDE it, and an `«include»`
 * between two cases. The boundary is why the actors sit in a column on the left
 * with nothing drawn around them — "outside" is the whole statement, and a
 * use-case document that cannot express it is a labelled ellipse chart.
 *
 * Associations are UNDIRECTED, so they carry no arrowhead; the `«include»`
 * carries an open one and draws dashed. That split is the notation's, not a
 * shorthand: a solid head on an association would claim a direction the format
 * has no way to record.
 */
const UC_CASES: readonly { id: string; label: string; cy: number }[] = [
  { id: "browse", label: "Browse menu", cy: 88 },
  { id: "order", label: "Place order", cy: 148 },
  { id: "pay", label: "Pay by card", cy: 208 },
  { id: "track", label: "Track order", cy: 268 },
];

const UC_ACTORS: readonly { id: string; name: string; cy: number }[] = [
  { id: "customer", name: "Customer", cy: 112 },
  { id: "courier", name: "Courier", cy: 250 },
];

/**
 * Associations, each landing on its ellipse's LEFT EXTREME and arriving
 * horizontally. Solving the real line-to-ellipse intersection would be the
 * honest geometry and is not worth it at six hardcoded positions: a curve that
 * flattens into the extreme point touches the outline exactly, at every
 * rendering, with no arithmetic to get wrong.
 */
const UC_LINKS: readonly { id: string; d: string }[] = [
  { id: "customer-browse", d: "M 56 106 C 100 100 108 88 139 88" },
  { id: "customer-order", d: "M 56 120 C 104 134 110 148 139 148" },
  { id: "courier-track", d: "M 56 254 C 100 260 112 268 139 268" },
];

/** Beats for the use-case panel, mirroring BEAT's shape. */
const UC_BEAT = {
  boundary: 400,
  actors: 480,
  actorGap: 90,
  cases: 560,
  caseGap: 85,
  links: 900,
  linkGap: 110,
  include: 1240,
  trace: 1900,
  traceGap: 240,
} as const;

/** The classic stick actor, centred on `cy` with its name beneath. */
function MiniActor({
  actor,
  delayMs,
}: {
  actor: (typeof UC_ACTORS)[number];
  delayMs: number;
}) {
  const { cy } = actor;
  return (
    <g>
      <g
        className="af-hero-node"
        style={riseAt(delayMs)}
        stroke="var(--uc-actor-border)"
        strokeWidth={1.4}
        strokeLinecap="round"
      >
        <circle cx={40} cy={cy - 17} r={6} fill="var(--uc-actor)" />
        <path
          d={`M 40 ${cy - 11} V ${cy + 7} M 29 ${cy - 4} H 51 M 40 ${cy + 7} L 31 ${cy + 20} M 40 ${cy + 7} L 49 ${cy + 20}`}
          fill="none"
        />
      </g>
      <text
        className="af-hero-fade font-mono"
        style={delay(delayMs + 140)}
        x={40}
        y={cy + 33}
        textAnchor="middle"
        fontSize={9}
        fill="var(--muted-foreground)"
      >
        {actor.name}
      </text>
    </g>
  );
}

function UseCasePanel() {
  return (
    <svg
      viewBox="0 0 350 336"
      fill="none"
      className="absolute inset-0 h-full w-full"
    >
      {/* The system boundary. Drawn first and washed with the canvas colour, so
          the cases inside sit on the system rather than on the card.
          A WASH, NOT A FILL, and the opacity is the point. It used to paint
          `--canvas` opaque, which is fine on the light themes where card and
          canvas are a few percent apart — but the default theme is `.contrast`,
          where the card is L 0.12 and the canvas is L 0.05. Opaque, that drew a
          near-black slab across two thirds of the card: the strongest edge in
          the whole hero belonged to a rectangle that is meant to be CONTEXT,
          and the actors outside it read as if they had fallen off the diagram.
          0.45 is not a taste value — it is the same wash
          `usecase-diagram.tsx` gives an untinted boundary, so the hero and the
          real renderer state "inside the system" with one voice. */}
      <rect
        className="af-hero-node"
        style={riseAt(UC_BEAT.boundary)}
        x={96}
        y={20}
        width={242}
        height={296}
        rx={16}
        fill="var(--canvas)"
        fillOpacity={0.45}
        stroke="var(--border)"
        strokeWidth={1.25}
      />
      <text
        className="af-hero-fade font-mono"
        style={delay(UC_BEAT.boundary + 140)}
        x={110}
        y={41}
        fontSize={10}
        fill="var(--muted-foreground)"
      >
        Food Delivery
      </text>

      <g stroke="var(--edge)" strokeWidth={1.4} strokeLinecap="round">
        {UC_LINKS.map((link, index) => (
          <path
            key={link.id}
            className="af-hero-edge"
            style={delay(UC_BEAT.links + index * UC_BEAT.linkGap)}
            d={link.d}
            pathLength={1}
          />
        ))}
      </g>

      {/* Associations keep a band running once drawn — the same reason the
          sequence panel's calls do. A use-case diagram has no motion of its own
          to borrow, and a perfectly still panel between three moving ones reads
          as the card having stopped. */}
      {UC_LINKS.map((link, index) => (
        <path
          key={link.id}
          className="af-hero-trace"
          style={delay(UC_BEAT.trace + index * UC_BEAT.traceGap)}
          d={link.d}
          pathLength={100}
          stroke="var(--primary)"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ))}

      {UC_CASES.map((useCase, index) => {
        const delayMs = UC_BEAT.cases + index * UC_BEAT.caseGap;
        return (
          <g key={useCase.id}>
            <ellipse
              className="af-hero-node"
              style={riseAt(delayMs)}
              cx={217}
              cy={useCase.cy}
              rx={78}
              ry={24}
              fill="var(--uc-usecase)"
              stroke="var(--uc-usecase-border)"
              strokeWidth={1.25}
            />
            <text
              className="af-hero-fade font-medium"
              style={delay(delayMs + 120)}
              x={217}
              y={useCase.cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fill="var(--node-foreground)"
            >
              {useCase.label}
            </text>
          </g>
        );
      })}

      {/* `«include»` — dashed, open-headed, and between the two ADJACENT cases,
          which is the only reason it can be a short straight line: a dependency
          between rows two apart would have to route around the one between them
          and would stop reading as a relationship at this size. */}
      <path
        className="af-hero-fade"
        style={delay(UC_BEAT.include)}
        d="M 217 172 V 179"
        stroke="var(--edge)"
        strokeWidth={1.4}
        strokeDasharray="4 3"
      />
      <path
        className="af-hero-fade"
        style={delay(UC_BEAT.include + 120)}
        d="M 217 184 l -4 -6 M 217 184 l 4 -6"
        stroke="var(--edge)"
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      <text
        className="af-hero-fade font-mono"
        style={delay(UC_BEAT.include + 200)}
        x={228}
        y={181}
        fontSize={9}
        fill="var(--muted-foreground)"
      >
        «include»
      </text>

      {UC_ACTORS.map((actor, index) => (
        <MiniActor
          key={actor.id}
          actor={actor}
          delayMs={UC_BEAT.actors + index * UC_BEAT.actorGap}
        />
      ))}
    </svg>
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
