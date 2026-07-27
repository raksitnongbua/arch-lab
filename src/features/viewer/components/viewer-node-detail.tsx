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
 * Announcements come from the canvas's existing aria-live region, not from
 * this component (same contract as the relationship card).
 */

import {
  ArrowLeftRight,
  Minus,
  MoveLeft,
  MoveRight,
  X,
  ZoomIn,
} from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { C4Edge, C4Level, C4Node } from "@/types";

import { resolveIcon } from "@/features/editor/lib/icons/registry";

import { TYPE_LABEL } from "../lib/labels";

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

const LEVEL_TITLE: Record<C4Level, string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

function MetaRow({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
        {term}
      </dt>
      <dd className="min-w-0 text-right text-[11px] text-foreground">
        {children}
      </dd>
    </div>
  );
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

export function ViewerNodeDetail({
  detail,
  onDismiss,
  onZoomIn,
}: {
  detail: NodeDetail;
  onDismiss: () => void;
  /** Drill into the element's child diagram — same path as the zoom chip. */
  onZoomIn: () => void;
}): React.JSX.Element {
  const { node, level, outgoing, incoming, drill } = detail;
  const { def } = resolveIcon(node);
  const Icon = def.Svg;
  const hasConnections = outgoing.length > 0 || incoming.length > 0;

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
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Deselect element"
          className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-sm leading-snug font-medium text-pretty text-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className={cn(node.type === "codeElement" && "font-mono")}>
          {node.name}
        </span>
      </p>

      <dl className="mt-2 space-y-1 border-t border-border/60 pt-2">
        <MetaRow term="Type">{TYPE_LABEL[node.type]}</MetaRow>
        {node.technology !== undefined && node.technology !== "" ? (
          <MetaRow term="Technology">
            <span className="font-mono">{node.technology}</span>
          </MetaRow>
        ) : null}
        <MetaRow term="Level">{LEVEL_TITLE[level]} view</MetaRow>
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
            {LEVEL_TITLE[drill.childLevel]} view.
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
    </aside>
  );
}
