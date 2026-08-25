/**
 * The viewer canvas's node projection: one frozen model diagram → the array of
 * React Flow node objects the canvas renders.
 *
 * WHY THIS IS A MODULE AND NOT A `useMemo` BODY. Every model change makes a
 * new `ViewerModel` (the editable canvas re-parses the text on every edit, so
 * even a node that did not move arrives as a new object), and React Flow
 * decides how much work a render costs by OBJECT IDENTITY: `adoptUserNodes`
 * keeps its internal node — measured size, handle bounds, absolute position —
 * only when the incoming object is `===` the one it adopted last time.
 * Otherwise it rebuilds the internal node and RESETS `handleBounds`, and until
 * the next DOM measurement lands, `getEdgePosition` returns null for every
 * edge touching that node: React Flow's error 008, an EdgeWrapper that renders
 * nothing, and a visible blink of the whole connector layer. Measured against
 * @xyflow/system 0.0.79 rather than argued — hand `adoptUserNodes` the same
 * objects and the internal node is reused verbatim; hand it equal-but-new ones
 * and the very next `getEdgePosition` comes back null.
 *
 * That cost used to be paid on every drag release — one press, one re-parse,
 * one full re-adopt — which is what a reader saw as a hitch at the end of an
 * otherwise clean gesture. So the projection is a CACHE, not a pure map: a
 * node whose every projected field is unchanged is handed back as the exact
 * object it was last time, and only the node that genuinely changed becomes a
 * new object. Nothing here special-cases a drag; a text edit that renames one
 * element leaves the other twenty untouched for the same reason.
 *
 * The two properties that make the cache safe to trust:
 *
 *   1. THE SIGNATURE IS DERIVED, NOT LISTED. It is `JSON.stringify` of the
 *      whole projected node, so a field added to the projection later is
 *      compared without anyone remembering to add it here. It may be
 *      pessimistic (a key-order change would read as "different" and cost one
 *      re-adopt, which is what today already costs); it cannot be optimistic,
 *      which is the direction that would render stale content.
 *   2. A PROJECTED NODE IS PURE DATA. Nothing in it is a function, which is
 *      what makes (1) total. The two navigations a node can start close over
 *      the model — so they would be new functions on every edit, and a cached
 *      node would hold the pair it was built with — so they reach the node
 *      through context instead (`ViewerNodeActionsProvider`, viewer-node.tsx).
 *      `check:canvas-edit` pins the serialisability, because the day a
 *      callback goes back into `data` the cache starts handing out a stale
 *      closure and nothing else would say so.
 */

import type { CSSProperties } from "react";

import type { C4Diagram, C4Node } from "@/types";
import { childLevelOf, hasChildDiagram, isBoundaryPlaceholder } from "@/types";

import { nodeColorStyle } from "@/features/editor/lib/node-colors";

import type { ViewerFlowNode } from "../components/viewer-node";
import type { ViewerModel } from "./model";
import { VIEWER_DURATIONS } from "./motion";

interface CacheEntry {
  signature: string;
  /** ms; kept so an on-screen node's entrance is not re-choreographed. */
  enterDelay: number;
  node: ViewerFlowNode;
}

/**
 * The identity the projection preserves between renders. Owned by the canvas
 * (one per mounted canvas) and mutated in place — it is a memo cache, so it
 * must survive the render that reads it.
 */
export interface NodeProjectionCache {
  diagramId: string | null;
  entries: Map<string, CacheEntry>;
}

export function createNodeProjectionCache(): NodeProjectionCache {
  return { diagramId: null, entries: new Map() };
}

/**
 * Entrance delay per node id, in ms.
 *
 * Entrance order = reading order (top-left → bottom-right), not array order:
 * the stagger should look like the diagram being drawn, and a hand-edited
 * `.alab` file's node order is whatever the author typed. Delay is capped so a
 * large diagram finishes settling with the level transition instead of
 * trickling in after it. Computed HERE (not in the node component) because it
 * needs the whole diagram; it rides the same inline style as the colour
 * variables, so nothing new re-renders.
 */
function entranceDelays(diagram: C4Diagram): Map<string, number> {
  const delays = new Map<string, number>();
  [...diagram.nodes]
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .forEach((node, rank) => {
      delays.set(
        node.id,
        Math.min(
          rank * VIEWER_DURATIONS.nodeEnterStagger,
          VIEWER_DURATIONS.nodeEnterMaxDelay,
        ),
      );
    });
  return delays;
}

interface ProjectionInput {
  model: ViewerModel;
  diagram: C4Diagram;
  /** Whether nodes may be dragged — the canvas's edit switch. */
  editable: boolean;
  cache: NodeProjectionCache;
}

