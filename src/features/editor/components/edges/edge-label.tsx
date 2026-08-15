"use client";

/**
 * Edge label chip (— rendering). A background chip at
 * the curve's label anchor so label + technology stay legible over the line;
 * the line itself is never obscured (the chip is only as wide as its text,
 * hard-capped, with the full text in a hover tooltip).
 *
 * Double-clicking the chip begins inline label editing — the canvas only
 * wires node double-clicks, so edges own their own affordance here.
 */

import { EdgeLabelRenderer } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { C4Edge } from "@/types";

import { useEditorStore } from "../../state";
import { InlineLabel } from "../nodes/inline-label";

export interface EdgeLabelChipProps {
  edge: C4Edge;
  isEditing: boolean;
  /** Label anchor from `lib/edge-geometry.ts`. */
  labelX: number;
  labelY: number;
  selected?: boolean;
}

export function EdgeLabelChip({
  edge,
  isEditing,
  labelX,
  labelY,
  selected,
}: EdgeLabelChipProps): React.JSX.Element | null {
  const hasLabel = edge.label !== undefined && edge.label !== "";
  const hasTechnology = edge.technology !== undefined && edge.technology !== "";
  if (!isEditing && !hasLabel && !hasTechnology) return null;

  const fullText = [
    hasLabel ? edge.label : null,
    hasTechnology ? `[${edge.technology}]` : null,
  ]
    .filter((part) => part !== null)
    .join(" ");

  return (
    <EdgeLabelRenderer>
      <div
        style={{
          transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        }}
        title={isEditing ? undefined : fullText}
        className={cn(
          "nodrag nopan pointer-events-auto absolute z-[1] flex max-w-40 min-w-0 flex-col items-center rounded-md border border-border bg-popover px-1.5 py-0.5 text-center text-popover-foreground shadow-sm",
          selected && "border-ring",
        )}
        onDoubleClick={(event) => {
          event.stopPropagation();
          useEditorStore
            .getState()
            .beginLabelEdit({ kind: "edge", id: edge.id });
        }}
      >
        {isEditing ? (
          <InlineLabel
            value={edge.label ?? ""}
            ariaLabel="Edit relationship label"
            className="w-32 bg-popover text-[11px] leading-tight"
          />
        ) : (
          <>
            {hasLabel ? (
              <span className="w-full truncate text-[11px] leading-tight">
                {edge.label}
              </span>
            ) : null}
            {hasTechnology ? (
              <span className="w-full truncate text-[10px] leading-tight text-muted-foreground">
                [{edge.technology}]
              </span>
            ) : null}
          </>
        )}
      </div>
    </EdgeLabelRenderer>
  );
}
