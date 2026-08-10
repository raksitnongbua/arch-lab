"use client";

/**
 * The sequence PLAYER: layout + playback + focus, composed around the pure
 * `SequenceDiagram` renderer. This component owns every piece of interaction
 * state; the renderer below it stays a function of (layout, step, focus).
 *
 * PLAYBACK ⟂ FOCUS — the composition rule, stated once:
 *   Focusing anything PAUSES playback, and pressing Play CLEARS focus.
 *   The alternative — letting auto-play advance under a focus — was rejected
 *   because focus dims most of the canvas, so new arrows would arrive
 *   pre-dimmed and unexplained; and a focus that auto-clears on the next
 *   tick makes the detail panel a 1.3-second toaster. Pause-on-focus means
 *   "I am reading this" and play-clears-focus means "carry on", which are
 *   the two intents the gestures already express.
 *
 * REDUCED MOTION parks the player on the MEANINGFUL frame: the complete
 * diagram. A sequence diagram is a record of what happened, so "finished" is
 * the static truth — a merely faster replay would still be a replay.
 * Stepping and focus stay fully usable from there; pressing Play still walks
 * the steps at the same readable cadence, just without draw animations
 * (every `--seq-*` duration is 0 — see lib/motion.ts).
 *
 * State discipline: the step is DERIVED (`rawStep ?? reduced-motion
 * default`, clamped to the current model) rather than synchronised by
 * effects — no setState in an effect body, per the same eslint rule
 * `editor/components/view-mode-link.tsx` documents. The only state writes
 * happen in event handlers and the auto-play timer callback.
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
import { SEQUENCE_DURATIONS, sequenceMotionVars } from "../lib/motion";
import type { SequenceFocus } from "./sequence-diagram";
import { SequenceDiagram } from "./sequence-diagram";
import { SequenceControls } from "./sequence-controls";

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
/* The player                                                                   */
/* -------------------------------------------------------------------------- */

