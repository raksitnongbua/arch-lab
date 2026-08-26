"use client";

/**
 * The relationship inspector: a floating card describing the selected
 * connector using only what the model genuinely holds (`C4Edge` has no
 * description field, so none is invented) — the label, technology, direction,
 * line style, tags, the parent-level relationship it realizes, and the two
 * endpoint elements with their own type / technology / description.
 *
 * ON AN EDITABLE CANVAS IT ALSO EDITS — the element card's twin, in the
 * element card's grammar (habit 2 of `codebase.md`: the Nth of something
 * matches the (N−1)th): `onRevise` present, the header grows the same pencil,
 * and the descriptive rows swap for a form over the fields the card already
 * showed — label, technology, direction and line style. `onDelete` present,
 * the header grows a bin beside the pencil, because unlike an element a
 * relationship has no drag affordance to teach that it is editable at all;
 * the Delete/Backspace key while the connector is selected does the same
 * through the canvas's edit-keys listener. What the form deliberately does
 * NOT offer — repointing the endpoints, tags, `~realizes`, `via` waypoints —
 * is argued at `C4EdgeRevision`.
 *
 * With nothing selected it turns into a small teaching card so the space
 * still earns its place. Announcements for screen readers come from the
 * canvas's existing aria-live region, not from this component.
 */

import { useEffect, useRef, useState } from "react";

