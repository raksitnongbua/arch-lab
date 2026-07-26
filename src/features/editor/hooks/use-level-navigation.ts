"use client";

/**
 * Drill / climb orchestration (T2-C — AF-E2-S2/S3). One module owns every way
 * of moving between levels so the rules live in one place:
 *
 * - Navigation itself is NEVER an undo entry (`setActiveDiagram` is view
 *   state); creating a child diagram IS one entry (`createChildDiagram`).
 * - Before navigating, the target diagram's last-selected node is checked
 *   against its saved viewport and, when off-screen, the saved camera is
 *   re-centred on it — so the breadcrumb "re-selects and scrolls into view"
 *   (AF-E2-S3). The canvas restores `viewportByDiagramId` on diagram change.
 * - `mod+ArrowDown` / `mod+ArrowUp` are T2-C's two claims in the §4.5
 *   registry, registered here (the hook is mounted by the breadcrumb).
 */

import { useMemo } from "react";
import { create } from "zustand";

import { toast } from "@/components/ui/toast";
import {
  childLevelOf,
  hasChildDiagram,
  isBoundaryPlaceholder,
  type C4Node,
} from "@/types";

import { MaxDepthError, selectBreadcrumb, useEditorStore } from "../state";
import { useShortcuts, type ShortcutBinding } from "./use-keyboard-shortcuts";

/* -------------------------------------------------------------------------- */
/* Navigation feedback — the breadcrumb's root shake (AF-E2-S3)                */
/* -------------------------------------------------------------------------- */

interface NavigationFeedbackState {
  /** Bumped when climbing is attempted at the root; the breadcrumb shakes. */
  shakeToken: number;
}

export const useNavigationFeedback = create<NavigationFeedbackState>(() => ({
  shakeToken: 0,
}));

function triggerRootShake(): void {
  useNavigationFeedback.setState((state) => ({
    shakeToken: state.shakeToken + 1,
  }));
}

/* -------------------------------------------------------------------------- */
/* Viewport pre-adjustment: scroll the restored selection into view            */
/* -------------------------------------------------------------------------- */

const VISIBLE_MARGIN_PX = 24;

/**
 * If the diagram we are about to show has a remembered last-selected node that
 * sits outside its saved viewport, re-centre the saved camera on it (same
 * zoom). Runs BEFORE `setActiveDiagram` so the canvas's restore effect picks
 * the adjusted camera up. View state only — never a history entry.
 */
function ensureRestoredSelectionVisible(diagramId: string): void {
  if (typeof document === "undefined") return;
  const store = useEditorStore.getState();
  const diagram = store.model.diagrams[diagramId];
  if (diagram === undefined) return;
  const lastId = store.lastSelectedByDiagramId[diagramId];
  if (typeof lastId !== "string") return;
  const node = diagram.nodes.find((n) => n.id === lastId);
  if (node === undefined) return;

  const canvasEl = document.querySelector(".react-flow");
  const rect = canvasEl?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return;

  const centreX = node.position.x + node.size.width / 2;
  const centreY = node.position.y + node.size.height / 2;
  const saved = store.viewportByDiagramId[diagramId];
  if (saved !== undefined) {
    const screenX = centreX * saved.zoom + saved.x;
    const screenY = centreY * saved.zoom + saved.y;
    const inView =
      screenX >= VISIBLE_MARGIN_PX &&
      screenX <= rect.width - VISIBLE_MARGIN_PX &&
      screenY >= VISIBLE_MARGIN_PX &&
      screenY <= rect.height - VISIBLE_MARGIN_PX;
    if (inView) return;
  }
  const zoom = saved?.zoom ?? 1;
  store.setViewport(diagramId, {
    x: rect.width / 2 - centreX * zoom,
    y: rect.height / 2 - centreY * zoom,
    zoom,
  });
}

/* -------------------------------------------------------------------------- */
/* The navigation commands                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Navigate to any diagram (breadcrumb click, sibling switch, drill target).
 * Restores that level's last selection (done by `setActiveDiagram`) and
 * scrolls it into view. Not an undo entry.
 */
export function navigateToDiagram(diagramId: string): void {
  const store = useEditorStore.getState();
  if (store.model.diagrams[diagramId] === undefined) return;
  if (diagramId === store.activeDiagramId) return;
  ensureRestoredSelectionVisible(diagramId);
  store.setActiveDiagram(diagramId);
}

/** Climb one level. At the root it is a no-op with a breadcrumb shake. */
export function climbToParent(): void {
  const store = useEditorStore.getState();
  const segments = selectBreadcrumb(store);
  if (segments.length < 2) {
    triggerRootShake();
    return;
  }
  navigateToDiagram(segments[segments.length - 2].diagramId);
}

/** Whether the context menu may offer any drill affordance for `node`. */
export function canDrillInto(
  node: C4Node,
  diagramLevelHasChild: boolean,
): boolean {
  if (isBoundaryPlaceholder(node)) return false;
  if (hasChildDiagram(node)) return true;
  // A `code`-level node offers no drill affordance in any form (D4/AF-E2-S2);
  // `childRef` (multi-file split) is unsupported this sprint.
  return diagramLevelHasChild && node.childRef === undefined;
}

/**
 * Drill into a node. Opens the existing child diagram, or — when the node is
 * a drillable leaf — creates an empty child one level deeper first
 * (`createChildDiagram`: ONE undo entry, both tree pointers set) and then
 * navigates in. Navigation itself is never an undo entry.
 */
export function drillIntoNode(nodeId: string): void {
  const store = useEditorStore.getState();
  const diagram = store.model.diagrams[store.activeDiagramId];
  const node = diagram?.nodes.find((n) => n.id === nodeId);
  if (diagram === undefined || node === undefined) return;

  if (hasChildDiagram(node) && typeof node.childDiagramId === "string") {
    navigateToDiagram(node.childDiagramId);
    return;
  }
  if (!canDrillInto(node, childLevelOf(diagram.level) !== null)) return;

  try {
    const childId = store.createChildDiagram(diagram.id, node.id);
    navigateToDiagram(childId);
  } catch (error) {
    if (error instanceof MaxDepthError) {
      toast({
        message: "Code is the deepest level — there is nothing below it.",
        tone: "info",
      });
      return;
    }
    toast({
      message:
        error instanceof Error
          ? error.message
          : "Could not create the child diagram.",
      tone: "warning",
    });
  }
}

/**
 * `mod+ArrowDown`: drill from a single selected node that HAS a child
 * diagram; a no-op on a leaf (AF-E2-S2 — creation is the context menu's job).
 */
function drillIntoSelection(): void {
  const store = useEditorStore.getState();
  if (store.selection.nodeIds.length !== 1) return;
  const diagram = store.model.diagrams[store.activeDiagramId];
  const node = diagram?.nodes.find((n) => n.id === store.selection.nodeIds[0]);
  if (
    node !== undefined &&
    hasChildDiagram(node) &&
    typeof node.childDiagramId === "string"
  ) {
    navigateToDiagram(node.childDiagramId);
  }
}

/* -------------------------------------------------------------------------- */
/* The hook — mounted by the breadcrumb (always in the shell header)           */
/* -------------------------------------------------------------------------- */

export function useLevelNavigation(): void {
  const bindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        id: "nav.drill-down",
        combo: "mod+ArrowDown",
        run: () => drillIntoSelection(),
      },
      {
        id: "nav.climb-up",
        combo: "mod+ArrowUp",
        run: () => climbToParent(),
      },
    ],
    [],
  );
  useShortcuts(bindings);
}
