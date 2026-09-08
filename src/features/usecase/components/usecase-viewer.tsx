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
// A deep import into the playground's input layer, as `flowchart-viewer.tsx`
// makes for its own revision type: the shape of a wording edit is the gesture
// module's to define, and this feature only fills it in.
import type { UseCaseElementRevision } from "@/features/playground/input/usecase-edit";
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
import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { useMeasuredScale } from "@/components/ui/use-measured-scale";
import { cn } from "@/lib/utils";

import type { LaidUseCaseEdge } from "../lib/layout";
import { layoutUseCase } from "../lib/layout";
import type { UseCaseFocus } from "./usecase-diagram";
import {
  resolveUseCaseFocus,
  USECASE_EDGE_KIND_LABEL,
  UseCaseDiagram,
} from "./usecase-diagram";
import { DockRow } from "@/components/ui/dock-row";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

/**
 * How far a press must travel before it stops being a click on a shape and
 * becomes a move.
 *
 * IN CSS PIXELS, MEASURED ON CLIENT COORDINATES. A threshold in the layout's
 * user units is a threshold that shrinks with the zoom: at the default "fit"
 * scale a diagram wider than its pane draws at well under 1:1, so two pixels
 * of hand jitter clear several user units and every click becomes a drag. A
 * pointer's tremor is a physical quantity, so its threshold has to be one too.
 *
 * MAINTAINED BY HAND against its twins — `NODE_DRAG_THRESHOLD` in
 * `flowchart-viewer.tsx`, `ENTITY_DRAG_THRESHOLD` in `er-viewer.tsx` and
 * `CANVAS_DRAG_THRESHOLD` in `sequence/lib/reorder.ts` — because a feature may
 * not deep-import another feature's internals and this has no home in
 * `src/lib` yet. Four copies is one too many; give it one.
 */
const ELEMENT_DRAG_THRESHOLD = 4;

/**
 * The gestures this canvas can send back, when editing is on.
 *
 * PRESENCE IS THE OFFER, the contract every editable canvas here keeps: the
 * whole bundle is `undefined` while the canvas is locked, read-only or in a
 * Mermaid pane, and the viewer then renders no editing chrome at all rather
 * than disabled controls. `editable` is the second half of the same answer for
 * a host that holds the handlers but cannot let them run yet.
 *
 * ONE GESTURE SERVES TWO SHAPES. An actor and a use case are one
 * `UseCaseElement` with a `kind`, so a drag on a stick figure and a drag on an
 * ellipse are the same edit — nothing here branches on kind, which is the
 * model being right rather than an omission (`usecase-edit.ts` says the same).
 *
 * NOTHING HERE IMPORTS THE PLAYGROUND. The host passes these in, the same
 * direction `FlowchartEditHandlers` points: this feature knows what a gesture
 * means geometrically and nothing about the text it becomes.
 */
export interface UseCaseEditHandlers {
  /**
   * Place `elementId`'s shape top-left at `position`, in the space the TEXT
   * records — which is what `UseCaseElement.position` holds unchanged, and
   * which is NOT the space the canvas draws in. The viewer takes the layout's
   * own shift off a dropped point first; `layoutShift` inside it carries why.
   *
   * TOP-LEFT, NOT THE CENTRE, even for an ellipse: `layoutUseCase` derives
   * `cx`/`cy` from a stated corner, and a pin read as a centre draws the
   * ellipse half a box up and left of where the author asked for it.
   */
  onMoveElement: (
    elementId: string,
    position: { x: number; y: number },
  ) => void;
  /** Hand one element back to the solver — its `(x,y)` and its `pin` both go,
   *  because a pin with no position is a document the parser refuses. */
  onReleaseElement: (elementId: string) => void;
  /** Set or clear one element's pin, which exempts it from a whole-diagram
   *  release. Pinning needs a position to keep. */
  onPinElement: (elementId: string, pinned: boolean) => void;
  /**
   * Rewrite one element's own wording — its label, its `[technology]`, its
   * `#tag`s and its `desc` detail. `id` and `kind` are not among them, and
   * `UseCaseElementRevision` carries why.
   *
   * OPTIONAL WHERE THE THREE ABOVE ARE NOT, because presence is the offer at
   * the level of ONE GESTURE here: placement and wording are separate cells of
   * `CANVAS_EDIT_OFFERS` (ADR 0003 gave this canvas the first without the
   * second), so `editable` beside them cannot answer for both — it is the
   * host's verdict on placement. A host that hands this handler over is a host
   * whose wording cell offers the ability, and the dock draws the fields only
   * then. Reading the grid from in here would be this feature importing the
   * playground, which is the direction this bundle exists to avoid.
   */
  onReviseElement?: (
    elementId: string,
    revision: UseCaseElementRevision,
  ) => void;
  /** False while the host holds the handlers but must not run them. */
  editable: boolean;
}

