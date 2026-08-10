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
 *     sequence-motion.css) and holds it emphasised; the detail panel below
 *     names sender, receiver, label, technology, kind and step.
 *   - Clicking a PARTICIPANT re-draws its whole message set in step order,
 *     lightly staggered so it reads as one gesture; the panel says how many
 *     messages it takes part in, and which.
 *   - Clicking a FRAGMENT's kind chip re-draws every message in the
 *     fragment — all branches, nested fragments included; clicking a branch
 *     GUARD label re-draws just that branch's flow. The step sets come from
 *     the layout (LaidFragment.steps / .branches), never recomputed here;
 *     the panel names the fragment, the branch, the steps and the
 *     participants involved.
 *   - Everything outside the focus set recedes (opacity only); Escape — or
 *     clicking empty canvas — brings the full diagram back.
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

import type { SequenceLabFile } from "@/types";

import { layoutSequence } from "../lib/layout";
import { sequenceMotionVars } from "../lib/motion";
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
          `Message ${focusedStep} of ${layout.stepCount}: ${nameById.get(message.from) ?? message.from} to ${nameById.get(message.to) ?? message.to} — ${message.label}. Details below the diagram; Escape clears focus.`,
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
        `Focused ${fragment.kind} fragment${guard !== undefined ? ` branch [${guard}]` : ""} — ${steps.length} of ${layout.stepCount} messages${steps.length > 0 ? ` (steps ${steps.join(", ")})` : ""}. Details below the diagram; Escape clears focus.`,
      );
    },
    [layout, onAnnounce],
  );

  const handleClearFocus = useCallback(() => {
    if (focus !== null) onAnnounce("Focus cleared.");
    setRawFocus(null);
  }, [focus, onAnnounce]);

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

  const focusedMessage =
    focus?.kind === "message"
      ? (layout.messages.find((m) => m.step === focus.step) ?? null)
      : null;
  const focusedParticipant =
    focus?.kind === "participant"
      ? (file.participants.find((p) => p.id === focus.id) ?? null)
      : null;
  const focusedParticipantSteps =
    focusedParticipant === null
      ? []
      : layout.messages
          .filter(
            (m) =>
              m.from === focusedParticipant.id ||
              m.to === focusedParticipant.id,
          )
          .map((m) => m.step);

  // Fragment focus detail — the steps come from the SAME resolver the
  // diagram dims with, so the panel can never describe a different flow
  // than the one lit up.
  const focusedFragment =
    focus?.kind === "fragment" ? (fragmentById.get(focus.id) ?? null) : null;
  const focusedFragmentGuard =
    focus?.kind === "fragment" && focus.branch !== null
      ? focusedFragment?.branches[focus.branch]?.label
      : undefined;
  const focusedFragmentSteps =
    focusedFragment === null ? null : resolveFocusSteps(layout, focus);
  const focusedFragmentStepList =
    focusedFragmentSteps === null
      ? []
      : layout.messages
          .filter((m) => focusedFragmentSteps.has(m.step))
          .map((m) => m.step);
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

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      // Arrow keys live on the wrapper, not on window: a global listener
      // would steal them from the source pane below this viewer. (Escape is
      // the exception — see the ladder comment above handleKeyDown.)
      onKeyDown={handleKeyDown}
      style={motionVars}
    >
      {/* No live region here — the hosting page owns the single polite
          region and focus announcements travel through `onAnnounce`. */}
      <div
        className="min-h-0 flex-1 overflow-auto bg-canvas p-3"
        tabIndex={0}
        role="application"
        aria-label="Sequence diagram. Arrow keys move focus between messages, Escape clears focus. Messages, participants and fragment chips are buttons — Tab reaches them."
      >
        <SequenceDiagram
          layout={layout}
          title={file.metadata.title}
          autonumber={file.autonumber === true}
          focus={focus}
          focusNonce={rawFocus?.nonce ?? 0}
          onFocusMessage={handleFocusMessage}
          onFocusParticipant={handleFocusParticipant}
          onFocusFragment={handleFocusFragment}
          onClearFocus={handleClearFocus}
        />
      </div>

      {/* ---- detail panel (click-to-focus) ----
          With playback and its counter gone, this panel is the ONLY place a
          step number appears — "Step N of M" leads for exactly that reason. */}
      {focusedMessage !== null ? (
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-border bg-card px-4 py-2.5 text-sm">
          <Detail
            term="Step"
            value={`${focusedMessage.step} of ${layout.stepCount}`}
            mono
          />
          <Detail
            term="From"
            value={nameById.get(focusedMessage.from) ?? focusedMessage.from}
          />
          <Detail
            term="To"
            value={nameById.get(focusedMessage.to) ?? focusedMessage.to}
          />
          <Detail term="Label" value={focusedMessage.label} />
          {focusedMessage.technology !== undefined ? (
            <Detail term="Technology" value={focusedMessage.technology} mono />
          ) : null}
          <Detail
            term="Kind"
            value={
              focusedMessage.self
                ? `${focusedMessage.kind} (self-message)`
                : focusedMessage.kind
            }
            mono
          />
        </dl>
      ) : null}
      {focusedParticipant !== null ? (
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-border bg-card px-4 py-2.5 text-sm">
          <Detail term="Participant" value={focusedParticipant.name} />
          <Detail
            term="Kind"
            value={focusedParticipant.kind ?? "participant"}
            mono
          />
          {focusedParticipant.technology !== undefined ? (
            <Detail
              term="Technology"
              value={focusedParticipant.technology}
              mono
            />
          ) : null}
          {focusedParticipant.description !== undefined ? (
            <Detail term="Description" value={focusedParticipant.description} />
          ) : null}
          {/* Not just a count: WHICH steps it touches is what lets the user
              jump from this panel back into the story with the arrow keys. */}
          <Detail
            term="Messages"
            value={
              focusedParticipantSteps.length === 0
                ? "none"
                : `${focusedParticipantSteps.length} of ${layout.stepCount} — steps ${focusedParticipantSteps.join(", ")}`
            }
            mono
          />
        </dl>
      ) : null}
      {focusedFragment !== null ? (
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-border bg-card px-4 py-2.5 text-sm">
          <Detail term="Fragment" value={focusedFragment.kind} mono />
          {focusedFragmentGuard !== undefined ? (
            <Detail term="Branch" value={`[${focusedFragmentGuard}]`} />
          ) : (
            <Detail
              term="Branches"
              value={`${focusedFragment.branches.length} (all focused)`}
            />
          )}
          <Detail
            term="Messages"
            value={
              focusedFragmentStepList.length === 0
                ? "none"
                : `${focusedFragmentStepList.length} of ${layout.stepCount} — steps ${focusedFragmentStepList.join(", ")}`
            }
            mono
          />
          <Detail
            term="Participants"
            value={
              focusedFragmentParticipants.length === 0
                ? "none"
                : focusedFragmentParticipants.join(", ")
            }
          />
        </dl>
      ) : null}

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

function Detail({
  term,
  value,
  mono = false,
}: {
  term: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
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
