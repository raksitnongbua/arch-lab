"use client";

/**
 * The sequence VIEWER: layout + focus, composed around the pure
 * `SequenceDiagram` renderer. This component owns every piece of interaction
 * state; the renderer below it stays a function of (layout, focus).
 *
 * THE DIAGRAM IS COMPLETE FROM FIRST PAINT. There is no playback: a sequence
 * diagram is a record of what happened, and the record is the content — so
 * the whole story is on screen immediately, and the animation budget is
 * spent where it answers a question the user just asked:
 *
 *   - Clicking a MESSAGE (its arrow OR its label — one hit target covers
 *     both) re-draws that one arrow (the stroke-dashoffset draw in
 *     sequence-motion.css) and holds it emphasised; the DETAILS DOCK (a
 *     side panel on the diagram's right, a bottom sheet below `md`) names
 *     sender and receiver with their technologies, the message's own
 *     technology, kind, `Message N of M`, and the fragment guard path it
 *     sits inside (`alt [card accepted] › par [receipt]`).
 *   - Clicking a PARTICIPANT re-draws its whole message set in step order,
 *     lightly staggered so it reads as one gesture; the dock lists every
 *     message it takes part in, each one a button that re-focuses it.
 *   - Clicking a FRAGMENT's kind chip re-draws every message in the
 *     fragment — all branches, nested fragments included; clicking a branch
 *     GUARD label re-draws just that branch's flow. The step sets come from
 *     the layout (LaidFragment.steps / .branches), never recomputed here;
 *     the dock names the fragment, the branch, the participants, and the
 *     flow's messages as the same re-focusing buttons.
 *   - Everything outside the focus set recedes (opacity only); Escape — or
 *     clicking empty canvas, or the dock's close button — brings the full
 *     diagram back.
 *
 * THE DOCK IS NOT A MODAL — deliberately. The request behind it said
 * "modal", but the entire point of this view is clicking AROUND the diagram
 * while reading details, and a dialog (focus trap, backdrop, inert page)
 * would forbid exactly that. It is a docked, non-blocking side panel; do
 * not "fix" it into a <dialog>. See the aside in the render for how it
 * avoids reflowing the diagram when it opens.
 *
 * Re-clicking a focused target REPLAYS its animation: every focus gesture
 * bumps `focusNonce`, and the diagram maps the nonce's parity onto one of
 * two identical keyframe animations — see the `focusNonce` prop in
 * sequence-diagram.tsx for why parity rather than the raw number.
 *
 * REDUCED MOTION costs this model nothing: the complete diagram was already
 * the resting state. The focus draw simply does not animate (every `--seq-*`
 * duration is 0 — see lib/motion.ts); dimming and the detail panel are
 * instant, equally meaningful state changes.
 *
 * State discipline: focus is VALIDATED at read time (`rawFocus` may point at
 * a message or participant a re-parse removed) rather than synchronised by
 * effects — no setState in an effect body, per the same eslint rule
 * `editor/components/view-mode-link.tsx` documents. The only state writes
 * happen in event handlers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scan, Waves, X, ZoomIn, ZoomOut } from "lucide-react";

import type { SequenceLabFile } from "@/types";
import {
  readIdleMotion,
  useIdleMotion,
  useReducedMotion,
  writeIdleMotion,
} from "@/lib/idle-motion";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
  ZOOM_READOUT_CLASSES,
  ZOOM_STEP,
} from "@/components/ui/zoom-pill";
import { cn } from "@/lib/utils";

import type { LaidMessage } from "../lib/layout";
import {
  collapseSequence,
  dependenciesOf,
  hiddenParticipants,
} from "../lib/collapse";
import { layoutSequence } from "../lib/layout";
import { sequenceMarchState, sequenceMotionVars } from "../lib/motion";
import type { SequenceFocus } from "./sequence-diagram";
import { resolveFocusSteps, SequenceDiagram } from "./sequence-diagram";

/* -------------------------------------------------------------------------- */
/* The viewer                                                                   */
/* -------------------------------------------------------------------------- */

