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
 * Decorative hero visual: one card that CYCLES THROUGH EVERY document kind
 * this product reads — a Container-level C4 diagram drawn with the editor's real
 * stack icons, a sequence flow, a flowchart, a use-case diagram, an ER schema,
 * a data dictionary and a gantt — stacked
 * over two ghost "sheets" that hint at the levels beneath (the Context→Container
 * drill-down). The kind strip in its header says which is showing, and the
 * header's LEFT side swaps with it: a level breadcrumb over the C4 panel, each
 * other document's own subtitle over its own panel — only a C4 model has levels,
 * so a breadcrumb left standing over a flowchart would be the header asserting
 * something that format cannot express.
 *
 * WHY IT CYCLES rather than showing one: the banner is the first thing a reader
 * sees, and a single C4 diagram made the other viewers look like footnotes
 * to a C4 product. Naming the kinds in the header without ever showing them
 * would be worse — a switch that never switches. It began as two kinds for
 * exactly this reason and has grown one panel per notation ever since; a kind
 * that exists in the product and not here is the same bug again.
 *
 * The swap is pure CSS: every panel occupies the same fixed 350×336 box,
 * absolutely positioned, cycling on one shared keyframe with each panel after
 * the first offset by a whole share of the cycle (`af-hero-kind` plus
 * `af-hero-kind-2` … `-7` in globals.css). No timer, no client state, so this
 * stays a SERVER component.
 *
 * Each panel assembles itself on load — sheets settle, boxes land one at a
 * time, connectors draw toward their arrowheads — and then keeps something
 * moving: the C4 panel runs a slow current along its edges, the others a
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
 *
 * FIXED-SIZE, AND THAT IS NOT AN OVERSIGHT: a 24rem card over a 350×336
 * coordinate space with hand-placed nodes. The SVG panels would scale on
 * their own, but the C4 panel is HTML boxes at absolute pixel offsets, so making
 * this fluid means rebuilding the one panel every other was drawn to match.
 *
 * It is no longer `lg:`-only, though. Hiding it below `lg` left every phone with
 * a headline and a button on an empty ground, so the landing page now renders it
 * on all viewports and fits it with `.af-hero-fit` (globals.css), which zooms
 * the whole card to 0.85 under `sm`. Two things that used to be free are now the
 * caller's job: the card can exceed a 320px viewport, and the ghost layers still
 * offset up and LEFT, so on a centred narrow layout a few pixels of sheet fall
 * outside the column. Both are clipped by the page root's `overflow-hidden`
 * rather than widening the document — which is what that `overflow-hidden`
 * exists for, but it is now load-bearing for this component and was not before.
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
 * The nine kinds, in cycle order, each paired with the phase class that puts
 * it at its own share of the swap. THE FIRST HAS NO CLASS on purpose: it runs the
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
  { name: "ER", phase: "af-hero-kind-5" },
  { name: "Dictionary", phase: "af-hero-kind-6" },
  { name: "Gantt", phase: "af-hero-kind-7" },
  { name: "Timeline", phase: "af-hero-kind-8" },
  { name: "Lifecycle", phase: "af-hero-kind-9" },
];

/**
 * What the header says on its left for the eight kinds that have no C4 levels:
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
  { name: "Shop orders", meta: "3 tables", phase: "af-hero-kind-5" },
  { name: "Customer API", meta: "4 fields", phase: "af-hero-kind-6" },
  /* The one subtitle whose `meta` is a DURATION rather than a count, because
     that is the fact this notation has where the other six have a size: "6
     rows" says nothing a reader could not see, and "4 weeks" is the answer the
     diagram exists to give. */
  { name: "Store migration", meta: "4 weeks", phase: "af-hero-kind-7" },
  /* Two counts, not one, and it is the one subtitle that needs both: "11
     events" alone says nothing about the grouping, which is the whole of what
     this notation adds over a list, and "4 periods" alone says nothing about
     the size. The gantt above it is the opposite case for the same reason —
     one number, because a duration is the fact it has. */
  {
    name: "Platform history",
    meta: "4 periods · 11 events",
    phase: "af-hero-kind-8",
  },
  /* Two counts again, and for a different reason from the timeline's above:
     "5 states" is the size, and "2 ways out" is the thing this notation has
     that no other kind here does — the branches are the whole difference
     between this and the ordered list next door, so a subtitle that named
     only the states would describe a timeline. */
  {
    name: "Order lifecycle",
    meta: "5 states · 2 ways out",
    phase: "af-hero-kind-9",
  },
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
            {/* The other six name the DOCUMENT, because that is what they
                have where a C4 model has a level: a sequence flow's title, a
                flowchart's name, a use-case system's boundary, a plan's own
                name and how long it runs. Each is the one thing the real
                viewer stamps above that kind of diagram. */}
            {/* NO INLINE `delay()` ON THESE ELEMENTS, and that is load-bearing:
                `af-hero-kind-2` … `-7` are nothing but an `animation-delay`,
                the offset that puts each one at its own point in the cycle. An inline `animationDelay` wins over the class, so a
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
              not a control: the card cycles through every notation, and this
              says how many there are and where in the set you are.

              IT WAS A NAMED PILL PER KIND, greyed until its turn — which is
              the honest design and does not fit. Four names in a 10px mono
              strip was already ~206px, and the breadcrumb beside it wants
              ~160px inside a 384px card: the two collided at four, and there
              are seven now. Widening the card to fit a legend would be letting
              the label set the size of the artwork.

              So the SET became dots and the NAME became singular. A row of
              dots answers "how many kinds", the lit one answers "which",
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

          {/* The other seven kinds, same box, each offset a whole eighth. */}
          <div className="af-hero-kind af-hero-kind-2 absolute inset-0">
            <SequencePanel />
          </div>
          <div className="af-hero-kind af-hero-kind-3 absolute inset-0">
            <FlowchartPanel />
          </div>
          <div className="af-hero-kind af-hero-kind-4 absolute inset-0">
            <UseCasePanel />
          </div>
          <div className="af-hero-kind af-hero-kind-5 absolute inset-0">
            <ErPanel />
          </div>
          <div className="af-hero-kind af-hero-kind-6 absolute inset-0">
            <DictPanel />
          </div>
          <div className="af-hero-kind af-hero-kind-7 absolute inset-0">
            <GanttPanel />
          </div>
          <div className="af-hero-kind af-hero-kind-8 absolute inset-0">
            <TimelinePanel />
          </div>
          <div className="af-hero-kind af-hero-kind-9 absolute inset-0">
            <LifecyclePanel />
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

