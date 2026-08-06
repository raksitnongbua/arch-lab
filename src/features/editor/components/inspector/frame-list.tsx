"use client";

/**
 * The boundaries panel: every frame on the active diagram, with rename,
 * nesting, membership count and delete — plus the button that adds one.
 *
 * Frames live in the DIAGRAM inspector rather than getting a selection state of
 * their own. A frame is scenery: `frame-layer.tsx` deliberately renders it
 * through a viewport portal with `pointer-events: none` so it never competes
 * with the elements for clicks, and giving it a place in `Selection` would have
 * meant teaching the canvas, the dimming stylesheet, the delete cascade and the
 * keyboard map about a third kind of selectable thing. A short list beside the
 * canvas turned out to be the better tool anyway: boundaries are few, they are
 * usually edited together, and the list is the only place their NESTING is
 * visible at a glance.
 *
 * Membership is set from the other end — the node inspector's Boundary field —
 * for the same reason: the node already has a selection and an inspector.
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { C4Diagram, C4Frame } from "@/types";

import { useEditorStore } from "../../state";
import { useInspectorField } from "./use-inspector-field";

/**
 * Frames ordered for reading: each one after its parent, indented by depth.
 * The model stores them sorted by id (the serializer's rule), which scatters a
 * nesting chain — so the tree is rebuilt here rather than shown flat.
 */
function framesInTreeOrder(
  frames: readonly C4Frame[],
): Array<{ frame: C4Frame; depth: number }> {
  const childrenOf = new Map<string | null, C4Frame[]>();
  for (const frame of frames) {
    const parent = frame.parentFrameId ?? null;
    const siblings = childrenOf.get(parent);
    if (siblings === undefined) childrenOf.set(parent, [frame]);
    else siblings.push(frame);
  }

  const out: Array<{ frame: C4Frame; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number): void => {
    for (const frame of childrenOf.get(parent) ?? []) {
      if (seen.has(frame.id)) continue;
      seen.add(frame.id);
      out.push({ frame, depth });
      walk(frame.id, depth + 1);
    }
  };
  walk(null, 0);
  // A frame whose parent is missing would otherwise vanish from the panel —
  // exactly when the user most needs to see it, to fix or delete it.
  for (const frame of frames) {
    if (!seen.has(frame.id)) out.push({ frame, depth: 0 });
  }
  return out;
}

/** Descendants of `frameId`, itself included — the illegal parents for it. */
function subtreeOf(frames: readonly C4Frame[], frameId: string): Set<string> {
  const out = new Set<string>([frameId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const frame of frames) {
      if (out.has(frame.id)) continue;
      if (out.has(frame.parentFrameId ?? "")) {
        out.add(frame.id);
        grew = true;
      }
    }
  }
  return out;
}

export function FrameList({
  diagram,
}: {
  diagram: C4Diagram;
}): React.JSX.Element {
  const createFrame = useEditorStore((s) => s.createFrame);
  const frames = diagram.frames ?? [];
  const rows = framesInTreeOrder(frames);

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-foreground">
          Boundaries
          {frames.length > 0 ? (
            <span className="ml-1 font-normal text-muted-foreground">
              ({frames.length})
            </span>
          ) : null}
        </h3>
        {/* An EMPTY boundary — legal in the model, and how you set one up
            before its elements exist. Wrapping an existing selection is the
            other route in, and it lives on the selection footer
            (`inspector-panel.tsx`), which is the only place a selection is on
            screen at the same time as a button. */}
        <button
          type="button"
          onClick={() => createFrame({ diagramId: diagram.id })}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add boundary
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No boundaries yet. A boundary is a labelled group drawn behind the
          elements — &ldquo;Internal&rdquo;, an AWS region, a trust boundary. It
          holds no relationships of its own.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(({ frame, depth }) => (
            <FrameRow
              key={frame.id}
              diagram={diagram}
              frame={frame}
              depth={depth}
              frames={frames}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FrameRow({
  diagram,
  frame,
  depth,
  frames,
}: {
  diagram: C4Diagram;
  frame: C4Frame;
  depth: number;
  frames: readonly C4Frame[];
}): React.JSX.Element {
  const updateFrame = useEditorStore((s) => s.updateFrame);
  const deleteFrame = useEditorStore((s) => s.deleteFrame);
  const [confirming, setConfirming] = useState(false);

  const labelField = useInspectorField({
    value: frame.label,
    fieldKey: `inspector:frame:${diagram.id}:${frame.id}:label`,
    commit: (next, coalesceKey) => {
      const trimmed = next.trim();
      if (trimmed === "") return; // a label is required — keep the previous one
      updateFrame(diagram.id, frame.id, { label: trimmed }, { coalesceKey });
    },
  });

  const memberCount = diagram.nodes.filter(
    (node) => node.frameId === frame.id,
  ).length;

  // A frame may not nest inside itself or its own descendants; the store throws
  // on those, so they are never offered.
  const illegal = subtreeOf(frames, frame.id);
  const parentChoices = frames.filter((each) => !illegal.has(each.id));

  return (
    <li
      className="space-y-1.5 rounded-md border border-border/70 bg-secondary/30 p-2"
      style={{ marginLeft: depth * 12 }}
    >
      <div className="flex items-center gap-1.5">
        <Input
          aria-label={`Boundary label (${frame.id})`}
          value={labelField.value}
          onFocus={labelField.onFocus}
          onChange={(event) => labelField.onChange(event.currentTarget.value)}
          onBlur={labelField.onBlur}
          onKeyDown={labelField.onKeyDown}
          className="h-7 text-xs"
        />
        <button
          type="button"
          aria-label={
            confirming
              ? `Confirm deleting boundary "${frame.label}"`
              : `Delete boundary "${frame.label}"`
          }
          title={
            confirming
              ? "Click again to delete — elements stay, they just leave the boundary"
              : "Delete this boundary"
          }
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            deleteFrame(diagram.id, frame.id);
          }}
          onBlur={() => setConfirming(false)}
          className={cn(
            "shrink-0 rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            confirming
              ? "bg-destructive/15 text-destructive"
              : "text-muted-foreground hover:bg-secondary hover:text-destructive",
          )}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {memberCount === 0
            ? "empty — not drawn"
            : `${memberCount} element${memberCount === 1 ? "" : "s"}`}
        </span>
        {parentChoices.length > 0 ? (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            inside
            <Select
              aria-label={`Enclosing boundary for "${frame.label}"`}
              value={frame.parentFrameId ?? ""}
              onChange={(event) =>
                updateFrame(diagram.id, frame.id, {
                  parentFrameId:
                    event.currentTarget.value === ""
                      ? undefined
                      : event.currentTarget.value,
                })
              }
              className="h-7 w-auto text-xs"
            >
              <option value="">— nothing</option>
              {parentChoices.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.label}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
    </li>
  );
}
