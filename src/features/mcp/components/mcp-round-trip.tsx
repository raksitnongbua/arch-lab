/**
 * The hero figure on `/mcp`: one round trip, looping.
 *
 * WHAT IT SAYS. Your agent calls a tool, the server answers with the real
 * parser's verdict, and nothing of yours is kept. That is the whole pitch of
 * the page, and it was previously four paragraphs with no picture — a page
 * about connecting two things that never showed the two things.
 *
 * WHY IT IS NOT A SCREENSHOT. The tool name in it comes from `catalog.ts`, the
 * same module the server registers from, so the figure cannot advertise a call
 * that does not exist. A screenshot would rot the first time a tool was
 * renamed and nothing would notice.
 *
 * Server-rendered like the rest of the page — no client component, no state,
 * no effect. The animation is CSS on complete markup (`styles/mcp-motion.css`),
 * so the figure is fully present in the HTML and a reader with motion turned
 * off gets a finished round trip rather than an empty frame.
 *
 * `aria-hidden`, deliberately: every word in it is said in the prose around it,
 * and a screen reader walking a decorative wire diagram learns nothing it is
 * not about to be told properly.
 */

import { ArrowRight, Check, Cpu, Server } from "lucide-react";

import { cn } from "@/lib/utils";

/** One clock for the whole figure — see the stylesheet on why it is shared. */
const CLOCK = "6200ms";

export function McpRoundTrip({
  /** The tool the figure shows being called. From the catalogue, never typed. */
  toolName,
  className,
}: {
  toolName: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{ "--af-mcp-clock": CLOCK } as React.CSSProperties}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card px-5 py-6 sm:px-7",
        className,
      )}
    >
      {/* A wash behind the wire, so the figure reads as a lit surface rather
          than a box with lines in it. Kept faint — it sits under body text. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 70%)",
        }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <Endpoint icon={<Cpu aria-hidden="true" className="size-4" />}>
          Your agent
        </Endpoint>

        {/* The wire. `pathLength={100}` normalises the dash maths, so the band
            reads the same however wide the figure gets. */}
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
            className="block h-3 w-full"
          >
            <path
              d="M 0 6 L 100 6"
              pathLength={100}
              fill="none"
              stroke="var(--edge)"
              strokeWidth={1}
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
            {/* Halo then head, in that order: SVG has no z-index, so the bright
                head has to be the later sibling to paint on top of its glow. */}
            <path
              d="M 0 6 L 100 6"
              pathLength={100}
              className="af-mcp-wire-flow af-mcp-wire-flow-glow"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M 0 6 L 100 6"
              pathLength={100}
              className="af-mcp-wire-flow af-mcp-wire-flow-head"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <span className="af-mcp-call inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 font-mono text-[11px] text-primary">
              {toolName}
              <ArrowRight aria-hidden="true" className="size-3" />
            </span>
            <span className="af-mcp-verdict inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/8 px-2.5 py-1 text-[11px] font-medium text-success">
              <Check aria-hidden="true" className="size-3" />
              valid
            </span>
          </div>
        </div>

        <Endpoint icon={<Server aria-hidden="true" className="size-4" />}>
          arch-lab
        </Endpoint>
      </div>

      <p className="relative mt-5 text-center text-xs text-muted-foreground">
        Hosted · read-only · nothing stored
      </p>
    </div>
  );
}

/** One end of the wire. Fixed width so the wire between them cannot jitter. */
function Endpoint({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-2 sm:w-24">
      <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-background text-primary">
        {icon}
      </span>
      <span className="text-center text-xs font-medium text-foreground">
        {children}
      </span>
    </div>
  );
}