/* -------------------------------------------------------------------------- */
/* The ER panel                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Three tables and the two lines between them — the smallest drawing that is
 * recognisably an ER diagram rather than three boxes.
 *
 * WHAT IT HAS TO SHOW to earn its slot, and why each is here rather than a
 * simplification:
 *
 *   - A HEADER BAND and RULED ROWS. Without them a table is a labelled box and
 *     the panel says "C4" to anyone glancing at it.
 *   - A `PK` and an `FK`, in the accent. They are what makes the rows read as
 *     COLUMNS rather than as a list, and they are the notation someone
 *     searching for "ER diagram" is looking for.
 *   - CROW'S FEET, both ends, both kinds. A line without them is not an ER
 *     relationship — the whole notation is at the ends — so the miniature
 *     draws the real `one` bar and the real `zero-or-more` foot, mirrored,
 *     exactly as `er-diagram.tsx` composes them from a bar, a ring and a fan.
 *
 * Hand-drawn at fixed coordinates like every sibling panel, not driven through
 * `layoutEr`: the panel is 320px wide and the real layout solves for a canvas
 * that scrolls, so feeding it a document would produce a correct diagram at
 * the wrong scale. The tradeoff is the one the other panels already accept —
 * this is artwork ABOUT the renderer, and `check:hero` pins the pairing.
 */
/* -------------------------------------------------------------------------- */
/* The data dictionary panel                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Four documented fields — the smallest drawing that is recognisably a
 * DICTIONARY rather than a table of anything.
 *
 * What earns its slot: the column HEADINGS (a dictionary is read by column,
 * and without them this is just rows), a wrapped MEANING (the column that
 * makes it a dictionary rather than a schema dump), and the flag BADGES
 * outlined exactly as the real canvas outlines them — including the one solid
 * `pii`, which is the only mark on that canvas allowed to shout.
 *
 * Hand-drawn at fixed coordinates like every sibling panel rather than driven
 * through `layoutDict`: the panel is 320px wide and the real layout solves for
 * a 940px page, so feeding it a document would produce a correct table at the
 * wrong scale.
 */
