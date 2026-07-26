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
import type { C4Level, C4NodeType, Point } from "@/types";

import {
  DEFAULT_NODE_SIZE,
  GRID_SIZE,
  PASTE_OFFSET,
} from "../lib/canvas-constants";
import {
  selectActiveLevel,
  selectValidNodeTypes,
  useEditorStore,
} from "../state";
import { PaletteItem } from "./palette-item";

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

const LEVEL_LABEL: Record<C4Level, string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

const snap = (value: number): number =>
  Math.round(value / GRID_SIZE) * GRID_SIZE;

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
  let position: Point = {
    x: snap(centre.x - DEFAULT_NODE_SIZE.width / 2),
    y: snap(centre.y - DEFAULT_NODE_SIZE.height / 2),
  };
  // Offset (16px, grid-aligned) until no existing node sits at exactly the
  // same spot, so repeated creates never stack invisibly.
  const occupied = new Set(
    diagram.nodes.map((node) => `${node.position.x}:${node.position.y}`),
  );
  while (occupied.has(`${position.x}:${position.y}`)) {
    position = { x: position.x + PASTE_OFFSET, y: position.y + PASTE_OFFSET };
  }

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

export function Palette(): React.JSX.Element {
  const activeLevel = useEditorStore(selectActiveLevel);
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

      <p className="mt-auto text-[10px] leading-relaxed text-muted-foreground/80">
        Drag onto the canvas, or double-click to add at the centre.
      </p>
    </nav>
  );
}
