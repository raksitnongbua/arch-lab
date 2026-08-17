"use client";

/**
 * The flowchart VIEWER: layout + focus + camera, composed around the pure
 * `FlowchartDiagram` renderer — the same division of labour as
 * `SequenceViewer` / `SequenceDiagram`, and deliberately the same interaction
 * vocabulary, so a reader who has learned one canvas has learned them all:
 *
 *   - Clicking a NODE emphasises it, keeps its incident arrows and their far
 *     ends lit, and opens the details dock — which is where a node's `desc`
 *     lives (the model deliberately never draws it inside the symbol).
 *   - Clicking an ARROW keeps its two endpoints lit and names the hop.
 *   - Everything else recedes on opacity; Escape, the dock's close button or
 *     a click on empty canvas brings the full chart back.
 *   - Zoom is the sequence viewer's camera verbatim: "fit" as the default
 *     MODE (the whole chart in the pane, holding through resizes for free),
 *     numeric scales past it, drag-to-pan on empty canvas, ctrl/⌘-scroll and
 *     trackpad pinch claimed and clamped.
 *
 * THE DOCK IS NOT A MODAL — the point of focus is clicking AROUND the chart
 * while reading details, and a dialog would forbid exactly that. It overlays
 * the pane rather than sitting beside it, so opening it never rescales the
 * drawing (the sequence viewer documents the reflow-jump this avoids).
 *
 * REDUCED MOTION costs this model nothing: the complete chart is the resting
 * state, dimming transitions are parked by the `motion-reduce:` classes in
 * the diagram (a media query, so it holds before hydration), and zoom is a
 * state change, not motion. The opening TRACE (the rank-by-rank reveal —
 * see styles/flowchart-motion.css) is likewise gated on `prefers-reduced-
 * motion: no-preference` in CSS, never in JS, because it plays at first
 * paint where no hook has run yet; this viewer neither starts nor stops it,
 * and none of its camera work (pan, zoom, fit) remounts the SVG's children,
 * so the trace can never accidentally replay mid-session. The ONE deliberate
 * replay is the hidden-mount restart below: a chart that mounted while the
 * page was not visible replays its trace at the reader's first actual look,
 * because a CSS animation's clock is wall time and burns unseen otherwise.
 *
 * IDLE MOTION — the pulse that re-walks the flow once the trace has settled
 * (styles/flowchart-motion.css, idle block) — is the one thing here that IS
 * behind the app-wide toggle: this viewer reads the shared preference
 * (lib/idle-motion.ts) and stamps `data-af-idle` on its root, the C4 shell's
 * exact wiring, so "stop the diagrams moving" set on any canvas holds on all
 * three. Reduced motion beats the toggle twice over: `idleMotionState` folds
 * it into the attribute, and the stylesheet's media gate holds before
 * hydration. The TRACE stays outside the toggle on purpose — an entrance is
 * motion the reader asked for by opening the page, not idle motion.
 *
 * Focus is VALIDATED at read time (a re-parse can remove the focused node)
 * rather than synchronised by effects — no setState in an effect body, the
 * same discipline the sequence viewer cites.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scan, Waves, X, ZoomIn, ZoomOut } from "lucide-react";

import type { FlowchartLabFile } from "@/types";
import {
  idleMotionState,
  readIdleMotion,
  useIdleMotion,
  useReducedMotion,
  writeIdleMotion,
} from "@/lib/idle-motion";
import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
  ZOOM_STEP,
} from "@/components/ui/zoom-pill";
import { useModKey } from "@/lib/mod-key";
import { cn } from "@/lib/utils";

import type { LaidFlowEdge } from "../lib/layout";
import { layoutFlowchart } from "../lib/layout";
import type { FlowchartFocus } from "./flowchart-diagram";
import { FlowchartDiagram, resolveFlowFocus } from "./flowchart-diagram";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

export function FlowchartViewer({
  file,
  onAnnounce,
}: {
  file: FlowchartLabFile;
  /**
   * Where focus announcements go. The viewer owns no live region — the
   * hosting page renders the single polite region (two regions updated near
   * each other race, and the loser's announcement is swallowed; the sequence
   * viewer documents the same contract).
   */
  onAnnounce: (message: string) => void;
}): React.JSX.Element {
  // ONE layout call per model — the single source of geometric truth.
  const layout = useMemo(() => layoutFlowchart(file), [file]);
  const nodeById = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout],
  );
  const mod = useModKey();

  /**
   * Idle motion: the reader's app-wide toggle, their OS preference, and the
   * attribute the stylesheet's pulse block selects on — the C4 shell's exact
   * wiring (`idleMotionState` in lib/idle-motion.ts), because a third way to
   * read one preference is two too many. Reduced motion wins outright; the
   * entrance TRACE is deliberately NOT behind this gate — an entrance is
   * motion the reader asked for by opening the page, not idle motion.
   */
  const reduced = useReducedMotion();
  const idleMotion = useIdleMotion();
  const idleState = idleMotionState(reduced, idleMotion);

  /**
   * True once the reader has turned idle motion ON with the toggle THIS
   * session. The pulse's animation is retracted by the `data-af-idle` gate,
   * so flipping the gate back on restarts it from zero — including the
   * `--flow-idle-start` settle that exists only to let the ENTRANCE finish.
   * Re-serving that settle to a click left the chart motionless for 3+
   * seconds after the press (reported as "toggle broken" — a control whose
   * effect is invisible for three seconds is a dead control to the reader).
   * `data-af-idle-resume` tells the stylesheet this ON was ASKED FOR, and it
   * answers on the draw's clock instead (flowchart-motion.css, resume block).
   * Deliberately NEVER set at load — the initial settle keeps its reason to
   * wait — and sticky once set: every later ON is equally the reader's ask.
   * Reduced motion is untouched: the resume rule lives inside the same
   * media gate, and the disabled toggle cannot stamp this state at all.
   */
  const [idleResumed, setIdleResumed] = useState(false);

  /* ---- the trace vs a hidden mount ----------------------------------------
   * CSS animations start the moment their style first applies and advance on
   * the document's WALL CLOCK, visible or not — a hidden tab's clock keeps
   * ticking. So a share link opened in a background tab (the ordinary way a
   * link from chat or mail arrives) used to play the entire entrance, and
   * the pulse's opening cycles, to nobody; `both` fill then greets the
   * reader's first look with a finished, motionless chart — reported as "no
   * animation runs at all", with reduced motion off. The media query cannot
   * express "visible", so this is the one place JS touches the trace: when
   * the viewer MOUNTED unseen, remount the diagram subtree (the key below)
   * at the first return to visibility, which restarts every CSS animation
   * from the reader's actual first sight. Reduced-motion correctness is
   * untouched — the remounted subtree sits behind the same media gate, so a
   * reduced-motion reader gets the same static chart re-rendered — and a
   * visible load never remounts: the listener is only installed when the
   * mount itself was hidden, and detaches after firing once, so later tab
   * switches never replay (the "never accidentally replay" rule above).
   * Known residue, accepted: a page that turns visible inside the sub-second
   * gap between first paint and hydration ran no JS while hidden and cannot
   * be detected here — that window is the hydration gap, not the
   * human-scale background-tab gap this exists for. */
  const [traceEpoch, setTraceEpoch] = useState(0);
  useEffect(() => {
    if (document.visibilityState !== "hidden") return;
    const onVisible = (): void => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      setTraceEpoch((epoch) => epoch + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const [rawFocus, setRawFocus] = useState<NonNullable<FlowchartFocus> | null>(
    null,
  );
  // Validated at read time: a focus pointing at nothing reads as no focus.
  const focus: FlowchartFocus =
    rawFocus === null
      ? null
      : rawFocus.kind === "node"
        ? nodeById.has(rawFocus.id)
          ? rawFocus
          : null
        : layout.edges.some((e) => e.index === rawFocus.index)
          ? rawFocus
          : null;

  /* ---- focus ------------------------------------------------------------- */

  const describeEdge = useCallback(
    (edge: LaidFlowEdge): string => {
      const from = nodeById.get(edge.from)?.label ?? edge.from;
      const to = nodeById.get(edge.to)?.label ?? edge.to;
      return (
        `${from} to ${to}` +
        (edge.label !== undefined ? ` — ${edge.label}` : "") +
        (edge.back ? " (loops back)" : edge.self ? " (self)" : "")
      );
    },
    [nodeById],
  );

  const handleFocusNode = useCallback(
    (id: string) => {
      setRawFocus({ kind: "node", id });
      const node = nodeById.get(id);
      if (node === undefined) return;
      const degree = layout.edges.filter(
        (e) => e.from === id || e.to === id,
      ).length;
      onAnnounce(
        `Focused ${node.shape} ${node.label} — ${degree} arrow${degree === 1 ? "" : "s"}.` +
          (node.description !== undefined
            ? ` Details: ${node.description.split("\n").join(". ")}.`
            : "") +
          " Details open beside the diagram; Escape clears focus.",
      );
    },
    [layout, nodeById, onAnnounce],
  );

  const handleFocusEdge = useCallback(
    (index: number) => {
      setRawFocus({ kind: "edge", index });
      const edge = layout.edges.find((e) => e.index === index);
      if (edge === undefined) return;
      onAnnounce(`Focused arrow: ${describeEdge(edge)}. Escape clears focus.`);
    },
    [layout, describeEdge, onAnnounce],
  );

  const handleClearFocus = useCallback(() => {
    if (focus !== null) onAnnounce("Focus cleared.");
    setRawFocus(null);
  }, [focus, onAnnounce]);

  const paneRef = useRef<HTMLDivElement>(null);
  const handleCloseDock = useCallback(() => {
    // The close button unmounts with the dock; re-home keyboard focus on the
    // pane so "close details, keep exploring" stays a pure keyboard flow.
    handleClearFocus();
    paneRef.current?.focus();
  }, [handleClearFocus]);

  /* ---- Escape on window — the same page ladder the sequence viewer keeps:
     it must fire wherever DOM focus sits, run before any shell listener
     (child effects register first), and preventDefault is the "consumed"
     signal a hosting shell checks before acting on its own rung. */
  const focusRef = useRef<FlowchartFocus>(null);
  const clearRef = useRef(handleClearFocus);
  useEffect(() => {
    focusRef.current = focus;
    clearRef.current = handleClearFocus;
  }, [focus, handleClearFocus]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.fullscreenElement !== null) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (focusRef.current === null) return;
      event.preventDefault();
      clearRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- zoom (the sequence viewer's camera, same constants) ----------------- */

  const [zoom, setZoom] = useState<number | "fit">("fit");

  const measureFitScale = useCallback((): number => {
    const pane = paneRef.current;
    if (pane === null) return 1;
    const width = pane.clientWidth - 24;
    const height = pane.clientHeight - 24;
    if (width <= 0 || height <= 0) return 1;
    return Math.min(width / layout.width, height / layout.height);
  }, [layout]);

  /** Scroll anchor kept across a zoom — fractions of the scrollable content,
   * the same both-modes-safe quantity the sequence viewer derives. */
  const zoomAnchor = useRef<{
    cx: number;
    cy: number;
    vx: number;
    vy: number;
  } | null>(null);

  const applyZoom = useCallback(
    (
      next: number,
      options: { at?: { x: number; y: number }; announce?: boolean } = {},
    ) => {
      const pane = paneRef.current;
      if (pane !== null && pane.scrollWidth > 0 && pane.scrollHeight > 0) {
        const vx = options.at?.x ?? pane.clientWidth / 2;
        const vy = options.at?.y ?? pane.clientHeight / 2;
        zoomAnchor.current = {
          cx: (pane.scrollLeft + vx) / pane.scrollWidth,
          cy: (pane.scrollTop + vy) / pane.scrollHeight,
          vx,
          vy,
        };
      }
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
      setZoom(clamped);
      if (options.announce !== false) {
        onAnnounce(
          `Zoom ${Math.round(clamped * 100)} percent. Drag or scroll the diagram pane to pan.`,
        );
      }
      return clamped;
    },
    [onAnnounce],
  );

  useEffect(() => {
    const anchor = zoomAnchor.current;
    if (anchor === null) return;
    zoomAnchor.current = null;
    const pane = paneRef.current;
    if (pane === null) return;
    pane.scrollLeft = anchor.cx * pane.scrollWidth - anchor.vx;
    pane.scrollTop = anchor.cy * pane.scrollHeight - anchor.vy;
  }, [zoom]);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const current = zoom === "fit" ? measureFitScale() : zoom;
      applyZoom(current * (direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP));
    },
    [zoom, measureFitScale, applyZoom],
  );

  const applyFit = useCallback(() => {
    setZoom("fit");
    onAnnounce("Diagram fitted to view — the whole chart is on screen.");
  }, [onAnnounce]);

  const handleToggleIdle = useCallback(() => {
    const next = !readIdleMotion();
    writeIdleMotion(next);
    // An explicit ON is motion the reader just asked for — mark it so the
    // pulse answers promptly instead of re-serving the entrance settle.
    if (next) setIdleResumed(true);
    onAnnounce(
      next
        ? "Idle motion on — a pulse of light retraces the flow."
        : "Idle motion off — the chart holds still until you focus something.",
    );
  }, [onAnnounce]);

  /* ---- trackpad pinch / ctrl+wheel, claimed and clamped --------------------
     Native listener with { passive: false } because preventDefault is the
     point (React's onWheel attaches passively); coalesced per frame because a
     pinch outruns SVG re-renders; announced once, when the fingers stop. The
     sequence viewer carries the full design notes — this is the same wiring. */
  const pinchTarget = useRef<number | null>(null);
  const pinchFrame = useRef<number | null>(null);
  const pinchIdle = useRef<number | null>(null);
  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const base =
        pinchTarget.current ?? (zoom === "fit" ? measureFitScale() : zoom);
      const factor = Math.exp(
        -Math.max(-40, Math.min(40, event.deltaY)) * 0.01,
      );
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, base * factor));
      pinchTarget.current = next;
      const rect = pane.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (pinchFrame.current === null) {
        pinchFrame.current = window.requestAnimationFrame(() => {
          pinchFrame.current = null;
          const target = pinchTarget.current;
          if (target === null) return;
          applyZoom(target, { at, announce: false });
        });
      }
      if (pinchIdle.current !== null) window.clearTimeout(pinchIdle.current);
      pinchIdle.current = window.setTimeout(() => {
        pinchIdle.current = null;
        const settled = pinchTarget.current;
        pinchTarget.current = null;
        if (settled === null) return;
        onAnnounce(`Zoom ${Math.round(settled * 100)} percent.`);
      }, 250);
    };
    pane.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      pane.removeEventListener("wheel", onWheel);
      if (pinchFrame.current !== null) {
        window.cancelAnimationFrame(pinchFrame.current);
        pinchFrame.current = null;
      }
      if (pinchIdle.current !== null) {
        window.clearTimeout(pinchIdle.current);
        pinchIdle.current = null;
      }
    };
  }, [zoom, measureFitScale, applyZoom, onAnnounce]);

  /* ---- drag to pan (mouse, primary button, empty canvas, real overflow) ----
     The pane is a real scroll container, so this drives scrollLeft/scrollTop:
     wheel, scrollbars, keyboard and the drag stay one coordinate system. A
     moved drag swallows its trailing click so panning never clears focus. */
  const panState = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const panSuppressesClick = useRef(false);
  const [panning, setPanning] = useState(false);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if ((event.target as Element).closest?.(".af-flow-hit") != null) return;
      const pane = event.currentTarget;
      const scrollable =
        pane.scrollWidth > pane.clientWidth ||
        pane.scrollHeight > pane.clientHeight;
      if (!scrollable) return;
      panState.current = {
        x: event.clientX,
        y: event.clientY,
        left: pane.scrollLeft,
        top: pane.scrollTop,
        moved: false,
      };
      setPanning(true);
      pane.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [],
  );
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      if (state === null) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.moved && Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
      const pane = event.currentTarget;
      pane.scrollLeft = state.left - dx;
      pane.scrollTop = state.top - dy;
    },
    [],
  );
  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      if (state === null) return;
      panState.current = null;
      setPanning(false);
      if (state.moved) panSuppressesClick.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  /* The pane is the backdrop — clicking empty canvas clears focus (every
     interactive element inside the SVG stops propagation, which is what
     makes this safe). The client-size guard exempts scrollbar gutters. */
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (panSuppressesClick.current) {
        panSuppressesClick.current = false;
        return;
      }
      const pane = event.currentTarget;
      const rect = pane.getBoundingClientRect();
      if (
        event.clientX - rect.left > pane.clientWidth ||
        event.clientY - rect.top > pane.clientHeight
      ) {
        return;
      }
      handleClearFocus();
    },
    [handleClearFocus],
  );

  /* Arrow keys walk node focus in DECLARATION order — the author's reading
     order, which the model calls out as data. From nothing, both directions
     land on the first node ("start reading"). */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (layout.nodes.length === 0) return;
      const currentIndex =
        focus?.kind === "node"
          ? layout.nodes.findIndex((n) => n.id === focus.id)
          : -1;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          handleFocusNode(
            layout.nodes[Math.min(currentIndex + 1, layout.nodes.length - 1)]
              .id,
          );
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          handleFocusNode(layout.nodes[Math.max(0, currentIndex - 1)].id);
          break;
        default:
          break;
      }
    },
    [focus, layout, handleFocusNode],
  );

  /* ---- render -------------------------------------------------------------- */

  const focusedNode =
    focus?.kind === "node" ? (nodeById.get(focus.id) ?? null) : null;
  const focusedEdge =
    focus?.kind === "edge"
      ? (layout.edges.find((e) => e.index === focus.index) ?? null)
      : null;
  const focusSet = resolveFlowFocus(layout, focus);
  const focusedNodeEdges =
    focusedNode === null || focusSet === null
      ? []
      : layout.edges.filter((e) => focusSet.edges.has(e.index));
  const dockOpen = focusedNode !== null || focusedEdge !== null;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={handleKeyDown}
      /* Carries the reader's idle-motion choice AND their reduced-motion
         preference as one attribute, because turning the pulse off has to
         withdraw a declaration (display), and only a selector can retract a
         rule. See lib/idle-motion.ts. `data-af-idle-resume` rides beside it
         once the reader has toggled idle motion ON themselves: a re-applied
         gate restarts the pulse from zero, and this is what tells the
         stylesheet not to re-serve the entrance settle to a click (the
         resume block in styles/flowchart-motion.css). */
      data-af-idle={idleState}
      data-af-idle-resume={idleResumed ? "" : undefined}
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={paneRef}
          className={cn(
            "h-full overflow-auto bg-canvas p-3",
            zoom !== "fit" && "flex",
            zoom !== "fit" && "cursor-grab",
            panning && "cursor-grabbing",
          )}
          onClick={handleBackdropClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          tabIndex={0}
          role="application"
          aria-label={`Flowchart. Arrow keys move focus between nodes, Escape clears focus. Pinch or hold ${mod === "⌘" ? "Command" : "Control"} and scroll to zoom between 10 and 400 percent. Nodes and arrows are buttons — Tab reaches them.`}
        >
          {/* `m-auto` (not justify/align centring) so an overflowing zoomed
              chart keeps its top-left reachable — the sequence viewer
              documents the scroll-to-negative-offset trap this avoids. */}
          <div className={zoom === "fit" ? "h-full w-full" : "m-auto w-max"}>
            <FlowchartDiagram
              /* Bumped once when a hidden mount first becomes visible — the
                 remount restarts the CSS trace at the reader's first sight
                 (the hidden-mount banner above). Stable 0 everywhere else. */
              key={traceEpoch}
              layout={layout}
              title={file.metadata.title}
              tagColors={file.metadata.tagColors}
              focus={focus}
              zoom={zoom}
              onFocusNode={handleFocusNode}
              onFocusEdge={handleFocusEdge}
            />
          </div>
        </div>

        {/* ---- zoom pill (bottom-left, the house pattern) ---- */}
        <div className={cn("absolute bottom-3 left-3 z-10", ZOOM_PILL_CLASSES)}>
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            aria-label="Zoom out"
            title={ZOOM_OUT_TITLE}
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <ZoomMenu
            percent={zoom === "fit" ? 100 : Math.round(zoom * 100)}
            isFit={zoom === "fit"}
            maxZoom={ZOOM_MAX}
            onFit={applyFit}
            onZoomTo={(scale) => applyZoom(scale)}
            title="Choose a zoom level"
          />
          <button
            type="button"
            onClick={() => stepZoom(1)}
            aria-label="Zoom in"
            title={ZOOM_IN_TITLE}
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={applyFit}
            aria-label="Fit the whole diagram in view"
            title="Fit to view"
            className={ZOOM_BUTTON_CLASSES}
          >
            <Scan aria-hidden="true" className="size-4" />
          </button>
          {/* A hairline before the view-level toggle — everything above
              changes how much of the chart you see, this changes how it is
              drawn, and without the rule it reads as another zoom step (the
              sequence pill's reasoning, kept identical on purpose). */}
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/70" />
          {/* Idle-motion toggle — the sequence viewer's control down to the
              behaviour: aria-pressed, announced through the host's live
              region, persisted app-wide (one preference for all three
              canvases — see lib/idle-motion.ts), and DISABLED under reduced
              motion rather than pretending: the OS preference wins outright,
              and a toggle claiming to enable motion it will not run would be
              lying (aria-pressed reads false there for the same honesty). */}
          <button
            type="button"
            onClick={handleToggleIdle}
            disabled={reduced}
            aria-pressed={!reduced && idleMotion}
            aria-label={
              reduced
                ? "Idle motion unavailable — your system prefers reduced motion"
                : idleMotion
                  ? "Turn idle motion off"
                  : "Turn idle motion on"
            }
            title={
              reduced
                ? "Reduced motion is on"
                : idleMotion
                  ? "Idle motion: on"
                  : "Idle motion: off"
            }
            className={`${ZOOM_BUTTON_CLASSES} disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:text-foreground`}
          >
            <Waves aria-hidden="true" className="size-4" />
          </button>
        </div>

        {/* ---- the details dock: docked, non-blocking, overlays the pane ---- */}
        {dockOpen ? (
          <aside
            aria-label="Focus details"
            className={
              "absolute z-10 flex flex-col border-border bg-card/95 shadow-lg backdrop-blur-sm " +
              "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-72 max-md:rounded-t-xl max-md:border-t " +
              "md:top-0 md:right-0 md:bottom-0 md:w-72 md:border-l"
            }
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
              <h2 className="text-sm font-semibold text-foreground">
                {focusedNode !== null ? "Node details" : "Arrow details"}
              </h2>
              <button
                type="button"
                onClick={handleCloseDock}
                aria-label="Close details and clear focus"
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {focusedNode !== null ? (
                <dl className="flex flex-col gap-2.5">
                  <DockRow term="Label" value={focusedNode.label} />
                  <DockRow term="Shape" value={focusedNode.shape} mono />
                  {/* THE REASON THE DOCK EXISTS for a node with a `desc`: the
                      symbol shows the title, this shows what it is short for. */}
                  {focusedNode.description !== undefined ? (
                    <DockRow term="Details" value={focusedNode.description} />
                  ) : null}
                  {focusedNode.technology !== undefined ? (
                    <DockRow
                      term="Technology"
                      value={focusedNode.technology}
                      mono
                    />
                  ) : null}
                  {focusedNode.tags !== undefined ? (
                    <DockRow
                      term="Tags"
                      value={focusedNode.tags.map((t) => `#${t}`).join(" ")}
                      mono
                    />
                  ) : null}
                  {focusedNodeEdges.length > 0 ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Arrows
                      </dt>
                      <dd className="mt-1 flex flex-col gap-1">
                        {focusedNodeEdges.map((edge) => (
                          <button
                            key={edge.index}
                            type="button"
                            onClick={() => handleFocusEdge(edge.index)}
                            className="rounded-md border border-border bg-card px-2 py-1 text-left text-xs text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {describeEdge(edge)}
                          </button>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : focusedEdge !== null ? (
                <dl className="flex flex-col gap-2.5">
                  <DockRow
                    term="From"
                    value={nodeById.get(focusedEdge.from)?.label ?? ""}
                  />
                  <DockRow
                    term="To"
                    value={nodeById.get(focusedEdge.to)?.label ?? ""}
                  />
                  {focusedEdge.label !== undefined ? (
                    <DockRow term="Label" value={focusedEdge.label} />
                  ) : null}
                  {focusedEdge.back || focusedEdge.self ? (
                    <DockRow
                      term="Kind"
                      value={focusedEdge.self ? "self-loop" : "loops back"}
                      mono
                    />
                  ) : null}
                </dl>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function DockRow({
  term,
  value,
  mono = false,
}: {
  term: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm break-words text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
