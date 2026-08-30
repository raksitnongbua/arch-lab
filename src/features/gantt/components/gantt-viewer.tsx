"use client";

/**
 * The mounted gantt canvas: focus, pinning, and the at-rest state the
 * ambient current waits for.
 *
 * The PAINTING lives in `./gantt-diagram.tsx`, which is server-safe and
 * takes no hooks. This component owns only what needs a browser — which state
 * is lit, and whether the reader has gone quiet — and hands the answers down
 * as props. That split is what lets the crawlable example pages render the
 * same SVG with no JavaScript at all.
 *
 * FOCUS HAS TWO LIFETIMES, and the second one is not decoration:
 *
 *   - A HOVER lasts as long as the pointer is over the row.
 *   - A PIN survives the pointer leaving, and Escape releases it.
 *
 * The pin exists because the focus current takes `--gantt-focus-current` (2.1s)
 * to travel a chain, and nobody holds a pointer still for two seconds. Without
 * it the third motion would be one a reader could never actually watch, which
 * would make it decoration that failed the "does removing this lose
 * information" test rather than motion that passes it.
 *
 * THE CHAIN IS BOTH DIRECTIONS. Selecting an item lights everything it waits
 * on AND everything waiting on it, because "what is this tangled with" has no
 * useful one-directional answer: a reader asking about a task wants to know
 * both what could delay it and what it could delay.
 *
 * AT REST IS A REAL STATE, AND A FRESH PAGE IS ALREADY IN IT. The ambient
 * motions stand down while the entrance plays and run from then on — nothing a
 * reader does here is sustained enough to yield to, and the wait that used to
 * follow every click is gone with it. What remains of
 * quiet — an ambient that never stops competes with the person reading and
 * stops meaning anything, which is precisely how ER's pulse ended up needing a
 * second visual language to survive (see `new-diagram-type.md`).
 *
 * But the FIRST transition is armed with `GANTT_SETTLE_MS` instead, and the
 * difference is a bug that shipped: a page nobody has touched yet is not a page
 * someone is busy with, and treating it as one left the hatch and the connector
 * current dead for three seconds while the axis sweep ran alone. Both constants
 * and the full argument live in `../lib/motion`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  idleMotionState,
  useIdleMotion,
  useReducedMotion,
} from "@/lib/idle-motion";
import type { GanttLabFile } from "@/types";

import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";
import { DockRow } from "@/components/ui/dock-row";
import { X } from "lucide-react";
import { itemSchedule } from "../lib/axis";
import { layoutGantt } from "../lib/layout";
import { GANTT_SETTLE_MS } from "../lib/motion";
import { useMeasuredScale } from "@/components/ui/use-measured-scale";

import { GanttDiagram } from "./gantt-diagram";

export interface GanttViewerProps {
  file: GanttLabFile;
}

export function GanttViewer({ file }: GanttViewerProps) {
  const reduced = useReducedMotion();
  const idleMotion = useIdleMotion();
  const idleState = idleMotionState(reduced, idleMotion);

  /* KEYBOARD FOCUS, NOT HOVER. Pointing at a row used to select it; it now
     takes a press, because a selection that follows the pointer fires on the
     way to somewhere else and a reader crossing the canvas sets and clears it
     a dozen times without meaning to.

     THE CHANNEL SURVIVES THE HOVER, and that is why this stays a second piece
     of state rather than collapsing into `pinned`. Tabbing to a row lights it
     WITHOUT committing to it — the same transient look the pointer used to
     give — and Enter or Space then pins it, through the same handler a click
     goes through. Deleting this along with the hover would have left a
     keyboard reader unable to look before choosing, which is the one thing the
     pointer could always do. */
  const [keyFocused, setKeyFocused] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  /* THE ENTRANCE IS A PHASE, AND IT HAS TO END. It was stamped as a bare
     literal here, which kept every `[data-reveal="1"]` rule matching for the
     life of the page — and each of those is `forwards`, so its end value went on
     being contributed from the ANIMATION ORIGIN, which outranks every normal
     author declaration. The focus dimming underneath it therefore applied to
     nothing at all.

     THE TIMELINE AND THE LIFECYCLE WERE FIXED THREE COMMITS AGO AND THIS WAS
     NOT, because the assertion that catches it was written into their own
     motion checks and this canvas has no equivalent — a per-canvas rule cannot
     ask the canvas nobody thought to write it for. It is swept from the
     filesystem in `check:view-input` now.

     AND IT IS THE ONLY PHASE LEFT. `atRest` used to be its own flag, lowered by
     an idle timer on every interaction; nothing stirs that timer any more, so
     the two flags always agreed and one of them was ceremony. */
  const [revealed, setRevealed] = useState(true);

  /* Both directions of the dependency graph, built once per document. The
     layout already resolved and de-duplicated `after`, so this reads the laid
     -out items rather than the file and cannot disagree with what is drawn. */
  const { parents, children } = useMemo(() => {
    const layout = layoutGantt(file);
    const parentMap = new Map<string, string[]>();
    const childMap = new Map<string, string[]>();
    for (const item of layout.items) {
      parentMap.set(item.id, item.after);
      if (!childMap.has(item.id)) childMap.set(item.id, []);
    }
    for (const item of layout.items) {
      for (const dep of item.after) {
        childMap.set(dep, [...(childMap.get(dep) ?? []), item.id]);
      }
    }
    return { parents: parentMap, children: childMap };
  }, [file]);

  const selected = pinned ?? keyFocused;

  /**
   * What one selection lights: the item, and the items it TOUCHES.
   *
   * IT USED TO WALK THE WHOLE CHAIN, transitively, in both directions — every
   * ancestor to the first task and every descendant to the last. On a plan
   * where most work is sequenced that is nearly the whole document, so
   * selecting one bar dimmed almost nothing and the reader was told "here is
   * everything, again". Reported as clicking one bar focusing the lot.
   *
   * ONE HOP, NOT ZERO. The literal request was the clicked bar alone, and this
   * deliberately keeps its immediate neighbours — because with zero hops every
   * connector attached to the selected bar dims, and a lit bar with faded
   * arrows leaving it reads as broken rather than as focused. One hop is also
   * the question a reader actually has at a bar: what is this waiting for, and
   * what is waiting on it. Two hops away is a different question and can be
   * asked by clicking again.
   */
  const litIds = useMemo(() => {
    if (!selected) return undefined;
    const seen = new Set<string>([selected]);
    for (const edges of [parents, children]) {
      for (const next of edges.get(selected) ?? []) seen.add(next);
    }
    return seen;
  }, [selected, parents, children]);

  /* FIRST RENDER USES THE SETTLE, every interaction after it uses the idle
     wait. See `../lib/motion` for why those are different questions; the short
     version is that a page nobody has touched is already at rest, and only the
     ENTRANCE has a claim on the moment after load.

     Mount arms the countdown DIRECTLY rather than calling `stir`: `atRest`
     already starts false, so the reset inside `stir` was a synchronous
     setState in an effect body — a cascading render that bought nothing and
     that `react-hooks/set-state-in-effect` refuses. `stir` keeps the reset for
     the interaction path, where standing the ambient down is a real change. */
  useEffect(() => {
    const settled = setTimeout(() => setRevealed(false), GANTT_SETTLE_MS);
    return () => clearTimeout(settled);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* THE GROUND'S CAMERA, ON A CANVAS WITH NO CAMERA.
     This notation has no pan-and-zoom; the `<svg>` is drawn at its natural size
     and shrunk by `max-width: 100%` when the pane is narrower. That shrink is
     still a scale, and the ground's adaptive ladder is a question about SCREEN
     pixels — so a drawing squeezed into a narrow pane has its ground squeezed
     with it, and the ladder must be told or it selects a level that lands below
     the readable band. Never magnified: the CSS cap only ever shrinks. */
  const groundRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutGantt(file), [file]);
  const measureGroundScale = useCallback((): number => {
    const box = groundRef.current;
    if (box === null || layout.width <= 0) return 1;
    return box.clientWidth <= 0
      ? 1
      : Math.min(1, box.clientWidth / layout.width);
  }, [layout.width]);
  const groundScale = useMeasuredScale(groundRef, measureGroundScale);

  /* THE SELECTED ITEM AS AN OBJECT, for the dock. Read off the SOLVED layout
     rather than off `file.items`, because float, criticality and the day
     offsets are all computed by `layoutGantt` and none of them is in the
     document — a dock built from the source text could name the duration and
     nothing else worth docking. */
  const focusedItem = useMemo(
    () =>
      selected === null
        ? null
        : (layoutGantt(file).items.find((item) => item.id === selected) ??
          null),
    [file, selected],
  );

  /* CLICKING THE PANE CLEARS THE SELECTION. Every interactive shape inside the
     SVG stops the event reaching here, so this only ever fires on empty
     ground. It was missing entirely: the only ways out were clicking the same
     bar again — which means finding it — or pressing Escape, which nobody
     discovers. The flowchart viewer has done it this way from the start and
     this is the same handler with its pan guard dropped, since this canvas has
     no camera to pan.

     THE CLIENT-SIZE GUARD EXEMPTS THE SCROLLBAR GUTTERS, which are inside the
     element's box but outside its content: a click on the scrollbar would
     otherwise read as a click on empty ground and clear a selection the reader
     was scrolling to look at. */
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const pane = event.currentTarget;
      const rect = pane.getBoundingClientRect();
      if (
        event.clientX - rect.left > pane.clientWidth ||
        event.clientY - rect.top > pane.clientHeight
      ) {
        return;
      }
      setPinned(null);
      setKeyFocused(null);
    },
    [],
  );

  return (
    /* A POSITIONING PARENT AROUND THE SCROLL BOX, not on it. The dock is
       absolutely positioned, and an absolute child of a SCROLLING element
       scrolls away with the content — so the box that establishes the
       containing block has to be the one that does not scroll. */
    <div className="relative flex min-h-0 w-full flex-1">
      <div
        /* THE SCROLL BOX AND THE GUTTERS. `min-h-0 flex-1` claims the height the
         host gives it — the example page hands over the rest of the page, the
         playground hands over the pane between its two strips — and
         `overflow-auto` is what lets a tall plan scroll inside that instead of
         being clipped by the host's `overflow-hidden`. ER and the dictionary
         reach the same place with a `[justify-content:safe_center]` flex box,
         because both carry a pan-and-zoom camera and must keep start-side
         overflow reachable; there is no camera here, so ordinary block flow
         plus the canvas's own `margin-inline: auto` centres it with less to go
         wrong. The padding is the air either side: without it the label rail
         and the last tick sit on the container's edges. */
        /* THE GROUND, filling the pane rather than the drawing — the reversal
         is recorded at `.af-canvas-rule` in globals.css. */
        className={cn(
          "min-h-0 w-full flex-1 overflow-auto px-5 py-6 sm:px-8",
          CANVAS_RULE_CLASS,
        )}
        style={groundFieldCss(groundScale)}
        onClick={handleBackdropClick}
        /* NOTHING STIRS THE AMBIENT ANY MORE, because nothing on this canvas is
           a sustained act for it to yield to. There is no camera here — no pan,
           no zoom, no drag — so all a reader does is LOOK and SELECT, and both
           are the moment the motion is worth having.

           IT YIELDED TO A CLICK UNTIL NOW, so deselecting killed every moving
           mark for three seconds. The wait was built for HOVER, which asked a
           real question while pointing at a bar selected it and the pointer moved
           continuously; selecting is a discrete press now. */
        /* Pointer leaving the canvas clears a hover but never a pin — the pin is
         the whole reason a reader can move the pointer away and keep looking. */
      >
        <div
          ref={groundRef}
          /* SHRINK-WRAPS THE DRAWING, which is what keeps `measureGroundScale`
           a reading of the `<svg>` rather than of the pane around it.
           `margin-inline: auto` is the canvas's own centring. */
          className="mx-auto w-fit"
        >
          <GanttDiagram
            file={file}
            litIds={litIds}
            /* THE CHOSEN ONE, SEPARATELY FROM ITS NEIGHBOURHOOD. `litIds` is the
             one-hop set and it answers "what is related"; this answers "what
             did you click". They were the same prop, so the ring — which is an
             identity mark — was drawn on the neighbours too, and three bars
             claimed to be the one selected. */
            selectedId={selected}
            reveal={revealed}
            idleMotion={idleState}
            /* AT REST IS EXACTLY "THE ENTRANCE IS OVER" now that nothing else
             disturbs it. */
            atRest={!revealed}
            onFocusItem={(id) =>
              setPinned((current) => (current === id ? null : id))
            }
            onKeyFocusItem={setKeyFocused}
          />
        </div>
      </div>

      {/* ---- the details dock, matching the flowchart and use-case viewers ----
          RIGHT-HAND ON DESKTOP, A SHEET ON A PHONE. Same markup as the two
          viewers that already dock, because a fourth arrangement of the same
          idea is the "Nth of something" failure `codebase.md` names — a reader
          meeting two kinds should see one product.

          WHY THE DATES LIVE HERE. They were on the bar's own label for one
          commit, which put sixteen characters beside a bar whose right edge may
          be anywhere and needed the text anchor to flip near the plot's edge. A
          panel has room for the span, the duration, the float and the state; a
          bar has room for one number. */}
      {focusedItem !== null ? (
        <aside
          aria-label="Selected item"
          className={
            "absolute z-10 flex flex-col border-border bg-card/95 shadow-lg backdrop-blur-sm " +
            "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-72 max-md:rounded-t-xl max-md:border-t " +
            "md:top-0 md:right-0 md:bottom-0 md:w-72 md:border-l"
          }
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
            <h2 className="text-sm font-semibold text-foreground">
              {focusedItem.milestone ? "Milestone" : "Task"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setPinned(null);
                setKeyFocused(null);
              }}
              aria-label="Close details and clear the selection"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <dl className="flex flex-col gap-2.5">
              <DockRow term="Name" value={focusedItem.label} />
              {/* THE ROW THIS DOCK EXISTS FOR: the plan states a duration and
                  leaves the reader to count the other end off the tick rail.
                  `itemSchedule` names the days it actually occupies, and the
                  last day it is worked rather than the day after. */}
              <DockRow term="Days" value={itemSchedule(file, focusedItem)} />
              {!focusedItem.milestone ? (
                <DockRow term="Duration" value={`${focusedItem.duration}d`} />
              ) : null}
              <DockRow term="State" value={focusedItem.state} mono />
              {/* FLOAT IS THE DERIVED NUMBER NOTHING ELSE SHOWS. Criticality is
                  painted on the bar, but "how much could this slip" is only
                  ever the arithmetic behind it, and zero float is worth saying
                  in words beside a bar that is already marked. */}
              {!focusedItem.milestone ? (
                <DockRow
                  term="Float"
                  value={
                    focusedItem.critical
                      ? "0d — on the critical path"
                      : `${focusedItem.float}d`
                  }
                />
              ) : null}
              {focusedItem.after.length > 0 ? (
                <DockRow
                  term="Waits for"
                  value={focusedItem.after.join(", ")}
                  mono
                />
              ) : null}
              {focusedItem.description !== undefined ? (
                <DockRow term="Details" value={focusedItem.description} />
              ) : null}
              {focusedItem.tags !== undefined ? (
                <DockRow term="Tags" value={focusedItem.tags.join(", ")} mono />
              ) : null}
            </dl>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
