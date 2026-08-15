"use client";

import { useNodesInitialized } from "@xyflow/react";
import { useEffect, useState } from "react";

import { useReducedMotion } from "@/lib/idle-motion";
import { cn } from "@/lib/utils";

/**
 * Covers the canvas for the one moment it cannot look right.
 *
 * WHAT IT HIDES, precisely — checked against the served HTML rather than
 * assumed. React Flow renders NO nodes on the server: the response carries the
 * pane and the viewport, and not one node element (no `data-id` anywhere in
 * it). It cannot, because node sizes come from measured DOM boxes and layout
 * needs them. So the canvas the reader is handed is genuinely EMPTY, and stays
 * empty until React Flow mounts, measures, lays out and fits — at which point
 * the whole diagram appears at once. Refreshing the page did that every time.
 *
 * So this is not decoration over content that was already there; for that
 * window there is nothing to see, and the only question is what occupies it. A
 * blank pane reads as a page that failed. The skeleton echoes the shape of
 * what is coming — cards and the lines between them — so the pane looks like
 * it is assembling a diagram rather than like it is broken, and the layout
 * does not appear to change character when the real thing arrives.
 *
 * IT IS SERVER-RENDERED, and that is load-bearing. Mounting it after hydration
 * would add a THIRD state (unfitted diagram, then skeleton, then diagram) and
 * make the flash worse than it started. Rendered from the first byte, it is
 * simply what the page looks like until the diagram is ready.
 *
 * `useNodesInitialized` is React Flow's own answer to "have the nodes been
 * measured", which is the exact precondition `fitView` waits for — so the
 * skeleton lifts on the same signal that moves the diagram, not on a timer
 * guessing when that might have happened.
 */
export function CanvasSkeleton(): React.JSX.Element | null {
  const nodesInitialized = useNodesInitialized();
  const reducedMotion = useReducedMotion();
  const [faded, setFaded] = useState(false);

  /* Unmounted a beat AFTER it fades, not the moment the nodes measure:
     removing it instantly would expose the fit animation it exists to cover. */
  useEffect(() => {
    if (!nodesInitialized || reducedMotion) return;
    const timer = window.setTimeout(() => setFaded(true), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [nodesInitialized, reducedMotion]);

  /* Under reduced motion there is no fade to outlast — the fit is instant too
     — so readiness IS the answer and no state is involved. Deriving it rather
     than setting state in the effect also keeps that path out of
     `react-hooks/set-state-in-effect`, which is right to object: a synchronous
     setState there is a cascading render, not a synchronisation. */
  const gone = reducedMotion ? nodesInitialized : faded;
  if (gone) return null;

  return (
    <div
      // Not aria-hidden: a screen reader reaching the canvas mid-load should be
      // told it is loading rather than find an unlabelled empty region. It is
      // removed entirely once the diagram is there, so this never lingers in
      // the accessibility tree alongside the real content.
      role="status"
      aria-label="Preparing the diagram"
      className={cn(
        "pointer-events-none absolute inset-0 z-10 bg-background",
        "transition-opacity duration-200 motion-reduce:transition-none",
        nodesInitialized ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="flex size-full items-center justify-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 240 120"
          className="w-[min(70%,22rem)] text-border"
          fill="none"
        >
          {/* Three cards and the two lines between them: the shape of a
              context diagram, which is what the reader is about to get. Drawn
              rather than div-based so it scales with the pane at any size
              without a second set of breakpoints. */}
          <rect
            x="8"
            y="44"
            width="56"
            height="32"
            rx="6"
            className="fill-card stroke-current"
            strokeWidth="1.5"
          />
          <rect
            x="92"
            y="24"
            width="56"
            height="32"
            rx="6"
            className="fill-card stroke-current"
            strokeWidth="1.5"
          />
          <rect
            x="92"
            y="72"
            width="56"
            height="32"
            rx="6"
            className="fill-card stroke-current"
            strokeWidth="1.5"
          />
          <path
            d="M64 60 H92 M64 60 V40 H92 M64 60 V88 H92"
            className="stroke-current"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <rect
            x="176"
            y="44"
            width="56"
            height="32"
            rx="6"
            className="fill-card stroke-current"
            strokeWidth="1.5"
          />
          <path
            d="M148 40 H176 V60 M148 88 H176 V60"
            className="stroke-current"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * Matches the `duration-200` above. Duplicated in JS because a timer cannot
 * read a Tailwind class; `pnpm check:viewer-motion` pins the pair, the same
 * arrangement `sequence-motion` uses for its stylesheet fallbacks.
 */
const FADE_MS = 200;
