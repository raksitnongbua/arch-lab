"use client";

/**
 * The connect grip — the viewer node's top-right control, present exactly
 * while the canvas is editable. One affordance, two interactions:
 *
 *   - DRAG it onto another element and release: the two are related. A ghost
 *     line previews the outcome the whole way, painted from the connect
 *     verdict model — green solid for a fresh pair, amber dashed for a pair
 *     already related (a caution, never a refusal), the neutral abort dash
 *     back on the source.
 *   - CLICK it and a menu opens with both halves of the product owner's ask:
 *     the diagram's existing elements to connect to, and the level's node
 *     types to create a NEW element already connected — one text edit, one
 *     undo.
 *
 * THE PRECEDENT is the editor's `relate-grip.tsx`, and what is shared versus
 * viewer-specific is deliberate (`dry.md`):
 *
 *   - SHARED: the verdict model. `connect-verdict.ts` is the one table that
 *     says what a release means (`verdictFor`), how it paints
 *     (`CONNECT_VERDICT`) and what it says (`captionFor`) — a second copy
 *     here is exactly the five-consumers-disagreeing bug that table was
 *     written to end. The menu's target list shares the same table through
 *     `connectTargets` (`lib/node-palette.ts`).
 *   - VIEWER-SPECIFIC: everything stateful. This canvas has no editor store —
 *     the gesture resolves through the canvas's context actions into a TEXT
 *     edit (`connectedNodesEdit` / `connectedNewNodeEdit`), its selection
 *     model and Escape ladder are its own, and a release over EMPTY canvas
 *     does not open a quick-add menu the way the editor's does: the drag
 *     connects to what exists (the product owner's split — "click and drag,
 *     connect with existing node"), so the empty-canvas caption redirects to
 *     the click menu instead of promising a creation the release will not
 *     perform. That one caption is the deliberate deviation from
 *     `captionFor`, stated here because it is load-bearing: the editor's
 *     `create` caption says "release to add", which on this canvas would be
 *     a promise the release breaks.
 *
 * HOW THE PRESS STAYS OUT OF THE OTHER TWO DRAGS ON THIS CANVAS:
 *
 *   - NODE-DRAGGING: the button wears `nodrag` (React Flow's default
 *     `noDragClassName`), and the pointerdown is stopped and captured — the
 *     relate grip's own recipe, because `stopPropagation` alone is not
 *     enough when the library also listens on the pane.
 *   - THE MARQUEE: needs nothing here — it claims a press only when the
 *     target IS `.react-flow__pane` itself, and this press starts on a
 *     button inside a node.
 *
 * The drag is hand-rolled with pointer capture, NEVER React Flow's connection
 * machinery: `nodesConnectable` is false on this flow and must stay false —
 * re-engaging the library's connect path would put per-frame connection state
 * back into the store the marquee's loop-proofing keeps disengaged
 * (`check:canvas-edit` pins the props). The only per-frame state here is this
 * component's own ghost, which feeds one portal overlay and nothing the
 * canvas projects from.
 *
 * The menu PORTALS to <body> at the grip's screen position rather than
 * rendering inside the node: the node wrapper is scaled by the viewport
 * transform, and a menu that shrinks with the zoom is unreadable at exactly
 * the zoom levels a big diagram is read at. Dismissal is `useMenuDismissal`,
 * shared with the zoom and reference menus, so Escape closes the menu WITHOUT
 * also clearing the canvas selection — and the trigger's own pointerdown is
 * stopped, so the press that opens the menu never reaches the hook's
 * outside-pointerdown listener as a dismissal.
 */

import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Plus } from "lucide-react";

import { useMenuDismissal } from "@/components/ui/menu-dismissal";
import type { C4Node, C4NodeType } from "@/types";

import {
  CONNECT_VERDICT,
  captionFor,
  type ConnectVerdict,
} from "@/features/editor/lib/connect-verdict";

import type { ConnectTarget, CreatableNodeType } from "../lib/node-palette";

/**
 * What the canvas hands every node's grip through context — callbacks and
 * derived lists, NEVER node data, so the projection cache's pure-data
 * contract holds (see `ViewerNodeData`). The canvas owns the geometry and the
 * text: the grip only reports screen points and menu choices.
 */
export interface ViewerConnectActions {
  /** The existing elements `sourceNodeId` may be connected to, with the
   *  verdict model's duplicate caution attached — `connectTargets`. */
  targetsFor: (sourceNodeId: string) => readonly ConnectTarget[];
  /** The node types a create-and-connect may mint at this diagram's level. */
  createTypes: readonly CreatableNodeType[];
  /** What releasing at this screen point would do, for the ghost line. */
  verdictAt: (
    sourceNodeId: string,
    clientX: number,
    clientY: number,
  ) => { verdict: ConnectVerdict; targetName: string | null };
  /** Complete a drag at this screen point. */
  completeAt: (sourceNodeId: string, clientX: number, clientY: number) => void;
  /** Connect to a chosen existing element (the menu's first half). */
  connectTo: (sourceNodeId: string, targetNodeId: string) => void;
  /** Create a new element of `type` already connected (the second half). */
  createAndConnect: (sourceNodeId: string, type: C4NodeType) => void;
}

/**
 * Below this travel (screen px) the press is a CLICK and opens the menu.
 * Screen pixels rather than flow units on purpose: the threshold guards the
 * HAND (a tap's tremor), which does not scale with the zoom the way the
 * relate grip's flow-unit threshold assumes — and the marquee's click slop
 * draws the same line in the same units one gesture over.
 */
const CONNECT_CLICK_SLOP_PX = 5;

