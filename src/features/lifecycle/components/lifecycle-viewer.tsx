"use client";

/**
 * The mounted lifecycle canvas: focus, pinning, and the at-rest state the
 * ambient sweep waits for.
 *
 * The PAINTING lives in `./lifecycle-diagram.tsx`, which is server-safe and
 * takes no hooks. This component owns only what needs a browser — which state
 * is lit, and whether the reader has gone quiet — and hands the answers down
 * as props. That split is what lets the crawlable example pages render the
 * same SVG with no JavaScript at all.
 *
 * FOCUS HAS TWO LIFETIMES:
 *
 *   - A HOVER lasts as long as the pointer is over the state's row.
 *   - A PIN survives the pointer leaving, and Escape releases it.
 *
 * THE LIT SET IS ONE ROW, AND A ROW IS A STATE WITH ITS DEPARTURES. That is a
 * decision about what focus MEANS here rather than an implementation detail:
 * the question a lifecycle is read for is "what can happen at this point",
 * and the answer is the state plus its ways out. Lighting only the dot would
 * answer "which box is this", which is what focusing a node in a graph means
 * and is precisely the reading this notation is trying not to invite.
 *
 * WHAT IT DELIBERATELY DOES NOT LIGHT is the state a branch returns to. That
 * was tried in principle and rejected: it would make focus walk the graph,
 * and a canvas whose focus walks a graph is telling the reader they are
 * looking at one. The returning path is already lit and already carries its
 * arrowhead and its travelling dash, which say where it lands without
 * recruiting a second row into the selection.
 *
 * AT REST IS A REAL STATE, AND A FRESH PAGE IS ALREADY IN IT. The sweep stands
 * down on any interaction and comes back after `IDLE_AFTER_MS` of quiet, but
 * the FIRST transition is armed with `LIFECYCLE_SETTLE_MS` instead: a page
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
import type { LifecycleLabFile } from "@/types";

import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";
import { IDLE_AFTER_MS, LIFECYCLE_SETTLE_MS } from "../lib/motion";
import { layoutLifecycle } from "../lib/layout";
import { useMeasuredScale } from "@/components/ui/use-measured-scale";

import { LifecycleDiagram } from "./lifecycle-diagram";

export interface LifecycleViewerProps {
  file: LifecycleLabFile;
}

export function LifecycleViewer({ file }: LifecycleViewerProps) {
  const reduced = useReducedMotion();
  const idleMotion = useIdleMotion();
  const idleState = idleMotionState(reduced, idleMotion);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [atRest, setAtRest] = useState(false);
  /* THE ENTRANCE IS A PHASE, AND IT HAS TO END. It used to be stamped as a
     bare literal, which kept every `[data-reveal="1"]` rule matching for the
     life of the page — and each of those is `forwards`, so its end value went
     on being contributed from the ANIMATION ORIGIN, which outranks every
     normal author declaration. The focus dimming underneath it therefore never
     applied to anything, on either canvas.

     DROPPED AT THE SETTLE, the wait this viewer already computes, and that is
     the same instant rather than a second guess: `LIFECYCLE_SETTLE_MS` is pinned by
     `check:lifecycle-motion` to be at or above the entrance's worst case. Separate state
     from `atRest` on purpose — `stir` puts the canvas back to work on every
     pointer move, and reusing that flag would replay the entrance each time.

     THE HANDOVER IS SEAMLESS because every value the entrance fills equals the
     resting declaration underneath it: a row ends at `opacity: 1` and rests at
     1, a drawn line ends at `stroke-dashoffset: 0` and rests with no dash at
     all. Nothing moves at the moment the phase ends. */
  const [revealed, setRevealed] = useState(true);
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
    idleTimer.current = setTimeout(() => {
      setAtRest(true);
      setRevealed(false);
    }, LIFECYCLE_SETTLE_MS);
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
  const layout = useMemo(() => layoutLifecycle(file), [file]);
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
         `overflow-auto` is what lets a long lifecycle scroll inside that
         instead of being clipped by the host's `overflow-hidden`. A vertical
         track with an annotated branch lane is the kind here most likely to be
         taller than its pane, so this is load-bearing rather than defensive.
         There is no pan-and-zoom camera, so ordinary block flow plus the
         canvas's own `margin-inline: auto` centres it with less to go wrong. */
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
      <div
        ref={groundRef}
        /* SHRINK-WRAPS THE DRAWING, which is what keeps `measureGroundScale`
           a reading of the `<svg>` rather than of the pane around it.
           `margin-inline: auto` is the canvas's own centring. */
        className="mx-auto w-fit"
      >
        <LifecycleDiagram
          file={file}
          litKeys={litKeys}
          reveal={revealed}
          idleMotion={idleState}
          atRest={atRest}
          onFocusState={(key) =>
            setPinned((current) => (current === key ? null : key))
          }
          onHoverState={setHovered}
        />
      </div>
    </div>
  );
}
