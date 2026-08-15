"use client";

/**
 * One draggable entry in the node palette.
 *
 * Internal to the palette — only `palette.tsx` and the quick-add menu import
 * from here (`NODE_TYPE_META` is the shared type→label/glyph table so the two
 * creation surfaces stay visually consistent).
 *
 * Interactions:
 * - Drag encodes the payload via `lib/drag-payload.ts`; the drag preview
 *   is a real node-sized ghost styled with the canvas tokens, anchored at its
 *   top-left so the preview sits exactly where the node will land.
 * - Double-click, `Enter`, and `Space` create at the viewport centre — the
 *   palette is fully operable without a mouse.
 */

import { useCallback, type DragEvent, type KeyboardEvent } from "react";
import {
  Box,
  Boxes,
  Code,
  Database,
  Globe,
  GripVertical,
  Layers,
  Puzzle,
  User,
  type LucideIcon,
} from "lucide-react";

import type { C4Level, C4NodeType } from "@/types";

import { DEFAULT_NODE_SIZE } from "../lib/canvas-constants";
import { encodePaletteDrag } from "../lib/drag-payload";

export interface NodeTypeMeta {
  label: string;
  /** One-line description shown under the label and in the tooltip. */
  hint: string;
  Icon: LucideIcon;
}

/** Shared type → presentation table for both creation surfaces. */
export const NODE_TYPE_META: Record<C4NodeType, NodeTypeMeta> = {
  person: {
    label: "Person",
    hint: "A human user of the system",
    Icon: User,
  },
  softwareSystem: {
    label: "Software System",
    hint: "A top-level system you own",
    Icon: Boxes,
  },
  externalSystem: {
    label: "External System",
    hint: "A system outside your control",
    Icon: Globe,
  },
  container: {
    label: "Container",
    hint: "A deployable app or service",
    Icon: Box,
  },
  database: {
    label: "Database",
    hint: "A store of data",
    Icon: Database,
  },
  queue: {
    label: "Queue",
    hint: "A message queue or bus",
    Icon: Layers,
  },
  component: {
    label: "Component",
    hint: "A module inside a container",
    Icon: Puzzle,
  },
  codeElement: {
    label: "Code Element",
    hint: "A class, function, or file",
    Icon: Code,
  },
};

/**
 * Builds the node-shaped drag preview. Token-styled (never a colour literal)
 * and sized like the node that will be created, so the drag reads as "you are
 * holding the node", not a ghost blob of the palette row.
 */
function buildDragPreview(label: string): HTMLElement {
  const ghost = document.createElement("div");
  ghost.textContent = label;
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    zIndex: "-1",
    width: `${DEFAULT_NODE_SIZE.width}px`,
    height: `${DEFAULT_NODE_SIZE.height}px`,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px 12px",
    textAlign: "center",
    fontSize: "14px",
    fontWeight: "500",
    fontFamily: "inherit",
    color: "var(--node-foreground)",
    background: "var(--node)",
    border: "1px solid var(--node-border)",
    borderRadius: "var(--radius)",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);
  return ghost;
}

export interface PaletteItemProps {
  type: C4NodeType;
  /** The level the palette is showing; travels in the drag payload. */
  level: C4Level;
  /** Create at viewport centre (double-click / `Enter` / `Space`). */
  onCreate: (type: C4NodeType) => void;
}

export function PaletteItem({
  type,
  level,
  onCreate,
}: PaletteItemProps): React.JSX.Element {
  const { label, hint, Icon } = NODE_TYPE_META[type];

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      encodePaletteDrag(event.dataTransfer, { nodeType: type, level });
      const ghost = buildDragPreview(label);
      // (0, 0): the preview's top-left rides the pointer, exactly where the
      // created node's top-left will land on drop.
      event.dataTransfer.setDragImage(ghost, 0, 0);
      window.setTimeout(() => ghost.remove(), 0);
    },
    [type, level, label],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      // Keep the keypress out of the global shortcut registry (`Enter` is
      // the rename combo) and stop Space from scrolling the rail.
      event.preventDefault();
      event.stopPropagation();
      onCreate(type);
    },
    [onCreate, type],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-label={`${label} — drag onto the canvas, or press Enter to add at the centre`}
      title={hint}
      onDragStart={handleDragStart}
      onDoubleClick={() => onCreate(type)}
      onKeyDown={handleKeyDown}
      className="group flex cursor-grab items-center gap-2.5 rounded-md border border-border bg-background px-2 py-1.5 select-none hover:border-ring/40 hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground">
          {label}
        </span>
        <span className="truncate text-[10px] leading-tight text-muted-foreground">
          {hint}
        </span>
      </span>
      <GripVertical
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
    </div>
  );
}
