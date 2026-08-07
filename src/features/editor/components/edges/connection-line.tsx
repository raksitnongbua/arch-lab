"use client";

/**
 * The line drawn while a connection drag is in flight.
 *
 * React Flow's default is a plain bezier leaving the handle you grabbed, in one
 * fixed colour, saying nothing about what will happen on release. Two problems
 * with that here, and this component exists for both:
 *
 * 1. **It misdescribed the result.** Committed edges use floating anchors
 *    (`lib/edge-geometry.ts`): the edge leaves whichever side of the source
 *    faces the target, recomputed as nodes move. Drag from the TOP handle to a
 *    node on the right and the preview came off the top while the finished edge
 *    came off the right. So the preview is built from the same
 *    `getFloatingAnchors` + `getParallelEdgePath` the real edge uses — over a
 *    node it is not an approximation of the result, it IS the result.
 * 2. **It encoded no verdict.** Colour and dash now come from
 *    `lib/connect-verdict.ts`, the one table the target highlight, the caption
 *    and the announcement also read. A green solid line with an arrowhead means
 *    a relationship is about to exist; an amber dashed one means a second one
 *    is; an accent dashed one means a new element; a grey one means nothing
 *    will happen.
 *
 * Over empty canvas there is no target rectangle, so the pointer is treated as
 * a 1x1 rect — `getFloatingAnchors` then picks the source side facing the
 * cursor, which is the same behaviour the finished edge would have if a node
 * were dropped there.
 *
 * The arrowhead is the canvas's own `af-arrow-*` marker, not a private one, so
 * the preview's tip and the committed edge's tip are the same shape.
 */

import {
  useConnection,
  type ConnectionLineComponentProps,
} from "@xyflow/react";

import { useEditorStore } from "../../state";
import {
  getFloatingAnchors,
  getParallelEdgePath,
  type NodeRect,
} from "../../lib/edge-geometry";
import {
  CONNECT_VERDICT,
  verdictFor,
  type ConnectVerdict,
} from "../../lib/connect-verdict";

/** A node's rect in flow coordinates, or null before it has been measured. */
function rectOf(
  node: ConnectionLineComponentProps["fromNode"] | null | undefined,
): NodeRect | null {
  if (!node) return null;
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  if (width == null || height == null) return null;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width,
    height,
  };
}

export function ConnectionLine({
  toX,
  toY,
  fromNode,
}: ConnectionLineComponentProps): React.JSX.Element | null {
  // `toNode` off the live connection rather than props: React Flow only fills
  // it once a handle is actually acquired, which — with the full-bleed body
  // handle in node-chrome.tsx — is exactly when the pointer is over a node.
  const toNode = useConnection((connection) => connection.toNode);
  const diagram = useEditorStore((s) => s.model.diagrams[s.activeDiagramId]);

  const sourceRect = rectOf(fromNode);
  if (sourceRect === null || diagram === undefined) return null;

  const targetRect = rectOf(toNode);
  const verdict: ConnectVerdict = verdictFor({
    sourceNodeId: fromNode.id,
    targetNodeId: toNode?.id ?? null,
    diagram,
  });
  const style = CONNECT_VERDICT[verdict];

  // Over a node: the real geometry, including the parallel offset the new edge
  // would take, so a duplicate previews on the curve it will actually occupy
  // instead of on top of the edge that already exists.
  const isOverNode = targetRect !== null;
  const existing = isOverNode
    ? diagram.edges.filter(
        (edge) =>
          (edge.source === fromNode.id && edge.target === toNode?.id) ||
          (edge.source === toNode?.id && edge.target === fromNode.id),
      ).length
    : 0;

  const anchors = getFloatingAnchors(
    sourceRect,
    targetRect ?? { x: toX, y: toY, width: 1, height: 1 },
  );
  const { path } = getParallelEdgePath({
    ...anchors,
    parallelIndex: existing,
    parallelCount: existing + 1,
  });

  return (
    <g
      aria-hidden="true"
      className="af-connection-line pointer-events-none"
      data-verdict={verdict}
    >
      <path
        d={path}
        fill="none"
        stroke={style.token}
        strokeWidth={2}
        strokeLinecap="round"
        {...(style.dash === null ? {} : { strokeDasharray: style.dash })}
        {...(style.arrow ? { markerEnd: "url(#af-connection-arrow)" } : {})}
      />
      {style.arrow ? (
        <defs>
          {/* Mirrors the committed edge's marker geometry so the tip does not
              shift on release. Painted with the verdict's own token. */}
          <marker
            id="af-connection-arrow"
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="9"
            markerHeight="9"
            markerUnits="strokeWidth"
            orient="auto-start-reverse"
          >
            <path d="M 1 1 L 11 6 L 1 11 Z" fill={style.token} />
          </marker>
        </defs>
      ) : null}
    </g>
  );
}
