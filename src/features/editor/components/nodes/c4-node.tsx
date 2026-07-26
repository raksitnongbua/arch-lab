"use client";

/**
 * STUB — ownership transfers to T2-A in Batch 2.
 *
 * The exported TYPE surface (`C4NodeData`, `C4FlowNode`,
 * `C4NodeComponentProps`) is the frozen contract from dev-handoff §4.2 —
 * `use-canvas-nodes.ts` and `canvas.tsx` (both final) build against it, so it
 * must not change. The COMPONENT body is deliberately minimal: T2-A replaces
 * it with per-type visual treatments, icons, badges and inline label editing
 * without touching any other file.
 */

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { C4Level, C4Node, C4NodeType } from "@/types";

/* ---- Contract (dev-handoff §4.2, frozen) --------------------------------- */

export interface C4NodeData extends Record<string, unknown> {
  /** The model node. Read-only — mutate via the store, never in place. */
  node: C4Node;
  /** The containing diagram's level. A node's level is never stored on the node. */
  level: C4Level;
  hasChildren: boolean;
  childCount: number;
  /** node.externalRef present ⇒ read-only boundary placeholder. */
  isPlaceholder: boolean;
  isEditingLabel: boolean;
  /** Icon slug after type-default resolution. Never empty. */
  resolvedIcon: string;
}

/** React Flow node id === C4Node.id. `type` === C4NodeType. */
export type C4FlowNode = Node<C4NodeData, C4NodeType>;
export type C4NodeComponentProps = NodeProps<C4FlowNode>;
// `selected`, `dragging`, `id`, `width`, `height` come from React Flow — do
// not duplicate them in data.

/* ---- Stub rendering (replaced wholesale by T2-A) ------------------------- */

const TYPE_LABEL: Record<C4NodeType, string> = {
  person: "Person",
  softwareSystem: "Software System",
  externalSystem: "External System",
  container: "Container",
  database: "Database",
  queue: "Queue",
  component: "Component",
  codeElement: "Code Element",
};

const HANDLES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

export function C4NodeComponent({
  data,
  selected,
  dragging,
}: C4NodeComponentProps) {
  const { node } = data;
  return (
    <div
      className={cn(
        "group relative flex size-full flex-col items-center justify-center gap-0.5 rounded-lg border border-node-border bg-node px-3 py-2 text-center text-node-foreground shadow-sm transition-shadow",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-canvas",
        dragging && "shadow-lg",
        data.isPlaceholder && "border-dashed opacity-60",
      )}
    >
      <span className="line-clamp-2 w-full text-sm leading-tight font-medium break-words">
        {node.name}
      </span>
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {TYPE_LABEL[node.type]}
      </span>
      {data.hasChildren ? (
        <span
          aria-label={`Contains ${data.childCount} elements`}
          className="absolute top-1 right-1 rounded-sm bg-secondary px-1 text-[10px] leading-4 text-secondary-foreground"
        >
          {data.childCount}
        </span>
      ) : null}
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className="!size-2 !border-node-border !bg-node-foreground/60 opacity-0 transition-opacity group-hover:opacity-100"
        />
      ))}
    </div>
  );
}
