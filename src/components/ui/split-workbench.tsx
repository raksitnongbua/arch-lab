"use client";

/**
 * The workbench layout both playgrounds wear: SOURCE on the left, CANVAS on
 * the right, one viewport tall, with the divider draggable and the rail
 * collapsible.
 *
 * WHAT IT REPLACED, and why the old argument lost. Both pages used to stack
 * the diagram over the text, and the sequence page argued for it: a sequence
 * diagram's participants spread HORIZONTALLY, so width is the axis the drawing
 * consumes, and halving it to seat a text column forces either a shrunken
 * diagram or sideways scrolling. That is still true — and it is outweighed by
 * what stacking costs, which is that editing and seeing are never on screen
 * together. You type, you scroll up, you scroll back down. Every real edit
 * pays that twice.
 *
 * THE SPLIT IS THE READER'S, in three ways — and an earlier version of this
 * file argued for only one of them. It said a drag handle "makes 'give the
 * diagram everything' a gesture you have to aim", and used that to justify a
 * fixed 30% with a collapse button. The premise was right and the conclusion
 * did not follow: aiming is a bad way to reach the EXTREME and a perfectly
 * good way to reach the middle. So all three exist, each doing what it is
 * good at:
 *
 *   - DRAG the divider for the width you actually want. Persisted, because a
 *     reader who has decided how wide their editor is has decided it for more
 *     than one page load.
 *   - COLLAPSE for the extreme — one click, no aim, and the canvas is
 *     everything. The stacked layout's best case, on demand.
 *   - DOUBLE-CLICK the divider to return to the default, so experimenting
 *     with the drag costs nothing.
 *
 * The divider is a real `separator` widget: arrow keys move it, Home and End
 * take it to the clamps. A drag-only control is a control a keyboard cannot
 * reach, and this one changes how the whole page reads.
 *
 * The source pane is HIDDEN, never unmounted, when collapsed: an unmounted
 * textarea loses the browser's undo stack and the caret, and collapsing to
 * read a wide diagram must not cost the edit you were in the middle of.
 * `hidden` also takes it out of the tab order, which is what makes the
 * collapsed state real for a keyboard.
 *
 * BELOW `lg` IT STACKS, source first, and the divider is not rendered at all.
 * A 30% column of a phone is ~110px, which is not a text editor, and a
 * resizer for a layout that is not side by side is a control that appears
 * inert.
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* The remembered width                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Percent of the workbench the source rail takes.
 *
 * ONE PREFERENCE FOR BOTH PLAYGROUNDS, and the key is unscoped to say so —
 * the same reasoning `lib/idle-motion.ts` records for its own: "my editor is
 * this wide" is a statement about the workbench, not about a route, and two
 * keys would mean setting it twice to stop being surprised.
 */
const STORAGE_KEY = "arch-lab:workbench-rail";

/** The default, and what double-clicking the divider returns to. */
const DEFAULT_RAIL_PERCENT = 30;

/**
 * The clamps. Below ~18% a monospace line wraps every few words, which makes
 * the editor unreadable rather than merely narrow; past 60% the canvas stops
 * being the thing the page is for. Both are floors on USEFULNESS, not on
 * taste — the collapse button covers "I want none of it", which is why the
 * lower clamp does not need to reach zero.
 */
const MIN_PERCENT = 18;
const MAX_PERCENT = 60;

/** Arrow-key step, in percent. Two is a visible nudge and ~20 presses across
 * the whole range, which is a control you can steer. */
const KEY_STEP = 2;

/* The `storage` event only fires in OTHER tabs, so local writes notify a
 * listener set; both paths funnel through the one subscribe — the shape
 * `idle-motion.ts` uses, for the same reason. */
const listeners = new Set<() => void>();

function clamp(percent: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(percent)));
}

function readRail(): number {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_RAIL_PERCENT;
    const parsed = Number.parseFloat(stored);
    /* Clamped on READ as well as on write: a stored value can predate a
       change to the clamps, and a rail wider than the window is a layout
       nobody can drag back. */
    return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_RAIL_PERCENT;
  } catch {
    return DEFAULT_RAIL_PERCENT;
  }
}

