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
// Type-only, and a deep import for it: the playground's edit module is where
// these two shapes are defined and enforced, and re-declaring them here would
// be a second definition free to drift from the gestures that honour it.
import type {
  FlowEdgeRevision,
  FlowNodeRevision,
} from "@/features/playground/input/flowchart-edit";
import { GROUPED_FLOW_LABEL } from "@/features/playground/input/flowchart-edit";
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
import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { useMeasuredScale } from "@/components/ui/use-measured-scale";
import {
  CanvasModeToggle,
  type CanvasDragMode,
} from "@/components/ui/canvas-mode-toggle";
import { cn } from "@/lib/utils";

import type { LaidFlowEdge } from "../lib/layout";
import { layoutFlowchart } from "../lib/layout";
import type { FlowchartFocus } from "./flowchart-diagram";
import { FlowchartDiagram, resolveFlowFocus } from "./flowchart-diagram";
import { DockRow } from "@/components/ui/dock-row";

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

/**
 * How far a press must travel before it stops being a click on a step and
 * becomes a drag that pins it.
 *
 * IN CSS PIXELS, MEASURED ON CLIENT COORDINATES — not in the layout's user
 * units, which is what this was and which had it exactly backwards. A
 * threshold in user units is a threshold that shrinks with the zoom: at the
 * default "fit" scale a chart wider than its pane draws at well under 1:1, so
 * two pixels of hand jitter cleared three user units and a click became a
 * drag. The bug that surfaced it was a shift-click for grouping turning into a
 * pin. A pointer's tremor is a physical quantity, so its threshold has to be
 * one too.
 */
const NODE_DRAG_THRESHOLD = 4;

/** A marquee's two corners as a positive-extent rect, so a drag in any
 *  direction describes the same box. */
function marqueeBox(m: {
  from: { x: number; y: number };
  to: { x: number; y: number };
}): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(m.from.x, m.to.x),
    y: Math.min(m.from.y, m.to.y),
    width: Math.abs(m.to.x - m.from.x),
    height: Math.abs(m.to.y - m.from.y),
  };
}

/**
 * The gestures this canvas can send back, when editing is on.
 *
 * PRESENCE IS THE OFFER, as on the sequence canvas: the whole bundle is
 * `undefined` while the canvas is locked, read-only or in a Mermaid pane, and
 * the viewer then renders no editing chrome at all rather than disabled
 * controls. A control that cannot change anything is worse than its absence.
 *
 * AN EDGE IS ADDRESSED BY ITS INDEX in `file.edges`, which is also how the
 * focus model already addresses one. A flowchart edge has no id, and a
 * `from`/`to` pair is not a key — two arrows between the same nodes are legal
 * text. `flowchart-edit.ts` argues it at length.
 *
 * `onMoveNode` PINS rather than moves, and the distinction is worth the word:
 * a dragged step stops being solved from the arrows and stays where it was put
 * (`FlowchartNode.position`). ADR 0002 records that decision and supersedes
 * ADR 0001, which had refused it — read both before removing either.
 */
export interface FlowchartEditHandlers {
  /** Pin `nodeId` at a position in USER UNITS — the space the layout works in,
   *  which is what the host writes into the text unchanged. */
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onReviseNode: (nodeId: string, revision: FlowNodeRevision) => void;
  onReviseEdge: (index: number, revision: FlowEdgeRevision) => void;
  onConnectNodes: (from: string, to: string) => void;
  onDeleteEdge: (index: number) => void;
  /** Split the arrow at `index` — `a -> b` becomes `a -> new` and `new -> b`. */
  onInsertStep: (index: number) => void;
  /** Wrap a contiguous run of steps in a `group`. */
  onGroupNodes: (nodeIds: readonly string[], label: string) => void;
  /**
   * Why a connect from `from` to `to` would be declined, or `null` when it
   * would be accepted. Asked DURING the drag so the refusal can be shown at
   * the grip rather than after the drop — a gesture that completes and
   * silently changes nothing reads as a broken control.
   */
  connectRefusal: (from: string, to: string) => string | null;
  /**
   * Why grouping this selection would be declined, or `null`. Asked as the
   * selection is BUILT so the reason sits beside the control the reader is
   * about to press — a flowchart `group` can only wrap steps declared next to
   * each other, and that is not guessable from the picture.
   */
  groupRefusal: (nodeIds: readonly string[]) => string | null;
}