import {
  ArrowDown,
  ArrowUpDown,
  Check,
  Minus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import { orAbsent } from "@/lib/absent";
import { LEVEL_LABEL } from "@/lib/constants";

import { MetaRow } from "./viewer-meta-row";
import { EditField, FIELD_CLASSES } from "./viewer-node-detail";
import { cn } from "@/lib/utils";
import type {
  C4Edge,
  C4EdgeRevision,
  C4Level,
  C4Node,
  EdgeDirection,
} from "@/types";

import { C4_ABSTRACTION } from "../lib/labels";

export interface EdgeDetail {
  edge: C4Edge;
  source: C4Node;
  target: C4Node;
  /** The parent-level relationship this one implements, when traceable. */
  realizes: { label: string; level: C4Level } | null;
}

const DIRECTION_LABEL: Record<EdgeDirection, string> = {
  forward: "One-way, source → target",
  bidirectional: "Bidirectional",
  none: "Undirected association",
};

/* The form's direction rows, derived from the label table above so the select
   and the read view cannot describe the same arrow in two vocabularies. The
   order is the grammar's own (`EdgeDirection`), most common first. */
const DIRECTION_OPTIONS: readonly EdgeDirection[] = [
  "forward",
  "bidirectional",
  "none",
];

function nodeMeta(node: C4Node): string {
  return node.technology !== undefined && node.technology !== ""
    ? `${C4_ABSTRACTION[node.type]} · ${node.technology}`
    : C4_ABSTRACTION[node.type];
}

function EndpointCard({
  role,
  node,
}: {
  role: string;
  node: C4Node;
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-border/60 bg-canvas/60 px-2 py-1.5">
      <p className="text-[9px] tracking-wide text-muted-foreground uppercase">
        {role}
      </p>
      <p className="text-xs font-medium text-foreground">{node.name}</p>
      <p className="truncate font-mono text-[9px] text-muted-foreground/80">
        [{nodeMeta(node)}]
      </p>
      {node.description !== undefined && node.description !== "" ? (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          {node.description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The relationship editor. `key`ed on the edge id by its caller, so selecting
 * a different connector REMOUNTS it — fields start from the new edge's values
 * rather than from an effect that syncs them (the element form's rule, for
 * the element form's reason).
 *
 * THE STYLE CONTROL IS TWO-STATE ON SCREEN AND THREE-STATE ON SUBMIT. The
 * reader chooses solid or dashed — the only distinction the drawing has —
 * but the grammar spells solid two ways (the arrow's default, and an
 * explicit `style=solid`), and collapsing them here is how a no-op Apply
 * would eat a hand-written default (`C4EdgeRevision` cites the shipped bug).
 * So a submit with the control untouched carries the edge's OWN spelling,
 * and only a genuine flip to solid submits the canonical absence.
 */
function EdgeEditForm({
  edge,
  onSubmit,
  onCancel,
}: {
  edge: C4Edge;
  onSubmit: (revision: C4EdgeRevision) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [label, setLabel] = useState(edge.label ?? "");
  const [technology, setTechnology] = useState(edge.technology ?? "");
  const [direction, setDirection] = useState<EdgeDirection>(edge.direction);
  const [dashed, setDashed] = useState(edge.style === "dashed");

  /* The label takes focus on mount rather than through `autoFocus`, which
     jsx-a11y flags and which cannot be scoped to "this remount" — the same
     note as the element form. */
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    labelRef.current?.select();
  }, []);

  return (
    <form
      className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          label: orAbsent(label),
          technology: orAbsent(technology),
          direction,
          // The three-state rule from the form header: dashed is dashed, and
          // solid keeps whichever spelling the author's line already has.
          style: dashed
            ? "dashed"
            : edge.style === "solid"
              ? "solid"
              : undefined,
        });
      }}
    >
      <EditField term="Label">
        <input
          ref={labelRef}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Reads orders — blank to remove"
          className={FIELD_CLASSES}
        />
      </EditField>
      <EditField term="Technology">
        <input
          value={technology}
          onChange={(event) => setTechnology(event.target.value)}
          placeholder="gRPC, HTTPS/JSON — blank to remove"
          className={cn(FIELD_CLASSES, "font-mono")}
        />
      </EditField>
      <EditField term="Direction">
        <select
          value={direction}
          onChange={(event) =>
            setDirection(event.target.value as EdgeDirection)
          }
          className={FIELD_CLASSES}
        >
          {DIRECTION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {DIRECTION_LABEL[option]}
            </option>
          ))}
        </select>
      </EditField>
      <EditField term="Line style">
        <select
          value={dashed ? "dashed" : "solid"}
          onChange={(event) => setDashed(event.target.value === "dashed")}
          className={FIELD_CLASSES}
        >
          <option value="solid">Solid — synchronous / primary</option>
          <option value="dashed">Dashed — async / background</option>
        </select>
      </EditField>
      {/* Apply / Cancel, in that order — the element form's row verbatim. */}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Check aria-hidden="true" className="size-3.5" />
          Apply
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ViewerEdgeDetail({
  detail,
  onDismiss,
  onRevise,
  onDelete,
}: {
  detail: EdgeDetail | null;
  onDismiss: () => void;
  /**
   * Rewrite the relationship's own fields. Present only while the canvas is
   * editable — presence is the signal, so a locked or read-only canvas
   * renders no pencil rather than a disabled one (the element card's
   * contract, verbatim).
   */
  onRevise?: (revision: C4EdgeRevision) => void;
  /**
   * Remove the relationship. Present exactly when `onRevise` is; the host
   * announces what was deleted and how to undo it. A header control rather
   * than a form action because a delete is not an Apply — it must not sit
   * behind a pencil the reader opened to reword something.
   */
  onDelete?: () => void;
}): React.JSX.Element | null {
  /* Keyed by the TARGET rather than a bare boolean — the element card's rule:
     selecting another connector must close the form, not re-aim it at a
     relationship the reader was not editing. */
  const [editingId, setEditingId] = useState<string | null>(null);

  /* NOTHING SELECTED, NOTHING RENDERED. This used to hold a standing hint
     explaining that elements and connectors are clickable — a card that never
     changed, occupying the corner of every diagram nobody had clicked yet.
     A presentation surface should show the diagram, not instructions for it,
     and the corner it was holding is the one place a reader looks first.
     Returning null rather than an empty box also means the panel's column
     contributes no gap, so the lock above it sits where it does with a card
     open. */
  if (detail === null) return null;

  const { edge, source, target, realizes } = detail;
  const editing = editingId === edge.id;
  const DirectionIcon =
    edge.direction === "forward"
      ? ArrowDown
      : edge.direction === "bidirectional"
        ? ArrowUpDown
        : Minus;
  const [sourceRole, targetRole] =
    edge.direction === "forward" ? ["From", "To"] : ["Between", "And"];

  return (
    <aside
      aria-label="Relationship details"
      className={cn(
        // Same narrow-screen height cap as the element card: at most 40vh
        // below `sm` so the canvas stays usable beneath the overlay.
        "flex max-h-[min(40vh,32rem)] w-72 max-w-full flex-col overflow-y-auto sm:max-h-[min(70vh,32rem)]",
        "rounded-lg border border-primary/40 bg-card/95 p-3 shadow-lg backdrop-blur",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-primary uppercase">
          Relationship
        </p>
        <span className="flex items-center gap-0.5">
          {onRevise !== undefined && !editing ? (
            <button
              type="button"
              onClick={() => setEditingId(edge.id)}
              aria-label="Edit this relationship"
              className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Pencil aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          {onDelete !== undefined && !editing ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete this relationship"
              className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Deselect relationship"
            className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      </div>

      {/* The form REPLACES the descriptive rows rather than sitting above
          them — the element card's shape: two renderings of the same fields
          at once would leave the reader unsure which one the diagram obeys. */}
      {onRevise !== undefined && editing ? (
        <EdgeEditForm
          key={edge.id}
          edge={edge}
          onSubmit={(revision) => {
            setEditingId(null);
            onRevise(revision);
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <>
          {edge.label !== undefined && edge.label !== "" ? (
            <p className="mt-1 text-sm leading-snug font-medium text-pretty text-foreground">
              {edge.label}
            </p>
          ) : null}

          <dl className="mt-2 space-y-1 border-t border-border/60 pt-2">
            {edge.technology !== undefined && edge.technology !== "" ? (
              <MetaRow term="Technology">
                <span className="font-mono">{edge.technology}</span>
              </MetaRow>
            ) : null}
            <MetaRow term="Direction">
              {DIRECTION_LABEL[edge.direction]}
            </MetaRow>
            {edge.style === "dashed" ? (
              <MetaRow term="Line style">Dashed — async / background</MetaRow>
            ) : null}
            {edge.tags !== undefined && edge.tags.length > 0 ? (
              <MetaRow term="Tags">
                <span className="flex flex-wrap justify-end gap-1">
                  {edge.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-1.5 py-px font-mono text-[9px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </MetaRow>
            ) : null}
          </dl>

          {realizes !== null ? (
            <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              Realizes{" "}
              <span className="font-medium text-foreground">
                “{realizes.label}”
              </span>{" "}
              from the {LEVEL_LABEL[realizes.level]} view one level up.
            </p>
          ) : null}

          <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
            <EndpointCard role={sourceRole} node={source} />
            <div className="flex justify-center" aria-hidden="true">
              <DirectionIcon className="size-3.5 text-primary" />
            </div>
            <EndpointCard role={targetRole} node={target} />
          </div>
        </>
      )}
    </aside>
  );
}