function writeRail(percent: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(percent));
  } catch {
    /* Private mode or quota: the width still applies for this session — the
       listeners are notified either way — it just forgets on reload. */
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

/** The stored rail width. The server snapshot is the default, so the markup
 * the server sends and the first client render agree; a stored width corrects
 * it after hydration (the mounted-guard shape `idle-motion.ts` documents). */
function useRailPercent(): number {
  return useSyncExternalStore(subscribe, readRail, () => DEFAULT_RAIL_PERCENT);
}

/* -------------------------------------------------------------------------- */
/* The layout                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * THERE IS NO `hidden` PROP, and that is a fix rather than an omission.
 *
 * This component briefly took one, so a page entering immersive mode could
 * hide the workbench — which hid the CANVAS too, and the canvas is the thing
 * immersive mode exists to enlarge. `display: none` on an ancestor beats
 * `position: fixed` on a descendant, so clicking Immersive made the diagram
 * vanish. In the stacked layout the source and the canvas were siblings and
 * hiding one could not touch the other; merging them into one frame is what
 * made "hide the source" and "hide the frame" different things.
 *
 * So immersive is expressed the way it actually behaves: `collapsed` also
 * covers it (`sourceCollapsed || isImmersive`), the canvas fixes itself over
 * the viewport, and the empty frame stays in the layout behind it — which
 * costs nothing and means leaving immersive restores the rail to whatever the
 * reader had it at.
 */
export function SplitWorkbench({
  collapsed,
  sourceLabel,
  source,
  canvas,
}: {
  /** Hides the rail AND its divider. Immersive mode is one of its callers. */
  collapsed: boolean;
  /** Names the left rail, for the section landmark and the divider. */
  sourceLabel: string;
  source: React.ReactNode;
  canvas: React.ReactNode;
}): React.JSX.Element {
  const railPercent = useRailPercent();
  const frameRef = useRef<HTMLDivElement>(null);

  /* POINTER CAPTURE rather than window listeners: the pointer keeps sending
     move events to the divider even once it leaves the element or the window,
     so a fast drag cannot "let go" halfway and strand the layout mid-resize —
     and there is no listener to forget to remove. */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Stops the browser starting a text selection across both panes, which
      // otherwise highlights the whole editor as the pointer sweeps it.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Capture IS the drag state — no `dragging` boolean to fall out of sync
      // with reality if a pointerup is missed.
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const frame = frameRef.current;
      if (frame === null) return;
      const rect = frame.getBoundingClientRect();
      if (rect.width === 0) return;
      writeRail(clamp(((event.clientX - rect.left) / rect.width) * 100));
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const next =
        event.key === "ArrowLeft"
          ? railPercent - KEY_STEP
          : event.key === "ArrowRight"
            ? railPercent + KEY_STEP
            : event.key === "Home"
              ? MIN_PERCENT
              : event.key === "End"
                ? MAX_PERCENT
                : null;
      if (next === null) return;
      // Consumed so the arrow keys do not also scroll the page, and — on the
      // sequence page — do not reach the viewer's message-walking bindings.
      event.preventDefault();
      writeRail(clamp(next));
    },
    [railPercent],
  );

  return (
    <div
      ref={frameRef}
      className={cn(
        /* The HEIGHT BUDGET is the page's, not this component's: each page
           knows what chrome sits above it, and a height guessed here goes
           stale the first time a heading wraps. This just fills what it is
           given (`lg:flex-1 lg:min-h-0`).

           Below `lg` the constraint is released entirely: stacked panes need
           the page to scroll, and a viewport-tall column that also stacks
           would put the canvas permanently off-screen. */
        "flex min-h-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-0",
      )}
    >
      {/* The width rides a CUSTOM PROPERTY, not an inline `width`: an inline
          width applies at every breakpoint, and below `lg` these are stacked
          rows where a 30%-wide editor is nonsense. As a variable,
          `lg:w-[var(--rail)]` keeps it to the one breakpoint that splits. */}
      {/* `data-af-source-pane` is a hook for the stylesheet, not styling of its
          own: the playground's fold is applied before first paint by an
          attribute on <html> (playground/lib/source-fold.ts), and the CSS
          needs something stable to aim at — the class below is composed at
          render time and does not exist yet when that rule has to apply. The
          two agree by construction: both hide this element and nothing else. */}
      <section
        data-af-source-pane=""
        aria-label={sourceLabel}
        style={{ "--rail": `${railPercent}%` } as React.CSSProperties}
        className={cn(
          "flex min-h-0 min-w-0 flex-col gap-2 lg:w-[var(--rail)]",
          collapsed && "hidden",
        )}
      >
        {source}
      </section>

      {/* The divider. Gone when the rail is — there is no boundary to move —
          and never rendered below `lg`, where the panes stack. */}
      <div
        data-af-source-divider=""
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize the ${sourceLabel}`}
        aria-valuenow={railPercent}
        aria-valuemin={MIN_PERCENT}
        aria-valuemax={MAX_PERCENT}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => writeRail(DEFAULT_RAIL_PERCENT)}
        title="Drag to resize · double-click to reset · arrow keys nudge"
        className={cn(
          /* 12px of hit area around a hairline rule: a divider you have to hit
             exactly is a divider people give up on, while a visibly thick one
             would put a gutter between two panes that belong together.
             `touch-none` stops a drag from scrolling the page under a finger
             instead of moving the divider. */
          "group relative hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none lg:flex",
          collapsed && "lg:hidden",
        )}
      >
        <span
          aria-hidden="true"
          className="h-full w-px bg-border transition-colors group-hover:bg-ring group-focus-visible:bg-ring"
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">{canvas}</div>
    </div>
  );
}

/**
 * The rail toggle as its own export, so each page can seat it in the chrome
 * it already has (the sequence pane's toolbar strip, the C4 canvas's control
 * row) rather than have the layout drop a floating button into a corner one
 * of them has already spent.
 */
export function SourceRailToggle({
  collapsed,
  onToggle,
  sourceLabel,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  sourceLabel: string;
  className?: string;
}): React.JSX.Element {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={
        collapsed ? `Show the ${sourceLabel}` : `Hide the ${sourceLabel}`
      }
      title={collapsed ? `Show the ${sourceLabel}` : `Hide the ${sourceLabel}`}
      className={cn(
        /* Desktop only: below `lg` the panes stack, so there is no rail to
           collapse and a control that appears inert is worse than none. */
        "hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:inline-flex",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span className="hidden xl:inline">{collapsed ? "Source" : "Hide"}</span>
    </button>
  );
}