export function SequenceViewer({
  file,
  onAnnounce,
}: {
  file: SequenceLabFile;
  /**
   * Where focus announcements go. The viewer OWNS no live region: the page
   * hosting it (the playground) renders the single polite region, and this
   * prop plumbs focus messages into it — two polite regions updated near
   * each other race, and the loser's announcement is swallowed. The host
   * owns the region because it renders unconditionally (this viewer can be
   * replaced by the seed-failure fallback) and already announces parse and
   * immersive state.
   */
  onAnnounce: (message: string) => void;
}): React.JSX.Element {
  /**
   * COLLAPSED PARTICIPANTS — the ones whose private dependencies are folded
   * away. State is the set of collapse HANDLES, not the set of hidden
   * participants, because the hidden set is derived (lib/collapse.ts) and
   * storing a derived set is how it goes stale: re-parse the document with one
   * dependency removed and a stored hidden set would keep hiding a participant
   * nothing points at any more.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const hidden = useMemo(
    () => hiddenParticipants(file, collapsed),
    [file, collapsed],
  );

  /**
   * The file as rendered. Everything downstream — layout, the dock, the text
   * listing, focus resolution — reads THIS rather than the parsed file, so a
   * collapsed view is internally consistent by construction instead of by each
   * consumer remembering to skip hidden ids. `collapseSequence` returns the
   * original object when nothing is hidden, so the uncollapsed case allocates
   * nothing and every memo below keeps its identity.
   */
  const shown = useMemo(() => collapseSequence(file, hidden), [file, hidden]);

  // ONE layout call per model — the single source of geometric truth.
  const layout = useMemo(() => layoutSequence(shown), [shown]);
  const nameById = useMemo(
    () => new Map(file.participants.map((p) => [p.id, p.name])),
    [file],
  );

  const fragmentById = useMemo(
    () => new Map(layout.fragments.map((f) => [f.id, f])),
    [layout],
  );

  const reduced = useReducedMotion();
  const idleMotion = useIdleMotion();

  /**
   * Focus and its nonce live in ONE state cell because they only ever change
   * together: every focus gesture — including re-focusing the SAME target —
   * bumps the nonce, and the nonce is what lets the diagram restart the draw
   * animation on a repeat click. Splitting them into two states would invite
   * a set-one-forget-the-other bug no compiler could catch.
   */
  const [rawFocus, setRawFocus] = useState<{
    focus: NonNullable<SequenceFocus>;
    nonce: number;
  } | null>(null);

  // Focus is validated at read time, not with a state-sync effect: a
  // re-parse can remove the focused message, participant or fragment, and a
  // focus pointing at nothing must read as no focus.
  const focus: SequenceFocus = (() => {
    if (rawFocus === null) return null;
    const raw = rawFocus.focus;
    switch (raw.kind) {
      case "message":
        return raw.step >= 1 && raw.step <= layout.stepCount ? raw : null;
      case "participant":
        // Against the RENDERED participants, not the parsed ones: collapsing
        // can take a focused participant off the canvas, and a focus on
        // something not drawn dims the whole diagram around nothing.
        return layout.participants.some((p) => p.id === raw.id) ? raw : null;
      case "fragment": {
        const fragment = fragmentById.get(raw.id);
        if (fragment === undefined) return null;
        return raw.branch === null || raw.branch < fragment.branches.length
          ? raw
          : null;
      }
    }
  })();

  /* ---- focus ------------------------------------------------------------- */

  /**
   * Toggling one handle. Collapsing announces WHAT went away by name: the
   * diagram visibly shrinks, and a change that large with no explanation reads
   * as a bug rather than a fold.
   */
  const handleToggleCollapse = useCallback(
    (id: string) => {
      // Folding renumbers the steps — the layout numbers what it draws — so a
      // held message focus would silently come to mean a DIFFERENT message.
      // Dropping it is the honest outcome; the alternative is a selection that
      // quietly moved.
      setRawFocus(null);
      const next = new Set(collapsed);
      if (next.has(id)) {
        next.delete(id);
        const names = [...dependenciesOf(file, id)]
          .map((dep) => nameById.get(dep) ?? dep)
          .join(", ");
        onAnnounce(`${nameById.get(id) ?? id} expanded — showing ${names}.`);
      } else {
        next.add(id);
        const deps = [...hiddenParticipants(file, new Set([...collapsed, id]))]
          .map((dep) => nameById.get(dep) ?? dep)
          .join(", ");
        onAnnounce(`${nameById.get(id) ?? id} collapsed — hiding ${deps}.`);
      }
      setCollapsed(next);
    },
    [collapsed, file, nameById, onAnnounce],
  );

  /**
   * Which participants are worth offering a control on, and how many each
   * would fold. Computed from the FULL file so the number on a collapsed card
   * still says how many are behind it.
   */
  const dependencyCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const participant of file.participants) {
      const size = dependenciesOf(file, participant.id).size;
      if (size > 0) counts.set(participant.id, size);
    }
    return counts;
  }, [file]);

  const handleFocusMessage = useCallback(
    (focusedStep: number) => {
      setRawFocus((prev) => ({
        focus: { kind: "message", step: focusedStep },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const message = layout.messages.find((m) => m.step === focusedStep);
      if (message !== undefined) {
        onAnnounce(
          `Message ${focusedStep} of ${layout.stepCount}: ${nameById.get(message.from) ?? message.from} to ${nameById.get(message.to) ?? message.to} — ${message.label}.` +
            /* The `desc` is READ OUT here, not merely pointed at: the dock is
               an unfocused region, so a sighted reader sees the detail
               appear and a screen-reader user would otherwise have to go
               hunting for it. This is the one place the full text belongs —
               the hit target's name deliberately only says it exists. */
            (message.description !== undefined
              ? /* Authored line breaks become sentence breaks: a screen
                   reader runs a bare newline into the next word, so
                   "…/orders body { cartId }" would arrive as one phrase. */
                ` Details: ${message.description.split("\n").join(". ")}.`
              : "") +
            " Details open beside the diagram; Escape clears focus.",
        );
      }
    },
    [layout, nameById, onAnnounce],
  );

  const handleFocusParticipant = useCallback(
    (id: string) => {
      setRawFocus((prev) => ({
        focus: { kind: "participant", id },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const steps = layout.messages
        .filter((m) => m.from === id || m.to === id)
        .map((m) => m.step);
      onAnnounce(
        `Focused participant ${nameById.get(id) ?? id} — takes part in ${steps.length} of ${layout.stepCount} messages${steps.length > 0 ? ` (steps ${steps.join(", ")})` : ""}. Escape clears focus.`,
      );
    },
    [layout, nameById, onAnnounce],
  );

  const handleFocusFragment = useCallback(
    (id: string, branch: number | null) => {
      setRawFocus((prev) => ({
        focus: { kind: "fragment", id, branch },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const fragment = layout.fragments.find((f) => f.id === id);
      if (fragment === undefined) return;
      const steps =
        branch === null
          ? fragment.steps
          : (fragment.branches[branch]?.steps ?? []);
      const guard =
        branch === null ? undefined : fragment.branches[branch]?.label;
      onAnnounce(
        `Focused ${fragment.kind} fragment${guard !== undefined ? ` branch [${guard}]` : ""} — ${steps.length} of ${layout.stepCount} messages${steps.length > 0 ? ` (steps ${steps.join(", ")})` : ""}. Details open beside the diagram; Escape clears focus.`,
      );
    },
    [layout, onAnnounce],
  );

  const handleClearFocus = useCallback(() => {
    if (focus !== null) onAnnounce("Focus cleared.");
    setRawFocus(null);
  }, [focus, onAnnounce]);

  /**
   * Closing the dock with its close BUTTON needs one extra step Escape does
   * not: the button unmounts along with the dock, and keyboard focus would
   * strand on <body>. Re-home it on the diagram region — tabbable, and the
   * owner of the arrow-key shortcuts, so "close details, keep exploring"
   * stays a pure keyboard flow. Escape needs no re-homing because the key
   * never moved DOM focus into the dock in the first place. (Opening the
   * dock deliberately does NOT move DOM focus either — stealing it would
   * break exactly the click-around exploration the dock exists to serve.)
   */
  const diagramRegionRef = useRef<HTMLDivElement>(null);
  const handleCloseDock = useCallback(() => {
    handleClearFocus();
    diagramRegionRef.current?.focus();
  }, [handleClearFocus]);

  /**
   * THE BACKDROP: the whole diagram pane, not a rect inside the SVG.
   *
   * Clicking empty canvas is the mouse equivalent of Escape, and it used to
   * miss most of the empty canvas. The old backdrop was a `<rect>` sized to
   * the viewBox, which is not the same region as "the part of the pane with no
   * diagram in it": in fit mode `preserveAspectRatio="meet"` letterboxes the
   * drawing, leaving a wide margin either side of a tall flow (on the bundled
   * example, ~170px per side) that belonged to the SVG element but to no rect;
   * and at a small zoom — the scale clamps down to 0.1 — the drawing is a
   * postage stamp in a pane that is almost entirely gutter. Clicks anywhere in
   * that space hit the pane and did nothing, so the diagram looked stuck in a
   * focused state until the user found Escape or the dock's close button.
   *
   * Moving it to the pane covers all of it, including the pane's own padding,
   * and needs no hit geometry to be maintained. What makes it safe is that
   * every interactive element inside the SVG stops propagation on click —
   * messages, participant headers, footer cards, fragment chips and guards —
   * so a click that reaches here is one that landed on nothing.
   *
   * The guard is for SCROLLBARS. A click on a scroll gutter targets the
   * scrolling element itself, so without this, dragging the scrollbar of a
   * zoomed diagram would clear focus on release — the user asked to pan, not to
   * deselect. `clientWidth`/`clientHeight` exclude the scrollbars while the
   * bounding rect includes them, and the difference is exactly the gutter.
   */
  /**
   * Drag-to-pan's state, declared before the handlers that read it: the click
   * handler consults `panSuppressesClick`, the pointer handlers write it, and
   * declaring the refs after their first reader trips the compiler's
   * immutability rule. See the drag-to-pan block below for the design.
   */
  const panState = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const panSuppressesClick = useRef(false);
  const [panning, setPanning] = useState(false);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // A drag that panned the view ends in a click; that click means "I
      // finished panning", not "clear focus". See handlePointerUp.
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

  /* ---- drag to pan ----------------------------------------------------------
   * Past fit, the pane is a window onto a bigger drawing, and reaching for a
   * scrollbar to move a canvas is the wrong gesture — every map and every node
   * editor lets you grab the thing and move it. The pane is a real scroll
   * container, so this drives `scrollLeft`/`scrollTop` rather than inventing a
   * transform layer: wheel, trackpad, scrollbars, keyboard and this all stay
   * one coordinate system, and the focus-follows-scroll nudge keeps working
   * without knowing panning exists.
   *
   * Four deliberate limits:
   *   - MOUSE ONLY. Touch already pans natively and far better; capturing
   *     pointers there would fight the platform and break pinch-zoom.
   *   - PRIMARY BUTTON on EMPTY CANVAS. A drag starting on a message or a
   *     participant is left alone so those clicks stay exactly as precise as
   *     they were — the interactive elements own their own gestures.
   *   - ONLY WHEN THERE IS SOMEWHERE TO GO, tested against real overflow at
   *     pointer-down. In fit mode, and at a zoom small enough that the drawing
   *     fits anyway, a drag must do nothing rather than fake resistance.
   *   - A MOVED drag swallows its trailing click, so panning away from a
   *     focused message does not also clear the focus. The 4px threshold is
   *     what separates a sloppy click from a deliberate drag.
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      // Interactive targets keep their own behaviour — see the limits above.
      if ((event.target as Element).closest?.(".af-seq-hit") != null) return;
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
      // Capture so a fast drag that leaves the pane keeps panning, and so the
      // gesture always ends with a pointerup we hear.
      pane.setPointerCapture(event.pointerId);
      // Stops the browser starting its own drag of the SVG.
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
      // Inverted: the content follows the hand, so dragging left reveals what
      // is to the right — grabbing the canvas, not dragging a scrollbar.
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

  /* ---- zoom -----------------------------------------------------------------
   * The hand-rolled equivalent of the C4 viewer's camera: `"fit"` (default —
   * the WHOLE flow inside the pane, the sequence answer to fitView) or a
   * numeric scale where 1 = one SVG user unit per CSS pixel. Fit is a MODE,
   * not a stored number, so it keeps holding through resizes and re-parses
   * for free; the number only exists once the user reaches for detail.
   */
  const [zoom, setZoom] = useState<number | "fit">("fit");

  /** The scale fit mode is currently rendering at — measured, because it
   * depends on the pane's live size. Used only as the base for the first
   * +/− step out of fit, so stepping feels continuous rather than jumping
   * to an unrelated absolute scale. */
  const measureFitScale = useCallback((): number => {
    const pane = diagramRegionRef.current;
    if (pane === null) return 1;
    // p-3 padding (12px per side) is outside the wrapper's content box.
    const width = pane.clientWidth - 24;
    const height = pane.clientHeight - 24;
    if (width <= 0 || height <= 0) return 1;
    return Math.min(width / layout.width, height / layout.height);
  }, [layout]);

  /**
   * WHAT THE VIEW WAS CENTRED ON when a zoom started, as a fraction of the
   * scrollable content on each axis. Applied again after the re-render, so a
   * zoom keeps looking at what it was looking at instead of snapping to the
   * top-left corner.
   *
   * Fractions rather than diagram coordinates, because the two zoom states
   * measure differently — in fit mode the drawing is letterboxed inside an
   * SVG that fills the pane, while at a numeric scale the SVG *is* the
   * drawing — and a fraction is the same quantity in both. It also gives the
   * fit → zoom step the right answer for free: fit has no overflow, so its
   * centre fraction is exactly 0.5, and staying at 0.5 after the zoom is what
   * "keep it centred" means.
   */
  const zoomAnchor = useRef<{
    cx: number;
    cy: number;
    /** Where in the PANE that content point should still sit afterwards.
     * Defaults to the pane's centre; a pinch passes the pointer instead, so
     * the diagram grows around the fingers rather than around the middle. */
    vx: number;
    vy: number;
  } | null>(null);

  const applyZoom = useCallback(
    (
      next: number,
      options: { at?: { x: number; y: number }; announce?: boolean } = {},
    ) => {
      const pane = diagramRegionRef.current;
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

  /**
   * Re-centre on the anchored point once the new scale has laid out. A DOM
   * scroll write in an effect, not state — the same shape as the
   * focus-follows-scroll effect above, and for the same reason: the value
   * depends on geometry that only exists after the commit. Assigning past the
   * scrollable range is safe; the browser clamps, which is exactly right when
   * the new scale leaves an axis with nothing to scroll.
   *
   * Not `useLayoutEffect`, which is the usual reach for "position before paint":
   * every zoom here originates in a click, and React flushes passive effects
   * from a discrete event before yielding to the browser, so there is no frame
   * painted at the stale offset to avoid — while a layout effect would warn on
   * every server render of this client component for nothing.
   */
  useEffect(() => {
    const anchor = zoomAnchor.current;
    if (anchor === null) return;
    zoomAnchor.current = null;
    const pane = diagramRegionRef.current;
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
    onAnnounce("Diagram fitted to view — the whole flow is on screen.");
  }, [onAnnounce]);

  /* ---- trackpad pinch (two fingers) -----------------------------------------
   * A pinch on a trackpad is delivered as a `wheel` event with `ctrlKey` set —
   * the platform convention every browser follows, and the same signal a mouse
   * sends for ctrl+wheel. Unhandled, the browser applies it to the WHOLE PAGE:
   * the nav, the source pane and the diagram all scaled together, past any
   * limit this view believes in, and a reader who pinched to inspect one arrow
   * had to hunt for the browser's own reset. So the gesture is claimed here and
   * CLAMPED to the same ZOOM_MIN/ZOOM_MAX the pill obeys.
   *
   * A NATIVE listener with `{ passive: false }`, not React's `onWheel`, because
   * preventDefault is the entire point and React attaches wheel handlers
   * passively (where preventDefault does nothing but warn).
   *
   * Only `ctrlKey` is intercepted. A plain two-finger scroll stays the pane's
   * own scrolling, which is how panning already works — the whole zoom model
   * rests on this being a real scroll container.
   *
   * COALESCED PER FRAME. A pinch delivers wheel events far faster than this
   * SVG can re-render, and calling setZoom on each one queues a render per
   * event; the target accumulates in a ref and one rAF commits it, so the
   * scale still tracks the fingers exactly while the DOM is written once a
   * frame. The pending target is also what the NEXT event reads, so a burst
   * inside one frame compounds correctly instead of each event stepping from
   * the same stale base.
   *
   * Announcing is deferred to the END of the gesture (250ms of quiet): a live
   * region fired per frame is unusable, and "Zoom 180 percent" is only news
   * once the fingers stop.
   */
  const pinchTarget = useRef<number | null>(null);
  const pinchFrame = useRef<number | null>(null);
  const pinchIdle = useRef<number | null>(null);

  useEffect(() => {
    const pane = diagramRegionRef.current;
    if (pane === null) return;

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const base =
        pinchTarget.current ?? (zoom === "fit" ? measureFitScale() : zoom);
      /* Exponential, so a pinch feels the same at 0.2 as at 2 — a linear step
         crawls when zoomed out and lurches when zoomed in. The 0.01 factor is
         tuned to macOS trackpad deltas; the per-event cap keeps a coarse mouse
         wheel (deltaY of ±100 in one tick) from jumping the whole range. */
      const factor = Math.exp(
        -Math.max(-40, Math.min(40, event.deltaY)) * 0.01,
      );
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, base * factor));
      pinchTarget.current = next;

      const rect = pane.getBoundingClientRect();
      const at = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

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
        const atLimit =
          settled <= ZOOM_MIN + 0.001
            ? " Minimum zoom."
            : settled >= ZOOM_MAX - 0.001
              ? " Maximum zoom."
              : "";
        onAnnounce(`Zoom ${Math.round(settled * 100)} percent.${atLimit}`);
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

  const handleToggleIdle = useCallback(() => {
    const next = !readIdleMotion();
    writeIdleMotion(next);
    onAnnounce(
      next
        ? "Idle motion on — every message line marches toward its target."
        : "Idle motion off — the diagram holds still until you focus something.",
    );
  }, [onAnnounce]);

  /**
   * FOCUS FOLLOWS SCROLL: clicking a thing must never hide that thing. The
   * dock overlays the pane's right edge (its bottom edge below `md`), so
   * when a freshly focused message or participant sits in the covered
   * strip, nudge the pane's scroll by exactly the overlap. This bites when
   * the pane genuinely scrolls — a numeric zoom, where the SVG is wider than
   * the pane. In fit mode the SVG is exactly pane-sized, so there is nothing
   * to scroll and this is a no-op by arithmetic rather than by a guard (the
   * scrollBy simply has nowhere to go), which is the correct outcome: fit
   * mode must not scroll, because scrolling implies content off-screen and
   * fit's whole promise is that there is none.
   * Runs per focus GESTURE (`rawFocus` includes the nonce, so re-clicks
   * count) in an effect AFTER the commit that mounted the dock, measuring
   * the real dock rect rather than assuming a breakpoint. DOM scrolling
   * only — no state, so the no-setState-in-effects rule holds.
   */
  const dockRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (rawFocus === null) return;
    const pane = diagramRegionRef.current;
    const dock = dockRef.current;
    if (pane === null || dock === null) return;
    const raw = rawFocus.focus;
    let target: Element | null = null;
    if (raw.kind === "message") {
      target = pane.querySelector('.af-seq-msg[data-focused="true"]');
    } else if (raw.kind === "participant") {
      const name = nameById.get(raw.id) ?? raw.id;
      target =
        [...pane.querySelectorAll(".af-seq-participant .af-seq-hit")].find(
          (el) => el.getAttribute("aria-label") === `Focus participant ${name}`,
        ) ?? null;
    }
    if (target === null) return;
    const rect = target.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    // Side dock spans the pane's full height; anything shorter is the sheet.
    const isSideDock = dockRect.height >= paneRect.height - 2;
    if (isSideDock) {
      const overlap = rect.right - dockRect.left;
      if (overlap > 0) pane.scrollLeft += overlap + 16;
    } else {
      const overlap = rect.bottom - dockRect.top;
      if (overlap > 0) pane.scrollTop += overlap + 16;
    }
  }, [rawFocus, nameById]);

  /* ---- keyboard ----------------------------------------------------------- */

  /**
   * ESCAPE — rung 2 of the PAGE's ladder (rung 1 is native fullscreen, owned
   * by the browser; rung 3, leaving immersive mode, belongs to the
   * playground shell around this viewer). A WINDOW listener rather than the
   * wrapper's onKeyDown because the rung must fire wherever DOM focus sits —
   * e.g. on the shell's immersive toggle button, which is outside this
   * component — or one press would skip straight to rung 3 with a focus
   * still held.
   *
   * Registered ONCE (empty deps; the changing values are read through refs):
   * a re-registered window listener moves to the BACK of the window's
   * listener order, behind the shell's rung-3 listener, and the ladder would
   * run bottom-up. Child effects run before parent effects, so registering
   * once here guarantees this listener always runs first. preventDefault is
   * the "consumed" signal the shell checks before exiting immersive mode.
   *
   * Form fields are exempt: Escape inside the source textarea belongs to its
   * Tab-escape-hatch (see sequence-playground.tsx), not to diagram focus.
   */
  const focusRef = useRef<SequenceFocus>(null);
  const clearFocusRef = useRef(handleClearFocus);
  // The "latest ref" update lives in an effect (not in render — the
  // react-hooks/refs rule forbids that), which is still always ahead of any
  // keydown: effects flush before the user can press another key.
  useEffect(() => {
    focusRef.current = focus;
    clearFocusRef.current = handleClearFocus;
  }, [focus, handleClearFocus]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.fullscreenElement !== null) return; // rung 1 — browser's turn
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (focusRef.current === null) return; // nothing to clear — rung 3 may act
      event.preventDefault();
      clearFocusRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Arrows walk focus through the messages in model order — the keyboard
   * equivalent of clicking each arrow in turn. From nothing (or from a
   * participant focus, which has no position in the story), both directions
   * land on the FIRST message: "start reading" is the only honest answer to
   * "previous" when there is no current position. (Escape is NOT handled
   * here — it lives on window, above, so the page's Escape ladder works
   * wherever DOM focus sits.)
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (layout.stepCount === 0) return;
      const current = focus?.kind === "message" ? focus.step : 0;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          handleFocusMessage(Math.min(current + 1, layout.stepCount));
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          handleFocusMessage(current === 0 ? 1 : Math.max(1, current - 1));
          break;
        default:
          break;
      }
    },
    [focus, layout.stepCount, handleFocusMessage],
  );

  /* ---- render -------------------------------------------------------------- */

  // Motion vars recompute whenever the reduced-motion store flips, so
  // toggling the OS setting takes effect without a reload.
  const motionVars = useMemo(() => sequenceMotionVars(reduced), [reduced]);

  /**
   * The march gate, as an ATTRIBUTE rather than one of the vars above:
   * switching it off has to withdraw a dasharray as well as an animation, and
   * a custom property can change a value but not retract a declaration. See
   * `sequenceMarchState`.
   */
  const marchState = sequenceMarchState(reduced, idleMotion);

  const focusedMessage =
    focus?.kind === "message"
      ? (layout.messages.find((m) => m.step === focus.step) ?? null)
      : null;
  const focusedParticipant =
    focus?.kind === "participant"
      ? (shown.participants.find((p) => p.id === focus.id) ?? null)
      : null;
  const focusedParticipantMessages =
    focusedParticipant === null
      ? []
      : layout.messages.filter(
          (m) =>
            m.from === focusedParticipant.id || m.to === focusedParticipant.id,
        );

  // Fragment focus detail — the steps come from the SAME resolver the
  // diagram dims with, so the dock can never describe a different flow
  // than the one lit up.
  const focusedFragment =
    focus?.kind === "fragment" ? (fragmentById.get(focus.id) ?? null) : null;
  const focusedFragmentGuard =
    focus?.kind === "fragment" && focus.branch !== null
      ? focusedFragment?.branches[focus.branch]?.label
      : undefined;
  const focusedFragmentSteps =
    focusedFragment === null ? null : resolveFocusSteps(layout, focus);
  const focusedFragmentMessages =
    focusedFragmentSteps === null
      ? []
      : layout.messages.filter((m) => focusedFragmentSteps.has(m.step));
  const focusedFragmentParticipants =
    focusedFragmentSteps === null
      ? []
      : layout.participants
          .filter((p) =>
            layout.messages.some(
              (m) =>
                focusedFragmentSteps.has(m.step) &&
                (m.from === p.id || m.to === p.id),
            ),
          )
          .map((p) => p.name);

  /** A participant's name with its technology, for the dock's From/To. */
  const withTechnology = (id: string): string => {
    const name = nameById.get(id) ?? id;
    const technology = shown.participants.find((p) => p.id === id)?.technology;
    return technology === undefined ? name : `${name} [${technology}]`;
  };

  /**
   * The guard path of a step — which fragment branches enclose it, outermost
   * first: `alt [card accepted] › par [receipt]`. `layout.fragments` is
   * pre-order, so filtering to the fragments whose step set contains the
   * step yields the ancestor chain already in nesting order; the branch a
   * step sits in comes from the same layout-computed sets the diagram dims
   * with. Nothing here re-derives structure.
   */
  const guardPath = (step: number): string | null => {
    const parts: string[] = [];
    for (const fragment of layout.fragments) {
      if (!fragment.steps.includes(step)) continue;
      const branch = fragment.branches.find((b) => b.steps.includes(step));
      parts.push(
        branch?.label !== undefined
          ? `${fragment.kind} [${branch.label}]`
          : fragment.kind,
      );
    }
    return parts.length === 0 ? null : parts.join(" › ");
  };

  const dockOpen =
    focusedMessage !== null ||
    focusedParticipant !== null ||
    focusedFragment !== null;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      // Arrow keys live on the wrapper, not on window: a global listener
      // would steal them from the source pane below this viewer. (Escape is
      // the exception — see the ladder comment above handleKeyDown.)
      onKeyDown={handleKeyDown}
      style={motionVars}
      data-seq-march={marchState}
    >
      {/* No live region here — the hosting page owns the single polite
          region and focus announcements travel through `onAnnounce`. */}
      {/* Relative wrapper: the details dock ANCHORS here so it can overlay
          the diagram pane instead of resizing it — see the aside below. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={diagramRegionRef}
          className={cn(
            "h-full overflow-auto bg-canvas p-3",
            // Flex ONLY at a numeric scale, so the wrapper's `m-auto` can
            // centre the drawing on both axes when it is smaller than the
            // pane. Fit mode is left as plain block layout: its child already
            // fills the pane and the SVG's own `xMidYMid` does the centring, so
            // there is nothing to gain and a working layout to risk.
            zoom !== "fit" && "flex",
            // `grab` whenever the view is past fit, which is where panning is
            // possible. At a zoom small enough that the drawing still fits it
            // over-promises by a cursor — the pointer-down guard measures real
            // overflow, so the gesture itself never lies, and the alternative
            // (a resize observer to keep a cursor honest) is not worth it.
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
          aria-label="Sequence diagram. Arrow keys move focus between messages, Escape clears focus. Pinch or hold Control and scroll to zoom between 10 and 400 percent. Messages, participants and fragment chips are buttons — Tab reaches them."
        >
          {/* Sized to the pane in fit mode, hugging the SVG when zoomed.
              Nothing is reserved for the dock, and that is the fix for a
              two-part bug rather than a simplification.

              What used to be here: a `box-content` wrapper with right padding
              equal to the dock's width, meant to give a pane-fitted SVG some
              overflow to scroll so the strip under the dock stayed reachable.
              It cost more than it bought. Extending the border box past 100%
              gave the pane a permanent horizontal SCROLLBAR the moment
              anything was focused, and that scrollbar consumed pane height,
              which made "meet" re-fit the whole diagram a few percent SMALLER
              — so clicking a message both grew a scrollbar and quietly
              rescaled the drawing, which is precisely the reflow-jump the
              overlay was chosen to avoid.

              It was also usually reserving nothing: fit scales by
              `min(paneW/vbW, paneH/vbH)`, and a tall flow is height-bound, so
              the drawing sits centred with horizontal slack on both sides and
              the dock overlays empty canvas. Reserving a dock's width of
              scroll room for a strip that is not covered is pure cost.

              The trade, stated plainly: when a diagram IS wide enough to run
              under the dock, that strip is now covered until the dock is
              closed (Escape, its close button, or clicking the canvas) or the
              view is zoomed, where the pane scrolls naturally and the
              focus-follows nudge above pulls the focused element clear. That
              is ordinary inspector-over-canvas behaviour, and it beats
              rescaling the diagram every time someone clicks. */}
          {/* `m-auto` and not `justify-center`/`items-center`: auto margins
              centre a flex item that is SMALLER than the container, and
              collapse to zero when it is bigger, so the overflow stays in the
              scrollable direction. Centring with justify/align instead
              overflows in BOTH directions and makes the leading half
              unreachable — a scroll container cannot scroll to negative
              offsets. This is the documented workaround for exactly that, and
              it is why zooming in past the pane still lets you reach the top
              and left of the diagram. */}
          <div className={zoom === "fit" ? "h-full w-full" : "m-auto w-max"}>
            <SequenceDiagram
              layout={layout}
              title={shown.metadata.title}
              autonumber={shown.autonumber === true}
              focus={focus}
              focusNonce={rawFocus?.nonce ?? 0}
              zoom={zoom}
              onFocusMessage={handleFocusMessage}
              onFocusParticipant={handleFocusParticipant}
              onFocusFragment={handleFocusFragment}
              collapsed={collapsed}
              dependencyCount={dependencyCount}
              onToggleCollapse={handleToggleCollapse}
            />
          </div>
        </div>

        {/* ---- zoom controls (bottom-left, the C4 viewer's pill pattern) ----
            The hand-rolled fitView/zoomTo: FIT is the default and the reset
            (the whole flow visible at once); the percent button jumps to
            actual size; +/− step by a fixed factor from whatever is on
            screen. Panning past fit is the pane's own scrolling — wheel,
            trackpad, scrollbars — not a drag layer, because dragging would
            fight the click-to-focus surface this diagram IS. Zoom changes
            are state, not motion (the SVG re-renders at the new size), so
            reduced motion needs no branch here; announcements go through
            the page's one live region. */}
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
          <button
            type="button"
            onClick={() => applyZoom(1)}
            aria-label={
              zoom === "fit"
                ? "Fitted to view — set zoom to 100 percent"
                : `Zoom ${Math.round(zoom * 100)} percent — reset to 100 percent`
            }
            title="Actual size (100%)"
            className={ZOOM_READOUT_CLASSES}
          >
            {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>
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
          {/* Idle-motion toggle — it lives in this pill because the strip
              is where view-level controls already are. Under reduced motion
              the button DISABLES rather than pretending: the OS preference
              wins outright, and a toggle that claims to enable motion it
              cannot run would be lying (aria-pressed reads false there for
              the same honesty). The preference persists in localStorage —
              see useIdleMotion. */}
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

        {/* ---- the details dock ----
            A docked, NON-BLOCKING side panel — deliberately not a modal
            dialog (see the header comment; do not "fix" this into one): the
            diagram behind it stays fully clickable while it is open.

            It OVERLAYS the diagram pane (absolute, in the relative wrapper
            above) instead of sitting beside it as a flex sibling, because
            the SVG is pane-fitted: a sibling would narrow the pane and
            rescale/shift every lifeline the instant something is clicked —
            a reflow-jump that undoes the point of clicking. Overlaying
            keeps the diagram's geometry byte-identical ("fit" means fit the
            pane, never re-fit around the dock), and nothing in the pane
            reserves room for it — see the wrapper above for why the spacer
            that used to do so was worse than the problem it solved. The
            aside UNMOUNTS when nothing is focused, so it costs nothing when
            closed.

            Below `md` a side dock would cover most of the diagram, so it
            becomes a bottom SHEET (same overlay reasoning, other edge) — and
            since it lives inside the diagram section it always sits ABOVE the
            source pane. Appearing is a state change, not motion: no
            animation, so nothing new to park under reduced motion. */}
        {dockOpen ? (
          <aside
            ref={dockRef}
            aria-label="Focus details"
            className={
              "absolute z-10 flex flex-col border-border bg-card/95 shadow-lg backdrop-blur-sm " +
              "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-72 max-md:rounded-t-xl max-md:border-t " +
              "md:top-0 md:right-0 md:bottom-0 md:w-72 md:border-l"
            }
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
              <h2 className="text-sm font-semibold text-foreground">
                {focusedMessage !== null
                  ? "Message details"
                  : focusedParticipant !== null
                    ? "Participant details"
                    : "Fragment details"}
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
              {focusedMessage !== null ? (
                <dl className="flex flex-col gap-2.5">
                  <DockRow
                    term="Message"
                    value={`${focusedMessage.step} of ${layout.stepCount}`}
                    mono
                  />
                  <DockRow
                    term="From"
                    value={withTechnology(focusedMessage.from)}
                  />
                  <DockRow
                    term="To"
                    value={withTechnology(focusedMessage.to)}
                  />
                  <DockRow term="Label" value={focusedMessage.label} />
                  {/* THE REASON THE DOCK EXISTS, for a message that carries a
                      `desc`: the arrow shows the title, this shows what the
                      title is short for. Directly under Label — it elaborates
                      that row, and separating them with Technology would read
                      as two unrelated facts. */}
                  {focusedMessage.description !== undefined ? (
                    <DockCodeRow
                      term="Details"
                      value={focusedMessage.description}
                    />
                  ) : null}
                  {focusedMessage.technology !== undefined ? (
                    <DockRow
                      term="Technology"
                      value={focusedMessage.technology}
                      mono
                    />
                  ) : null}
                  <DockRow
                    term="Kind"
                    value={
                      focusedMessage.self
                        ? `${focusedMessage.kind} (self-message)`
                        : focusedMessage.kind
                    }
                    mono
                  />
                  {/* WHERE the message sits: the chain of fragment branches
                      around it, outermost first. Omitted (not "none") for a
                      top-level message — absence of a frame is not a fact
                      worth a row. */}
                  {guardPath(focusedMessage.step) !== null ? (
                    <DockRow
                      term="Inside"
                      value={guardPath(focusedMessage.step) ?? ""}
                      mono
                    />
                  ) : null}
                </dl>
              ) : null}

              {focusedParticipant !== null ? (
                <>
                  <dl className="flex flex-col gap-2.5">
                    <DockRow
                      term="Participant"
                      value={focusedParticipant.name}
                    />
                    <DockRow
                      term="Kind"
                      value={focusedParticipant.kind ?? "participant"}
                      mono
                    />
                    {focusedParticipant.technology !== undefined ? (
                      <DockRow
                        term="Technology"
                        value={focusedParticipant.technology}
                        mono
                      />
                    ) : null}
                    {focusedParticipant.description !== undefined ? (
                      <DockRow
                        term="Description"
                        value={focusedParticipant.description}
                      />
                    ) : null}
                  </dl>
                  <DockMessageList
                    heading={`Messages — ${focusedParticipantMessages.length} of ${layout.stepCount}`}
                    messages={focusedParticipantMessages}
                    nameById={nameById}
                    onFocusMessage={handleFocusMessage}
                  />
                </>
              ) : null}

              {focusedFragment !== null ? (
                <>
                  <dl className="flex flex-col gap-2.5">
                    <DockRow
                      term="Fragment"
                      value={focusedFragment.kind}
                      mono
                    />
                    {focusedFragmentGuard !== undefined ? (
                      <DockRow
                        term="Branch"
                        value={`[${focusedFragmentGuard}]`}
                      />
                    ) : (
                      <DockRow
                        term="Branches"
                        value={`${focusedFragment.branches.length} (all focused)`}
                      />
                    )}
                    <DockRow
                      term="Participants"
                      value={
                        focusedFragmentParticipants.length === 0
                          ? "none"
                          : focusedFragmentParticipants.join(", ")
                      }
                    />
                  </dl>
                  <DockMessageList
                    heading={`Messages — ${focusedFragmentMessages.length} of ${layout.stepCount}`}
                    messages={focusedFragmentMessages}
                    nameById={nameById}
                    onFocusMessage={handleFocusMessage}
                  />
                </>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {/* The keyboard hint that used to live in the control strip — the
          controls are gone, the affordances are not.

          The FOLD clause is conditional, and that is the point: the `−` glyph
          only exists on cards with private dependencies (lib/collapse.ts), so
          on a flow where nothing folds, naming the control would send a reader
          hunting for a glyph that is not on screen. Where it does exist it was
          the least discoverable thing in the viewer — a 10px minus in a card
          corner, explained only by the accessible name of a control a mouse
          user never hears. */}
      <p className="hidden border-t border-border bg-card px-4 py-1.5 text-xs text-muted-foreground sm:block">
        Click a message, participant, or fragment chip to focus it · a{" "}
        <span aria-hidden="true">•</span> after a label means that message
        carries details · ← → move between messages · pinch or ctrl-scroll to
        zoom · Esc clears focus
        {dependencyCount.size > 0 ? (
          <>
            {" · "}
            <span aria-hidden="true">−</span> on a card hides the services only
            it uses, <span aria-hidden="true">+n</span> brings them back
          </>
        ) : null}
      </p>

      {/* Text alternative: the whole story as an ordered list, for readers
          the SVG serves poorly — with playback gone this is the only LINEAR
          reading of the diagram. Kept in sync for free — it reads the same
          layout the diagram does. */}
      <ol className="sr-only">
        {layout.messages.map((message) => (
          <li key={message.step}>
            {nameById.get(message.from) ?? message.from} to{" "}
            {nameById.get(message.to) ?? message.to} ({message.kind}
            {message.self ? ", self-message" : ""}): {message.label}
            {message.technology !== undefined ? ` [${message.technology}]` : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * THE ZOOM RANGE, and the only place it is written down. Every entry point —
 * the pill's +/− buttons and the trackpad pinch — clamps to these, so no
 * gesture can reach a scale another gesture cannot undo.
 *
 * 0.1 is where a wide flow still reads as a shape; 4 is enough to inspect a
 * hairline. Past either end the pill's button and the pinch both simply stop.
 * Module scope rather than the component body: an effect depends on them, and
 * a per-render constant in a dependency list is a lie about what can change.
 */
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

/* -------------------------------------------------------------------------- */
/* Dock building blocks                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A term whose value is a CODE BLOCK: a bordered, tinted, monospace panel that
 * honours the newlines in the value.
 *
 * WHY THE MESSAGE DETAIL GETS THIS AND THE OTHER ROWS DO NOT. A `desc` on a
 * message is where endpoints, payloads and status codes go — the one field in
 * the dock whose content is usually literal text a reader will copy. Set as
 * prose it reads as a paragraph that happens to contain a path, so
 * `POST /api/v1/orders — body { cartId, addressId }. 201 …` arrives as one
 * grey wall and the reader has to parse it back into fields. Monospace and
 * pre-wrap give the author a way to lay it out (a `desc` may contain `\n`)
 * and stop the proportional font from making `{ cartId, addressId }` look
 * like a sentence.
 *
 * Wrapping is deliberate on both axes: `whitespace-pre-wrap` keeps authored
 * newlines AND still wraps a long line, so the dock never grows a horizontal
 * scrollbar for prose; `break-words` is what keeps an unbroken 80-character
 * URL inside the panel rather than pushing it wider than the dock.
 */
function DockCodeRow({
  term,
  value,
}: {
  term: string;
  value: string;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      {/* The button OVERLAYS the block's top-right corner rather than sitting
          in a header bar like `/syntax`'s CodeBlock: the dock is 18rem wide,
          and a second chrome row would cost a line of the detail itself. It is
          always visible, never hover-only — a hover-reveal control does not
          exist for touch, and the dock is the mobile bottom sheet too.

          `pr-9` on the <pre> is what keeps a long first line from running
          under the button. */}
      <dd className="relative mt-1">
        <pre className="overflow-x-auto rounded-md border border-border bg-secondary/40 py-2 pr-9 pl-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground">
          {value}
        </pre>
        <CopyButton
          text={value}
          label={`Copy the ${term.toLowerCase()}`}
          iconOnly
          className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </dd>
    </div>
  );
}

/** One stacked term/value row — the dock has vertical room, so it uses it. */
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
        className={
          mono ? "font-mono text-xs text-foreground" : "text-sm text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The dock's message list: REAL buttons, one per message, each re-focusing
 * its step — the dock is not just a description of the focus, it is a way
 * to walk the flow message by message without hunting for thin arrows.
 */
function DockMessageList({
  heading,
  messages,
  nameById,
  onFocusMessage,
}: {
  heading: string;
  messages: LaidMessage[];
  nameById: Map<string, string>;
  onFocusMessage: (step: number) => void;
}): React.JSX.Element {
  return (
    <div className="mt-3">
      <h3 className="text-xs font-medium text-muted-foreground">{heading}</h3>
      {messages.length === 0 ? (
        <p className="mt-1 text-sm text-foreground">none</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {messages.map((message) => (
            <li key={message.step}>
              <button
                type="button"
                onClick={() => onFocusMessage(message.step)}
                className="w-full rounded-md px-2 py-1 text-left hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="block text-xs text-foreground">
                  <span className="font-mono text-muted-foreground">
                    {message.step}.
                  </span>{" "}
                  {message.label}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {nameById.get(message.from) ?? message.from} →{" "}
                  {nameById.get(message.to) ?? message.to}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
