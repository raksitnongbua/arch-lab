"use client";

/**
 * Animated level transitions. Props-free; mounted
 * by the frozen `canvas.tsx` inside the React Flow tree.
 *
 * How it works around the instant node-set swap (integration risk R6):
 * `useEditorStore.subscribe` fires synchronously when `activeDiagramId`
 * changes — BEFORE React re-renders — so the outgoing level is still in the
 * DOM. At that moment we clone `.react-flow__viewport` (a static snapshot of
 * the outgoing level) and capture the drilled node's on-screen bounds. After
 * React commits the incoming level, a layout effect plays both halves with
 * the Web Animations API:
 *
 * - Drill: the snapshot scales UP and fades out anchored on the drilled
 *   node's bounds while the live renderer scales in from those bounds.
 * - Climb: the inverse — the snapshot shrinks toward the parent node while
 *   the live renderer settles down onto it, then the parent node is briefly
 *   highlighted.
 * - Across (sibling / unrelated): a plain crossfade.
 *
 * `transform`/`opacity` only, `duration("levelTransition")` (320ms, in the
 * 250–400ms band) with an ease-out curve. Under `prefers-reduced-motion`
 * `duration()` returns 0 and the whole path is skipped — an instant swap.
 * A new transition (or unmount) cancels the running one and removes its
 * snapshot, so rapid drill/climb sequences leave no ghost layers.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { C4Diagram } from "@/types";

import { duration } from "../../lib/motion";
import { useEditorStore, type EditorModel } from "../../state";

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** How far the level "behind" the camera is scaled. Inverse pair. */
const SCALE_NEAR = 1.42;
const SCALE_FAR = 0.7;
/** Subtle settle for sibling crossfades. */
const SCALE_ACROSS = 0.98;

type Relation =
  | { kind: "drill"; anchorNodeId: string }
  | { kind: "climb"; anchorNodeId: string }
  | { kind: "across" };

interface PendingTransition {
  relation: Relation;
  /** Anchor centre in root-element pixels; captured pre-swap for drills. */
  anchor: { x: number; y: number } | null;
  /** Anchor bounds for the climb highlight (queried post-swap instead). */
  snapshot: HTMLElement;
  rootEl: HTMLElement;
}

interface ActiveTransition {
  host: HTMLDivElement;
  animations: Animation[];
  renderer: HTMLElement | null;
  previousTransformOrigin: string;
}

/**
 * How `to` relates to `from` in the diagram tree. Multi-hop breadcrumb jumps
 * up still classify as a climb, anchored on the ancestor node that contains
 * the level we came from. Depth is bounded at 4; the guard terminates a
 * corrupt parent cycle.
 */
function classify(model: EditorModel, fromId: string, toId: string): Relation {
  let cursor: C4Diagram | undefined = model.diagrams[toId];
  let guard = 0;
  while (cursor !== undefined && guard < 8) {
    guard += 1;
    if (cursor.parentDiagramId === fromId) {
      return cursor.ownerNodeId !== null
        ? { kind: "drill", anchorNodeId: cursor.ownerNodeId }
        : { kind: "across" };
    }
    cursor =
      cursor.parentDiagramId !== null
        ? model.diagrams[cursor.parentDiagramId]
        : undefined;
  }
  cursor = model.diagrams[fromId];
  guard = 0;
  while (cursor !== undefined && guard < 8) {
    guard += 1;
    if (cursor.parentDiagramId === toId) {
      return cursor.ownerNodeId !== null
        ? { kind: "climb", anchorNodeId: cursor.ownerNodeId }
        : { kind: "across" };
    }
    cursor =
      cursor.parentDiagramId !== null
        ? model.diagrams[cursor.parentDiagramId]
        : undefined;
  }
  return { kind: "across" };
}

