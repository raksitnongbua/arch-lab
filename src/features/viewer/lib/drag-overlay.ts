/**
 * The in-flight drag overlay: where a node is *right now*, while the press is
 * still happening and the model does not know about it yet.
 *
 * WHY THIS EXISTS AT ALL. The viewer canvas is a CONTROLLED React Flow — it
 * passes `nodes`, never `defaultNodes` — and in @xyflow/system 0.0.79 a drag
 * does not move a controlled node by itself. `XYDrag` builds a throwaway
 * `NodeDragItem` per dragged node at press time, mutates *that* copy as the
 * pointer moves, and hands the result to `updateNodePositions` →
 * `triggerNodeChanges`. That function has exactly two outlets: apply the
 * changes itself when `hasDefaultNodes`, or call `onNodesChange`. A controlled
 * flow with no `onNodesChange` gets neither, so the store's `nodeLookup` is
 * never written, `NodeWrapper`'s transform keeps reading the old position, and
 * the node sits still under the cursor until release re-parses the text. That
 * was the bug: "click drag to change position not smooth".
 *
 * WHY AN OVERLAY AND NOT A NODES ARRAY IN STATE. The editor canvas owns its
 * nodes outright, so its `onNodesChange` can be the library's documented
 * `applyNodeChanges` into local state. Here the source of truth is the
 * DOCUMENT TEXT: the canvas re-projects it on every keystroke in the source
 * pane, and holding a second full copy of the nodes would be the "two halves,
 * each self-consistent, that disagree" shape — the copy would win over an
 * incoming text edit for as long as it lived. An overlay holds only the delta
 * a press has produced and nothing else, so a text edit arriving mid-press
 * still reaches the screen.
 *
 * THE MODEL INVARIANT IS UNCHANGED: one commit per press-to-release. This
 * moves LOCAL state per frame; `onNodeDragStop` is still the only thing that
 * rewrites the text, so a press is still one undo entry (see the drag-stop
 * comment in `viewer-canvas.tsx`).
 *
 * THE HANDOVER IS WHERE THIS WOULD GO WRONG, so both halves are arranged to
 * produce the same number. React Flow reports the position it has already
 * snapped to `snapGrid` (`snapPosition` = `grid * Math.round(v / grid)`), the
 * commit rounds that with `Math.round`, and so does {@link dragOverlayAfter} —
 * so the last frame of the press and the first frame after the commit are the
 * same position. Combined with the projection cache in `project-nodes.ts`, the
 * committed frame reuses the very node OBJECT the last drag frame was given:
 * zero re-adopts at the handover and nothing settles twice.
 * `check:canvas-edit` measures that as object identity, because "no flicker"
 * is otherwise only observable in a browser.
 *
 * THE SNAP RIDES ALONG FOR THE SAME REASON. Alignment snapping corrects the
 * position React Flow proposes, and a correction applied here and NOT at the
 * commit is the exact shape of "a node that springs back with no explanation"
 * — the failure `canvas-editing.md` names. So the snap is a function passed
 * in, both this and the drag-stop handler call it, and the check drives the
 * same gesture through both and requires one number.
 */

import type { Node, NodeChange } from "@xyflow/react";

import {
  NO_GUIDES,
  type AlignmentGuide,
  type Point,
  type SnapOutcome,
} from "@/lib/align-snap";
import type { C4Diagram } from "@/types";

/**
 * Where each node being dragged currently is, in MODEL coordinates, already
 * snapped and rounded to what a commit of the same gesture would write.
 * Empty means no press is in progress.
 */
export type DragOverlay = ReadonlyMap<string, { x: number; y: number }>;

/**
 * The idle overlay. A shared frozen-by-convention empty map so an idle canvas
 * — every read-only host — hands the same identity to its memos forever and
 * re-projects nothing.
 */
export const NO_DRAG_OVERLAY: DragOverlay = new Map();

/**
 * Fold React Flow's node changes into the overlay.
 *
 * Returns `current` unchanged when no position change applies, so a change
 * batch about something else (a `dimensions` change from the ResizeObserver,
 * for instance) costs no render.
 *
 * `change.dragging` IS THE PRESS BOUNDARY, and reading it is what keeps this
 * to one clearing path. React Flow emits `dragging: false` at the end of a
 * gesture and — this is the case a `onNodeDragStop`-based clear would miss —
 * ALSO on an aborted one: a second finger landing mid-drag, or the node being
 * deleted under the pointer, sets `abortDrag`, which fires the final position
 * change and then returns *without* calling `onNodeDragStop`. Clearing on the
 * library's own flag covers both; clearing in the drag-stop handler would
 * leave an aborted press showing a position the document never received, with
 * nothing left to correct it.
 */
export interface DragOverlayStep {
  /** `current` itself when nothing moved, so the projection memos re-run for nothing. */
  overlay: DragOverlay;
  /** What the snap took hold of this frame; `NO_GUIDES` when nothing did. */
  guides: readonly AlignmentGuide[];
}

export function dragOverlayAfter<NodeType extends Node>(
  current: DragOverlay,
  changes: readonly NodeChange<NodeType>[],
  /**
   * The alignment snap, or omitted for a canvas that does not snap. Must be
   * the SAME function the drag-stop handler calls — see the header.
   */
  snap?: (id: string, proposed: Point) => SnapOutcome,
): DragOverlayStep {
  let next: Map<string, { x: number; y: number }> | null = null;
  let guides: readonly AlignmentGuide[] = NO_GUIDES;
  const target = () => (next ??= new Map(current));
  for (const change of changes) {
    if (change.type !== "position") continue;
    if (change.dragging === true) {
      if (!change.position) continue;
      const snapped = snap?.(change.id, change.position);
      if (snapped !== undefined) guides = snapped.guides;
      const at = snapped?.position ?? change.position;
      // Rounded HERE so the value the reader sees mid-press is the value the
      // commit writes — see the handover note in the file header.
      target().set(change.id, {
        x: Math.round(at.x),
        y: Math.round(at.y),
      });
    } else if (current.has(change.id)) {
      target().delete(change.id);
    }
  }
  return { overlay: next ?? current, guides };
}

/**
 * The diagram as it looks mid-press: model geometry with the overlay applied.
 *
 * RETURNS THE ARGUMENT ITSELF whenever the overlay says nothing new, and that
 * identity is load-bearing twice over. It is what makes a locked canvas — and
 * every read-only host — project exactly the objects it projects today, and it
 * is what makes the handover free: once the commit lands, the model already
 * holds the overlay's position, so this returns the untouched diagram and the
 * projection cache recognises every node, including the one that moved.
 *
 * Frames are the reason this shapes a whole DIAGRAM rather than patching the
 * projected nodes: `placeFrames` derives a frame's box from its members'
 * positions, so a frame fed the model while the nodes were fed the overlay
 * would visibly disagree with the node it is supposed to contain, and then
 * jump on release.
 */
export function diagramWithDragOverlay(
  diagram: C4Diagram,
  overlay: DragOverlay,
): C4Diagram {
  if (overlay.size === 0) return diagram;
  let moved = false;
  const nodes = diagram.nodes.map((node) => {
    const at = overlay.get(node.id);
    if (at === undefined) return node;
    if (at.x === node.position.x && at.y === node.position.y) return node;
    moved = true;
    return { ...node, position: { x: at.x, y: at.y } };
  });
  return moved ? { ...diagram, nodes } : diagram;
}
