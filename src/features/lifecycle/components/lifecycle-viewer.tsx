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

import { IDLE_AFTER_MS, LIFECYCLE_SETTLE_MS } from "../lib/motion";
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
    idleTimer.current = setTimeout(() => setAtRest(true), LIFECYCLE_SETTLE_MS);
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
      className="min-h-0 w-full flex-1 overflow-auto px-5 py-6 sm:px-8"
      onPointerMove={stir}
      onPointerDown={stir}
      onKeyDown={stir}
      onWheel={stir}
      /* Pointer leaving the canvas clears a hover but never a pin — the pin is
         the whole reason a reader can move the pointer away and keep looking. */
      onPointerLeave={() => setHovered(null)}
    >
      <LifecycleDiagram
        file={file}
        litKeys={litKeys}
        reveal
        idleMotion={idleState}
        atRest={atRest}
        onFocusState={(key) =>
          setPinned((current) => (current === key ? null : key))
        }
        onHoverState={setHovered}
      />
    </div>
  );
}
