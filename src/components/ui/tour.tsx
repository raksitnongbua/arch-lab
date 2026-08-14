"use client";

/**
 * The feature TOUR: a compact, dismissible card that walks through the
 * controls a view's chrome does not explain by itself — one step per control,
 * Back/Next/Done, a step counter, and a way to never see it again.
 *
 * NOT A MODAL, deliberately. The card teaches controls that live on the
 * canvas underneath it, and a dialog (focus trap, backdrop, inert page) would
 * forbid trying each one while reading about it — the same argument the
 * sequence viewer's details dock records against becoming a <dialog>. Do not
 * "fix" this into one. It never steals DOM focus on open either: the card
 * auto-opens on a first visit, and yanking focus off whatever the reader was
 * doing would make the introduction the interruption. Its buttons are real
 * <button>s in the tab order, so the keyboard reaches everything without a
 * trap.
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
 * PERSISTENCE, one versioned localStorage key per view (bump the version to
 * re-show a rewritten tour). The key stores a VERDICT, so the three ways out
 * write differently:
 *   - Done (walking off the last step) and "Don't show again" both persist —
 *     finishing is seeing it, and suppressing is asking for exactly this;
 *   - the close button and Escape close for the SESSION only. Abandoning a
 *     tour mid-read is not a verdict on it, and the reader who never wants it
 *     back has the explicit control for that.
 * SSR-safe the way lib/idle-motion.ts is: a `useSyncExternalStore` whose
 * server snapshot claims the tour was seen, so server markup never contains
 * the card and the client corrects after hydration. localStorage failures
 * (private mode, quota) degrade to "seen" — never auto-nagging on every load
 * beats never remembering a dismissal, and the replay button still works.
 *
 * REDUCED MOTION: the entrance animation is skipped in JS (`useReducedMotion`
 * — the card mounts from client state, never on first paint, so the JS read
 * is always available) and the card simply appears.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
/* The seen flag                                                               */
/* -------------------------------------------------------------------------- */

/* Same store shape as lib/idle-motion.ts: the `storage` event only fires in
 * OTHER tabs, so local writes notify a listener set, and both paths funnel
 * through the one subscribe. */
const listeners = new Set<() => void>();

function readSeen(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) !== null;
  } catch {
    // Unreadable storage cannot remember a dismissal, and auto-showing a
    // card nobody can silence is worse than not auto-showing it. The replay
    // button keeps the tour reachable.
    return true;
  }
}

function writeSeen(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, "seen");
  } catch {
    /* Session-only degradation — the session flags below still close it. */
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/** What a view needs to host a tour: whether the card shows, and the four
 * ways its state changes. `start` is for the persistent replay button. */
export interface TourHandle {
  open: boolean;
  /** Open (or re-open) the tour at its first step. */
  start: () => void;
  /** Close for this session only — the tour may auto-show again next visit. */
  close: () => void;
  /** Done: the tour was walked through; persist and close. */
  finish: () => void;
  /** "Don't show again": persist without finishing, and close. */
  suppress: () => void;
}

export function useTour(storageKey: string): TourHandle {
  const seen = useSyncSeen(storageKey);
  // Closing without persisting still has to close: `seen` alone cannot say
  // "dismissed just now", and `manuallyOpen` alone cannot say "auto-show is
  // over". Both are plain event-handler writes — no effects involved.
  const [sessionClosed, setSessionClosed] = useState(false);
  const [manuallyOpen, setManuallyOpen] = useState(false);

  const start = useCallback(() => setManuallyOpen(true), []);
  const close = useCallback(() => {
    setManuallyOpen(false);
    setSessionClosed(true);
  }, []);
  const finish = useCallback(() => {
    writeSeen(storageKey);
    setManuallyOpen(false);
    setSessionClosed(true);
  }, [storageKey]);

  return useMemo(
    () => ({
      open: manuallyOpen || (!seen && !sessionClosed),
      start,
      close,
      finish,
      // Same write as finishing — the key records "do not auto-show", not
      // how the reader arrived at that.
      suppress: finish,
    }),
    [manuallyOpen, seen, sessionClosed, start, close, finish],
  );
}

function useSyncSeen(storageKey: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readSeen(storageKey),
    // Server snapshot: seen. The card must never be in server markup — its
    // truth lives in localStorage, which only the client can read.
    () => true,
  );
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

      <div className="mt-2.5 flex items-center gap-1.5">
        {/* Suppression is a quiet text control, not a peer of Next: it is the
            escape hatch for the reader the auto-show annoyed, and giving it
            button chrome would make "never help me" the visual equal of
            "keep going". */}
        <button
          type="button"
          onClick={handle.suppress}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Don&apos;t show again
        </button>
        <div className="ml-auto flex items-center gap-1.5">
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
            onClick={() => (isLast ? handle.finish() : setIndex(safeIndex + 1))}
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
    </div>
  );
}
