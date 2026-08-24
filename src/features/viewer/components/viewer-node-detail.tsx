"use client";

/**
 * The element inspector: the node-side twin of viewer-edge-detail. It renders
 * in the same top-right panel slot and describes the selected element using
 * only what the model genuinely holds on `C4Node` — name, type, technology,
 * description, tags, and the level of the diagram it sits in (a node's level
 * is never stored on it) — then the element's relationships in the current
 * view, incoming and outgoing, each with its label and the other endpoint.
 *
 * The drill affordance lives here too: an element with a child diagram gets
 * a prominent "Zoom into this element" button with the child element count.
 * Boundary placeholders (`externalRef`) and file-split children (`childRef`)
 * are named honestly instead of showing a dead button. Nothing is invented.
 *
 * ON AN EDITABLE CANVAS IT ALSO EDITS. `onRevise` present, the header grows
 * the same pencil the sequence dock has, and the descriptive rows swap for a
 * form over the three fields the panel already showed — name, technology,
 * description. This panel is that editor rather than a new dock because it is
 * already the one surface showing every field a node has, so "edit this" can
 * mean "edit all of it" without a second inspector appearing anywhere. The
 * form's interaction grammar is the sequence dock's, deliberately (habit 2 of
 * `codebase.md`): plain <form> so Enter submits, Apply/Cancel in that order,
 * blank optional fields submit as absent, remount per element so fields start
 * from the new element's values. The form pieces are re-spelled here rather
 * than imported because the layering runs editor → viewer → sequence — this
 * feature cannot import the sequence viewer's.
 *
 * Announcements come from the host's existing aria-live region, not from
 * this component (same contract as the relationship card): the playground
 * says what the applied edit did.
 */

import { useEffect, useRef, useState } from "react";

import {
  ArrowLeftRight,
  Check,
  Minus,
  MoveLeft,
  MoveRight,
  Pencil,
  X,
  ZoomIn,
} from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { LEVEL_LABEL } from "@/lib/constants";

import { MetaRow } from "./viewer-meta-row";
import { cn } from "@/lib/utils";
import type { C4Edge, C4Level, C4Node, C4NodeRevision } from "@/types";

import { resolveIcon } from "@/features/editor/lib/icons/registry";
import { useIconStyle } from "@/lib/icon-style";

import {
  C4_ABSTRACTION,
  SHAPE_LABEL,
  shapeAddsInformation,
} from "../lib/labels";

/** One relationship touching the selected element, in the current diagram. */
export interface NodeConnection {
  edge: C4Edge;
  /** Name of the endpoint that is NOT the selected element. */
  otherName: string;
}

export interface NodeDetail {
  node: C4Node;
  /** Level of the containing diagram — the element's own C4 level. */
  level: C4Level;
  /** Edges where the element is the source. */
  outgoing: NodeConnection[];
  /** Edges where the element is the target. */
  incoming: NodeConnection[];
  /** Present ⇔ the element has a loaded child diagram to zoom into. */
  drill: { childCount: number; childLevel: C4Level } | null;
}

/** Directional glyph for a connection row, seen from the selected element. */
function connectionIcon(
  edge: C4Edge,
  side: "outgoing" | "incoming",
): React.JSX.Element {
  if (edge.direction === "bidirectional") {
    return <ArrowLeftRight aria-hidden="true" className="size-3 shrink-0" />;
  }
  if (edge.direction === "none") {
    return <Minus aria-hidden="true" className="size-3 shrink-0" />;
  }
  return side === "outgoing" ? (
    <MoveRight aria-hidden="true" className="size-3 shrink-0" />
  ) : (
    <MoveLeft aria-hidden="true" className="size-3 shrink-0" />
  );
}

function ConnectionRow({
  connection,
  side,
}: {
  connection: NodeConnection;
  side: "outgoing" | "incoming";
}): React.JSX.Element {
  const { edge, otherName } = connection;
  return (
    <li className="flex items-start gap-1.5 rounded-md border border-border/60 bg-canvas/60 px-2 py-1.5">
      <span className="mt-0.5 text-primary">{connectionIcon(edge, side)}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-foreground">
          {otherName}
        </span>
        {edge.label !== undefined && edge.label !== "" ? (
          <span className="block text-[10px] leading-snug text-muted-foreground">
            {edge.label}
          </span>
        ) : null}
        {edge.technology !== undefined && edge.technology !== "" ? (
          <span className="block truncate font-mono text-[9px] text-muted-foreground/70">
            [{edge.technology}]
          </span>
        ) : null}
      </span>
    </li>
  );
}

