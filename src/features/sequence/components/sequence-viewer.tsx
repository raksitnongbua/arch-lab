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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Scan, Waves, X, ZoomIn, ZoomOut } from "lucide-react";

import type { SequenceLabFile } from "@/types";

import type { LaidMessage } from "../lib/layout";
import { layoutSequence } from "../lib/layout";
import { sequenceMarchState, sequenceMotionVars } from "../lib/motion";
import type { SequenceFocus } from "./sequence-diagram";
import { resolveFocusSteps, SequenceDiagram } from "./sequence-diagram";

/* -------------------------------------------------------------------------- */
/* Reduced motion, hydration-safe                                               */
/* -------------------------------------------------------------------------- */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * `matchMedia` is a browser API, so the server snapshot is `false` and the
 * client corrects after hydration — the D17 mounted-guard pattern
 * (`diagram-inspector.tsx`), which is what keeps the reduced-motion default
 * from aborting hydration for the whole playground.
 */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/* -------------------------------------------------------------------------- */
/* Idle-motion preference, persisted + hydration-safe                           */
/* -------------------------------------------------------------------------- */

/**
 * The idle-motion toggle's backing store: localStorage behind a
 * useSyncExternalStore, the same D17 mounted-guard shape as
 * `useReducedMotion` above (and diagram-inspector.tsx) — the server
 * snapshot is the DEFAULT (on), and the client corrects after hydration if
 * a stored "off" disagrees, instead of the render reading a browser API it
 * does not have on the server. localStorage failures (private mode, storage
 * quota) degrade to session-only state: reads fall back to the default and
 * writes still notify this tab's listeners, so the toggle keeps working —
 * it just forgets on reload.
 *
 * The `storage` event only fires in OTHER tabs, so writes also notify a
 * local listener set — both paths funnel through the same subscribe.
 */
const IDLE_MOTION_KEY = "arch-lab:sequence-idle-motion";
const idleMotionListeners = new Set<() => void>();

function readIdleMotion(): boolean {
  try {
    return window.localStorage.getItem(IDLE_MOTION_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeIdleMotion(on: boolean): void {
  try {
    window.localStorage.setItem(IDLE_MOTION_KEY, on ? "on" : "off");
  } catch {
    /* Session-only degradation — see the store comment. */
  }
  for (const listener of idleMotionListeners) listener();
}

function subscribeIdleMotion(onChange: () => void): () => void {
  idleMotionListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    idleMotionListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useIdleMotion(): boolean {
  return useSyncExternalStore(subscribeIdleMotion, readIdleMotion, () => true);
}

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
  // ONE layout call per model — the single source of geometric truth.
  const layout = useMemo(() => layoutSequence(file), [file]);
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
        return nameById.has(raw.id) ? raw : null;
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

  const handleFocusMessage = useCallback(
    (focusedStep: number) => {
      setRawFocus((prev) => ({
        focus: { kind: "message", step: focusedStep },
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const message = layout.messages.find((m) => m.step === focusedStep);
      if (message !== undefined) {
        onAnnounce(
          `Message ${focusedStep} of ${layout.stepCount}: ${nameById.get(message.from) ?? message.from} to ${nameById.get(message.to) ?? message.to} — ${message.label}. Details open beside the diagram; Escape clears focus.`,
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

  const applyZoom = useCallback(
    (next: number) => {
      const clamped = Math.min(4, Math.max(0.1, next));
      setZoom(clamped);
      onAnnounce(
        `Zoom ${Math.round(clamped * 100)} percent. Scroll the diagram pane to pan.`,
      );
    },
    [onAnnounce],
  );

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const current = zoom === "fit" ? measureFitScale() : zoom;
      applyZoom(current * (direction === 1 ? 1.25 : 1 / 1.25));
    },
    [zoom, measureFitScale, applyZoom],
  );

  const applyFit = useCallback(() => {
    setZoom("fit");
    onAnnounce("Diagram fitted to view — the whole flow is on screen.");
  }, [onAnnounce]);

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
      ? (file.participants.find((p) => p.id === focus.id) ?? null)
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
    const technology = file.participants.find((p) => p.id === id)?.technology;
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
          className="h-full overflow-auto bg-canvas p-3"
          tabIndex={0}
          role="application"
          aria-label="Sequence diagram. Arrow keys move focus between messages, Escape clears focus. Messages, participants and fragment chips are buttons — Tab reaches them."
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
          <div className={zoom === "fit" ? "h-full w-full" : "w-max"}>
            <SequenceDiagram
              layout={layout}
              title={file.metadata.title}
              autonumber={file.autonumber === true}
              focus={focus}
              focusNonce={rawFocus?.nonce ?? 0}
              zoom={zoom}
              onFocusMessage={handleFocusMessage}
              onFocusParticipant={handleFocusParticipant}
              onFocusFragment={handleFocusFragment}
              onClearFocus={handleClearFocus}
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
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            aria-label="Zoom out"
            title="Zoom out"
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
            className="min-w-11 rounded-md px-1.5 py-1 text-center text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() => stepZoom(1)}
            aria-label="Zoom in"
            title="Zoom in"
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
          controls are gone, the affordances are not. */}
      <p className="hidden border-t border-border bg-card px-4 py-1.5 text-xs text-muted-foreground sm:block">
        Click a message, participant, or fragment chip to focus it · ← → move
        between messages · Esc clears focus
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

/** Shared icon-button styling for the zoom pill (the C4 controls' look). */
const ZOOM_BUTTON_CLASSES =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/* -------------------------------------------------------------------------- */
/* Dock building blocks                                                         */
/* -------------------------------------------------------------------------- */

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