interface GhostLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  verdict: ConnectVerdict;
  caption: string;
}

export function ViewerConnectGrip({
  node,
  connect,
}: {
  node: C4Node;
  connect: ViewerConnectActions;
}): React.JSX.Element {
  const [ghost, setGhost] = useState<GhostLine | null>(null);
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(
    null,
  );
  /** The press's origin, client coords; null between presses. */
  const startRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const closeMenu = useCallback(() => setMenuAt(null), []);
  useMenuDismissal(menuAt !== null, closeMenu, menuRef);

  /* The one deviation from `captionFor`, argued in the header: over empty
     canvas the editor promises a creation its release performs, and this
     canvas's release does not — the caption redirects to the gesture that
     does. */
  const captionAt = useCallback(
    (verdict: ConnectVerdict, targetName: string | null): string =>
      verdict === "create"
        ? "Release on an element to connect — or click the handle to add a new one"
        : captionFor(verdict, node.name, targetName),
    [node.name],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      // Stopped AND cancelled: propagation so React Flow never starts a node
      // drag from this press, default so the compat mousedown never reaches
      // the menu-dismissal hook's window listener as an outside press.
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = startRef.current;
      if (start === null || event.pointerId !== start.pointerId) return;
      const travelled =
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >
        CONNECT_CLICK_SLOP_PX;
      if (!travelled) {
        setGhost(null);
        return;
      }
      const { verdict, targetName } = connect.verdictAt(
        node.id,
        event.clientX,
        event.clientY,
      );
      setGhost({
        x1: start.x,
        y1: start.y,
        x2: event.clientX,
        y2: event.clientY,
        verdict,
        caption: captionAt(verdict, targetName),
      });
    },
    [connect, node.id, captionAt],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = startRef.current;
      startRef.current = null;
      setGhost(null);
      if (start === null || event.pointerId !== start.pointerId) return;
      const travelled =
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >
        CONNECT_CLICK_SLOP_PX;
      if (!travelled) {
        // A click: the menu opens under the grip, where the press was.
        const rect = event.currentTarget.getBoundingClientRect();
        setMenuAt({ left: rect.left, top: rect.bottom + 4 });
        return;
      }
      connect.completeAt(node.id, event.clientX, event.clientY);
    },
    [connect, node.id],
  );

  const handlePointerCancel = useCallback(() => {
    startRef.current = null;
    setGhost(null);
  }, []);

  const targets = menuAt !== null ? connect.targetsFor(node.id) : [];

  return (
    <>
      <button
        type="button"
        // `nodrag` keeps React Flow from dragging the node instead — the
        // relate grip's own note: stopPropagation alone is not enough.
        className="af-connect-grip nodrag absolute -top-2 -right-2 z-[3] flex size-5 cursor-crosshair items-center justify-center rounded-full border border-node-border bg-node text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 hover:border-accent hover:text-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        // Leads with the OUTCOME, the relate grip's labelling rule.
        aria-label={`Connect ${node.name} to another element — drag onto it, or click to choose one (or add a new one)`}
        title="Drag onto an element to connect — click for choices"
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        aria-controls={menuAt !== null ? menuId : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        // Never a drill or selection: this control means exactly one thing.
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <ArrowUpRight aria-hidden="true" className="size-3" />
      </button>
      {ghost !== null
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 z-50"
            >
              <svg className="size-full">
                <line
                  x1={ghost.x1}
                  y1={ghost.y1}
                  x2={ghost.x2}
                  y2={ghost.y2}
                  stroke={CONNECT_VERDICT[ghost.verdict].token}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={
                    CONNECT_VERDICT[ghost.verdict].dash ?? undefined
                  }
                />
              </svg>
              <div
                className="absolute max-w-64 rounded-md border border-border bg-popover px-2 py-1 text-[11px] leading-snug shadow-md"
                style={{
                  left: ghost.x2 + 12,
                  top: ghost.y2 + 12,
                  color: CONNECT_VERDICT[ghost.verdict].token,
                }}
              >
                {ghost.caption}
              </div>
            </div>,
            document.body,
          )
        : null}
      {menuAt !== null
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={`Connect ${node.name} to`}
              className="af-glass fixed z-50 max-h-72 min-w-48 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
              style={{ left: menuAt.left, top: menuAt.top }}
            >
              {/* The reference menu's micro-label register: what this row IS,
                  never one more choice. */}
              <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
                Connect to
              </p>
              {targets.length === 0 ? (
                <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
                  No other elements here yet
                </p>
              ) : (
                targets.map(({ node: target, related }) => (
                  <button
                    key={target.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      connect.connectTo(node.id, target.id);
                    }}
                    title={
                      related
                        ? `${node.name} and ${target.name} are already related — this adds a second relationship`
                        : `Relate ${node.name} to ${target.name}`
                    }
                    className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {target.name}
                    </span>
                    {/* The duplicate CAUTION, before the choice — the verdict
                        model's colour, so the menu and the drag preview say
                        "already related" in one voice. */}
                    {related ? (
                      <span
                        className="shrink-0 text-[10px]"
                        style={{ color: CONNECT_VERDICT.duplicate.token }}
                      >
                        already related
                      </span>
                    ) : null}
                  </button>
                ))
              )}
              <p className="mt-1 border-t border-border/70 px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
                New element
              </p>
              {connect.createTypes.map(({ keyword, type }) => (
                <button
                  key={keyword}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    connect.createAndConnect(node.id, type);
                  }}
                  title={`Add a ${keyword} element connected to ${node.name}`}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[11px] text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                >
                  <Plus
                    aria-hidden="true"
                    className="size-3 text-muted-foreground"
                  />
                  {keyword}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
