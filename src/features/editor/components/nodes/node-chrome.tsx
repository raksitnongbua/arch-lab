"use client";

/**
 * The shared node frame (T2-A): shape layer, icon + name / technology /
 * description hierarchy, inline label editor, child-count badge, unknown-icon
 * warning marker, and the four connection handles the canvas relies on.
 *
 * Colours are exclusively semantic tokens: `--node`, `--node-foreground`,
 * `--node-border`, plus the shadcn set. Zero colour literals.
 */

import { Handle, Position } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { C4NodeType } from "@/types";

import { resolveIcon } from "../../lib/icons/registry";
import { ChildBadge } from "./child-badge";
import type { C4NodeData } from "./c4-node";
import { InlineLabel } from "./inline-label";
import {
  hasSvgSilhouette,
  NodeShapeLayer,
  SHAPE_WRAPPER_CLASSES,
} from "./node-shapes";

export const TYPE_LABEL: Record<C4NodeType, string> = {
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

export interface NodeChromeProps {
  data: C4NodeData;
  selected?: boolean;
  dragging?: boolean;
  /** True on a node's first-ever presentation: plays the create animation. */
  entering?: boolean;
}

export function NodeChrome({
  data,
  selected,
  dragging,
  entering,
}: NodeChromeProps): React.JSX.Element {
  const { node } = data;
  // The component resolves through the registry itself; `data.resolvedIcon`
  // is a convenience for consumers without registry access.
  const { def, isFallback } = resolveIcon(node);
  const Icon = def.Svg;

  // C4 metadata convention: [Container: Go] — type always, technology when set.
  const meta =
    node.technology !== undefined && node.technology !== ""
      ? `${TYPE_LABEL[node.type]}: ${node.technology}`
      : TYPE_LABEL[node.type];

  // Name (and description) in full on hover (AF-E1-S6 / AF-E3-S2).
  const hoverText =
    node.description !== undefined && node.description !== ""
      ? `${node.name}\n\n${node.description}`
      : node.name;

  const svgSilhouette = hasSvgSilhouette(node.type);

  return (
    <div
      title={data.isEditingLabel ? undefined : hoverText}
      className={cn(
        // `af-node-chrome` (styles/canvas-motion.css) gives box-shadow and
        // opacity their `--motion-hover` transition, driven by lib/motion.ts.
        "af-node-chrome group relative flex size-full flex-col items-center justify-center overflow-visible px-3 py-1.5 text-center text-node-foreground",
        SHAPE_WRAPPER_CLASSES[node.type],
        // Hover raises elevation (AF-E6-S2); SVG-silhouette types (cylinder,
        // pipe) skip the box shadow — it would draw a rectangle around them.
        !svgSilhouette && "shadow-sm hover:shadow-md",
        // Content clears the cylinder rim / pipe rims.
        node.type === "database" && "pt-4",
        node.type === "queue" && "px-8",
        svgSilhouette && "rounded-lg",
        // Drag ghost at 60% opacity (AF-E6-S2); otherwise the static
        // placeholder / external-system treatments.
        dragging
          ? "opacity-60 shadow-lg"
          : data.isPlaceholder
            ? "opacity-60"
            : node.type === "externalSystem" && "opacity-90",
        entering && "af-node-enter",
      )}
    >
      <NodeShapeLayer type={node.type} />

      {/* Selection outline: always mounted so it can fade in AND out over
          `--motion-selection` (AF-E6-S2). Sits 4px outside the node bounds,
          replacing the previous instant ring+offset. */}
      <span
        aria-hidden="true"
        className={cn(
          "af-selection-ring pointer-events-none absolute -inset-1 z-[2] rounded-[inherit] ring-2 ring-ring",
          selected ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="relative z-[1] flex w-full min-w-0 flex-col items-center gap-px overflow-hidden">
        <div className="flex w-full min-w-0 items-center justify-center gap-1.5">
          <Icon className="size-4 shrink-0" />
          {data.isEditingLabel ? (
            <InlineLabel
              value={node.name}
              ariaLabel={`Rename ${node.name}`}
              className="text-sm leading-tight font-medium"
            />
          ) : (
            <span
              className={cn(
                "line-clamp-3 min-w-0 text-sm leading-tight font-medium break-words",
                node.type === "codeElement" && "font-mono",
              )}
            >
              {node.name}
            </span>
          )}
        </div>
        <span className="w-full truncate text-[10px] leading-tight text-muted-foreground">
          [{meta}]
        </span>
        {node.description !== undefined && node.description !== "" ? (
          <span className="line-clamp-1 w-full text-[10px] leading-tight break-words text-muted-foreground/80">
            {node.description}
          </span>
        ) : null}
      </div>

      {isFallback ? (
        <span
          aria-label={`Unknown icon "${node.icon ?? ""}" — showing the generic ${TYPE_LABEL[node.type]} icon`}
          title={`Unknown icon "${node.icon ?? ""}" — showing the generic ${TYPE_LABEL[node.type]} icon`}
          className="absolute top-1 left-1 z-[2] size-2 rounded-full bg-warning"
        />
      ) : null}

      {data.hasChildren ? <ChildBadge count={data.childCount} /> : null}

      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          // Reveal timing (and connect-state feedback) lives in
          // styles/canvas-motion.css on `--motion-hover`.
          className="!size-2 !border-node-border !bg-node-foreground/60 opacity-0 group-hover:opacity-100"
        />
      ))}
    </div>
  );
}