export function UseCaseViewer({
  file,
  onAnnounce,
  edit,
  lockSlot,
}: {
  file: UseCaseLabFile;
  /**
   * Where focus announcements go. The viewer owns no live region — the
   * hosting page renders the single polite region (two regions updated near
   * each other race, and the loser's announcement is swallowed; the
   * sequence viewer documents the contract).
   */
  onAnnounce: (message: string) => void;
  /** Editing gestures, or absent — see `UseCaseEditHandlers`. */
  edit?: UseCaseEditHandlers;
  /**
   * The canvas lock, mounted at the pane's own top-right corner exactly as the
   * C4, sequence and flowchart canvases mount theirs.
   *
   * A SLOT RATHER THAN A FLAG, and it lives on the canvas rather than in the
   * host's strip for the reason `67b35ae` bought: a lock that was correct in
   * `canvasEditability` and rendered only inside another notation's branch left
   * a whole canvas silently uneditable with no control anywhere to unlock it,
   * for a release, with every assertion green.
   *
   * DELIBERATELY NOT GATED ON `edit`: locking WITHDRAWS the handlers, so a lock
   * that only rendered alongside them could never be pressed to undo itself.
   */
  lockSlot?: React.ReactNode;
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
    /* Fitted against the DRAWN frame, not the canvas measured from the
       origin: a pin outside the solved bounds widens the former and not the
       latter, so fitting to `layout.width` would scale the picture as if the
       overhang were not there and then let the viewBox crop it. */
    return Math.min(width / layout.bounds.width, height / layout.bounds.height);
  }, [layout]);

  /* THE GROUND'S CAMERA. `zoom` is a MODE as often as it is a number, and the
     adaptive ladder needs the number — `screenPitch = worldPitch × scale`. Fit
     is therefore measured, and re-measured on resize, because the pane changes
     size when the source rail collapses and when immersive mode opens. This is
     the SAME camera the diagram is drawn at, resolved; not a second one. */
  const fitScale = useMeasuredScale(paneRef, measureFitScale);
  const groundScale = zoom === "fit" ? fitScale : zoom;

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

  /* ---- the move gesture --------------------------------------------------
   * IT COSTS NO NEW POINTER ARBITRATION, which is what made it addable to a
   * canvas that already drag-pans: `handlePointerDown` below already stands
   * down for any press inside `.af-uc-hit`, and the hit rect over every shape
   * carries that class — so the pan never sees the press that starts a move,
   * and a drag that both panned and placed is unreachable rather than merely
   * unlikely. The flowchart canvas stands down for `.af-flow-hit` the same
   * way. */

  const editing = edit !== undefined && edit.editable;
  /* THE WORDING GESTURE IS ITS OWN OFFER, held rather than tested as a
     boolean so the handler passed to the form is the one TypeScript has
     already seen is there. See `UseCaseEditHandlers.onReviseElement` for why
     it is not `editing` that answers for this. */
  const onReviseElement = edit?.onReviseElement;
  const svgRef = useRef<SVGSVGElement>(null);

  /**
   * THE LAYOUT'S OWN SHIFT — what has to come off a dropped point before it
   * can be written back as a position.
   *
   * This notation solves around its own origin and then slides the whole cast
   * into the margins and down under the heading, so a DRAWN point and the
   * `(x,y)` the text should state differ by a heading-height. Writing the
   * drawn point straight through would place the shape that far from the
   * cursor and walk it further on every drag — silently, with every check
   * green. The ER canvas needs no equivalent: `layoutEr` writes a stated
   * coordinate straight onto the box, which is why `ErEditHandlers` says
   * there is no offset to subtract and this one does.
   *
   * THIS WAS A PROBE AND IS NOT ANY MORE. It used to pin one element at the
   * origin, re-solve the whole document, and read the shift off where that
   * element landed. That was sound — the shift is a function of solved
   * geometry alone, so the probe could not perturb what it measured — but it
   * paid for a second full solve per document to recover a number
   * `layoutUseCase` already had. `UseCaseLayout.shift` reports it now; the
   * field's own note carries the argument, and `check:usecase-layout` asserts
   * that the reported shift is the one actually applied, which is what makes
   * reading it here as safe as measuring it was.
   */
  const layoutShift = layout.shift;

  /**
   * Client coordinates → LAYOUT units, through the SVG's own matrix.
   *
   * `getScreenCTM` rather than arithmetic on `zoom` and the pane's scroll
   * offsets: it already accounts for the viewBox — whose origin is
   * `layout.bounds.x`/`y` and goes NEGATIVE the moment something is pinned
   * left of or above the origin — for the `preserveAspectRatio` letterboxing
   * a fitted canvas introduces, and for any page transform above the pane.
   * Three things a hand-rolled conversion has to get right separately, one of
   * which changes with the pane's aspect ratio.
   */
  const toLayoutUnits = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      const matrix = svg?.getScreenCTM();
      if (svg == null || matrix == null) return null;
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(matrix.inverse());
      return { x: local.x, y: local.y };
    },
    [],
  );

  /**
   * The in-flight move: which element, and where its top-left would land.
   * `grab` is the offset from that corner to the pointer, so the shape does
   * not jump to centre itself under the cursor on the first move.
   *
   * `moved` is what separates a click from a drag. The hit rect is both the
   * focus target and the move handle, so a press that travels less than
   * `ELEMENT_DRAG_THRESHOLD` stays a click and focuses the element, and one
   * that travels further places it.
   */
  const [elementDrag, setElementDrag] = useState<{
    id: string;
    x: number;
    y: number;
    grab: { dx: number; dy: number };
    /** Where the press started, in CLIENT pixels — the threshold's own unit. */
    from: { clientX: number; clientY: number };
    moved: boolean;
  } | null>(null);

  const handleElementDragStart = useCallback(
    (id: string, event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      /* A MODIFIER-CLICK IS NOT A MOVE. The flowchart canvas shipped without
         this and any hand jitter past the threshold turned a modifier-click
         into a drag; the same three keys are the whole of the gesture's split
         wherever a canvas has one, so they are read identically here. */
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      const at = toLayoutUnits(event.clientX, event.clientY);
      const laid = elementById.get(id);
      if (at === null || laid === undefined) return;
      setElementDrag({
        id,
        x: laid.x,
        y: laid.y,
        grab: { dx: at.x - laid.x, dy: at.y - laid.y },
        from: { clientX: event.clientX, clientY: event.clientY },
        moved: false,
      });
      /* NO POINTER CAPTURE HERE, and the omission is the whole point: capture
         on pointerdown retargets the following `click` to the capturing
         element, so the shape's own `onClick` never runs and clicking an
         element stops focusing it. Capture is taken LAZILY in the move
         handler, on the first move that crosses the threshold — by which
         point there is a real drag to keep hold of and no click to protect. */
    },
    [elementById, toLayoutUnits],
  );

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
  /* ONE MOVE HANDLER, deciding between the two gestures rather than two
     handlers racing for one press — the flowchart canvas's arrangement. A move
     is in flight or a pan is; never both, because the press that starts one
     was refused by the other. */
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (elementDrag !== null) {
        const at = toLayoutUnits(event.clientX, event.clientY);
        if (at === null) return;
        const crossed =
          elementDrag.moved ||
          Math.abs(event.clientX - elementDrag.from.clientX) +
            Math.abs(event.clientY - elementDrag.from.clientY) >
            ELEMENT_DRAG_THRESHOLD;
        // See `handleElementDragStart`: capture only once this is really a
        // drag, so a click keeps its own target.
        if (crossed && !elementDrag.moved) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        setElementDrag({
          ...elementDrag,
          x: at.x - elementDrag.grab.dx,
          y: at.y - elementDrag.grab.dy,
          moved: crossed,
        });
        return;
      }
      const state = panState.current;
      if (state === null) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.moved && Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
      const pane = event.currentTarget;
      pane.scrollLeft = state.left - dx;
      pane.scrollTop = state.top - dy;
    },
    [elementDrag, toLayoutUnits],
  );
  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (elementDrag !== null) {
        setElementDrag(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        /* Under the threshold this was a click, and it is left alone: the
           shape's own `onClick` runs after this handler and focuses the
           element, which is what a press that went nowhere has always done. A
           zero-distance move would also write a coordinate the reader never
           asked for and opt the shape out of the solver for good. */
        if (!elementDrag.moved) return;
        /* The capture above already retargeted the trailing click to the pane,
           so suppress it there too — otherwise the drag ends by clearing the
           focus the reader was working with. */
        panSuppressesClick.current = true;
        /* MINUS THE LAYOUT'S OWN SHIFT — see `layoutShift`. Writing the drawn
           coordinate straight through would place the shape a heading's height
           and a margin away from the cursor, and do it again on every
           subsequent drag, so the shape walks off the page. */
        edit?.onMoveElement(elementDrag.id, {
          x: elementDrag.x - layoutShift.dx,
          y: elementDrag.y - layoutShift.dy,
        });
        return;
      }
      const state = panState.current;
      if (state === null) return;
      panState.current = null;
      setPanning(false);
      if (state.moved) panSuppressesClick.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [edit, elementDrag, layoutShift],
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
            /* THE GROUND, filling the pane rather than the drawing.
               `.af-canvas-rule` in globals.css carries the reversal and the
               reason `local` attachment is the whole panning mechanism. */
            CANVAS_RULE_CLASS,
            zoom !== "fit" && "flex",
            zoom !== "fit" && "cursor-grab",
            panning && "cursor-grabbing",
          )}
          style={groundFieldCss(groundScale)}
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
              svgRef={svgRef}
              onElementDragStart={editing ? handleElementDragStart : undefined}
              /* Only a drag that has really travelled reaches the canvas, so a
                 press that stays a click never nudges the shape it focuses. */
              elementDrag={elementDrag?.moved === true ? elementDrag : null}
            />
          </div>
        </div>

        {/* The lock, at the pane's top-right — the corner the C4, sequence and
            flowchart canvases all put theirs in, so a reader moving between
            the notations finds it in one place.

            IT SLIDES LEFT OF AN OPEN DOCK, the sequence canvas's fix for the
            same collision: the dock owns this corner while it is open, and two
            controls in one corner is how one of them ends up unreachable —
            which is exactly the failure the lock's own history is about. Below
            `md` the dock is a bottom sheet, so the corner is never contested
            there. */}
        {lockSlot !== undefined ? (
          <div
            className={cn(
              "absolute top-3 z-20",
              dockOpen ? "right-3 md:right-[18.75rem]" : "right-3",
            )}
          >
            {lockSlot}
          </div>
        ) : null}

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
                  {/* ---- wording: the same four facts, typed into rather
                      than read off, WHERE THEY ALREADY WERE. The dock this
                      canvas already opened to show an element's `desc` is the
                      surface, so nothing new appears beside the diagram and
                      the placement controls below keep their place — a second
                      panel would be two authoring surfaces for one model,
                      which is the refusal the C4 canvas's own dock replaced.

                      KEYED BY THE ELEMENT, so moving focus to another symbol
                      remounts the form with that symbol's values. A shared
                      instance would keep the fields a reader had half-typed
                      and submit them against a different element. */}
                  {onReviseElement !== undefined ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Wording
                      </dt>
                      <dd className="mt-1">
                        <ElementWordingForm
                          key={focusedElement.id}
                          element={{
                            id: focusedElement.id,
                            label: focusedElement.label,
                            technology: focusedElement.technology,
                            tags: focusedElement.tags,
                            description: focusedElement.description,
                          }}
                          onRevise={onReviseElement}
                        />
                      </dd>
                    </div>
                  ) : (
                    <>
                      <DockRow term="Label" value={focusedElement.label} />
                      {/* THE REASON THE DOCK EXISTS for an element with a
                          `desc`: the symbol shows the title, this shows what
                          it is short for. */}
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
                          value={focusedElement.tags
                            .map((t) => `#${t}`)
                            .join(" ")}
                          mono
                        />
                      ) : null}
                    </>
                  )}
                  {/* OUTSIDE THE BRANCH, in both: `kind` is the one field of
                      an element the dock states and the form refuses, so it
                      is read-only whether or not the wording is editable. */}
                  <DockRow term="Kind" value={focusedElement.kind} mono />
                  {/* ---- placement: the two gestures a pointer has that a
                      keyboard does not, plus the two that need a control
                      either way.

                      THE DRAG IS NAMED RATHER THAN LEFT TO BE DISCOVERED, the
                      flowchart dock's answer for its own pin gesture. Placing
                      a shape is a pointer gesture and there is no keyboard
                      nudge on any canvas here — but RELEASING one and PINNING
                      it are gestures of their own, and a gesture with no
                      control is a feature only a mouse can reach, so both are
                      buttons a Tab lands on.

                      THE CONTROLS APPEAR ONLY WHERE THEY CAN DO SOMETHING:
                      releasing a shape that states no `(x,y)` and pinning one
                      with no position to keep are both edits the gesture
                      module refuses, and a control that cannot change
                      anything is worse than its absence. */}
                  {editing ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Placement
                      </dt>
                      {(() => {
                        const stated = file.elements.find(
                          (element) => element.id === focusedElement.id,
                        );
                        if (stated?.position === undefined) {
                          return (
                            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Laid out from its boundary and its lines. Drag it
                              to place it yourself.
                            </dd>
                          );
                        }
                        return (
                          <dd className="mt-1 flex flex-col gap-2">
                            <span className="text-xs leading-relaxed text-muted-foreground">
                              Placed at {Math.round(stated.position.x)},{" "}
                              {Math.round(stated.position.y)}. Drag it to move
                              it.
                            </span>
                            <span className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  edit?.onReleaseElement(stated.id)
                                }
                                className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              >
                                Hand back to the layout
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  edit?.onPinElement(
                                    stated.id,
                                    stated.pinned !== true,
                                  )
                                }
                                aria-pressed={stated.pinned === true}
                                className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary"
                              >
                                {stated.pinned === true
                                  ? "Pinned against a sweep"
                                  : "Pin against a sweep"}
                              </button>
                            </span>
                          </dd>
                        );
                      })()}
                    </div>
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

