"use client";

/**
 * The mounted timeline canvas: focus, pinning, and the at-rest state the
 * ambient sweep waits for.
 *
 * The PAINTING lives in `./timeline-diagram.tsx`, which is server-safe and
 * takes no hooks. This component owns only what needs a browser — which event
 * is lit, and whether the reader has gone quiet — and hands the answers down
 * as props. That split is what lets the crawlable example pages render the
 * same SVG with no JavaScript at all.
 *
 * FOCUS HAS TWO LIFETIMES:
 *
 *   - A HOVER lasts as long as the pointer is over the event's box.
 *   - A PIN survives the pointer leaving, and Escape releases it.
 *
 * THE LIT SET IS THE EVENT AND NOTHING ELSE, which is the one place this
 * viewer is simpler than the gantt's and the difference is the notation
 * rather than an omission. A gantt lights a CHAIN because its events wait on
 * one another; a timeline has no `after`, no id and no connector, so there is
 * no chain to walk — every relationship on this canvas is "these happened in
 * this order", which the layout already shows and focus cannot add to. A
 * viewer that lit a whole period instead would be asserting a grouping the
 * reader can already see, and it would put the dimming at war with the rail.
 *
 * AT REST IS A REAL STATE, AND A FRESH PAGE IS ALREADY IN IT. The sweep stands
 * down while the entrance plays and runs from then on — nothing a reader
 * does here is sustained enough to yield to, but
 * the FIRST transition is armed with `TIMELINE_SETTLE_MS` instead: a page
 * nobody has touched yet is not a page someone is busy with, and treating it
 * as one left the gantt canvas's ambient dead for three seconds after the
 * entrance finished. Both constants and the full argument live in
 * `../lib/motion`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  idleMotionState,
  useIdleMotion,
  useReducedMotion,
} from "@/lib/idle-motion";
import type { TimelineLabFile } from "@/types";

import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";
import { TIMELINE_SETTLE_MS } from "../lib/motion";
import { layoutTimeline } from "../lib/layout";
import { useMeasuredScale } from "@/components/ui/use-measured-scale";

import { TimelineDiagram } from "./timeline-diagram";

export interface TimelineViewerProps {
  file: TimelineLabFile;
}

export function TimelineViewer({ file }: TimelineViewerProps) {
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
  /* THE ENTRANCE IS A PHASE, AND IT HAS TO END. It used to be stamped as a
     bare literal, which kept every `[data-reveal="1"]` rule matching for the
     life of the page — and each of those is `forwards`, so its end value went
     on being contributed from the ANIMATION ORIGIN, which outranks every
     normal author declaration. The focus dimming underneath it therefore never
     applied to anything, on either canvas.

     DROPPED AT THE SETTLE, the wait this viewer already computes, and that is
     the same instant rather than a second guess: `TIMELINE_SETTLE_MS` is pinned by
     `check:timeline-motion` to be at or above the entrance's worst case. Separate state
     from `atRest` on purpose — `stir` puts the canvas back to work on every
     pointer move, and reusing that flag would replay the entrance each time.

     THE HANDOVER IS SEAMLESS because every value the entrance fills equals the
     resting declaration underneath it: a row ends at `opacity: 1` and rests at
     1, a drawn line ends at `stroke-dashoffset: 0` and rests with no dash at
     all. Nothing moves at the moment the phase ends. */
  const [revealed, setRevealed] = useState(true);

  const selected = pinned ?? keyFocused;
  const litKeys = useMemo(
    () => (selected === null ? undefined : new Set([selected])),
    [selected],
  );

  /* CLICKING THE PANE CLEARS THE SELECTION. Every interactive shape inside the
     SVG stops the event reaching here, so this only ever fires on empty
     ground — and that stop is load-bearing rather than tidy: without it the
     same click sets the selection and then clears it, which is a flicker and
     nothing staying lit.

     IT WAS MISSING ENTIRELY, and only became a problem when selecting stopped
     happening on hover. A hover cleared itself the moment the pointer moved
     away; a click PINS, so the only ways out were clicking the same row again —
     which means finding it — or Escape, which nobody discovers. Reported as
     being unable to deselect at all.

     THE CLIENT-SIZE GUARD EXEMPTS THE SCROLLBAR GUTTERS, which are inside the
     element's box but outside its content: a click on the scrollbar would
     otherwise read as a click on empty ground and clear a selection the reader
     was scrolling to look at. */
  const handleBackdropClick = useCallback(
    (pointer: React.MouseEvent<HTMLDivElement>) => {
      const pane = pointer.currentTarget;
      const rect = pane.getBoundingClientRect();
      if (
        pointer.clientX - rect.left > pane.clientWidth ||
        pointer.clientY - rect.top > pane.clientHeight
      ) {
        return;
      }
      setPinned(null);
      setKeyFocused(null);
    },
    [],
  );

  /* FIRST RENDER USES THE SETTLE, every interaction after it uses the idle
     wait. Mount arms the countdown DIRECTLY rather than calling `stir`:
     `atRest` already starts false, so the reset inside `stir` would be a
     synchronous setState in an effect body — a cascading render that buys
     nothing and that `react-hooks/set-state-in-effect` refuses. */
  useEffect(() => {
    const settled = setTimeout(() => setRevealed(false), TIMELINE_SETTLE_MS);
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
  const layout = useMemo(() => layoutTimeline(file), [file]);
  const measureGroundScale = useCallback((): number => {
    const box = groundRef.current;
    if (box === null || layout.width <= 0) return 1;
    return box.clientWidth <= 0
      ? 1
      : Math.min(1, box.clientWidth / layout.width);
  }, [layout.width]);
  const groundScale = useMeasuredScale(groundRef, measureGroundScale);

  return (
    <div
      /* THE SCROLL BOX AND THE GUTTERS. `min-h-0 flex-1` claims the height the
         host gives it — the example page hands over the rest of the page, the
         playground hands over the pane between its two strips — and
         `overflow-auto` is what lets a long history scroll inside that instead
         of being clipped by the host's `overflow-hidden`. A vertical timeline
         is the kind here most likely to be taller than its pane, so this is
         load-bearing rather than defensive. There is no pan-and-zoom camera,
         so ordinary block flow plus the canvas's own `margin-inline: auto`
         centres it with less to go wrong. */
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
         mark for three seconds: the press reached the pane, stirred the idle
         timer, and the wash and the drift both stopped. Reported as the
         animation vanishing on unfocus. Focusing did it too, less visibly,
         because the focus dash went on running while the rest went still.

         THE WAIT WAS BUILT FOR HOVER. `IDLE_AFTER_MS` answered "how long
         after the reader stops fiddling", which was a real question while
         POINTING at a row selected it and the pointer moved continuously.
         Selecting is a discrete press now, and a three-second blackout after
         one click is the wrong shape for a discrete act. */
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
        <TimelineDiagram
          file={file}
          litKeys={litKeys}
          reveal={revealed}
          idleMotion={idleState}
          /* AT REST IS EXACTLY "THE ENTRANCE IS OVER" now that nothing else
             disturbs it — one timer and two derived attributes, rather
             than two flags free to disagree. */
          atRest={!revealed}
          onFocusEvent={(key) =>
            setPinned((current) => (current === key ? null : key))
          }
          onKeyFocusEvent={setKeyFocused}
        />
      </div>
    </div>
  );
}