function project(
  node: C4Node,
  { model, diagram, editable }: ProjectionInput,
  enterDelay: number,
): ViewerFlowNode {
  const childLevel = childLevelOf(diagram.level);
  const drillable =
    hasChildDiagram(node) && typeof node.childDiagramId === "string";
  /* TWO RULES, ONE PER CANVAS STATE, and the split is deliberate:
     - READ-ONLY, the chip is gated on the child COUNT. A pointer at an empty
       diagram is nothing a READER can zoom into, and a chip reading "0" is an
       affordance that lies — the rule this projection has always applied.
     - EDITABLE, a child that EXISTS is offered even while empty, because the
       nest gesture mints exactly that: an empty child is the workspace the
       author just created, and gating on count left them with a diagram they
       could not enter from the canvas they made it on (the details panel's
       `emptyChild` was the only way in). The chip's wording downstream
       (viewer-node.tsx) says "empty" rather than promising contents.
     A DANGLING pointer offers nothing in either state — `drillInto` would
     no-op on a diagram the model does not hold, and a chip that does nothing
     is worse than none. Resolved via the map (the `refSourceLevel` pattern
     below), never `getDiagram`, which throws on exactly that case. */
  const child =
    drillable && node.childDiagramId
      ? (model.diagrams[node.childDiagramId] ?? null)
      : null;
  const childCount = child === null ? 0 : child.nodes.length;
  return {
    id: node.id,
    type: "c4" as const,
    position: { x: node.position.x, y: node.position.y },
    width: node.size.width,
    height: node.size.height,
    /* SEEDED, not left for the ResizeObserver, and this is the second half of
       the header's re-adopt story. When a node DOES change — the one node a
       drag moved — React Flow rebuilds its internal node, and it carries the
       previous handle bounds over only if the incoming object already claims a
       measured size (`parseHandles`); with `measured` absent it resets them
       and the moved node's own connectors blink for a frame. Truthful because
       the viewer never resizes a node: React Flow writes `width`/`height`
       above onto the wrapper as inline styles, so the measured box IS
       `node.size` — the same fact viewer-node.tsx relies on to draw its
       selection outline arithmetically instead of measuring. */
    measured: { width: node.size.width, height: node.size.height },
    draggable: editable,
    connectable: false,
    selectable: false,
    focusable: false,
    // Same colour plumbing as the editor's projection: two custom
    // properties on the wrapper, inherited by the shape classes.
    // Author tagColors (frozen in model metadata) beat the type default.
    // The entrance delay rides along as a third custom property — the
    // wrapper's inline style is already the per-node channel, and the
    // animation itself lives on the INNER element (viewer-node.tsx), so
    // React Flow's positioning transform is never animated.
    style: {
      ...nodeColorStyle(node, model.file.metadata.tagColors),
      "--viewer-enter-delay": `${enterDelay}ms`,
    } as CSSProperties,
    data: {
      node,
      level: diagram.level,
      isPlaceholder: isBoundaryPlaceholder(node),
      // A dangling `^ref` resolves to null and renders no chip.
      refSourceLevel:
        node.externalRef !== undefined
          ? (model.diagrams[node.externalRef.diagramId]?.level ?? null)
          : null,
      drill:
        node.childDiagramId &&
        childLevel !== null &&
        (childCount > 0 || (editable && child !== null))
          ? {
              childDiagramId: node.childDiagramId,
              childLevelLabel: childLevel,
              childCount,
            }
          : null,
    },
  };
}

/**
 * Project `input.diagram` into React Flow nodes, reusing the object a node was
 * given last time when nothing about it changed.
 *
 * Mutates `input.cache`. Idempotent: projecting the same diagram twice returns
 * the same objects, so a double-invoked render (StrictMode) is not a re-adopt.
 */
export function projectViewerNodes(input: ProjectionInput): ViewerFlowNode[] {
  const { diagram, cache } = input;
  /* A LEVEL CHANGE STARTS OVER. Node ids are unique per diagram, not per
     model, so an id can mean one element here and another one level down —
     and a drill is also the one moment the entrance stagger is meant to play
     again. Clearing is what keeps both true. */
  if (cache.diagramId !== diagram.id) {
    cache.entries.clear();
    cache.diagramId = diagram.id;
  }

  const delays = entranceDelays(diagram);
  const nodes = diagram.nodes.map((node) => {
    const previous = cache.entries.get(node.id);
    /* A NODE ALREADY ON SCREEN KEEPS THE DELAY IT ENTERED WITH. The delay is
       a rank over every node's position, so moving one node reshuffles the
       ranks of others — recomputing would hand several untouched nodes a new
       inline style, breaking their identity for the sake of an animation that
       finished seconds ago. */
    const enterDelay = previous?.enterDelay ?? delays.get(node.id) ?? 0;
    const projected = project(node, input, enterDelay);
    const signature = JSON.stringify(projected);
    if (previous !== undefined && previous.signature === signature) {
      return previous.node;
    }
    cache.entries.set(node.id, { signature, enterDelay, node: projected });
    return projected;
  });

  // A deleted node must not keep its entry alive: the cache would grow for the
  // life of the page, and an id reused by a later edit would inherit a stale
  // entrance delay.
  if (cache.entries.size > nodes.length) {
    const live = new Set(diagram.nodes.map((node) => node.id));
    for (const id of cache.entries.keys()) {
      if (!live.has(id)) cache.entries.delete(id);
    }
  }

  return nodes;
}