export function FlowchartViewer({
  file,
  onAnnounce,
  edit,
  lockSlot,
}: {
  file: FlowchartLabFile;
  /**
   * Where focus announcements go. The viewer owns no live region — the
   * hosting page renders the single polite region (two regions updated near
   * each other race, and the loser's announcement is swallowed; the sequence
   * viewer documents the same contract).
   */
  onAnnounce: (message: string) => void;
  /** Editing gestures, or absent — see `FlowchartEditHandlers`. */
  edit?: FlowchartEditHandlers;
  /**
   * The canvas lock, mounted at the pane's top-right corner exactly as the C4
   * and sequence canvases mount theirs.
   *
   * A SLOT RATHER THAN A FLAG, and it lives here rather than in the host's
   * strip for the reason `canvas-lock-button.tsx` records: a lock that was
   * correct in the model and rendered only in another branch left a whole
   * canvas silently uneditable with no control anywhere to unlock it.
   */
  lockSlot?: React.ReactNode;
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
    /* Fitted against the DRAWN frame, not the canvas measured from the
       origin: a pin outside the solved bounds widens the former and not the
       latter, so fitting to `layout.width` scaled the picture as if the
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

  /**
   * The in-flight PIN drag: which node, and where its top-left corner would
   * land. `grab` is the offset from that corner to the pointer, so the node
   * does not jump to centre itself under the cursor on the first move.
   *
   * `moved` is what separates a click from a drag. The node's hit rect is both
   * the focus target and the drag handle (see the diagram), so a press that
   * travels less than the threshold stays a click and focuses the node, and
   * one that travels further suppresses that click and pins instead.
   */
  const [nodeDrag, setNodeDrag] = useState<{
    id: string;
    x: number;
    y: number;
    grab: { dx: number; dy: number };
    /** Where the press started, in CLIENT pixels — see `NODE_DRAG_THRESHOLD`. */
    from: { clientX: number; clientY: number };
    moved: boolean;
  } | null>(null);
  /**
   * WHAT A BARE DRAG ON THE BACKGROUND DOES — Select (draws the marquee) or Pan
   * (moves the camera). The C4 canvas's contract verbatim, including Select as
   * the default: the toggle only appears on an editable canvas, and a reader
   * who unlocked it did so to edit.
   *
   * TAKEN FROM THE C4 CANVAS RATHER THAN INVENTED. This canvas first shipped
   * multi-select as a shift-click, which is not how the neighbouring canvas
   * works, so a reader who had learned one had not learned the other — the
   * failure `codebase.md` habit 2 names ("when adding the Nth of something,
   * open the (N-1)th and match it"). The held-key pan that toggle replaced was
   * reported broken three times over there; do not reintroduce it here.
   */
  const [dragMode, setDragMode] = useState<CanvasDragMode>("select");
  /* THE LASSO EXISTS ONLY WHERE IT CAN DO SOMETHING. On a locked, read-only or
     Mermaid-pane canvas there is no `edit` bundle, so a bare drag still pans —
     which is every shared link and every presentation, since the canvas locks
     by default. */
  const marqueeMode = edit !== undefined && dragMode === "select";
  /** The marquee in flight, in USER UNITS — the space the containment test and
   *  the drawn rect both work in, so neither converts. */
  const [marquee, setMarquee] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  /** The grouping selection — see `onToggleSelect` on the diagram for why it
   *  is a second set rather than a wider focus. Cleared after a group lands. */
  const [selection, setSelection] = useState<readonly string[]>([]);
  const handleToggleSelect = useCallback((id: string) => {
    setSelection((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);

  /** Client coordinates → user units, through the SVG's own matrix.
   *
   * `getScreenCTM` rather than arithmetic on the zoom and the scroll offsets:
   * it already accounts for the camera, the `preserveAspectRatio` letterboxing
   * that `"fit"` introduces, and any page transform above the pane — three
   * things a hand-rolled conversion has to get right separately, and one of
   * which changes with the pane's aspect ratio. */
  const toUserUnits = useCallback(
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

  /** The node under the pointer, read off the DOM rather than hit-tested
   *  again here — see the `data-af-flow-node` comment in the diagram. */
  const nodeUnderPointer = useCallback(
    (clientX: number, clientY: number): string | null => {
      const element = document.elementFromPoint(clientX, clientY);
      const hit = element?.closest?.("[data-af-flow-node]");
      return hit?.getAttribute("data-af-flow-node") ?? null;
    },
    [],
  );
  /**
   * A bare drag on the background. ONE ENTRY POINT that chooses between the
   * marquee and the pan, rather than two handlers racing for the same button.
   *
   * The C4 canvas achieves the same thing by DETACHING its marquee handlers in
   * Pan mode, because there a third party (React Flow's own `panOnDrag`) owns
   * the press it is standing down from. Here both gestures are this
   * component's, so choosing at pointerdown is the same guarantee with one
   * handler instead of two — and, as there, the pan owes nothing to keyboard
   * or focus state.
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if ((event.target as Element).closest?.(".af-flow-hit") != null) return;
      /* CHROME FLOATING OVER THE PANE OWNS ITS OWN PRESSES. The lasso and the
         pan belong to the canvas GROUND, and every overlay inside this pane —
         the grouping card, the padlock — is a child of it, so without this a
         press on one started a marquee, captured the pointer, and swallowed
         the click that never reached the button. Reported as "cannot click
         Clear"; the padlock had it too.

         MARKED, NOT LISTED: a new overlay carries the attribute and is covered,
         where a list here would have to be remembered. `check:canvas-edit`
         pins that every absolutely-positioned overlay in this pane has it. */
      if (
        (event.target as Element).closest?.("[data-af-flow-chrome]") != null
      ) {
        return;
      }
      if (marqueeMode) {
        const at = toUserUnits(event.clientX, event.clientY);
        if (at === null) return;
        setMarquee({ from: at, to: at });
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
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
    [marqueeMode, toUserUnits],
  );
  /* ---- connect: drag from a grip to another node -------------------------- */

  /**
   * The in-flight connect, in USER UNITS — the same space the chart is drawn
   * in, so the ghost line needs no second coordinate system.
   *
   * IT COSTS NO NEW POINTER ARBITRATION, which is the whole reason this could
   * be added to a canvas that already drag-pans. `handlePointerDown` above
   * already stands down for any press inside `.af-flow-hit`, and the grip
   * carries that class — so the pan never sees the press that starts a
   * connect, and a drag that both panned and drew is unreachable rather than
   * merely unlikely.
   */
  const [connectDrag, setConnectDrag] = useState<{
    from: string;
    x: number;
    y: number;
    over: string | null;
  } | null>(null);

  const handleNodeDragStart = useCallback(
    (id: string, event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      /* A MODIFIER-CLICK IS A SELECTION AND MUST NOT BECOME A DRAG. Without
         this, shift-clicking a step to group it started a pin drag, and any
         hand jitter past the threshold turned the selection into a move — so
         building a multi-step selection was, in practice, impossible. The
         modifier is checked in exactly one other place (the node's own
         `onClick`); these two are the whole of the gesture's split and they
         must agree, which is why both read the same three keys. */
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      const at = toUserUnits(event.clientX, event.clientY);
      const node = nodeById.get(id);
      if (at === null || node === undefined) return;
      setNodeDrag({
        id,
        x: node.x,
        y: node.y,
        grab: { dx: at.x - node.x, dy: at.y - node.y },
        from: { clientX: event.clientX, clientY: event.clientY },
        moved: false,
      });
      /* NO POINTER CAPTURE HERE, and that omission is the whole fix for a bug
         this shipped with: capturing on pointerdown retargets the following
         `click` to the pane, so the node's own `onClick` never ran and
         clicking a step stopped focusing it entirely. Capture is taken
         LAZILY instead, on the first move that crosses the drag threshold —
         by which point there is a real drag to keep hold of and no click to
         protect. */
    },
    [nodeById, toUserUnits],
  );

  const handleConnectStart = useCallback(
    (id: string, event: React.PointerEvent) => {
      const at = toUserUnits(event.clientX, event.clientY);
      if (at === null) return;
      setConnectDrag({ from: id, x: at.x, y: at.y, over: null });
      paneRef.current?.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [toUserUnits],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (nodeDrag !== null) {
        const at = toUserUnits(event.clientX, event.clientY);
        if (at === null) return;
        const x = at.x - nodeDrag.grab.dx;
        const y = at.y - nodeDrag.grab.dy;
        const crossed =
          nodeDrag.moved ||
          Math.abs(event.clientX - nodeDrag.from.clientX) +
            Math.abs(event.clientY - nodeDrag.from.clientY) >
            NODE_DRAG_THRESHOLD;
        // See `handleNodeDragStart`: capture only once this is really a drag,
        // so a click keeps its own target.
        if (crossed && !nodeDrag.moved) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        setNodeDrag({
          ...nodeDrag,
          x,
          y,
          moved: crossed,
        });
        return;
      }
      if (connectDrag !== null) {
        const at = toUserUnits(event.clientX, event.clientY);
        if (at === null) return;
        const over = nodeUnderPointer(event.clientX, event.clientY);
        setConnectDrag({
          from: connectDrag.from,
          x: at.x,
          y: at.y,
          /* Only a node the gesture would ACCEPT lights up. Highlighting one
             it is about to refuse would promise a drop that cannot happen —
             the refusal is the same one `flowConnectRefusal` will give, asked
             here so it is visible before the reader commits. */
          over:
            over !== null &&
            over !== connectDrag.from &&
            edit?.connectRefusal(connectDrag.from, over) == null
              ? over
              : null,
        });
        return;
      }
      if (marquee !== null) {
        const at = toUserUnits(event.clientX, event.clientY);
        if (at !== null) setMarquee({ from: marquee.from, to: at });
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
    [connectDrag, edit, marquee, nodeDrag, nodeUnderPointer, toUserUnits],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (nodeDrag !== null) {
        setNodeDrag(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        // Under the threshold: this was a click. Let it focus the node, which
        // is what the rect's own onClick does after this handler returns.
        if (!nodeDrag.moved) return;
        // Over it: suppress the trailing click so the drag does not also
        // change the selection out from under the reader.
        panSuppressesClick.current = true;
        /* MINUS THE LAYOUT'S OWN SHIFT. `nodeDrag` is in the space the canvas
           DRAWS in; `FlowchartNode.position` is in the space the layout SOLVES
           in, and the two differ by `layout.offset` because the rows are built
           around axis 0. Writing the drawn coordinate straight through put the
           step `offset.x` to the right of the cursor and did it again on every
           subsequent drag, so the step walked off the page. */
        edit?.onMoveNode(nodeDrag.id, {
          x: nodeDrag.x - layout.offset.x,
          y: nodeDrag.y - layout.offset.y,
        });
        return;
      }
      if (connectDrag !== null) {
        const target = nodeUnderPointer(event.clientX, event.clientY);
        setConnectDrag(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        // Dropped on empty canvas: the reader changed their mind. Silent, the
        // way abandoning any drag is.
        if (target === null || edit === undefined) return;
        const refusal = edit.connectRefusal(connectDrag.from, target);
        if (refusal !== null) {
          // SAID, not swallowed: the reader aimed at something and let go, so
          // "nothing happened" needs a reason attached to it.
          onAnnounce(refusal);
          return;
        }
        edit.onConnectNodes(connectDrag.from, target);
        return;
      }
      if (marquee !== null) {
        const box = marqueeBox(marquee);
        setMarquee(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        /* FULL CONTAINMENT, matching the C4 marquee and React Flow's own
           default: a box that merely clips a neighbour does not conscript it
           into a group. A drag too small to be a lasso (a click on empty
           canvas) selects nothing and falls through to the backdrop click,
           which clears focus as it always did. */
        if (box.width < 4 && box.height < 4) return;
        const covered = layout.nodes
          .filter(
            (node) =>
              node.x >= box.x &&
              node.y >= box.y &&
              node.x + node.width <= box.x + box.width &&
              node.y + node.height <= box.y + box.height,
          )
          .map((node) => node.id);
        // REPLACES rather than adds: a fresh lasso is a fresh selection, and
        // shift-click is the way to extend one.
        setSelection(covered);
        panSuppressesClick.current = true;
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
    [
      connectDrag,
      edit,
      layout,
      marquee,
      nodeDrag,
      nodeUnderPointer,
      onAnnounce,
    ],
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
  /* VALIDATED AT READ TIME, the discipline this viewer's header sets out: a
     re-parse can remove a selected step, and a stale id would make the group
     control offer one that is no longer there. */
  const liveSelection = selection.filter((id) => nodeById.has(id));
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
            /* THE CURSOR REPEATS THE MODE, as it does on the C4 canvas: the
               crosshair says a drag will lasso, the grab hand says it will
               pan. A mode with no cursor to match it is a mode the reader has
               to remember. */
            marqueeMode && "cursor-crosshair",
            !marqueeMode && zoom !== "fit" && "cursor-grab",
            !marqueeMode && panning && "cursor-grabbing",
          )}
          style={groundFieldCss(groundScale)}
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
              svgRef={svgRef}
              onConnectStart={
                edit === undefined ? undefined : handleConnectStart
              }
              connectDrag={connectDrag}
              onNodeDragStart={
                edit === undefined ? undefined : handleNodeDragStart
              }
              nodeDrag={nodeDrag?.moved === true ? nodeDrag : null}
              onToggleSelect={
                edit === undefined ? undefined : handleToggleSelect
              }
              selected={liveSelection}
              marquee={marquee === null ? null : marqueeBox(marquee)}
            />
          </div>
          {/* THE GROUPING BAR, present only while a selection exists — the
              gesture's one control, and the only place its refusal is shown.
              Bottom-left so it clears the lock at the top right and the dock
              down the right-hand side. */}
          {edit !== undefined && liveSelection.length > 0 ? (
            /* ABOVE the mode toggle, which owns the bottom-left corner now.
               Two overlays in one corner is how a control ends up unreachable
               on a short pane. */
            <div
              data-af-flow-chrome
              className="absolute bottom-16 left-3 z-20 flex max-w-[min(24rem,calc(100%-1.5rem))] flex-col gap-2 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm"
            >
              <p className="text-xs font-medium text-foreground">
                {liveSelection.length === 1
                  ? "1 step selected"
                  : `${liveSelection.length} steps selected`}
              </p>
              {(() => {
                const refusal = edit.groupRefusal(liveSelection);
                return refusal === null ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        edit.onGroupNodes(liveSelection, GROUPED_FLOW_LABEL);
                        setSelection([]);
                      }}
                      className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Group these steps
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelection([])}
                      className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  /* THE SENTENCE, NOT A DISABLED BUTTON WITH A TOOLTIP. The
                     reason names the steps in the way, which is exactly what
                     the reader needs in order to fix the selection — a greyed
                     control would hide it. */
                  <>
                    <p className="text-xs text-muted-foreground">{refusal}</p>
                    <button
                      type="button"
                      onClick={() => setSelection([])}
                      className="self-start rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Clear
                    </button>
                  </>
                );
              })()}
            </div>
          ) : null}
          {/* The lock, at the pane's top-right — the same corner the C4 and
              sequence canvases put theirs, so a reader moving between the
              three notations finds it in one place. */}
          {lockSlot !== undefined ? (
            <div data-af-flow-chrome className="absolute top-2 right-2 z-20">
              {lockSlot}
            </div>
          ) : null}
        </div>

        {/* ---- the drag mode, beside the zoom pill: the C4 canvas's own
              placement, so a reader moving between the two canvases finds it
              in one place. Only where it can do something — see
              `marqueeMode`. ---- */}
        {edit !== undefined ? (
          <div className="absolute bottom-3 left-3 z-10">
            <CanvasModeToggle mode={dragMode} onModeChange={setDragMode} />
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
              {focusedNode !== null && edit !== undefined ? (
                /* KEYED BY THE NODE, so moving focus to another symbol
                   remounts the form with that symbol's values. A shared
                   instance would keep the fields the reader had half-typed and
                   submit them against a different node — the C4 edge form
                   carries the same key for the same reason. */
                <NodeEditForm
                  key={focusedNode.id}
                  inSelection={liveSelection.includes(focusedNode.id)}
                  onToggleSelect={handleToggleSelect}
                  node={{
                    id: focusedNode.id,
                    shape: focusedNode.shape,
                    label: focusedNode.label,
                    technology: focusedNode.technology,
                    tags: focusedNode.tags,
                    description: focusedNode.description,
                  }}
                  edges={focusedNodeEdges.map((e) => ({
                    index: e.index,
                    label: describeEdge(e),
                  }))}
                  onFocusEdge={handleFocusEdge}
                  onRevise={edit.onReviseNode}
                />
              ) : focusedEdge !== null && edit !== undefined ? (
                <EdgeEditForm
                  key={focusedEdge.index}
                  index={focusedEdge.index}
                  from={nodeById.get(focusedEdge.from)?.label ?? ""}
                  to={nodeById.get(focusedEdge.to)?.label ?? ""}
                  label={focusedEdge.label}
                  onRevise={edit.onReviseEdge}
                  onDelete={edit.onDeleteEdge}
                  onInsert={edit.onInsertStep}
                />
              ) : focusedNode !== null ? (
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

/* -------------------------------------------------------------------------- */
/* The editable dock                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The dock's field styling, in one place. Three inputs and a textarea share it,
 * and a fourth copy is how one of them ends up a pixel out from the others.
 *
 * `bg-canvas/60` IS THE SHARED ANSWER, not a colour picked here: it is the fill
 * the C4 details panel's `FIELD_CLASSES` uses for the same job — a control
 * floating over a diagram — and `check:canvas-chrome` fails a viewer that
 * reaches for a full-strength `bg-background` or `bg-canvas`, because a
 * notation grounding itself is how the ground behind a diagram came to change
 * shade when the reader changed notation.
 *
 * NOT EXTRACTED INTO ONE CONSTANT WITH THAT PANEL, deliberately: its fields are
 * `text-xs` with a top margin because its labels WRAP their control, and these
 * are `text-sm` in a gap-spaced column. Unifying would change how that panel
 * looks to save a line. The token is the part that has to agree, and it does.
 */
const FIELD_CLASS =
  "w-full rounded-md border border-border bg-canvas/60 px-2 py-1 text-sm text-foreground " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const LABEL_CLASS = "text-xs font-medium text-muted-foreground";

/**
 * A selected step's own fields, editable in place.
 *
 * SUBMIT, NOT KEYSTROKE. Every gesture on this canvas is a source-text patch
 * and each one lands in the undo ring, so committing per character would fill
 * that ring with a letter apiece and rewrite the pane under a reader who is
 * still mid-word. The C4 details panel makes the same call.
 *
 * `shape` IS NOT A FIELD HERE, and its absence is deliberate rather than an
 * omission — changing a step to a decision changes what its outgoing edges
 * MEAN. It is shown, read-only, so the dock still says what the symbol is.
 */
function NodeEditForm({
  node,
  edges,
  onFocusEdge,
  onRevise,
  inSelection,
  onToggleSelect,
}: {
  node: {
    id: string;
    shape: string;
    label: string;
    technology?: string;
    tags?: readonly string[];
    description?: string;
  };
  edges: readonly { index: number; label: string }[];
  onFocusEdge: (index: number) => void;
  onRevise: (nodeId: string, revision: FlowNodeRevision) => void;
  /** This step is in the grouping selection. */
  inSelection: boolean;
  /** Add or remove it — the KEYBOARD path to the grouping gesture. */
  onToggleSelect: (id: string) => void;
}): React.JSX.Element {
  const [label, setLabel] = useState(node.label);
  const [technology, setTechnology] = useState(node.technology ?? "");
  /* Tags round-trip through ONE space-separated string rather than a chip
     editor: the grammar writes them as `#a #b` on the node's own line, and a
     text field is the shape that matches what the author would have typed. The
     leading `#` is decoration here — accepted if typed, never required. */
  const [tags, setTags] = useState((node.tags ?? []).join(" "));
  const [description, setDescription] = useState(node.description ?? "");

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const parsedTags = tags
      .split(/[\s,]+/)
      .map((tag) => tag.replace(/^#/, ""))
      .filter((tag) => tag !== "");
    onRevise(node.id, {
      label: label.trim(),
      // An emptied box REMOVES the field — `undefined` is what the gesture
      // reads as "drop it", and a blank string would write `[]` or `""`.
      technology: technology.trim() === "" ? undefined : technology.trim(),
      tags: parsedTags.length === 0 ? undefined : parsedTags,
      description: description.trim() === "" ? undefined : description.trim(),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-flow-label">
          Label
        </label>
        <input
          id="af-flow-label"
          className={FIELD_CLASS}
          value={label}
          required
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <DockRow term="Shape" value={node.shape} mono />
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-flow-tech">
          Technology
        </label>
        <input
          id="af-flow-tech"
          className={FIELD_CLASS}
          value={technology}
          placeholder="Go 1.22"
          onChange={(event) => setTechnology(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-flow-tags">
          Tags
        </label>
        <input
          id="af-flow-tags"
          className={FIELD_CLASS}
          value={tags}
          placeholder="checkout retry"
          onChange={(event) => setTags(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-flow-desc">
          Details
        </label>
        <textarea
          id="af-flow-desc"
          className={FIELD_CLASS}
          rows={3}
          value={description}
          placeholder="What this step is short for"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Apply
      </button>
      {edges.length > 0 ? (
        <div>
          <p className={LABEL_CLASS}>Arrows</p>
          <div className="mt-1 flex flex-col gap-1">
            {edges.map((edge) => (
              <button
                key={edge.index}
                type="button"
                onClick={() => onFocusEdge(edge.index)}
                className="rounded-md border border-border bg-card px-2 py-1 text-left text-xs text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {edge.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {/* THE KEYBOARD PATH TO GROUPING. Shift-click is the pointer gesture and
          a keyboard has no shift-click, so without this control the whole
          grouping feature was reachable by pointer only — the dock is where a
          keyboard reader already is, having tabbed to this step. */}
      <button
        type="button"
        onClick={() => onToggleSelect(node.id)}
        aria-pressed={inSelection}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {inSelection ? "Remove from selection" : "Add to selection"}
      </button>
      {/* The two gestures a pointer has that a keyboard does not, named where a
          reader will find them rather than left to be discovered. */}
      <p className="text-xs text-muted-foreground">
        Drag this step to pin it where you drop it, or drag the handle under it
        onto another step to connect them. Shift-click also adds a step to the
        selection.
      </p>
    </form>
  );
}

/**
 * A selected arrow's guard label — and its removal.
 *
 * BY INDEX, which is also how the focus model addresses an arrow: this grammar
 * gives an edge no id, and two arrows between the same pair of steps are legal
 * text, so a `from`/`to` pair would not identify one.
 */
function EdgeEditForm({
  index,
  from,
  to,
  label,
  onRevise,
  onDelete,
  onInsert,
}: {
  index: number;
  from: string;
  to: string;
  label?: string;
  onRevise: (index: number, revision: FlowEdgeRevision) => void;
  onDelete: (index: number) => void;
  onInsert: (index: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(label ?? "");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onRevise(index, {
          label: draft.trim() === "" ? undefined : draft.trim(),
        });
      }}
      className="flex flex-col gap-3"
    >
      <DockRow term="From" value={from} />
      <DockRow term="To" value={to} />
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-flow-edge-label">
          Label
        </label>
        <input
          id="af-flow-edge-label"
          className={FIELD_CLASS}
          value={draft}
          placeholder="yes"
          onChange={(event) => setDraft(event.target.value)}
        />
        {/* The one thing a reader cannot see from the diagram: on an arrow
            leaving a decision this field IS the branch condition. */}
        <p className="text-xs text-muted-foreground">
          On an arrow out of a decision, this is the branch&rsquo;s condition.
        </p>
      </div>
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Apply
      </button>
      {/* REMOVAL IS THE ARROW'S, NOT THE STEP'S. Both steps stay declared, and
          the announcement says so — including when the removal leaves one with
          nothing pointing at it. Node removal is a separate change; its verdict
          has three questions this one does not (`deletedFlowEdgeEdit`). */}
      {/* SPLITTING THE ARROW is `create` on this notation — the new step's
          place is "between these two", which is what two edges spell, so no
          coordinate is needed and none is written. */}
      <button
        type="button"
        onClick={() => onInsert(index)}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Insert a step into this arrow
      </button>
      <button
        type="button"
        onClick={() => onDelete(index)}
        className="rounded-md border border-destructive px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Remove this arrow
      </button>
    </form>
  );
}
