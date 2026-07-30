"use client";

/**
 * Double-click empty canvas → pick an element type → it appears where you
 * clicked.
 *
 * The third way to create a node, alongside palette drag and palette
 * double-click. It exists because double-clicking blank space is the reflex
 * users arrive with from every other canvas tool, and until now the gesture did
 * nothing at all (`zoomOnDoubleClick` is `false`), which reads as a dead app
 * rather than a missing feature.
 *
 * Props-free like the other overlays (§4.4); the position comes from the
 * `pendingCreate` slice of the canvas interaction seam, which `canvas.tsx`
 * fills after confirming the double-click landed on the pane and not a node.
 *
 * Offers exactly `selectValidNodeTypes` — the same level gate as the palette,
 * so this cannot introduce a type the palette would refuse. Grouping matches
 * the palette's order too: two surfaces, one mental model.
 *
 * The click position is honoured, not adjusted. `lib/placement.ts` deliberately
 * limits its overlap-dodging to *programmatic* creation; a double-click is a
 * pointer gesture that already said where, and moving the result would be
 * second-guessing the user.
 */

import { useCallback, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { C4NodeType, Point } from "@/types";

import { DEFAULT_NODE_SIZE, GRID_SIZE } from "../../lib/canvas-constants";
import { selectValidNodeTypes, useEditorStore } from "../../state";
import { NODE_TYPE_META } from "../palette-item";
import {
  setPendingCreate,
  useCanvasInteraction,
  type PendingCreate,
} from "../canvas";

const snap = (value: number): number =>
  Math.round(value / GRID_SIZE) * GRID_SIZE;

/** Same display order as `palette.tsx`, filtered to the active level. */
const TYPE_ORDER: readonly C4NodeType[] = [
  "person",
  "softwareSystem",
  "container",
  "component",
  "codeElement",
  "database",
  "queue",
  "externalSystem",
];

/**
 * Gate only. The body lives in a child so that opening the dialog MOUNTS it:
 * `useState(0)` then starts on the first option every time, with no effect
 * resetting state after the fact. (`react-hooks/set-state-in-effect` rightly
 * rejects that pattern, and mounting is the simpler mechanism anyway.)
 */
export function CreateNodeDialog(): React.JSX.Element | null {
  const pending = useCanvasInteraction((s) => s.pendingCreate);
  if (pending === null) return null;
  return <CreateNodeDialogBody pending={pending} />;
}

function CreateNodeDialogBody({
  pending,
}: {
  pending: PendingCreate;
}): React.JSX.Element {
  const validTypes = useEditorStore(selectValidNodeTypes);
  const [active, setActive] = useState(0);

  const types = TYPE_ORDER.filter((type) => validTypes.includes(type));

  const close = useCallback(() => setPendingCreate(null), []);

  const create = useCallback(
    (type: C4NodeType) => {
      const store = useEditorStore.getState();
      // The click marks the node's CENTRE — dropping its top-left there would
      // make the node appear down-and-right of the cursor.
      const position: Point = {
        x: snap(pending.flowPosition.x - DEFAULT_NODE_SIZE.width / 2),
        y: snap(pending.flowPosition.y - DEFAULT_NODE_SIZE.height / 2),
      };
      try {
        const nodeId = store.createNode({
          diagramId: store.activeDiagramId,
          type,
          position,
        });
        store.setSelection({ nodeIds: [nodeId], edgeIds: [] });
        // Straight into rename: you double-clicked to make a thing, so the next
        // thing you want is to say what it is.
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
      close();
    },
    [close, pending],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (types.length === 0) return;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        setActive((index) => (index + 1) % types.length);
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        setActive((index) => (index - 1 + types.length) % types.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const type = types[Math.min(active, types.length - 1)];
        if (type !== undefined) create(type);
      }
    },
    [active, create, types],
  );

  return (
    <Dialog
      open
      onClose={close}
      title="Add an element"
      description="It lands where you double-clicked. Only types valid at this level are offered."
    >
      <div onKeyDown={onKeyDown} className="flex flex-col gap-1.5">
        {types.map((type, index) => {
          const { label, hint, Icon } = NODE_TYPE_META[type];
          const isActive = index === Math.min(active, types.length - 1);
          return (
            <button
              key={type}
              type="button"
              // Focus the highlighted row so screen readers follow the arrow
              // keys, and so Enter has an unambiguous target.
              ref={(el) => {
                if (isActive) el?.focus();
              }}
              onClick={() => create(type)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-2 py-1.5 text-left focus-visible:outline-none",
                isActive
                  ? "border-ring/60 bg-secondary"
                  : "border-border hover:bg-secondary/60",
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {label}
                </span>
                <span className="truncate text-[10px] leading-tight text-muted-foreground">
                  {hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