/* -------------------------------------------------------------------------- */
/* The editable dock                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The dock's field styling, in one place — three inputs and a textarea share
 * it, and a fifth copy is how one of them ends up a pixel out from the others.
 *
 * `bg-canvas/60` IS THE SHARED ANSWER rather than a colour picked here: it is
 * the fill the flowchart dock and the C4 details panel use for the same job, a
 * control floating over a diagram. `check:canvas-chrome` lets that shade
 * through and fails a viewer reaching for a full-strength `bg-canvas` or
 * `bg-background`, because a notation grounding itself is how the ground
 * behind a diagram came to change shade when the reader changed notation.
 *
 * MAINTAINED BY HAND against `FIELD_CLASS` in `flowchart-viewer.tsx`, which
 * a feature may not deep-import from. The token is the part that has to agree,
 * and `check:canvas-chrome` is what watches it.
 */
const FIELD_CLASS =
  "w-full rounded-md border border-border bg-canvas/60 px-2 py-1 text-sm text-foreground " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const LABEL_CLASS = "text-xs font-medium text-muted-foreground";

/**
 * A focused element's own wording, editable in place.
 *
 * SUBMIT, NOT KEYSTROKE. Every gesture on this canvas is a source-text patch
 * and each one lands in the undo ring, so committing per character would fill
 * that ring with a letter apiece and rewrite the pane under a reader who is
 * still mid-word. The flowchart dock and the C4 details panel make the same
 * call.
 *
 * ONE FORM FOR BOTH SHAPES. An actor and a use case are one `UseCaseElement`
 * with a `kind`, so the fields a stick figure offers are the fields an ellipse
 * offers — nothing here branches on kind, which is the model being right
 * rather than an omission.
 */