function ConnectionGroup({
  heading,
  connections,
  side,
}: {
  heading: string;
  connections: NodeConnection[];
  side: "outgoing" | "incoming";
}): React.JSX.Element | null {
  if (connections.length === 0) return null;
  return (
    <div>
      <p className="text-[9px] tracking-wide text-muted-foreground uppercase">
        {heading}
      </p>
      <ul className="mt-1 space-y-1">
        {connections.map((connection) => (
          <ConnectionRow
            key={connection.edge.id}
            connection={connection}
            side={side}
          />
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The edit form — the sequence dock's grammar, on this panel's three fields   */
/* -------------------------------------------------------------------------- */

/** Blank string -> `undefined`, so clearing a field removes it — the same
 * "empty means absent" contract the sequence dock forms state: `.alab` can
 * spell `[""]` and `desc ""`, and a document carrying one renders a blank
 * field the reader cannot tell from a missing one. */
function orAbsent(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}

const FIELD_CLASSES =
  "mt-0.5 w-full rounded-md border border-border bg-canvas/60 px-2 py-1 " +
  "text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:outline-none";

/** One labelled control. The <label> WRAPS its control rather than using
 * `htmlFor`, for the reason the sequence dock's `DockField` gives: an id
 * would have to be unique per selected element, a name to keep in step for
 * nothing. */
function EditField({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-muted-foreground">
        {term}
      </span>
      {children}
    </label>
  );
}

/**
 * The node editor. `key`ed on the node id by its caller, so selecting a
 * different element REMOUNTS it — the fields start from the new element's
 * values rather than from an effect that syncs them (the sequence forms'
 * rule, for the sequence forms' reason).
 *
 * THE NAME MAY NOT BE BLANKED: the model requires one, and `revisedNodeEdit`
 * refuses an empty name rather than dropping the edit silently — so the form
 * submits the name as typed and leaves the refusal to the one authority. The
 * two optional fields go through `orAbsent`, exactly as the dock's do.
 */
function NodeEditForm({
  node,
  onSubmit,
  onCancel,
}: {
  node: C4Node;
  onSubmit: (revision: C4NodeRevision) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(node.name);
  const [technology, setTechnology] = useState(node.technology ?? "");
  const [description, setDescription] = useState(node.description ?? "");

  /* The name takes focus on mount rather than through `autoFocus`, which
     jsx-a11y flags and which cannot be scoped to "this remount" — the same
     note as the sequence forms. */
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.select();
  }, []);

  return (
    <form
      className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name,
          technology: orAbsent(technology),
          description: orAbsent(description),
        });
      }}
    >
      <EditField term="Name">
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={FIELD_CLASSES}
        />
      </EditField>
      <EditField term="Technology">
        <input
          value={technology}
          onChange={(event) => setTechnology(event.target.value)}
          placeholder="Next.js, PostgreSQL 16 — blank to remove"
          className={cn(FIELD_CLASSES, "font-mono")}
        />
      </EditField>
      {/* A TEXTAREA because the field may hold newlines the render honours —
          the same reason the dock's Details field is one. */}
      <EditField term="Description">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Blank to remove"
          className={FIELD_CLASSES}
        />
      </EditField>
      {/* Apply / Cancel, in that order — the primary action nearest the
          fields, matching the sequence dock's `DockFormActions`. */}
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

export function ViewerNodeDetail({
  detail,
  onDismiss,
  onZoomIn,
  onRevise,
}: {
  detail: NodeDetail;
  onDismiss: () => void;
  /** Drill into the element's child diagram — same path as the zoom chip. */
  onZoomIn: () => void;
  /**
   * Rewrite the element's wording. Present only while the canvas is editable
   * — presence is the signal, so a locked or read-only canvas renders no
   * pencil rather than a disabled one (the same contract the sequence dock's
   * `edit` prop states).
   */
  onRevise?: (revision: C4NodeRevision) => void;
}): React.JSX.Element {
  const { node } = detail;

  /* Keyed by the TARGET rather than a bare boolean, the sequence dock's rule
     for the sequence dock's reason: selecting another element must close the
     form, not re-aim it — an open form holds the reader's half-typed text,
     and silently re-pointing it would commit that text to an element they
     were not looking at. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === node.id;

  /* A boundary placeholder is read-only BY MEANING, not by mode: its name is
     the referenced node's, derived at parse time (`revisedNodeEdit` refuses it
     too — one verdict on both sides). So the pencil is withheld, and the card
     below already says why. */
  const revisable = onRevise !== undefined && node.externalRef === undefined;

  return (
    <aside
      aria-label="Element details"
      className={cn(
        // Narrow screens: the card keeps its width but caps at 40vh so more
        // than half the canvas stays visible under it; it scrolls internally
        // and dismisses via the X, Escape, or a pane tap.
        "flex max-h-[min(40vh,32rem)] w-72 max-w-full flex-col overflow-y-auto sm:max-h-[min(70vh,32rem)]",
        "rounded-lg border border-primary/40 bg-card/95 p-3 shadow-lg backdrop-blur",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-primary uppercase">
          Element
        </p>
        <span className="flex items-center gap-0.5">
          {revisable && !editing ? (
            <button
              type="button"
              onClick={() => setEditingId(node.id)}
              aria-label="Edit this element"
              className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Pencil aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Deselect element"
            className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      </div>

      {/* The form REPLACES the descriptive rows rather than sitting above
          them — the sequence dock's shape: two renderings of the same fields
          at once would leave the reader unsure which one the diagram obeys. */}
      {revisable && editing ? (
        <NodeEditForm
          key={node.id}
          node={node}
          onSubmit={(revision) => {
            setEditingId(null);
            onRevise(revision);
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <NodeReadView detail={detail} onZoomIn={onZoomIn} />
      )}
    </aside>
  );
}

/** The descriptive rows — everything the card shows when it is not a form. */
function NodeReadView({
  detail,
  onZoomIn,
}: {
  detail: NodeDetail;
  onZoomIn: () => void;
}): React.JSX.Element {
  const { node, level, outgoing, incoming, drill } = detail;
  const { def } = resolveIcon(node);
  const [iconStyle] = useIconStyle();
  const Icon = def.byStyle[iconStyle];
  const hasConnections = outgoing.length > 0 || incoming.length > 0;

  return (
    <>
      <p className="mt-1 flex items-center gap-1.5 text-sm leading-snug font-medium text-pretty text-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className={cn(node.type === "codeElement" && "font-mono")}>
          {node.name}
        </span>
      </p>

      <dl className="mt-2 space-y-1 border-t border-border/60 pt-2">
        {/*
         * The C4 classification, plus the silhouette in parentheses whenever
         * the two differ ("Container (database)"). This panel is the one
         * place with room to say both, so it is where a reader who wonders
         * why a cylinder is labelled Container finds the answer.
         */}
        <MetaRow term="Type">
          {shapeAddsInformation(node.type)
            ? `${C4_ABSTRACTION[node.type]} (${SHAPE_LABEL[node.type].toLowerCase()})`
            : C4_ABSTRACTION[node.type]}
        </MetaRow>
        {node.technology !== undefined && node.technology !== "" ? (
          <MetaRow term="Technology">
            <span className="font-mono">{node.technology}</span>
          </MetaRow>
        ) : null}
        <MetaRow term="Level">{LEVEL_LABEL[level]} view</MetaRow>
        {node.tags !== undefined && node.tags.length > 0 ? (
          <MetaRow term="Tags">
            <span className="flex flex-wrap justify-end gap-1">
              {node.tags.map((tag) => (
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

      {node.description !== undefined && node.description !== "" ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {node.description}
        </p>
      ) : null}

      {node.externalRef !== undefined ? (
        <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          Boundary placeholder — this element is defined one level up and is
          mirrored here read-only for context.
        </p>
      ) : null}

      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Relationships in this view
        </p>
        {hasConnections ? (
          <>
            <ConnectionGroup
              heading="Outgoing"
              connections={outgoing}
              side="outgoing"
            />
            <ConnectionGroup
              heading="Incoming"
              connections={incoming}
              side="incoming"
            />
          </>
        ) : (
          <p className="text-[10px] leading-snug text-muted-foreground">
            No relationships touch this element in the current view.
          </p>
        )}
      </div>

      {drill !== null ? (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Contains {drill.childCount}{" "}
            {drill.childCount === 1 ? "element" : "elements"} in its{" "}
            {LEVEL_LABEL[drill.childLevel]} view.
          </p>
          <button
            type="button"
            onClick={onZoomIn}
            className={buttonClasses({
              size: "sm",
              className: "mt-1.5 w-full",
            })}
          >
            <ZoomIn aria-hidden="true" />
            Zoom into this element
          </button>
        </div>
      ) : node.childRef !== undefined ? (
        <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          This element&apos;s child diagram lives in a separate file (
          <span className="font-mono">{node.childRef}</span>) and is not loaded
          in this view.
        </p>
      ) : null}
    </>
  );
}
