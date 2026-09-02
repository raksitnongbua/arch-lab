"use client";

/**
 * The feature TOUR: a compact, dismissible card that walks through the
 * controls a view's chrome does not explain by itself — one step per control,
 * Back/Next/Done, a step counter, and a close button.
 *
 * ASKED FOR, NEVER OFFERED. The card only ever opens because a reader pressed
 * the view's Tour button; it does not auto-show on a first visit and it
 * remembers nothing between them. A diagram is something people OPEN TO READ,
 * often in front of an audience, and a card that lands over the drawing
 * uninvited is chrome on the one surface this project sells clean. The
 * question the tour answers — "what can I do here?" — is asked at a moment
 * only the reader knows, and the ⓘ/? button is on screen the whole time to
 * take it. That also removes the reason the tour used to persist a verdict:
 * with nothing auto-showing, there is nothing to suppress, so there is no
 * storage key, no "Don't show again", and nothing that can go stale in a
 * browser that has been here before.
 *
 * NOT A MODAL, deliberately. The card teaches controls that live on the
 * canvas underneath it, and a dialog (focus trap, backdrop, inert page) would
 * forbid trying each one while reading about it — the same argument the
 * sequence viewer's details dock records against becoming a <dialog>. Do not
 * "fix" this into one. Its buttons are real <button>s in the tab order, so
 * the keyboard reaches everything without a trap.
 *
 * ESCAPE — the LAST rung of whichever ladder the hosting page runs (the
 * sequence playground and the viewer shell each document theirs). That falls
 * out of WHEN the listener registers: the card only mounts when the tour
 * opens, which is always after the page's rung listeners mounted, and a
 * later-registered window listener runs after every earlier one. So a press
 * clears a diagram focus, then leaves immersive mode, and only then closes
 * the tour — each earlier rung preventDefaults when it consumes, and this
 * listener stands down on `defaultPrevented` exactly as the rungs above it
 * do. It preventDefaults its own consumption too, so anything later still
 * hears a settled key. Form fields are exempt for the same reason the
 * sequence viewer exempts them: Escape inside the source textarea belongs to
 * its Tab-escape-hatch.
 *
 * REDUCED MOTION: the entrance animation is skipped in JS (`useReducedMotion`
 * — the card mounts from client state, never on first paint, so the JS read
 * is always available) and the card simply appears.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, type LucideIcon } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { useReducedMotion } from "@/lib/idle-motion";
import { cn } from "@/lib/utils";

/** One step, as plain data — the card renders it, the view declares it. */
export interface TourStep {
  title: string;
  body: string;
  icon?: LucideIcon;
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/** What a view needs to host a tour: whether the card shows, and the two ways
 * that changes. `start` is the view's Tour button — the ONLY way in. */
export interface TourHandle {
  open: boolean;
  /** Open (or re-open) the tour at its first step. */
  start: () => void;
  /** Close it. Nothing is remembered; the button reopens it. */
  close: () => void;
}

export function useTour(): TourHandle {
  const [open, setOpen] = useState(false);
  const start = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return useMemo(() => ({ open, start, close }), [open, start, close]);
}

/* -------------------------------------------------------------------------- */
/* The card                                                                    */
/* -------------------------------------------------------------------------- */

export function Tour({
  steps,
  handle,
  label,
  className,
}: {
  steps: readonly TourStep[];
  handle: TourHandle;
  /** Accessible name for the card, e.g. "Sequence viewer tour". */
  label: string;
  /** Placement — the hosting view pins the card over its own canvas. */
  className?: string;
}): React.JSX.Element | null {
  // Unmounting when closed is what resets the step to 0 for the next open —
  // no "reset" state write anywhere.
  if (!handle.open || steps.length === 0) return null;
  return (
    <TourCard
      steps={steps}
      handle={handle}
      label={label}
      className={className}
    />
  );
}

function TourCard({
  steps,
  handle,
  label,
  className,
}: {
  steps: readonly TourStep[];
  handle: TourHandle;
  label: string;
  className?: string;
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  // The "latest ref" shape the sequence viewer's Escape rung uses, and for
  // the same reason: the listener registers once (its position in the window
  // listener order IS the ladder position — see the header comment), so the
  // changing callback is read through a ref kept fresh in an effect.
  const closeRef = useRef(handle.close);
  useEffect(() => {
    closeRef.current = handle.close;
  }, [handle.close]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.fullscreenElement !== null) return; // the browser's turn
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // steps.length ≥ 1 is guaranteed by the guard in Tour; clamp anyway so a
  // steps array that SHRINKS mid-tour (the sequence viewer drops its fold
  // step when a re-parse removes every fold control) can never index past
  // the end.
  const safeIndex = Math.min(index, steps.length - 1);
  const step = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;
  const Icon = step.icon;

  return (
    <div
      role="dialog"
      aria-label={label}
      className={cn(
        "w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm",
        className,
      )}
      style={
        reduced ? undefined : { animation: "af-tour-enter 180ms ease-out" }
      }
    >
      {/* Scoped here rather than in globals.css: the keyframes have exactly
          one consumer, and the card is never in first-paint markup (see the
          header), so there is no flash-of-unstyled risk to pin down. */}
      <style>
        {
          "@keyframes af-tour-enter { from { opacity: 0; transform: translateY(6px); } }"
        }
      </style>

      <div className="flex items-start gap-2">
        {Icon !== undefined ? (
          <Icon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-primary"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {step.title}{" "}
            <span className="font-normal text-muted-foreground">
              · {safeIndex + 1} of {steps.length}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handle.close}
          aria-label="Close the tour"
          title="Close (Esc)"
          className="-mt-0.5 -mr-0.5 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {step.body}
      </p>

      {/* No suppression control: nothing auto-shows, so there is nothing to
          suppress — see the header. The row is Back/Next alone, right-aligned. */}
      <div className="mt-2.5 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setIndex(Math.max(0, safeIndex - 1))}
          disabled={safeIndex === 0}
          className={buttonClasses({
            variant: "ghost",
            size: "sm",
            className: "h-7 px-2 text-xs",
          })}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => (isLast ? handle.close() : setIndex(safeIndex + 1))}
          className={buttonClasses({
            variant: "secondary",
            size: "sm",
            className: "h-7 px-2.5 text-xs",
          })}
        >
          {isLast ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