/** Centre of a node's DOM element relative to the React Flow root, or null. */
function anchorCentre(
  rootEl: HTMLElement,
  nodeId: string,
): { x: number; y: number } | null {
  const el = rootEl.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`,
  );
  if (!(el instanceof HTMLElement)) return null;
  const rootRect = rootEl.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left - rootRect.left + rect.width / 2,
    y: rect.top - rootRect.top + rect.height / 2,
  };
}

/** Bounds of a node's DOM element relative to the root, for the highlight. */
function anchorBounds(
  rootEl: HTMLElement,
  nodeId: string,
): { x: number; y: number; width: number; height: number } | null {
  const el = rootEl.querySelector(
    `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`,
  );
  if (!(el instanceof HTMLElement)) return null;
  const rootRect = rootEl.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function LevelTransition(): React.JSX.Element | null {
  const markerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingTransition | null>(null);
  const activeRef = useRef<ActiveTransition | null>(null);
  const [tick, setTick] = useState(0);

  /* ---- capture: synchronous, pre-swap ------------------------------------ */

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.activeDiagramId === previous.activeDiagramId) return;
      // Reduced motion: instant swap, nothing captured, nothing animated.
      if (duration("levelTransition") === 0) return;
      // Both diagrams must exist in the CURRENT model — a file open or a
      // cascade delete that moved us is an instant cut, not a transition.
      if (
        state.model.diagrams[previous.activeDiagramId] === undefined ||
        state.model.diagrams[state.activeDiagramId] === undefined
      ) {
        return;
      }
      const rootEl = markerRef.current?.closest(".react-flow");
      if (!(rootEl instanceof HTMLElement)) return;
      const viewportEl = rootEl.querySelector(".react-flow__viewport");
      if (!(viewportEl instanceof HTMLElement)) return;

      const relation = classify(
        state.model,
        previous.activeDiagramId,
        state.activeDiagramId,
      );
      // For a drill the anchor node lives in the OUTGOING level — measure it
      // now, while that level is still mounted.
      const anchor =
        relation.kind === "drill"
          ? anchorCentre(rootEl, relation.anchorNodeId)
          : null;
      const snapshot = viewportEl.cloneNode(true) as HTMLElement;
      pendingRef.current = { relation, anchor, snapshot, rootEl };
      setTick((value) => value + 1);
    });
    return unsubscribe;
  }, []);

  /* ---- play: after the incoming level committed --------------------------- */

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;

    cancelTransition(activeRef.current);
    activeRef.current = null;

    const { relation, rootEl, snapshot } = pending;
    const rootRect = rootEl.getBoundingClientRect();
    if (rootRect.width === 0 || rootRect.height === 0) return;

    // The climb anchor lives in the INCOMING level — measurable only now.
    const anchor = pending.anchor ??
      (relation.kind === "climb"
        ? anchorCentre(rootEl, relation.anchorNodeId)
        : null) ?? { x: rootRect.width / 2, y: rootRect.height / 2 };
    const origin = `${anchor.x}px ${anchor.y}px`;
    const ms = duration("levelTransition");
    if (ms === 0) return;

    // Snapshot host: above the renderer, below React Flow's panels (z 5).
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.className = "pointer-events-none absolute inset-0 overflow-hidden";
    host.style.zIndex = "4"; // above the renderer, below React Flow's panels
    const wrapper = document.createElement("div");
    wrapper.className = "absolute inset-0";
    wrapper.style.transformOrigin = origin;
    wrapper.appendChild(snapshot);
    host.appendChild(wrapper);
    rootEl.appendChild(host);

    const renderer =
      rootEl.querySelector(".react-flow__renderer") ??
      rootEl.querySelector(".react-flow__viewport")?.parentElement ??
      null;
    const rendererEl = renderer instanceof HTMLElement ? renderer : null;
    const previousTransformOrigin = rendererEl?.style.transformOrigin ?? "";
    if (rendererEl !== null) rendererEl.style.transformOrigin = origin;

    const timing: KeyframeAnimationOptions = {
      duration: ms,
      easing: EASE_OUT,
      fill: "forwards",
    };
    const animations: Animation[] = [];

    if (relation.kind === "drill") {
      // Outgoing grows past the camera; incoming grows up from the node.
      animations.push(
        wrapper.animate(
          [
            { transform: "scale(1)", opacity: 1 },
            { transform: `scale(${SCALE_NEAR})`, opacity: 0 },
          ],
          timing,
        ),
      );
      if (rendererEl !== null) {
        animations.push(
          rendererEl.animate(
            [
              { transform: `scale(${SCALE_FAR})`, opacity: 0 },
              { transform: "scale(1)", opacity: 1 },
            ],
            timing,
          ),
        );
      }
    } else if (relation.kind === "climb") {
      // Inverse: outgoing shrinks back into the parent node; incoming
      // settles down from above the camera.
      animations.push(
        wrapper.animate(
          [
            { transform: "scale(1)", opacity: 1 },
            { transform: `scale(${SCALE_FAR})`, opacity: 0 },
          ],
          timing,
        ),
      );
      if (rendererEl !== null) {
        animations.push(
          rendererEl.animate(
            [
              { transform: `scale(${SCALE_NEAR})`, opacity: 0 },
              { transform: "scale(1)", opacity: 1 },
            ],
            timing,
          ),
        );
      }
      // Briefly highlight the parent node we climbed out of.
      const bounds = anchorBounds(rootEl, relation.anchorNodeId);
      if (bounds !== null) {
        const highlight = document.createElement("div");
        highlight.className =
          "pointer-events-none absolute rounded-lg border-2 border-accent";
        highlight.style.left = `${bounds.x - 4}px`;
        highlight.style.top = `${bounds.y - 4}px`;
        highlight.style.width = `${bounds.width + 8}px`;
        highlight.style.height = `${bounds.height + 8}px`;
        highlight.style.opacity = "0";
        host.appendChild(highlight);
        animations.push(
          highlight.animate(
            [
              { opacity: 0 },
              { opacity: 1, offset: 0.35 },
              { opacity: 1, offset: 0.7 },
              { opacity: 0 },
            ],
            { duration: ms * 2, easing: "ease-in-out", fill: "forwards" },
          ),
        );
      }
    } else {
      // Across: plain crossfade with the faintest settle.
      animations.push(
        wrapper.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      );
      if (rendererEl !== null) {
        animations.push(
          rendererEl.animate(
            [
              { transform: `scale(${SCALE_ACROSS})`, opacity: 0 },
              { transform: "scale(1)", opacity: 1 },
            ],
            timing,
          ),
        );
      }
    }

    const active: ActiveTransition = {
      host,
      animations,
      renderer: rendererEl,
      previousTransformOrigin,
    };
    activeRef.current = active;

    void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
      // Only clean up if this run is still the active one (not interrupted).
      if (activeRef.current === active) {
        cancelTransition(active);
        activeRef.current = null;
      }
    });
  }, [tick]);

  /* ---- unmount safety ------------------------------------------------------ */

  useEffect(
    () => () => {
      cancelTransition(activeRef.current);
      activeRef.current = null;
    },
    [],
  );

  return <div ref={markerRef} aria-hidden="true" className="hidden" />;
}

/**
 * Cancel every animation and remove the snapshot. All animations end at the
 * identity transform, so cancelling leaves the live renderer exactly as-is.
 */
function cancelTransition(active: ActiveTransition | null): void {
  if (active === null) return;
  for (const animation of active.animations) {
    try {
      animation.cancel();
    } catch {
      // Already finished/detached — nothing to cancel.
    }
  }
  active.host.remove();
  if (active.renderer !== null) {
    active.renderer.style.transformOrigin = active.previousTransformOrigin;
  }
}
