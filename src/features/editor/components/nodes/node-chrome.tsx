"use client";

/**
 * The shared node frame: shape layer, icon + name / technology /
 * description hierarchy, inline label editor, child-count badge, `^ref`
 * source-layer chip, unknown-icon warning marker, and the four connection
 * handles the canvas relies on.
 *
 * Corner budget — each marker owns one corner, so they never overlap:
 * top-left unknown-icon dot, top-right child badge, bottom-left ref chip.
 *
 * Colours are exclusively semantic tokens: the per-node `--node-fill` /
 * `--node-stroke` pair (set by `lib/node-colors.ts` on the flow-node
 * wrapper), `--node-foreground`, plus the shadcn set. Zero colour literals.
 */

import { Handle, Position } from "@xyflow/react";

import { cn } from "@/lib/utils";

import { C4_ABSTRACTION, SHAPE_LABEL } from "@/features/viewer/lib/labels";

import { goToOriginal } from "../../lib/goto-original";
import { useIconStyle } from "@/lib/icon-style";

import { resolveIcon } from "../../lib/icons/registry";
import { colorRoleForNode, EXTERNAL_DIM_CLASS } from "../../lib/node-colors";
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

/**
 * Re-exported for the editor's own consumers. The tables themselves live in
 * `viewer/lib/labels.ts` — one vocabulary for both renderers, the same
 * centralisation rule `node-colors.ts` follows.
 */
