"use client";

/**
 * The relationship inspector: a floating card describing the selected
 * connector using only what the model genuinely holds (`C4Edge` has no
 * description field, so none is invented) — the label, technology, direction,
 * line style, tags, the parent-level relationship it realizes, and the two
 * endpoint elements with their own type / technology / description.
 *
 * With nothing selected it turns into a small teaching card so the space
 * still earns its place. Announcements for screen readers come from the
 * canvas's existing aria-live region, not from this component.
 */

import { ArrowDown, ArrowUpDown, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { C4Edge, C4Level, C4Node, EdgeDirection } from "@/types";

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

const LEVEL_TITLE: Record<C4Level, string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

function nodeMeta(node: C4Node): string {
  return node.technology !== undefined && node.technology !== ""
    ? `${C4_ABSTRACTION[node.type]} · ${node.technology}`
    : C4_ABSTRACTION[node.type];
}

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

export function ViewerEdgeDetail({
  detail,
  onDismiss,
}: {
  detail: EdgeDetail | null;
  onDismiss: () => void;
}): React.JSX.Element {
  if (detail === null) {
    // Empty state: teach the interaction instead of leaving a hole.
    return (
      <div className="hidden w-56 rounded-lg border border-border/60 bg-card/80 p-3 backdrop-blur sm:block">
        <p className="text-xs font-medium text-foreground">
          Inspect the diagram
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Click any element to see what it is and what it talks to, or any
          connector — the line or its label — to trace that relationship.
        </p>
      </div>
    );
  }

  const { edge, source, target, realizes } = detail;
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
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Deselect relationship"
          className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>

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
        <MetaRow term="Direction">{DIRECTION_LABEL[edge.direction]}</MetaRow>
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
          from the {LEVEL_TITLE[realizes.level]} view one level up.
        </p>
      ) : null}

      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
        <EndpointCard role={sourceRole} node={source} />
        <div className="flex justify-center" aria-hidden="true">
          <DirectionIcon className="size-3.5 text-primary" />
        </div>
        <EndpointCard role={targetRole} node={target} />
      </div>
    </aside>
  );
}