function DictPanel() {
  const COLS = { name: 12, type: 96, rules: 150, meaning: 214 };
  const rows = [
    { name: "id", type: "uuid", flags: ["required"], meaning: "Never reused" },
    { name: "email", type: "string", flags: ["pii"], meaning: "Lowercased" },
    { name: "name", type: "string", flags: [], meaning: "Free text" },
    { name: "ltv", type: "numeric", flags: ["derived"], meaning: "Nightly" },
  ];
  const badge = (flag: string) => {
    const solid = flag === "pii";
    const mark =
      flag === "required"
        ? "var(--primary)"
        : solid
          ? "var(--destructive)"
          : "var(--node-meta)";
    return { solid, mark };
  };

  return (
    <svg viewBox="0 0 320 240" className="h-full w-full" aria-hidden="true">
      <rect
        x="4"
        y="34"
        width="312"
        height="184"
        rx="8"
        fill="var(--node)"
        stroke="var(--node-border)"
      />
      <text
        x="8"
        y="22"
        dominantBaseline="central"
        fontSize="12"
        fontWeight="650"
        fill="var(--foreground)"
      >
        Customer
      </text>
      {(["name", "type", "rules", "meaning"] as const).map((key) => (
        <text
          key={key}
          x={COLS[key]}
          y="48"
          dominantBaseline="central"
          fontSize="7"
          fontWeight="600"
          letterSpacing="0.5"
          fill="var(--muted-foreground)"
        >
          {key === "name"
            ? "FIELD"
            : key === "rules"
              ? "RULES"
              : key === "type"
                ? "TYPE"
                : "MEANING"}
        </text>
      ))}
      <line
        x1="4"
        y1="58"
        x2="316"
        y2="58"
        stroke="var(--node-border)"
        strokeWidth="1"
      />
      {rows.map((row, index) => {
        const y = 76 + index * 36;
        return (
          <g key={row.name}>
            {index > 0 ? (
              <line
                x1="4"
                y1={y - 18}
                x2="316"
                y2={y - 18}
                stroke="var(--node-border)"
                strokeWidth="1"
                opacity="0.5"
              />
            ) : null}
            <text
              x={COLS.name}
              y={y}
              dominantBaseline="central"
              fontSize="8.5"
              fontWeight="600"
              fill="var(--node-foreground)"
            >
              {row.name}
            </text>
            <text
              x={COLS.type}
              y={y}
              dominantBaseline="central"
              fontSize="8"
              fill="var(--node-meta)"
            >
              {row.type}
            </text>
            {row.flags.map((flag) => {
              const paint = badge(flag);
              const width = flag.length * 4.6 + 10;
              return (
                <g key={flag}>
                  <rect
                    x={COLS.rules}
                    y={y - 6}
                    width={width}
                    height="12"
                    rx="6"
                    fill={paint.solid ? paint.mark : "none"}
                    stroke={paint.mark}
                    strokeWidth="1"
                  />
                  <text
                    x={COLS.rules + width / 2}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="6.5"
                    fontWeight="700"
                    fill={
                      paint.solid ? "var(--destructive-foreground)" : paint.mark
                    }
                  >
                    {flag}
                  </text>
                </g>
              );
            })}
            <text
              x={COLS.meaning}
              y={y}
              dominantBaseline="central"
              fontSize="8"
              fill="var(--node-foreground)"
            >
              {row.meaning}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* The gantt panel                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The card's seventh face: a miniature Gantt in the same fixed 350×336 box.
 *
 * WHAT IT HAS TO SHOW, and why a row of bars would not have been enough. Every
 * plan tool draws durations; the three things a reader cannot get from a bar
 * chart are the three drawn here, and each is the reason a row exists:
 *
 *   - A MEASURED AXIS. x is `day * PX_PER_DAY` and nothing else, so a bar's
 *     length IS its duration. That is the one axis in this whole hero that
 *     means a quantity rather than a position, which is what separates a
 *     gantt from the other six miniatures (`gantt/lib/layout.ts` opens
 *     on the same distinction).
 *   - A DEPENDENCY ELBOW. "What can't start until this is done" is the half of
 *     the notation a reader arrives without, so the connectors are derived
 *     from the bars they join rather than drawn beside them — the arrangement
 *     `ErPanel` had to be rewritten into after its hand-typed paths detached
 *     from its hand-typed tables.
 *   - A MILESTONE DIAMOND. A zero-duration item is a different SHAPE, not a
 *     very short bar, because a bar of width zero says "this takes no time"
 *     where a diamond says "this is a date".
 *
 * The critical chain is tinted with `--gantt-critical` — cap, connector and
 * arrowhead — exactly as `gantt-motion.css` paints the real canvas, and the
 * ambient band retraces that chain and no other line. Same choice the
 * flowchart panel's trace makes: the resting motion follows the route the
 * diagram is ABOUT. A band down the float branch would say the slack matters
 * as much as the path that sets the end date, which is the one thing a Gantt
 * exists to deny.
 *
 * Hand-set geometry rather than a call into `layoutGantt`, for the reason
 * every panel here states: the real layout solves for a 1020px canvas with a
 * 196px rail, and feeding it a document would draw a correct plan at four
 * times this panel's scale.
 */

/** The plot's own geometry. `PX_PER_DAY` is derived, never typed: it is the
 *  whole claim the panel makes, and a hand-rounded copy could contradict the
 *  axis drawn from the same two edges. */
const GANTT_PLOT = { x0: 104, x1: 330, days: 28, tickStep: 7 } as const;
const GANTT_PX_PER_DAY = (GANTT_PLOT.x1 - GANTT_PLOT.x0) / GANTT_PLOT.days;
const ganttX = (day: number) => GANTT_PLOT.x0 + day * GANTT_PX_PER_DAY;

/** Row and band metrics, in the same shape (and the same spirit) as `GANTT`. */
const GANTT_METRIC = {
  axisRule: 28,
  rowHeight: 36,
  barHeight: 18,
  /** Bar top, measured from the row's top — `GANTT.barOffsetY` at this scale. */
  barOffsetY: 6,
  sectionHead: 20,
  milestoneRadius: 8,
  /** The primary-coloured cap on a critical bar's leading edge. */
  capWidth: 3,
} as const;

/**
 * The plan, as data. Sections in order, each with its rows; `y` is solved
 * below rather than written down, so a row inserted anywhere moves the ones
 * under it instead of overlapping them.
 *
 * `state` names the four the grammar has, spelled as `gantt-motion.css`
 * spells them, so the fills below are lookups rather than choices. All four
 * appear, and `planned` appears as an absent state exactly as a real document
 * writes it.
 */
const GANTT_SECTIONS: readonly {
  name: string;
  rows: readonly {
    id: string;
    label: string;
    /** Day offsets. A milestone has `to` equal to `from`. */
    from: number;
    to: number;
    state?: "done" | "active" | "at-risk";
    milestone?: true;
    /** On the chain that decides the end date. */
    critical?: true;
    /** The row this one cannot start until — drawn as an elbow. */
    after?: string;
  }[];
}[] = [
  {
    name: "Audit",
    rows: [
      {
        id: "inventory",
        label: "Rack audit",
        from: 0,
        to: 6,
        state: "done",
        critical: true,
      },
      /* THE FLOAT BRANCH, and the one row with no `after`. Fast work sitting
         beside slow procurement is what slack actually looks like on a plan,
         and a miniature where every bar is on the critical path would make the
         tint below say nothing. */
      { id: "netplan", label: "Move plan", from: 9, to: 14, state: "done" },
    ],
  },
  {
    name: "Move",
    rows: [
      {
        id: "crossconnect",
        label: "Cross-connects",
        from: 7,
        to: 18,
        state: "active",
        critical: true,
        after: "inventory",
      },
      {
        id: "ship",
        label: "Ship and rack",
        from: 19,
        to: 23,
        critical: true,
        after: "crossconnect",
      },
    ],
  },
  {
    name: "Live",
    rows: [
      {
        id: "recable",
        label: "Re-cable",
        from: 24,
        to: 26,
        state: "at-risk",
        critical: true,
        after: "ship",
      },
      {
        id: "cutover",
        label: "Cutover",
        from: 28,
        to: 28,
        milestone: true,
        critical: true,
        after: "recable",
      },
    ],
  },
];

/** Fill and border per reporting state, the same pairs `gantt-motion.css`
 *  paints the real bars with — a `planned` bar carries no state at all, which
 *  is why the default sits on the key rather than beside it. */
const GANTT_STATE_TOKEN = {
  planned: "external",
  done: "queue",
  active: "internal",
  "at-risk": "decision",
} as const;

/** Beats for the gantt panel, mirroring `FLOW_BEAT`'s shape. */
const GANTT_BEAT = {
  axis: 380,
  sections: 460,
  rows: 540,
  rowGap: 90,
  edges: 760,
  edgeGap: 90,
  trace: 2000,
  traceGap: 170,
} as const;

/**
 * SOLVED, NOT TYPED. Every y comes from the two metrics above, so the bars, the
 * rail names, the section headings and the connector elbows all read one
 * arrangement — the property `ErPanel` lost when its paths and its tables were
 * placed by two separate hand-written sets.
 *
 * AT MODULE SCOPE, not inside the component. `GANTT_SECTIONS` and `GANTT_METRIC` are
 * both constants, so this arrangement is the same on every render and there is
 * nothing here for a render to decide. Running it in the component body also
 * meant carrying a `cursor` that each row reassigned, which is a mutation after
 * render completes and what `react-hooks/immutability` refuses.
 */
const GANTT_PLACED = (() => {
  let cursor = GANTT_METRIC.axisRule + 12;
  return GANTT_SECTIONS.map((section) => {
    const headY = cursor + GANTT_METRIC.sectionHead / 2;
    cursor += GANTT_METRIC.sectionHead;
    const rows = section.rows.map((row) => {
      const top = cursor;
      cursor += GANTT_METRIC.rowHeight;
      return {
        ...row,
        top,
        midY: top + GANTT_METRIC.barOffsetY + GANTT_METRIC.barHeight / 2,
      };
    });
    return { name: section.name, headY, rows };
  });
})();

const GANTT_ROWS = GANTT_PLACED.flatMap((section) => section.rows);
const GANTT_ROW_BY_ID = new Map(GANTT_ROWS.map((row) => [row.id, row]));

function GanttPanel() {
  const placed = GANTT_PLACED;
  const rows = GANTT_ROWS;
  const rowById = GANTT_ROW_BY_ID;

  /** Out of the predecessor's right edge, down its own channel, into the
   *  dependant's left edge — the out-across-in route the real router falls
   *  back to, with the channel sitting in the gutter the two bars leave. */
  const elbows = rows.flatMap((row) => {
    const from = row.after === undefined ? undefined : rowById.get(row.after);
    if (from === undefined) return [];
    const startX = ganttX(from.to);
    /* A milestone is entered at its LEFT VERTEX, not at its centre — an
       arrowhead landing in the middle of the diamond would be drawn over by
       it. */
    const endX =
      row.milestone === true
        ? ganttX(row.from) - GANTT_METRIC.milestoneRadius
        : ganttX(row.from);
    const channel = (startX + endX) / 2;
    return [
      {
        id: `${from.id}-${row.id}`,
        critical: row.critical === true && from.critical === true,
        endX,
        endY: row.midY,
        d: `M ${startX} ${from.midY} H ${channel} V ${row.midY} H ${endX}`,
      },
    ];
  });

  return (
    <svg
      viewBox="0 0 350 336"
      fill="none"
      className="absolute inset-0 h-full w-full"
    >
      {/* The measured axis: a tick every week, the label above it, and the
          baseline the bars hang from. Drawn first so nothing crosses a bar. */}
      <g className="af-hero-fade" style={delay(GANTT_BEAT.axis)}>
        {Array.from(
          { length: GANTT_PLOT.days / GANTT_PLOT.tickStep + 1 },
          (_, index) => index * GANTT_PLOT.tickStep,
        ).map((day) => (
          <g key={day}>
            <path
              d={`M ${ganttX(day)} ${GANTT_METRIC.axisRule} V 306`}
              stroke="var(--canvas-grid)"
              strokeWidth={1}
            />
            <text
              x={ganttX(day)}
              y={16}
              textAnchor={
                day === 0 ? "start" : day === GANTT_PLOT.days ? "end" : "middle"
              }
              dominantBaseline="central"
              fontSize={8.5}
              className="font-mono"
              fill="var(--muted-foreground)"
            >
              {`${2 + day} Mar`}
            </text>
          </g>
        ))}
        <path
          d={`M ${GANTT_PLOT.x0} ${GANTT_METRIC.axisRule} H ${GANTT_PLOT.x1}`}
          stroke="var(--edge)"
          strokeWidth={1.2}
        />
      </g>

      {/* The connectors, UNDER the bars: a line that stops a hair inside a
          bar's outline is hidden by it rather than crossing into the label. */}
      {elbows.map((elbow, index) => (
        <g key={elbow.id}>
          <path
            className="af-hero-edge"
            style={delay(GANTT_BEAT.edges + index * GANTT_BEAT.edgeGap)}
            d={elbow.d}
            pathLength={1}
            stroke={elbow.critical ? "var(--gantt-critical)" : "var(--edge)"}
            strokeWidth={elbow.critical ? 1.9 : 1.3}
            strokeLinecap="round"
          />
          <path
            className="af-hero-fade"
            style={delay(
              GANTT_BEAT.edges + index * GANTT_BEAT.edgeGap + BEAT.drawMs,
            )}
            d={`M ${elbow.endX} ${elbow.endY} l -6 -4 v 8 Z`}
            fill={elbow.critical ? "var(--gantt-critical)" : "var(--edge)"}
          />
        </g>
      ))}

      {/* The ambient band, over the finished chain and along it only. Same
          `pathLength=100` trick the flowchart panel uses, so one keyframe fits
          every span however the route bends. */}
      {elbows
        .filter((elbow) => elbow.critical)
        .map((elbow, index) => (
          <path
            key={elbow.id}
            className="af-hero-trace"
            style={delay(GANTT_BEAT.trace + index * GANTT_BEAT.traceGap)}
            d={elbow.d}
            pathLength={100}
            stroke="var(--gantt-critical)"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        ))}

      {placed.map((section, sectionIndex) => (
        <text
          key={section.name}
          className="af-hero-fade font-mono"
          style={delay(GANTT_BEAT.sections + sectionIndex * 110)}
          x={4}
          y={section.headY}
          dominantBaseline="central"
          fontSize={8.5}
          letterSpacing={0.6}
          fill="var(--muted-foreground)"
        >
          {section.name.toUpperCase()}
        </text>
      ))}

      {rows.map((row, index) => {
        const delayMs = GANTT_BEAT.rows + index * GANTT_BEAT.rowGap;
        const token = GANTT_STATE_TOKEN[row.state ?? "planned"];
        /* `--flow-decision` rather than a `--node-*` pair for `at-risk`: the
           amber that means "a decision" on a flowchart means "watch this" on a
           plan, and it is the pair the real canvas already reuses. */
        const fill =
          token === "decision"
            ? "var(--flow-decision)"
            : `var(--node-${token})`;
        const stroke =
          token === "decision"
            ? "var(--flow-decision-border)"
            : `var(--node-${token}-border)`;
        return (
          <g key={row.id}>
            {/* The rail name, right-aligned against the plot's left edge, so
                the labels form the column the real canvas gives them. */}
            <text
              className="af-hero-fade"
              style={delay(delayMs + 110)}
              x={GANTT_PLOT.x0 - 10}
              y={row.midY}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={9.5}
              fill="var(--node-foreground)"
            >
              {row.label}
            </text>

            {row.milestone === true ? (
              /* A DIAMOND, NOT A ONE-DAY BAR. A zero-duration item is a date
                 rather than a short piece of work, and drawing it as a sliver
                 would say the opposite. */
              <path
                className="af-hero-node"
                style={riseAt(delayMs)}
                d={`M ${ganttX(row.from)} ${row.midY - GANTT_METRIC.milestoneRadius} L ${ganttX(row.from) + GANTT_METRIC.milestoneRadius} ${row.midY} L ${ganttX(row.from)} ${row.midY + GANTT_METRIC.milestoneRadius} L ${ganttX(row.from) - GANTT_METRIC.milestoneRadius} ${row.midY} Z`}
                fill="var(--node)"
                stroke="var(--gantt-critical)"
                strokeWidth={2}
              />
            ) : (
              <>
                <rect
                  className="af-hero-node"
                  style={riseAt(delayMs)}
                  x={ganttX(row.from)}
                  y={row.top + GANTT_METRIC.barOffsetY}
                  width={ganttX(row.to) - ganttX(row.from)}
                  height={GANTT_METRIC.barHeight}
                  rx={4}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.25}
                />
                {row.critical === true ? (
                  /* The cap on the leading edge, in the critical tint — the
                     one mark that says "this bar sets the end date" without
                     recolouring the state the bar is reporting. */
                  <rect
                    className="af-hero-node"
                    style={riseAt(delayMs + 60)}
                    x={ganttX(row.from)}
                    y={row.top + GANTT_METRIC.barOffsetY}
                    width={GANTT_METRIC.capWidth}
                    height={GANTT_METRIC.barHeight}
                    fill="var(--gantt-critical)"
                  />
                ) : null}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* The milestone timeline panel                                                */
/* -------------------------------------------------------------------------- */

/**
 * The card's eighth face: a miniature milestone timeline in the same fixed
 * 350×336 box.
 *
 * WHAT IT HAS TO SHOW, and why it must not look like the gantt one panel
 * earlier. The two notations are neighbours and their overlap was WAIVED
 * rather than argued away (`src/types/timeline.ts`), so this miniature's job
 * is partly to make the difference visible in the two seconds it is on screen:
 *
 *   - IT RUNS DOWN, not across. That alone separates it from every bar the
 *     gantt panel draws, and it is the real canvas's own choice for the real
 *     reason — the label is the whole element, so it gets the width.
 *   - THERE IS NO AXIS AND NOTHING IS MEASURED. The gantt panel's one boast is
 *     that x means a quantity; here the spine carries ticks nowhere, the gaps
 *     between dots are the heights of sentences, and a reader who tries to
 *     read a duration off it finds none. That is the notation.
 *   - THE BANDS ARE DIFFERENT SIZES, solved from their event counts, so the
 *     picture says more happened later. A miniature with three equal bands
 *     would be the grid `purpose.md` forbids, drawn at the one scale where
 *     nobody would notice.
 *
 * Hand-set geometry rather than a call into `layoutTimeline`, for the reason
 * every panel here states: the real layout solves for a 1020-unit canvas whose
 * label measure alone is 620, and feeding it a document would draw a correct
 * timeline at three times this panel's width.
 *
 * The ambient band retraces the SPINE, and nothing else — the same choice the
 * gantt panel makes for its critical chain and the flowchart panel for its
 * route: the resting motion follows the thing the diagram is about. On this
 * canvas that is the passage of time, which is exactly what the real
 * `timeline-motion.css` sweep says and the only thing here a still frame
 * cannot.
 */

/** Where the spine runs, and the two columns either side of it. */
const TL_METRIC = {
  spineX: 96,
  railRight: 84,
  labelX: 112,
  top: 22,
  dotRadius: 5,
  periodHead: 20,
  eventGap: 8,
  lineHeight: 13,
} as const;

/**
 * The history, as data — periods in order, each with its events. An event's
 * `lines` is how many lines its label takes at this scale, which is what the
 * real layout SOLVES and this panel has to be told: it is the field that makes
 * the bands different heights, so it is the field a reader is actually seeing.
 */
const TL_PERIODS: readonly {
  name: string;
  events: readonly { label: readonly string[] }[];
}[] = [
  { name: "2016", events: [{ label: ["Two people and a prototype"] }] },
  {
    name: "2018",
    events: [
      { label: ["First paying customer"] },
      { label: ["Split the monolith into", "an API and a web app"] },
    ],
  },
  {
    name: "2021",
    events: [
      { label: ["Order store off the", "shared database"] },
      { label: ["First platform engineer"] },
      { label: ["The Friday freeze ended"] },
    ],
  },
  {
    name: "2024",
    events: [
      { label: ["Opened the public API"] },
      { label: ["First region outside Europe"] },
      { label: ["Ten million orders in a month"] },
    ],
  },
];

/** Beats for the timeline panel, mirroring `GANTT_BEAT`'s shape. */
const TL_BEAT = {
  spine: 380,
  periods: 460,
  events: 560,
  eventGap: 80,
  trace: 2000,
} as const;

/**
 * SOLVED, NOT TYPED, and at module scope for the reason `GANTT_PLACED` gives:
 * every y comes from the metrics above and the line counts in the data, so a
 * longer label pushes what is under it instead of overlapping it — which is
 * the same property `check:timeline-layout` asserts of the real canvas, made
 * unspellable here rather than merely correct today.
 */
const TL_PLACED = (() => {
  let cursor = TL_METRIC.top;
  return TL_PERIODS.map((period) => {
    const headY = cursor + TL_METRIC.periodHead / 2;
    cursor += TL_METRIC.periodHead;
    const events = period.events.map((event) => {
      const dotY = cursor + 5;
      const height = event.label.length * TL_METRIC.lineHeight;
      cursor += height + TL_METRIC.eventGap;
      return {
        ...event,
        dotY,
        firstLineY: cursor - height - TL_METRIC.eventGap + 8,
      };
    });
    return { name: period.name, headY, events, ruleY: headY + 8 };
  });
})();

const TL_EVENTS = TL_PLACED.flatMap((period) => period.events);
const TL_SPINE_TOP = TL_EVENTS[0].dotY;
const TL_SPINE_BOTTOM = TL_EVENTS[TL_EVENTS.length - 1].dotY;

function TimelinePanel() {
  return (
    <svg
      viewBox="0 0 350 336"
      fill="none"
      className="absolute inset-0 h-full w-full"
    >
      {/* The spine, drawn first so nothing crosses a dot. It is CLIPPED TO THE
          DOTS, exactly as the real canvas clips it: a line running the full
          height would imply time either side of the document, which this
          notation has no way to claim. */}
      <path
        className="af-hero-edge"
        style={delay(TL_BEAT.spine)}
        d={`M ${TL_METRIC.spineX} ${TL_SPINE_TOP} V ${TL_SPINE_BOTTOM}`}
        pathLength={1}
        stroke="var(--canvas-grid)"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* The ambient band, down the spine and along nothing else. */}
      <path
        className="af-hero-trace"
        style={delay(TL_BEAT.trace)}
        d={`M ${TL_METRIC.spineX} ${TL_SPINE_TOP} V ${TL_SPINE_BOTTOM}`}
        pathLength={100}
        stroke="var(--edge-drift)"
        strokeWidth={3}
        strokeLinecap="round"
      />

      {TL_PLACED.map((period, periodIndex) => (
        <g key={period.name}>
          <text
            className="af-hero-fade font-mono"
            style={delay(TL_BEAT.periods + periodIndex * 110)}
            x={TL_METRIC.railRight}
            y={period.headY}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={8.5}
            letterSpacing={0.6}
            fill="var(--muted-foreground)"
          >
            {period.name}
          </text>
          <path
            className="af-hero-fade"
            style={delay(TL_BEAT.periods + periodIndex * 110)}
            d={`M 4 ${period.ruleY} H 342`}
            stroke="var(--canvas-grid)"
            strokeWidth={1}
            opacity={0.55}
          />
        </g>
      ))}

      {TL_EVENTS.map((event, index) => {
        const delayMs = TL_BEAT.events + index * TL_BEAT.eventGap;
        return (
          <g key={`${event.dotY}`}>
            {/* ONE APPEARANCE FOR EVERY DOT, which is the notation and not an
                unfinished palette: this kind assigns no meaning to colour, so
                a second fill here would be a distinction the grammar cannot
                express. */}
            <circle
              className="af-hero-node"
              style={riseAt(delayMs)}
              cx={TL_METRIC.spineX}
              cy={event.dotY}
              r={TL_METRIC.dotRadius}
              fill="var(--node)"
              stroke="var(--primary)"
              strokeWidth={2}
            />
            {event.label.map((line, lineIndex) => (
              <text
                key={line}
                className="af-hero-fade"
                style={delay(delayMs + 90)}
                x={TL_METRIC.labelX}
                y={event.firstLineY + lineIndex * TL_METRIC.lineHeight}
                dominantBaseline="central"
                fontSize={9.5}
                fill="var(--node-foreground)"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function ErPanel() {
  /* THE TABLE RECTS ARE DATA, and the connectors are DERIVED from them.
     THE BUG THIS FIXES: the paths and the crow's feet were hand-written
     coordinates while the tables were placed by SEPARATE hand-written
     coordinates, and the two sets did not agree — the dashed line began at
     y=150 in a panel whose Customer table ends at y=78, so it started in
     mid-air with nothing attached to it. Deriving both from one table makes
     that class of mistake unspellable rather than merely fixed. */
  const TABLES = {
    customer: { x: 8, y: 24, w: 100, rows: 2 },
    order: { x: 148, y: 84, w: 108, rows: 2 },
    audit: { x: 148, y: 162, w: 108, rows: 1 },
  } as const;
  const HEAD = 22;
  const ROW = 16;
  const FOOT = 11;
  const SPREAD = 5;

  const box = (key: keyof typeof TABLES) => {
    const t = TABLES[key];
    return { ...t, h: HEAD + t.rows * ROW };
  };

  /** Right edge of `from` to left edge of `to`, out-across-in. `exitOffset`
   * separates two lines leaving one table so they do not overlap. */
  const link = (
    from: keyof typeof TABLES,
    to: keyof typeof TABLES,
    exitOffset: number,
  ) => {
    const a = box(from);
    const b = box(to);
    const startX = a.x + a.w;
    const startY = a.y + a.h / 2 + exitOffset;
    const endX = b.x;
    const endY = b.y + b.h / 2;
    const midX = (startX + endX) / 2;
    return {
      d: `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`,
      startX,
      startY,
      endX,
      endY,
    };
  };

  const toOrder = link("customer", "order", -8);
  const toAudit = link("customer", "audit", 8);

  /** The `one` end: a bar ACROSS the line, just outside the box it leaves. */
  const bar = (x: number, y: number) =>
    `M ${x + FOOT * 0.55} ${y - SPREAD} L ${x + FOOT * 0.55} ${y + SPREAD}`;

  /** The `zero-or-more` end: a three-toed fan opening away from the box it
   * enters, exactly as `er-diagram.tsx` composes it. */
  const fan = (x: number, y: number) =>
    `M ${x} ${y} L ${x - FOOT} ${y - SPREAD} M ${x} ${y} L ${x - FOOT} ${y + SPREAD} M ${x} ${y} L ${x - FOOT} ${y}`;

  const table = (
    x: number,
    y: number,
    width: number,
    name: string,
    rows: { name: string; type: string; key?: string }[],
  ) => (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={22 + rows.length * 16}
        rx={6}
        fill="var(--node)"
        stroke="var(--node-border)"
        strokeWidth={1}
      />
      <path
        d={`M ${x} ${y + 22} L ${x} ${y + 6} Q ${x} ${y} ${x + 6} ${y} L ${x + width - 6} ${y} Q ${x + width} ${y} ${x + width} ${y + 6} L ${x + width} ${y + 22} Z`}
        fill="var(--primary)"
        opacity={0.12}
      />
      <line
        x1={x}
        y1={y + 22}
        x2={x + width}
        y2={y + 22}
        stroke="var(--node-border)"
        strokeWidth={1}
      />
      <text
        x={x + 8}
        y={y + 11}
        dominantBaseline="central"
        fontSize={9.5}
        fontWeight={650}
        fill="var(--node-foreground)"
      >
        {name}
      </text>
      {rows.map((row, index) => (
        <g key={row.name}>
          <text
            x={x + 8}
            y={y + 22 + index * 16 + 8}
            dominantBaseline="central"
            fontSize={8}
            fill="var(--node-foreground)"
          >
            {row.name}
          </text>
          {row.key !== undefined ? (
            <text
              x={x + width - 8 - row.type.length * 4.6 - 6}
              y={y + 22 + index * 16 + 8}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={7}
              fontWeight={700}
              fill="var(--primary)"
            >
              {row.key}
            </text>
          ) : null}
          <text
            x={x + width - 8}
            y={y + 22 + index * 16 + 8}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={8}
            fill="var(--node-meta)"
          >
            {row.type}
          </text>
        </g>
      ))}
    </g>
  );

  return (
    <svg viewBox="0 0 320 240" className="h-full w-full" aria-hidden="true">
      {/* Lines under the tables, so a connector never crosses a box it only
          passes — the rule the real canvas holds. */}
      <g
        className="af-hero-er-line"
        fill="none"
        stroke="var(--edge)"
        strokeWidth={1.2}
      >
        <path d={toOrder.d} />
        <path d={toAudit.d} strokeDasharray="4 3" />
      </g>
      {/* The crow's feet, drawn as the real canvas composes them: a BAR is "at
          least one", a FAN is "many", a RING is "zero allowed". */}
      <g fill="none" stroke="var(--edge)" strokeWidth={1.2}>
        <path d={bar(toOrder.startX, toOrder.startY)} />
        <path d={fan(toOrder.endX, toOrder.endY)} />
        <path d={bar(toAudit.startX, toAudit.startY)} />
        <path d={fan(toAudit.endX, toAudit.endY)} />
        <circle
          cx={toAudit.endX - FOOT - 4}
          cy={toAudit.endY}
          r={3}
          fill="var(--canvas)"
        />
      </g>

      {table(8, 24, 100, "Customer", [
        { name: "id", type: "uuid", key: "PK" },
        { name: "email", type: "string", key: "UK" },
      ])}
      {table(148, 84, 108, "Order", [
        { name: "id", type: "uuid", key: "PK" },
        { name: "customer_id", type: "uuid", key: "FK" },
      ])}
      {table(148, 162, 108, "Audit log", [{ name: "at", type: "timestamptz" }])}
    </svg>
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
            cloned per use and every clone runs the same animation gantt, so
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

/* -------------------------------------------------------------------------- */
/* The lifecycle panel                                                         */
/* -------------------------------------------------------------------------- */

/**
 * ONE THING MOVING THROUGH STATES, AND THE WAYS IT CAN LEAVE.
 *
 * THE MINIATURE'S JOB IS TO NOT LOOK LIKE THE FLOWCHART PANEL, six slots
 * earlier in the same cycle. A reader sees both within a minute, and if they
 * read as the same picture this notation has failed in the one place it is
 * most exposed (`src/types/lifecycle.ts` records that the overlap with the
 * flowchart was waived rather than argued away). Three things separate them,
 * and all three are the real canvas's own:
 *
 *   - THE STATES ARE ON A LINE, IN ONE COLUMN, WITH NO ARROWS BETWEEN THEM.
 *     The flowchart panel draws boxes joined by arrowheads; here the order is
 *     the geometry and there is nothing between one state and the next to
 *     draw. That absence is the strongest signal available at this size.
 *   - THE BRANCHES LEAVE SIDEWAYS, INTO THEIR OWN LANE, at a smaller size.
 *     Everything right of the spine is where the subject goes; everything
 *     left of it is where it stops going.
 *   - THE ONE ARROWHEAD ON THE PANEL points INTO the spine, at the end of the
 *     return. On the flowchart panel every edge has one; here exactly one mark
 *     does, so it means one thing.
 *
 * Hand-set geometry rather than a call into `layoutLifecycle`, for the reason
 * every panel here states: the real layout solves for a 1040-unit canvas whose
 * state measure alone is 500, and feeding it a document would draw a correct
 * lifecycle at three times this panel's width.
 *
 * The ambient band retraces the SPINE and nothing else — the same choice the
 * timeline panel makes, and for the same reason: the resting motion follows
 * the thing the diagram is about, which here is one subject's passage down the
 * track. It is exactly what the real `lifecycle-motion.css` sweep says and the
 * only thing here a still frame cannot.
 */

/** Where the spine runs, the branch lane to its left, and the return's channel. */
const LC_METRIC = {
  spineX: 150,
  branchRight: 132,
  branchDot: 140,
  labelX: 166,
  channelX: 14,
  subjectY: 26,
  top: 52,
  dotRadius: 5,
  exitDotRadius: 3.5,
  lineHeight: 13,
  stateGap: 26,
  exitTop: 20,
  exitGap: 14,
  whenGap: 13,
  stopHalf: 6,
} as const;

/**
 * The lifecycle, as data — states in order, each with its departures. An
 * exit's `rejoins` is the id of an EARLIER state, exactly as the grammar
 * demands, so the return drawn below can only ever point back up the track.
 */
const LC_STATES: readonly {
  id: string;
  label: string;
  final?: boolean;
  exits?: readonly { label: string; when: string; rejoins: string | null }[];
}[] = [
  {
    id: "placed",
    label: "Placed",
    exits: [{ label: "Cancelled", when: "before payment", rejoins: null }],
  },
  { id: "paid", label: "Paid" },
  { id: "packed", label: "Packed" },
  {
    id: "shipped",
    label: "Shipped",
    exits: [
      { label: "Returned", when: "refused at the door", rejoins: "packed" },
    ],
  },
  { id: "delivered", label: "Delivered", final: true },
];

/** Beats for the lifecycle panel, mirroring `TL_BEAT`'s shape. */
const LC_BEAT = {
  spine: 380,
  states: 500,
  stateGap: 90,
  returns: 980,
  trace: 2000,
} as const;

/**
 * SOLVED, NOT TYPED, and at module scope for the reason `TL_PLACED` gives:
 * every y comes from the metrics above and the exits in the data, so a state
 * with a branch pushes what is under it instead of overlapping it — the same
 * property `check:lifecycle-layout` asserts of the real canvas, made
 * unspellable here rather than merely correct today.
 *
 * THE RETURN'S ROUTE IS SOLVED HERE TOO, and its two corner rules are the real
 * layout's: it leaves BELOW its own text (running left from the dot would
 * cross the label right-aligned in the lane it has to travel through) and it
 * meets the spine IN THE GAP above its target, never at the dot — so it
 * crosses no state it does not touch, at this scale as at full size.
 */
const LC_PLACED = (() => {
  let cursor = LC_METRIC.top;
  const rows = LC_STATES.map((state) => {
    const dotY = cursor + 5;
    let leftCursor = dotY + LC_METRIC.exitTop;
    let leftBottom = dotY;
    const exits = (state.exits ?? []).map((exit) => {
      const exitDotY = leftCursor;
      const whenY = exitDotY + LC_METRIC.whenGap;
      leftCursor = whenY + LC_METRIC.exitGap;
      leftBottom = whenY;
      return { ...exit, dotY: exitDotY, whenY, bottom: whenY };
    });
    const top = cursor;
    cursor = Math.max(dotY, leftBottom) + LC_METRIC.stateGap;
    return { ...state, top, dotY, exits, bottom: Math.max(dotY, leftBottom) };
  });

  /* The gap a return re-enters through: between the previous row's bottom and
     this one's top, which is air by construction. */
  const returns = rows.flatMap((row) =>
    row.exits
      .filter((exit) => exit.rejoins !== null)
      .map((exit) => {
        const targetIndex = rows.findIndex((r) => r.id === exit.rejoins);
        const gapTop =
          targetIndex <= 0
            ? LC_METRIC.subjectY + 8
            : rows[targetIndex - 1].bottom;
        const gapBottom = rows[targetIndex].top;
        return {
          key: `${row.id}-${exit.label}`,
          fromY: exit.dotY,
          departY: exit.bottom + LC_METRIC.exitGap / 2,
          joinY: (gapTop + gapBottom) / 2,
        };
      }),
  );

  return { rows, returns };
})();

const LC_SPINE_TOP = LC_PLACED.rows[0].dotY;
const LC_SPINE_BOTTOM = LC_PLACED.rows[LC_PLACED.rows.length - 1].dotY;

function LifecyclePanel() {
  return (
    <svg
      viewBox="0 0 350 336"
      fill="none"
      className="absolute inset-0 h-full w-full"
    >
      {/* The subject, above the track. It is what the states are states OF,
          so it is not on the line and carries no dot — a first box here would
          read as a start node, which is a flowchart's element. */}
      <text
        className="af-hero-fade"
        style={delay(LC_BEAT.spine)}
        x={LC_METRIC.labelX}
        y={LC_METRIC.subjectY}
        dominantBaseline="central"
        fontSize={13}
        fontWeight={600}
        fill="var(--foreground)"
      >
        Order
      </text>

      {/* The spine, drawn first so nothing crosses a dot. CLIPPED TO THE DOTS,
          exactly as the real canvas clips it: a line running past the outermost
          state would say the subject was somewhere before it began or goes on
          after it stops. */}
      <path
        className="af-hero-edge"
        style={delay(LC_BEAT.spine)}
        d={`M ${LC_METRIC.spineX} ${LC_SPINE_TOP} V ${LC_SPINE_BOTTOM}`}
        pathLength={1}
        stroke="var(--canvas-grid)"
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* The ambient band, down the spine and along nothing else. */}
      <path
        className="af-hero-trace"
        style={delay(LC_BEAT.trace)}
        d={`M ${LC_METRIC.spineX} ${LC_SPINE_TOP} V ${LC_SPINE_BOTTOM}`}
        pathLength={100}
        stroke="var(--edge-drift)"
        strokeWidth={3}
        strokeLinecap="round"
      />

      {/* The returns, under the states so a dot is never crossed. Each is
          drawn FROM its departure TO the spine, which is the direction the
          subject travels — the same orientation the real canvas's `d` uses so
          its travelling dash runs the right way. */}
      {LC_PLACED.returns.map((route) => (
        <g key={route.key}>
          <path
            className="af-hero-edge"
            style={delay(LC_BEAT.returns)}
            d={`M ${LC_METRIC.branchDot} ${route.fromY} V ${route.departY} H ${LC_METRIC.channelX} V ${route.joinY} H ${LC_METRIC.spineX}`}
            pathLength={1}
            stroke="var(--edge)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {/* The panel's ONE arrowhead. There are none between states, because
              the track has no edges — so this mark means exactly one thing
              wherever a reader meets it: the subject comes back in here. */}
          <path
            className="af-hero-fade"
            style={delay(LC_BEAT.returns + 220)}
            d={`M ${LC_METRIC.spineX} ${route.joinY} l -6 -3 l 0 6 z`}
            fill="var(--edge)"
          />
        </g>
      ))}

      {LC_PLACED.rows.map((row, index) => {
        const delayMs = LC_BEAT.states + index * LC_BEAT.stateGap;
        return (
          <g key={row.id}>
            {row.exits.map((exit) => (
              <g key={exit.label}>
                <path
                  className="af-hero-edge"
                  style={delay(delayMs + 60)}
                  d={`M ${LC_METRIC.spineX} ${row.dotY} V ${exit.dotY} H ${LC_METRIC.branchDot}`}
                  pathLength={1}
                  stroke="var(--edge)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                <circle
                  className="af-hero-node"
                  style={riseAt(delayMs + 90)}
                  cx={LC_METRIC.branchDot}
                  cy={exit.dotY}
                  r={LC_METRIC.exitDotRadius}
                  fill="var(--canvas)"
                  stroke="var(--edge)"
                  strokeWidth={1.5}
                />
                {/* A terminal branch stops at a bar — the same mark a final
                    state carries. SHAPE, NOT HUE: it survives greyscale and a
                    screenshot, which a second colour would not. */}
                {exit.rejoins === null ? (
                  <path
                    className="af-hero-fade"
                    style={delay(delayMs + 120)}
                    d={`M 130 ${exit.dotY - LC_METRIC.stopHalf} V ${exit.dotY + LC_METRIC.stopHalf}`}
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                ) : null}
                <text
                  className="af-hero-fade"
                  style={delay(delayMs + 120)}
                  x={LC_METRIC.branchRight - 10}
                  y={exit.dotY}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={9}
                  fontWeight={600}
                  fill="var(--node-foreground)"
                >
                  {exit.label}
                </text>
                <text
                  className="af-hero-fade"
                  style={delay(delayMs + 150)}
                  x={LC_METRIC.branchRight - 10}
                  y={exit.whenY}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={7.5}
                  fill="var(--node-meta)"
                >
                  {exit.when}
                </text>
              </g>
            ))}

            <circle
              className="af-hero-node"
              style={riseAt(delayMs)}
              cx={LC_METRIC.spineX}
              cy={row.dotY}
              r={LC_METRIC.dotRadius}
              fill="var(--node)"
              stroke="var(--primary)"
              strokeWidth={2}
            />
            {row.final === true ? (
              <path
                className="af-hero-fade"
                style={delay(delayMs + 60)}
                d={`M ${LC_METRIC.spineX - LC_METRIC.stopHalf} ${row.dotY + 11} H ${LC_METRIC.spineX + LC_METRIC.stopHalf}`}
                stroke="var(--primary)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ) : null}
            <text
              className="af-hero-fade"
              style={delay(delayMs + 90)}
              x={LC_METRIC.labelX}
              y={row.dotY}
              dominantBaseline="central"
              fontSize={10.5}
              fontWeight={600}
              fill="var(--node-foreground)"
            >
              {row.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
