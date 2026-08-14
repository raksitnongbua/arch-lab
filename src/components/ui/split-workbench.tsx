"use client";

/**
 * The workbench layout both playgrounds wear: SOURCE on the left at 30%,
 * CANVAS on the right at 70%, one viewport tall, with the left rail
 * collapsible.
 *
 * WHAT IT REPLACED, and why the old argument lost. Both pages used to stack
 * the diagram over the text, and the sequence page argued for it explicitly:
 * a sequence diagram's participants spread HORIZONTALLY, so width is the axis
 * the drawing consumes, and halving it to seat a text column forces either a
 * shrunken diagram or sideways scrolling. That is still true — and it is
 * outweighed by what stacking costs, which is that editing and seeing are
 * never on screen together. You type, you scroll up, you scroll back down.
 * Every real edit pays that twice, and a 70% column plus a collapse control
 * beats a 100% column you have to scroll to.
 *
 * THE COLLAPSE IS THE ANSWER TO THE WIDTH ARGUMENT, not a convenience: one
 * click and the canvas is the whole workbench, which is the stacked layout's
 * best case available on demand instead of as a permanent tax. It is also why
 * the rail collapses rather than the panes resizing — a drag handle would
 * make "give the diagram everything" a gesture you have to aim.
 *
 * The source pane is HIDDEN, never unmounted, when collapsed: an unmounted
 * textarea loses the browser's undo stack and the caret, and collapsing to
 * read a wide diagram must not cost the edit you were in the middle of.
 * `hidden` also takes it out of the tab order, which is what makes the
 * collapsed state real for a keyboard.
 *
 * BELOW `lg` IT STACKS, source first. A 30% column of a phone is ~110px,
 * which is not a text editor, and the responsive answer to "two panes do not
 * fit" is one pane at a time in reading order.
 */

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";

export function SplitWorkbench({
  collapsed,
  sourceLabel,
  source,
  canvas,
  /** Hidden entirely while the canvas owns the viewport (immersive mode). */
  hidden = false,
}: {
  collapsed: boolean;
  /** Names the left rail, for the section landmark and the toggle beside it. */
  sourceLabel: string;
  source: React.ReactNode;
  canvas: React.ReactNode;
  hidden?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        /* The HEIGHT BUDGET is the page's, not this component's: each page
           knows what chrome sits above it, and a height guessed here goes
           stale the first time a heading wraps. This just fills what it is
           given (`lg:flex-1 lg:min-h-0`) — so the page makes its container a
           viewport tall and the workbench takes the rest.

           Below `lg` the constraint is released entirely: stacked panes need
           the page to scroll, and a viewport-tall column that also stacks
           would put the canvas permanently off-screen. */
        "flex min-h-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row",
        hidden && "hidden",
      )}
    >
      {/* Grid-free on purpose: `lg:w-[30%]` plus `flex-1` on the canvas gives
          the 30/70 split AND lets the left rail collapse to nothing without a
          template to rewrite. */}
      <section
        aria-label={sourceLabel}
        className={cn(
          "flex min-h-0 min-w-0 flex-col gap-2 lg:w-[30%]",
          collapsed && "hidden",
        )}
      >
        {source}
      </section>

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
