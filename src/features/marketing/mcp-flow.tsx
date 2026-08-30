import type { CSSProperties } from "react";

import { groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";

/**
 * Decorative illustration for the landing page's MCP card: an agent calling the
 * server and getting answers back, as a small looping transcript.
 *
 * WHY IT EXISTS. The card was the only one in its row with nothing but prose, so
 * it read as a footnote beside the sequence card's illustration and left the row
 * visually unbalanced. It also had the harder claim to make — "an agent can
 * author these and get the real parser's verdict" is abstract until you see what
 * a verdict looks like.
 *
 * EVERY LINE IS REAL. The tool names are the registered ones (`catalog.ts`), and
 * the responses are the shape those tools actually return — a located line and
 * column on failure, counts on success. An invented transcript would be the one
 * thing on this page claiming something the server does not do, and the whole
 * page's credibility rests on not doing that. The one it shows failing fails the
 * way the real tool fails: with a location.
 *
 * Pure CSS, so this is a server component — no timer, no hydration. The rows
 * stagger in, hold, and the loop restarts; `prefers-reduced-motion` parks the
 * whole transcript visible, which is a complete and readable frame rather than a
 * slower version of the same thing.
 *
 * `aria-hidden`, like the hero: the card's own copy states the claim, and a
 * screen reader gains nothing from a decorative transcript.
 */

interface Exchange {
  tool: string;
  /** What came back. `ok: false` renders as the located failure. */
  reply: string;
  ok: boolean;
}

/**
 * Four exchanges, ordered as an agent would actually work: ask for the grammar,
 * write something, get it rejected with a location, fix it, get it accepted.
 * That arc is the product's argument in four lines — the failure in the middle is
 * the point, not a blemish.
 */
const MCP_GROUND = groundFieldCss(1);

const EXCHANGES: readonly Exchange[] = [
  { tool: "get_syntax_reference", reply: "sequence grammar", ok: true },
  { tool: "validate_sequence", reply: "line 7, column 12", ok: false },
  { tool: "validate_sequence", reply: "VALID · 5 participants", ok: true },
  { tool: "format_sequence", reply: "canonical .alab", ok: true },
];

/** One line's slot in the loop, in ms. */
const LINE_GAP = 900;

export function McpFlow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/70 bg-background/60 p-3",
        className,
      )}
    >
      {/* The same ground declaration the hero card and the real canvas use, so
          the two illustrations on this page read as one product rather than
          merely claiming to. Static: nothing here is worth a repaint. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: MCP_GROUND.backgroundImage,
          backgroundSize: MCP_GROUND.backgroundSize,
          maskImage:
            "radial-gradient(ellipse 100% 80% at 30% 0%, black 20%, transparent 90%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 100% 80% at 30% 0%, black 20%, transparent 90%)",
        }}
      />

      <ul className="relative flex flex-col gap-2 font-mono text-[10px] leading-4">
        {EXCHANGES.map((exchange, index) => (
          <li
            key={`${exchange.tool}-${index}`}
            style={{ animationDelay: `${index * LINE_GAP}ms` } as CSSProperties}
            className="af-mcp-line flex items-center gap-1.5"
          >
            <span className="text-muted-foreground/50">›</span>
            <span className="truncate text-foreground">{exchange.tool}</span>
            <span
              aria-hidden="true"
              className="min-w-2 flex-1 border-b border-dashed border-border/60"
            />
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5",
                exchange.ok
                  ? "bg-accent/12 text-accent"
                  : // --warning, not --destructive: a located parse error is the
                    // tool working, not the tool failing.
                    "bg-warning/12 text-warning",
              )}
            >
              {exchange.reply}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