export { C4_ABSTRACTION, SHAPE_LABEL };

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
  const [iconStyle] = useIconStyle();
  const Icon = def.byStyle[iconStyle];

  // C4 metadata convention: [Container: Go] — the ABSTRACTION always (never
  // the silhouette's name: a cylinder is still a Container), technology when
  // set.
  const meta =
    node.technology !== undefined && node.technology !== ""
      ? `${C4_ABSTRACTION[node.type]}: ${node.technology}`
      : C4_ABSTRACTION[node.type];

  // Name (and description) in full on hover.
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
        // Hover raises elevation; SVG-silhouette types (cylinder,
        // pipe) skip the box shadow — it would draw a rectangle around them.
        !svgSilhouette && "shadow-sm hover:shadow-md",
        // Content clears the cylinder rim / pipe rims.
        node.type === "database" && "pt-4",
        node.type === "queue" && "px-8",
        svgSilhouette && "rounded-lg",
        // Drag ghost at 60% opacity; otherwise the static
        // placeholder / external-element treatments. External is decided by
        // COLOUR ROLE (type or the Mermaid-residue `external` tag) through
        // the shared constant — this used to be an `externalSystem` literal
        // duplicated here and in viewer-node.tsx.
        dragging
          ? "opacity-60 shadow-lg"
          : data.isPlaceholder
            ? "opacity-60"
            : colorRoleForNode(node) === "external" && EXTERNAL_DIM_CLASS,
        entering && "af-node-enter",
      )}
    >
      <NodeShapeLayer type={node.type} />

      {/* Role-tinted hover glow — same `.af-node-glow` (globals.css) as the
          viewer's node, so the two canvases keep one hover language. Rides
          UNDER the existing shadow-sm→shadow-md elevation step rather than
          replacing it: the neutral shadow says "this lifts", the tinted
          glow says which role is lifting. Opacity-only; skipped for SVG
          silhouettes exactly like the box shadows above. */}
      {!svgSilhouette ? (
        <span
          aria-hidden="true"
          className="af-node-glow pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
        />
      ) : null}

      {/* Selection outline: always mounted so it can fade in AND out over
          `--motion-selection`. Sits 4px outside the node bounds,
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
          {/* The icon takes the node's accent (--node-stroke): the border
              colour on 16px of artwork is what makes each role read as a
              designed card rather than a tinted rectangle — and it follows
              tagColors / external greying for free. Contrast is the same
              measured border-vs-fill pair (≥3:1, WCAG 1.4.11). */}
          <Icon className="size-4 shrink-0 text-(--node-stroke)" />
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
        {/* text-node-meta, not text-muted-foreground: the meta/description
            lines sit ON the coloured fills, and the muted token is only
            measured against panel surfaces. Description drops its old /80
            alpha for the same reason — blending 20% of the fill back into
            the ink took the pair under 4.5:1 on the vivid fills. */}
        <span className="w-full truncate text-[10px] leading-tight text-node-meta">
          [{meta}]
        </span>
        {node.description !== undefined && node.description !== "" ? (
          <span className="line-clamp-1 w-full text-[10px] leading-tight break-words text-node-meta">
            {node.description}
          </span>
        ) : null}
      </div>

      {isFallback ? (
        <span
          aria-label={`Unknown icon "${node.icon ?? ""}" — showing the generic ${SHAPE_LABEL[node.type].toLowerCase()} icon`}
          title={`Unknown icon "${node.icon ?? ""}" — showing the generic ${SHAPE_LABEL[node.type].toLowerCase()} icon`}
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

      {/*
       * THE WHOLE NODE IS A DROP TARGET.
       *
       * React Flow only records a target when the release lands on a handle:
       * `toNode` is `result.toHandle ? … : null` (@xyflow/system, buildConnection),
       * and `elementFromPoint` is only consulted for elements carrying
       * `.react-flow__handle`. With four 8px dots plus the default 20-unit snap
       * radius, that covered roughly a sixth of a 176x88 node — and everywhere
       * else, including dead centre where people aim, the drop fell through to
       * "released over empty canvas" and opened the quick-add menu ON TOP of
       * the node being aimed at. Not confusing feedback: the wrong outcome,
       * silently.
       *
       * A full-bleed target handle makes every pixel of the node a target,
       * exactly, with no bleed into the gaps between nodes. Raising
       * `connectionRadius` to node scale was the other option and is worse: at
       * a radius big enough to cover this node's interior it also reaches into
       * the NEXT node's, and `getClosestHandle` would silently retarget in a
       * dense diagram.
       *
       * `isConnectableStart={false}` is what keeps this inert at rest, with no
       * new state to track: React Flow's own stylesheet sets
       * `pointer-events: none` on every handle and grants `pointer-events: all`
       * only to `.connectionindicator`, which a start-disabled handle earns
       * only while a connection is in flight. So it cannot swallow a node drag,
       * a click, or the double-click that drills in.
       *
       * Rendered FIRST so the four dots paint above it, and carrying no id that
       * ever reaches the model — `handleConnect` drops sourceHandle/targetHandle
       * outright and floating anchors remain the only routing authority.
       */}
      <Handle
        id="body"
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        // No `!bg-transparent` here: Tailwind emits utilities inside
        // `@layer utilities`, and for `!important` declarations layer order is
        // REVERSED — a layered `!important` beats an unlayered one whatever
        // the specificity. It silently won over the drop-target tint in
        // canvas-motion.css, which owns this element's background instead.
        className="af-node-drop !absolute !inset-0 !size-auto !transform-none !rounded-[inherit] !border-0"
      />

      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          // Reveal timing (and connect-state feedback) lives in
          // styles/canvas-motion.css on `--motion-hover`.
          //
          // The dot stays 8px, but `after:-inset-3` gives it a transparent
          // 32px hit area — the visual weight of a small dot with the
          // targetability of a button. Handles are the ONLY way to start a
          // relationship, so an 8px target was the single biggest source of
          // missed connection drags.
          //
          // Revealed on selection as well as hover: after clicking a node,
          // its handles stay put instead of vanishing the moment the pointer
          // drifts off, which is exactly when you reach for one.
          className={cn(
            // Size and colour live in canvas-motion.css, NOT here. Tailwind
            // emits utilities inside `@layer utilities`, and for `!important`
            // declarations layer order is reversed — a layered `!important`
            // beats an unlayered one whatever the specificity. So `!size-2`
            // and `!bg-*` here would silently outrank the armed and
            // drop-target states the stylesheet needs to paint. What stays is
            // the transparent 32px hit area and the reveal transition.
            "af-node-dot after:absolute after:-inset-3 after:content-['']",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      ))}
    </div>
  );
}