function ElementWordingForm({
  element,
  onRevise,
}: {
  element: {
    id: string;
    label: string;
    technology?: string;
    tags?: readonly string[];
    description?: string;
  };
  onRevise: (elementId: string, revision: UseCaseElementRevision) => void;
}): React.JSX.Element {
  const [label, setLabel] = useState(element.label);
  const [technology, setTechnology] = useState(element.technology ?? "");
  /* Tags round-trip through ONE space-separated string rather than a chip
     editor, as the flowchart dock's do: the grammar writes them as `#a #b` on
     the element's own line, and a text field is the shape that matches what
     the author would have typed. The leading `#` is decoration here —
     accepted if typed, never required. */
  const [tags, setTags] = useState((element.tags ?? []).join(" "));
  const [description, setDescription] = useState(element.description ?? "");

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const parsedTags = tags
      .split(/[\s,]+/)
      .map((tag) => tag.replace(/^#/, ""))
      .filter((tag) => tag !== "");
    onRevise(element.id, {
      label: label.trim(),
      // An emptied box REMOVES the field — `undefined` is what the gesture
      // reads as "drop it", and a blank string would write `[""]` instead.
      technology: technology.trim() === "" ? undefined : technology.trim(),
      tags: parsedTags.length === 0 ? undefined : parsedTags,
      description: description.trim() === "" ? undefined : description.trim(),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-uc-label">
          Label
        </label>
        <input
          id="af-uc-label"
          className={FIELD_CLASS}
          value={label}
          required
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-uc-tech">
          Technology
        </label>
        <input
          id="af-uc-tech"
          className={FIELD_CLASS}
          value={technology}
          placeholder="Stripe"
          onChange={(event) => setTechnology(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-uc-tags">
          Tags
        </label>
        <input
          id="af-uc-tags"
          className={FIELD_CLASS}
          value={tags}
          placeholder="checkout billing"
          onChange={(event) => setTags(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-uc-desc">
          Details
        </label>
        <textarea
          id="af-uc-desc"
          className={FIELD_CLASS}
          rows={3}
          value={description}
          placeholder="What this use case is short for"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Apply
      </button>
    </form>
  );
}
