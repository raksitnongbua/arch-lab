import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * Decorative illustration for the landing page's sequence card: a wide, short
 * flow with its message lines actually running.
 *
 * WHY IT EXISTS. The card's copy is short and its row is tall (the MCP card
 * beside it sets the height), which left a large empty band between the prose
 * and the buttons — visible and ugly. This fills it with the thing the card is
 * describing.
 *
 * THE MOTION IS THE PRODUCT'S OWN. Solid arrows carry a travelling highlight and
 * replies march their dash, which is exactly the split the real viewer uses and
 * for the same reason: a dash on a solid arrow would make it read as async or a
 * reply, so only the kind that is already dashed may march. Someone who opens
 * the viewer after seeing this should recognise it.
 *
 * WIDE, not the hero's tall panel: this sits in a two-column card, so the flow
 * runs across rather than down. Four lifelines and four messages — enough for a
 * call, a reply and a hand-off, which is the shortest thing that reads as a
 * sequence rather than a list.
 *
 * Pure CSS, so a server component: no timer, no hydration. `prefers-reduced-
 * motion` parks every line complete and still, which is a finished diagram
 * rather than a slower one. `aria-hidden` — the copy beside it makes the claim.
 */

const LANES: readonly { id: string; name: string; x: number }[] = [
  { id: "cust", name: "Customer", x: 62 },
  { id: "web", name: "Storefront", x: 208 },
  { id: "api", name: "Order API", x: 354 },
  { id: "pay", name: "Payments", x: 486 },
];

/** `reply` marches its dash; the rest carry a travelling highlight. */
const STEPS: readonly {
  id: string;
  from: number;
  to: number;
  y: number;
  label: string;
  reply?: boolean;
}[] = [
  { id: "order", from: 0, to: 1, y: 74, label: "Place order" },
  { id: "post", from: 1, to: 2, y: 104, label: "POST /orders" },
  { id: "charge", from: 2, to: 3, y: 134, label: "Create charge" },
  { id: "ok", from: 3, to: 2, y: 164, label: "charge.succeeded", reply: true },
];

export function SequenceStrip({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/70 bg-background/50",
        className,
      )}
    >
      {/* The same faint grid as the hero card and the MCP transcript, so every
          illustration on this page reads as one product. Static. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage:
            "radial-gradient(ellipse 90% 90% at 40% 10%, black 25%, transparent 92%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 90% at 40% 10%, black 25%, transparent 92%)",
        }}
      />

      <svg
        viewBox="0 0 548 190"
        fill="none"
        className="relative h-auto w-full"
        // The lifelines tint from here, so one attribute covers all four.
        color="var(--muted-foreground)"
      >
        {/* Participant cards, drawn in SVG rather than as HTML so their
            positions and the arrowheads share one coordinate space and can
            never drift apart at a different card width. */}
        {LANES.map((lane, index) => {
          const width = Math.max(72, lane.name.length * 6.4 + 16);
          return (
            <g key={lane.id}>
              <rect
                x={lane.x - width / 2}
                y={10}
                width={width}
                height={22}
                rx={6}
                fill="var(--card)"
                stroke={`var(--seq-lane-${index + 1})`}
                strokeWidth={1.25}
              />
              <text
                x={lane.x}
                y={25}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="var(--node-foreground)"
              >
                {lane.name}
              </text>
              <line
                x1={lane.x}
                y1={36}
                x2={lane.x}
                y2={182}
                stroke={`var(--seq-lane-${index + 1})`}
                strokeOpacity={0.5}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          );
        })}

        {STEPS.map((step, index) => {
          const from = LANES[step.from].x;
          const to = LANES[step.to].x;
          const dir = to > from ? 1 : -1;
          const tip = to - 8 * dir;
          const mid = (from + to) / 2;
          const stagger = {
            animationDelay: `${index * 700}ms`,
          } as CSSProperties;
          return (
            <g key={step.id}>
              <text
                x={mid}
                y={step.y - 6}
                textAnchor="middle"
                fontSize={9}
                fill="var(--muted-foreground)"
                fontFamily="var(--font-geist-mono), monospace"
              >
                {step.label}
              </text>

              {/* The line itself: replies dashed at rest, calls solid. */}
              <line
                x1={from}
                y1={step.y}
                x2={tip}
                y2={step.y}
                stroke="var(--edge)"
                strokeWidth={1.5}
                strokeDasharray={step.reply ? "6 5" : undefined}
                className={step.reply ? "af-strip-march" : undefined}
                style={step.reply ? stagger : undefined}
              />

              {/* The travelling highlight on a SOLID line — a short bright band
                  riding over an unbroken stroke, which is how the real viewer
                  animates a call without making it look dashed. */}
              {step.reply === undefined ? (
                <line
                  x1={from}
                  y1={step.y}
                  x2={tip}
                  y2={step.y}
                  stroke={`var(--seq-lane-${step.from + 1})`}
                  strokeWidth={2}
                  strokeLinecap="round"
                  pathLength={100}
                  className="af-strip-flow"
                  style={stagger}
                />
              ) : null}

              <path
                d={`M ${tip} ${step.y} l ${-8 * dir} -4 v 8 Z`}
                fill={step.reply ? "none" : "var(--edge)"}
                stroke="var(--edge)"
                strokeWidth={step.reply ? 1.2 : 0}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
