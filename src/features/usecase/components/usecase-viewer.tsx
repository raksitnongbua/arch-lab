"use client";

/**
 * The use-case VIEWER: layout + focus + camera, composed around the pure
 * `UseCaseDiagram` renderer — the same division of labour as
 * `FlowchartViewer` / `FlowchartDiagram`, and deliberately the same
 * interaction vocabulary, so a reader who has learned one canvas has
 * learned them all:
 *
 *   - Clicking an ELEMENT emphasises it, keeps its incident lines and their
 *     far ends lit, and opens the details dock — where an element's `desc`
 *     lives (the model deliberately never draws it inside the symbol).
 *   - Clicking a LINE keeps its two endpoints lit and names the
 *     relationship.
 *   - Everything else recedes on opacity; Escape, the dock's close button
 *     or a click on empty canvas brings the full diagram back.
 *   - Zoom is the house camera verbatim: "fit" as the default mode, numeric
 *     scales past it, drag-to-pan on empty canvas, ctrl/⌘-scroll and
 *     trackpad pinch claimed and clamped.
 *
 * IDLE MOTION, on the same terms as its flowchart sibling: the app-wide
 * preference in `lib/idle-motion.ts`, read here and stamped as `data-af-idle`
 * on the root, with the toggle in the zoom pill. This viewer once deliberately
 * lacked it — the argument was that a use-case diagram has no flow for light
 * to travel along — and that argument still shapes WHAT moves (dependencies
 * walk their own dash; associations swell in place, never travel, because a
 * travelling band would imply a direction an association does not have) but no
 * longer whether anything does. One preference across all four canvases, read
 * through the one module, because "stop the diagrams moving" is a statement
 * about diagrams rather than about a route.
 *
 * REDUCED MOTION costs this model nothing: the complete diagram is the
 * resting state, dimming transitions are parked by `motion-reduce:` classes
 * in the renderer, and the reveal is gated on `prefers-reduced-motion:
 * no-preference` in CSS, never in JS, because it plays at first paint where
 * no hook has run yet. The ONE deliberate replay is the hidden-mount
 * restart below (the flowchart viewer's mechanism, same shipped-bug
 * rationale): a diagram that mounted in a background tab replays its reveal
 * at the reader's first actual look, because a CSS animation's clock is
 * wall time and burns unseen otherwise.
 *
 * Focus is VALIDATED at read time (a re-parse can remove the focused
 * element) rather than synchronised by effects — no setState in an effect
 * body, the discipline every sibling viewer cites.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scan, Waves, X, ZoomIn, ZoomOut } from "lucide-react";

import type { UseCaseLabFile } from "@/types";
import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
  ZOOM_STEP,
} from "@/components/ui/zoom-pill";
import {
  idleMotionState,
  readIdleMotion,
  useIdleMotion,
  useReducedMotion,
  writeIdleMotion,
} from "@/lib/idle-motion";
import { useModKey } from "@/lib/mod-key";
import { cn } from "@/lib/utils";

import type { LaidUseCaseEdge } from "../lib/layout";
import { layoutUseCase } from "../lib/layout";
import type { UseCaseFocus } from "./usecase-diagram";
import {
  resolveUseCaseFocus,
  USECASE_EDGE_KIND_LABEL,
  UseCaseDiagram,
} from "./usecase-diagram";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

export function UseCaseViewer({
  file,
  onAnnounce,
}: {
  file: UseCaseLabFile;
  /**
   * Where focus announcements go. The viewer owns no live region — the
   * hosting page renders the single polite region (two regions updated near
   * each other race, and the loser's announcement is swallowed; the
   * sequence viewer documents the contract).
   */
  onAnnounce: (message: string) => void;
}): React.JSX.Element {
  // ONE layout call per model — the single source of geometric truth.
  const layout = useMemo(() => layoutUseCase(file), [file]);
  const elementById = useMemo(
    () => new Map(layout.elements.map((e) => [e.id, e])),
    [layout],
  );
  const mod = useModKey();

  /* ---- the reveal vs a hidden mount (the flowchart viewer's banner, same
   * shipped bug): a share link opened in a background tab burns its CSS
   * reveal unseen; remount the diagram subtree at first visibility so it
   * plays at the reader's first actual look. Installed only when the mount
   * itself was hidden, detached after firing once — later tab switches
   * never replay. */
  const [revealEpoch, setRevealEpoch] = useState(0);
  useEffect(() => {
    if (document.visibilityState !== "hidden") return;
    const onVisible = (): void => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      setRevealEpoch((epoch) => epoch + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const [rawFocus, setRawFocus] = useState<NonNullable<UseCaseFocus> | null>(
    null,
  );
  // Validated at read time: a focus pointing at nothing reads as no focus.
  const focus: UseCaseFocus =
    rawFocus === null
      ? null
      : rawFocus.kind === "element"
        ? elementById.has(rawFocus.id)
          ? rawFocus
          : null
        : layout.edges.some((e) => e.index === rawFocus.index)
          ? rawFocus
          : null;

  /* ---- focus ------------------------------------------------------------- */

  const describeEdge = useCallback(
    (edge: LaidUseCaseEdge): string => {
      const from = elementById.get(edge.from)?.label ?? edge.from;
      const to = elementById.get(edge.to)?.label ?? edge.to;
      const label = edge.labelLines.join(" ");
      return (
        `${USECASE_EDGE_KIND_LABEL[edge.kind]}: ${from} ${
          edge.kind === "generalization" ? "is a" : "to"
        } ${to}` + (label === "" ? "" : ` — ${label}`)
      );
    },
    [elementById],
  );

  const handleFocusElement = useCallback(
    (id: string) => {
      setRawFocus({ kind: "element", id });
      const element = elementById.get(id);
      if (element === undefined) return;
      const degree = layout.edges.filter(
        (e) => e.from === id || e.to === id,
      ).length;
      onAnnounce(
        `Focused ${element.kind === "actor" ? "actor" : "use case"} ${element.label} — ${degree} relationship${degree === 1 ? "" : "s"}.` +
          (element.description !== undefined
            ? ` Details: ${element.description.split("\n").join(". ")}.`
            : "") +
          " Details open beside the diagram; Escape clears focus.",
      );
    },
    [layout, elementById, onAnnounce],
  );

  const handleFocusEdge = useCallback(
    (index: number) => {
      setRawFocus({ kind: "edge", index });
      const edge = layout.edges.find((e) => e.index === index);
      if (edge === undefined) return;
      onAnnounce(`Focused ${describeEdge(edge)}. Escape clears focus.`);
    },
    [layout, describeEdge, onAnnounce],
  );

  const handleClearFocus = useCallback(() => {
    if (focus !== null) onAnnounce("Focus cleared.");
    setRawFocus(null);
  }, [focus, onAnnounce]);

  const paneRef = useRef<HTMLDivElement>(null);
  const handleCloseDock = useCallback(() => {
    // The close button unmounts with the dock; re-home keyboard focus on
    // the pane so "close details, keep exploring" stays pure keyboard.
    handleClearFocus();
    paneRef.current?.focus();
  }, [handleClearFocus]);

  /* ---- Escape on window — the page ladder every canvas keeps: fire
     wherever DOM focus sits, run before any shell listener, preventDefault
     as the "consumed" signal. */
  const focusRef = useRef<UseCaseFocus>(null);
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

  /* ---- zoom (the house camera, same constants) ----------------------------- */

  const [zoom, setZoom] = useState<number | "fit">("fit");

  const measureFitScale = useCallback((): number => {
    const pane = paneRef.current;
    if (pane === null) return 1;
    const width = pane.clientWidth - 24;
    const height = pane.clientHeight - 24;
    if (width <= 0 || height <= 0) return 1;
    return Math.min(width / layout.width, height / layout.height);
  }, [layout]);

  /** Scroll anchor kept across a zoom — fractions of the scrollable
   * content, the both-modes-safe quantity the sequence viewer derives. */
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
    onAnnounce("Diagram fitted to view — the whole diagram is on screen.");
  }, [onAnnounce]);

  /* ---- trackpad pinch / ctrl+wheel, claimed and clamped — the sequence
     viewer carries the full design notes; this is the same wiring. */
  const pinchTarget = useRef<number | null>(null);
  const pinchFrame = useRef<number | null>(null);
  /* The OS preference, read for the TOGGLE's honesty only — the stylesheet's
     own media gate is what actually suppresses motion, and it holds before
     hydration where this hook cannot. */
  const reduced = useReducedMotion();
  /* The reader's app-wide toggle and their OS preference, folded into one
     attribute by the shared `idleMotionState` — the flowchart shell's exact
     wiring, never a second way to read the preference. Reduced motion wins
     twice: here, and again in the stylesheet's own media gate, which is what
     holds before hydration. */
  const idleMotion = useIdleMotion();
  const idleState = idleMotionState(reduced, idleMotion);
  /* Set only by the toggle's ON edge, never at load: an explicit ON must
     answer promptly, while the initial settle keeps its reason to wait. */
  const [idleResumed, setIdleResumed] = useState(false);

  const handleToggleIdle = useCallback(() => {
    const next = !readIdleMotion();
    writeIdleMotion(next);
    if (next) setIdleResumed(true);
    onAnnounce(
      next
        ? "Idle motion on — dependencies walk and associations breathe."
        : "Idle motion off — the diagram holds still until you focus something.",
    );
  }, [onAnnounce]);

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
     The pane is a real scroll container; a moved drag swallows its trailing
     click so panning never clears focus. */
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
      if ((event.target as Element).closest?.(".af-uc-hit") != null) return;
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
     interactive element inside the SVG stops propagation). The client-size
     guard exempts scrollbar gutters. */
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

  /* Arrow keys walk element focus in DECLARATION order — the author's
     reading order, which the model calls out as data. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (layout.elements.length === 0) return;
      const currentIndex =
        focus?.kind === "element"
          ? layout.elements.findIndex((e) => e.id === focus.id)
          : -1;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          handleFocusElement(
            layout.elements[
              Math.min(currentIndex + 1, layout.elements.length - 1)
            ].id,
          );
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          handleFocusElement(layout.elements[Math.max(0, currentIndex - 1)].id);
          break;
        default:
          break;
      }
    },
    [focus, layout, handleFocusElement],
  );

  /* ---- render -------------------------------------------------------------- */

  const focusedElement =
    focus?.kind === "element" ? (elementById.get(focus.id) ?? null) : null;
  const focusedEdge =
    focus?.kind === "edge"
      ? (layout.edges.find((e) => e.index === focus.index) ?? null)
      : null;
  const focusSet = resolveUseCaseFocus(layout, focus);
  const focusedElementEdges =
    focusedElement === null || focusSet === null
      ? []
      : layout.edges.filter((e) => focusSet.edges.has(e.index));
  const dockOpen = focusedElement !== null || focusedEdge !== null;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={handleKeyDown}
      /* Carries the reader's idle-motion choice AND their reduced-motion
         preference, folded by `idleMotionState`. The stylesheet's idle block
         reads it; see lib/idle-motion.ts. */
      data-af-idle={idleState}
      {...(idleResumed ? { "data-af-idle-resume": "" } : {})}
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={paneRef}
          className={cn(
            /* NO GROUND OF ITS OWN: the well is painted by the host that owns
               the pane — see `components/ui/diagram-well.tsx`. This box wore
               `bg-canvas` while five sibling notations wore nothing, which is
               how the ground behind a diagram came to change shade with the
               notation. */
            "h-full overflow-auto p-3",
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
          aria-label={`Use-case diagram. Arrow keys move focus between elements, Escape clears focus. Pinch or hold ${mod === "⌘" ? "Command" : "Control"} and scroll to zoom between 10 and 400 percent. Elements and lines are buttons — Tab reaches them.`}
        >
          {/* `m-auto` (not justify/align centring) so an overflowing zoomed
              diagram keeps its top-left reachable — the sequence viewer
              documents the scroll-to-negative-offset trap this avoids. */}
          <div className={zoom === "fit" ? "h-full w-full" : "m-auto w-max"}>
            <UseCaseDiagram
              /* Bumped once when a hidden mount first becomes visible — the
                 remount restarts the CSS reveal at the reader's first sight
                 (the hidden-mount banner above). Stable 0 everywhere else. */
              key={revealEpoch}
              layout={layout}
              title={file.metadata.title}
              tagColors={file.metadata.tagColors}
              focus={focus}
              zoom={zoom}
              onFocusElement={handleFocusElement}
              onFocusEdge={handleFocusEdge}
            />
          </div>
        </div>

        {/* ---- zoom pill (bottom-right, the house pattern) ---- */}
        <div
          className={cn("absolute right-3 bottom-3 z-10", ZOOM_PILL_CLASSES)}
        >
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
          {/* Idle-motion toggle — the flowchart and sequence viewers' control
              down to the behaviour: aria-pressed, announced through the host's
              live region, persisted app-wide (ONE preference for all four
              canvases — see lib/idle-motion.ts), and DISABLED under reduced
              motion rather than pretending, because the OS preference wins
              outright and a toggle claiming to enable motion it will not run
              would be lying. */}
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
                {focusedElement !== null
                  ? focusedElement.kind === "actor"
                    ? "Actor details"
                    : "Use-case details"
                  : "Relationship details"}
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
              {focusedElement !== null ? (
                <dl className="flex flex-col gap-2.5">
                  <DockRow term="Label" value={focusedElement.label} />
                  <DockRow term="Kind" value={focusedElement.kind} mono />
                  {/* THE REASON THE DOCK EXISTS for an element with a
                      `desc`: the symbol shows the title, this shows what it
                      is short for. */}
                  {focusedElement.description !== undefined ? (
                    <DockRow
                      term="Details"
                      value={focusedElement.description}
                    />
                  ) : null}
                  {focusedElement.technology !== undefined ? (
                    <DockRow
                      term="Technology"
                      value={focusedElement.technology}
                      mono
                    />
                  ) : null}
                  {focusedElement.tags !== undefined ? (
                    <DockRow
                      term="Tags"
                      value={focusedElement.tags.map((t) => `#${t}`).join(" ")}
                      mono
                    />
                  ) : null}
                  {focusedElementEdges.length > 0 ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Relationships
                      </dt>
                      <dd className="mt-1 flex flex-col gap-1">
                        {focusedElementEdges.map((edge) => (
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
                    term="Kind"
                    value={USECASE_EDGE_KIND_LABEL[focusedEdge.kind]}
                    mono
                  />
                  <DockRow
                    term="From"
                    value={elementById.get(focusedEdge.from)?.label ?? ""}
                  />
                  <DockRow
                    term="To"
                    value={elementById.get(focusedEdge.to)?.label ?? ""}
                  />
                  {focusedEdge.labelLines.length > 0 ? (
                    <DockRow
                      term="Label"
                      value={focusedEdge.labelLines.join(" ")}
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
