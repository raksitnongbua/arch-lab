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
 * motions stand down on any interaction and come back after `IDLE_AFTER_MS` of
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

import { DiagramFrost } from "@/components/ui/diagram-frost";
import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";
import { layoutGantt, GANTT_FRAME_PAD } from "../lib/layout";
import { IDLE_AFTER_MS, GANTT_SETTLE_MS } from "../lib/motion";
import { useMeasuredScale } from "@/components/ui/use-measured-scale";

import { GanttDiagram } from "./gantt-diagram";

export interface GanttViewerProps {
  file: GanttLabFile;
}

export function GanttViewer({ file }: GanttViewerProps) {
  const reduced = useReducedMotion();
  const idleMotion = useIdleMotion();
  const idleState = idleMotionState(reduced, idleMotion);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [atRest, setAtRest] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const selected = pinned ?? hovered;

  const litIds = useMemo(() => {
    if (!selected) return undefined;
    const seen = new Set<string>([selected]);
    const walk = (id: string, edges: Map<string, string[]>): void => {
      for (const next of edges.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        walk(next, edges);
      }
    };
    walk(selected, parents);
    walk(selected, children);
    return seen;
  }, [selected, parents, children]);

  const stir = useCallback(() => {
    setAtRest(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setAtRest(true), IDLE_AFTER_MS);
  }, []);

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
    idleTimer.current = setTimeout(() => setAtRest(true), GANTT_SETTLE_MS);
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
     the readable band. Never magnified: the CSS cap only ever shrinks.

     THE FROST SPENDS THE SAME NUMBER, for the same reason one step further on:
     its blur radius is stated against the ground's pitch at scale 1, so a
     squeezed pitch under an unsqueezed radius would quiet the ruling hardest
     on the narrowest panes. One measurement, two consumers — a second
     observer for the same shrink is a second thing to keep in step. */
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

  return (
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
      onPointerMove={stir}
      onPointerDown={stir}
      onKeyDown={stir}
      onWheel={stir}
      /* Pointer leaving the canvas clears a hover but never a pin — the pin is
         the whole reason a reader can move the pointer away and keep looking. */
      onPointerLeave={() => setHovered(null)}
    >
      {/* THE FROST, and the box the drawing shares with it. The `<div>`
          is inert in eight themes and blurs the ruling under the diagram
          area in `blueprint`; `@/components/ui/diagram-frost` argues why
          it cannot be the surface `<rect>` the drawing already draws. It
          also shrink-wraps the `<svg>`, which is what keeps the measured
          scale a reading of the drawing rather than of the pane. */}
      <DiagramFrost
        ref={groundRef}
        width={layout.width}
        height={layout.height}
        framePad={GANTT_FRAME_PAD}
        scale={groundScale}
      >
        <GanttDiagram
          file={file}
          litIds={litIds}
          reveal
          idleMotion={idleState}
          atRest={atRest}
          onFocusItem={(id) =>
            setPinned((current) => (current === id ? null : id))
          }
          onHoverItem={setHovered}
        />
      </DiagramFrost>
    </div>
  );
}
