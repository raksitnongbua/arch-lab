"use client";

/**
 * The shared node frame (T2-A): shape layer, icon + name / technology /
 * description hierarchy, inline label editor, child-count badge, `^ref`
 * source-layer chip, unknown-icon warning marker, and the four connection
 * handles the canvas relies on.
 *
 * Corner budget — each marker owns one corner, so they never overlap:
 * top-left unknown-icon dot, top-right child badge, bottom-left ref chip.
 *
 * Colours are exclusively semantic tokens: `--node`, `--node-foreground`,
 * `--node-border`, plus the shadcn set. Zero colour literals.
 */

import { Handle, Position } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { C4NodeType } from "@/types";

import { goToOriginal } from "../../lib/goto-original";
import { resolveIcon } from "../../lib/icons/registry";
import { ChildBadge } from "./child-badge";
import type { C4NodeData } from "./c4-node";
import { RelateGrip } from "./relate-grip";
import { InlineLabel } from "./inline-label";
import {
  hasSvgSilhouette,
  NodeShapeLayer,
  SHAPE_WRAPPER_CLASSES,
} from "./node-shapes";
import { RefBadge } from "./ref-badge";

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

      {data.refSourceLevel !== null ? (
        <RefBadge
          sourceLevel={data.refSourceLevel}
          nodeName={node.name}
          onOpen={() => goToOriginal(node)}
        />
      ) : null}

      {/* Placeholders DO get the relate grip. "Read-only" governs identity —
          you cannot rename, retype or duplicate one — but drawing a
          relationship FROM a boundary element is the entire reason to put it in
          the diagram (`userRef -> accounts` in a container view). The
          connection handles were already available on placeholders; withholding
          the grip only made the two disagree.
          Suppressed mid-rename, where no node should sprout extra controls. */}
      {!data.isEditingLabel ? <RelateGrip node={node} /> : null}

      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          // Reveal timing (and connect-state feedback) lives in
          // styles/canvas-motion.css on `--motion-hover`.
          //
          // The dot stays 8px, but `after:-inset-2` gives it a transparent
          // 24px hit area — the visual weight of a small dot with the
          // targetability of a button. Handles are the ONLY way to start a
          // relationship, so an 8px target was the single biggest source of
          // missed connection drags.
          //
          // Revealed on selection as well as hover: after clicking a node,
          // its handles stay put instead of vanishing the moment the pointer
          // drifts off, which is exactly when you reach for one.
          className={cn(
            "!size-2 !border-node-border !bg-node-foreground/60 transition-opacity duration-150 after:absolute after:-inset-2 after:content-[''] hover:!size-3 hover:!bg-primary motion-reduce:transition-none",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      ))}
    </div>
  );
}
