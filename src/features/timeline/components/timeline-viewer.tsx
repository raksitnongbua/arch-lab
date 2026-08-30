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
 * down on any interaction and comes back after `IDLE_AFTER_MS` of quiet, but
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
import { IDLE_AFTER_MS, TIMELINE_SETTLE_MS } from "../lib/motion";
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

  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [atRest, setAtRest] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = pinned ?? hovered;
  const litKeys = useMemo(
    () => (selected === null ? undefined : new Set([selected])),
    [selected],
  );

  const stir = useCallback(() => {
    setAtRest(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setAtRest(true), IDLE_AFTER_MS);
  }, []);

  /* FIRST RENDER USES THE SETTLE, every interaction after it uses the idle
     wait. Mount arms the countdown DIRECTLY rather than calling `stir`:
     `atRest` already starts false, so the reset inside `stir` would be a
     synchronous setState in an effect body — a cascading render that buys
     nothing and that `react-hooks/set-state-in-effect` refuses. */
  useEffect(() => {
    idleTimer.current = setTimeout(() => setAtRest(true), TIMELINE_SETTLE_MS);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
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
  const naturalWidth = useMemo(() => layoutTimeline(file).width, [file]);
  const measureGroundScale = useCallback((): number => {
    const box = groundRef.current;
    if (box === null || naturalWidth <= 0) return 1;
    return box.clientWidth <= 0
      ? 1
      : Math.min(1, box.clientWidth / naturalWidth);
  }, [naturalWidth]);
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
      onPointerMove={stir}
      onPointerDown={stir}
      onKeyDown={stir}
      onWheel={stir}
      /* Pointer leaving the canvas clears a hover but never a pin — the pin is
         the whole reason a reader can move the pointer away and keep looking. */
      onPointerLeave={() => setHovered(null)}
    >
      <div ref={groundRef}>
        <TimelineDiagram
          file={file}
          litKeys={litKeys}
          reveal
          idleMotion={idleState}
          atRest={atRest}
          onFocusEvent={(key) =>
            setPinned((current) => (current === key ? null : key))
          }
          onHoverEvent={setHovered}
        />
      </div>
    </div>
  );
}