export function SequencePlayer({
  file,
}: {
  file: SequenceLabFile;
}): React.JSX.Element {
  // ONE layout call per model — the single source of geometric truth.
  const layout = useMemo(() => layoutSequence(file), [file]);
  const nameById = useMemo(
    () => new Map(file.participants.map((p) => [p.id, p.name])),
    [file],
  );

  const reduced = useReducedMotion();

  /**
   * `null` = "the user has not stepped yet, use the default": 0 normally
   * (play from the start), the final step under reduced motion. Clamping at
   * READ time — not with a state-sync effect — is what keeps a re-parse that
   * shrank the model from ever rendering a step that no longer exists.
   */
  const [rawStep, setRawStep] = useState<number | null>(null);
  const step = Math.min(
    rawStep ?? (reduced ? layout.stepCount : 0),
    layout.stepCount,
  );
  // The auto-play timer needs the CURRENT step without re-arming per tick;
  // a render-synchronised ref is the standard escape hatch.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });

  const [playing, setPlaying] = useState(false);
  const [rawFocus, setRawFocus] = useState<SequenceFocus>(null);
  const [announcement, setAnnouncement] = useState("");

  // Focus is validated at read time too: a re-parse can remove the focused
  // message or participant, and a focus pointing at nothing must read as no
  // focus. A message focus beyond the current step (possible after stepping
  // back) also clears — the message is no longer on screen.
  const focus: SequenceFocus =
    rawFocus === null
      ? null
      : rawFocus.kind === "message"
        ? rawFocus.step <= Math.min(step, layout.stepCount)
          ? rawFocus
          : null
        : nameById.has(rawFocus.id)
          ? rawFocus
          : null;

  const announceStep = useCallback(
    (nextStep: number) => {
      if (nextStep === 0) {
        setAnnouncement("At the start — nothing has happened yet.");
        return;
      }
      const message = layout.messages.find((m) => m.step === nextStep);
      if (message === undefined) return;
      setAnnouncement(
        `Step ${nextStep} of ${layout.stepCount}: ` +
          `${nameById.get(message.from) ?? message.from} to ` +
          `${nameById.get(message.to) ?? message.to} — ${message.label}` +
          (nextStep === layout.stepCount ? ". End of diagram." : ""),
      );
    },
    [layout, nameById],
  );

  /* ---- playback ---------------------------------------------------------- */

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => {
      // Cadence is unchanged under reduced motion: steps must stay readable
      // EVENTS; only the per-arrow animation inside each step is parked.
      const next = Math.min(stepRef.current + 1, layout.stepCount);
      setRawStep(next);
      announceStep(next);
      if (next >= layout.stepCount) setPlaying(false);
    }, SEQUENCE_DURATIONS.autoAdvance);
    return () => window.clearInterval(interval);
  }, [playing, layout.stepCount, announceStep]);

  const handlePlayPause = useCallback(() => {
    setRawFocus(null); // play means "carry on" — the composition rule above
    if (playing) {
      setPlaying(false);
      setAnnouncement("Paused.");
      return;
    }
    // Play at the end restarts; anywhere else it resumes.
    if (step >= layout.stepCount) setRawStep(0);
    setPlaying(true);
    setAnnouncement("Playing.");
  }, [playing, step, layout.stepCount]);

  const handleStepForward = useCallback(() => {
    setPlaying(false);
    const next = Math.min(step + 1, layout.stepCount);
    setRawStep(next);
    announceStep(next);
  }, [step, layout.stepCount, announceStep]);

  const handleStepBack = useCallback(() => {
    setPlaying(false);
    const next = Math.max(0, step - 1);
    setRawStep(next);
    announceStep(next);
  }, [step, announceStep]);

  const handleRestart = useCallback(() => {
    setPlaying(false);
    setRawFocus(null);
    setRawStep(0);
    setAnnouncement("Restarted — at the start.");
  }, []);

  /* ---- focus ------------------------------------------------------------- */

  const handleFocusMessage = useCallback(
    (focusedStep: number) => {
      setPlaying(false); // focusing pauses playback
      setRawFocus({ kind: "message", step: focusedStep });
      const message = layout.messages.find((m) => m.step === focusedStep);
      if (message !== undefined) {
        setAnnouncement(
          `Focused message ${focusedStep}: ${nameById.get(message.from) ?? message.from} to ${nameById.get(message.to) ?? message.to} — ${message.label}. Details below the diagram; Escape clears focus.`,
        );
      }
    },
    [layout, nameById],
  );

  const handleFocusParticipant = useCallback(
    (id: string) => {
      setPlaying(false); // focusing pauses playback
      setRawFocus({ kind: "participant", id });
      setAnnouncement(
        `Focused participant ${nameById.get(id) ?? id} — its messages stay highlighted. Escape clears focus.`,
      );
    },
    [nameById],
  );

  const handleClearFocus = useCallback(() => {
    if (focus !== null) setAnnouncement("Focus cleared.");
    setRawFocus(null);
  }, [focus]);

  /* ---- keyboard ----------------------------------------------------------- */

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Buttons handle their own Space/Enter; don't double-fire play/pause
      // when the event started on one (or on an in-SVG button, which stops
      // propagation itself).
      const onButton =
        event.target instanceof Element &&
        event.target.closest("button") !== null;
      switch (event.key) {
        case " ":
          if (onButton) return;
          event.preventDefault();
          handlePlayPause();
          break;
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          handleStepForward();
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          handleStepBack();
          break;
        case "Escape":
          handleClearFocus();
          break;
        case "Home":
          event.preventDefault();
          handleRestart();
          break;
        default:
          break;
      }
    },
    [
      handlePlayPause,
      handleStepForward,
      handleStepBack,
      handleClearFocus,
      handleRestart,
    ],
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

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      // Keyboard shortcuts live on the wrapper, not on window: a global
      // listener would steal Space from the text pane next to this player.
      onKeyDown={handleKeyDown}
      style={motionVars}
    >
      {/* One polite live region for playback AND focus announcements. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div
        className="min-h-0 flex-1 overflow-auto bg-canvas p-3"
        tabIndex={0}
        role="application"
        aria-label="Sequence diagram player. Space plays or pauses, arrow keys step, Escape clears focus. Messages and participants are buttons — Tab reaches them."
      >
        <SequenceDiagram
          layout={layout}
          title={file.metadata.title}
          autonumber={file.autonumber === true}
          step={step}
          focus={focus}
          onFocusMessage={handleFocusMessage}
          onFocusParticipant={handleFocusParticipant}
          onClearFocus={handleClearFocus}
        />
      </div>

      {/* ---- detail panel (click-to-focus) ---- */}
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
          <Detail
            term="Messages"
            value={String(
              layout.messages.filter(
                (m) =>
                  m.from === focusedParticipant.id ||
                  m.to === focusedParticipant.id,
              ).length,
            )}
            mono
          />
        </dl>
      ) : null}

      <SequenceControls
        step={step}
        stepCount={layout.stepCount}
        playing={playing}
        onPlayPause={handlePlayPause}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onRestart={handleRestart}
      />

      {/* Text alternative: the whole story as an ordered list, for readers
          the SVG serves poorly. Kept in sync for free — it reads the same
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
