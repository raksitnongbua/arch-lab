"use client";

/**
 * The node palette (AF-E1-S2, owned by T2-B). Props-free per §4.4 — mounted
 * by `editor-shell.tsx` in the left rail, reads the store itself.
 *
 * Shows exactly `VALID_NODE_TYPES_BY_LEVEL[activeLevel]` (via the frozen
 * `selectValidNodeTypes` selector), grouped and labelled, and re-renders as
 * you navigate levels. Items drag onto the canvas (payload per §4.7) or
 * create at the viewport centre on double-click / `Enter` / `Space`. A type
 * the store rejects (`InvalidNodeTypeError` — e.g. a stale gesture across a
 * level change) surfaces as a toast, never an unhandled throw.
 */

import { useCallback } from "react";

import { toast } from "@/components/ui/toast";
import { childLevelOf, type C4NodeType, type Point } from "@/types";

import { DEFAULT_NODE_SIZE, snapToGrid } from "../lib/canvas-constants";
import { findFreePosition } from "../lib/placement";
import {
  selectActiveLevel,
  selectValidNodeTypes,
  useEditorStore,
} from "../state";
import { LEVEL_LABEL } from "@/lib/constants";
import { PaletteItem } from "./palette-item";
import { RefPickerDialog } from "./ref-picker-dialog";

/** Display order and grouping of the palette; filtered per level at render. */
const PALETTE_GROUPS: ReadonlyArray<{
  label: string;
  types: readonly C4NodeType[];
}> = [
  { label: "People", types: ["person"] },
  {
    label: "Elements",
    types: ["softwareSystem", "container", "component", "codeElement"],
  },
  { label: "Data & messaging", types: ["database", "queue"] },
  { label: "External", types: ["externalSystem"] },
];

/**
 * The flow coordinate at the centre of the canvas viewport. Derived from the
 * store's per-diagram camera (kept fresh by the canvas's `onMoveEnd`) and the
 * mounted React Flow element's size — the palette lives outside the
 * `ReactFlowProvider`, so `useReactFlow` is not available here.
 */
function viewportCentreFlowPosition(diagramId: string): Point {
  const viewport = useEditorStore.getState().viewportByDiagramId[diagramId] ?? {
    x: 0,
    y: 0,
    zoom: 1,
  };
  const pane = document.querySelector<HTMLElement>(".react-flow");
  if (!pane) return { x: 0, y: 0 };
  const rect = pane.getBoundingClientRect();
  return {
    x: (rect.width / 2 - viewport.x) / viewport.zoom,
    y: (rect.height / 2 - viewport.y) / viewport.zoom,
  };
}

/** Creates `type` at the viewport centre, dodging exact overlaps (AF-E1-S2). */
function createAtViewportCentre(type: C4NodeType): void {
  const store = useEditorStore.getState();
  const diagramId = store.activeDiagramId;
  const diagram = store.model.diagrams[diagramId];
  if (!diagram) return;

  const centre = viewportCentreFlowPosition(diagramId);
  const position = findFreePosition(diagram, DEFAULT_NODE_SIZE, {
    x: snapToGrid(centre.x - DEFAULT_NODE_SIZE.width / 2),
    y: snapToGrid(centre.y - DEFAULT_NODE_SIZE.height / 2),
  });

  try {
    const nodeId = store.createNode({ diagramId, type, position });
    store.setSelection({ nodeIds: [nodeId], edgeIds: [] });
    store.beginLabelEdit({ kind: "node", id: nodeId });
  } catch (error) {
    toast({
      message:
        error instanceof Error
          ? error.message
          : "That element type is not valid at this level.",
      tone: "warning",
    });
  }
}

/**
 * Places a `^ref` boundary placeholder at the viewport centre. Mirrors
 * `createAtViewportCentre` minus the label edit — a placeholder is read-only,
 * so there is nothing to rename on arrival.
 */
function placeRefAtViewportCentre(
  sourceDiagramId: string,
  sourceNodeId: string,
): void {
  const store = useEditorStore.getState();
  const diagramId = store.activeDiagramId;
  const diagram = store.model.diagrams[diagramId];
  if (!diagram) return;

  const centre = viewportCentreFlowPosition(diagramId);
  const position = findFreePosition(diagram, DEFAULT_NODE_SIZE, {
    x: snapToGrid(centre.x - DEFAULT_NODE_SIZE.width / 2),
    y: snapToGrid(centre.y - DEFAULT_NODE_SIZE.height / 2),
  });

  try {
    store.createRefNode({
      diagramId,
      sourceDiagramId,
      sourceNodeId,
      position,
    });
  } catch (error) {
    toast({
      message:
        error instanceof Error
          ? error.message
          : "Could not reference that element here.",
      tone: "warning",
    });
  }
}

export function Palette(): React.JSX.Element {
  const activeLevel = useEditorStore(selectActiveLevel);

  // `null` at code level, where there is nothing below to point at.
  const childLevel = childLevelOf(activeLevel);
  const nextLevelLabel = childLevel === null ? null : LEVEL_LABEL[childLevel];
  const validTypes = useEditorStore(selectValidNodeTypes);

  const handleCreate = useCallback((type: C4NodeType) => {
    createAtViewportCentre(type);
  }, []);

  const groups = PALETTE_GROUPS.map((group) => ({
    label: group.label,
    types: group.types.filter((type) => validTypes.includes(type)),
  })).filter((group) => group.types.length > 0);

  return (
    <nav
      aria-label="Node palette"
      className="flex h-full flex-col gap-4 overflow-y-auto p-3"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Palette
        </h2>
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          {LEVEL_LABEL[activeLevel]}
        </span>
      </header>

      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="mb-1.5 text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase">
            {group.label}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {group.types.map((type) => (
              <li key={type}>
                <PaletteItem
                  type={type}
                  level={activeLevel}
                  onCreate={handleCreate}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-auto flex flex-col gap-2">
        {/* One button, not a list: the rail stays the same height whether the
            model has three referenceable elements or three hundred. Renders
            nothing at the root, or once everything eligible is placed. */}
        <RefPickerDialog onPlace={placeRefAtViewportCentre} />

        {/* The palette can only ever offer types legal at THIS level, so the
            level below is unreachable from here by construction. Users read
            that absence as "arch-lab cannot make containers" — say where they
            actually live, in the panel where they went looking for them. */}
        {nextLevelLabel === null ? null : (
          <p className="rounded-md border border-border/60 bg-secondary/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Looking for{" "}
            <span className="font-medium text-foreground">
              {nextLevelLabel.toLowerCase()}s
            </span>
            ? They live inside an element. Select one on the canvas and use{" "}
            <span className="font-medium text-foreground">
              Add {nextLevelLabel.toLowerCase()}s inside
            </span>{" "}
            in the inspector.
          </p>
        )}
        <p className="text-[10px] leading-relaxed text-muted-foreground/80">
          Drag onto the canvas, or double-click to add at the centre.
        </p>
      </div>
    </nav>
  );
}
