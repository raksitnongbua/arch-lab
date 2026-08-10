"use client";

/**
 * The playback control strip: real <button>s (never clickable divs), a
 * step counter, and the keyboard hint. State changes are announced by the
 * PLAYER's single polite live region, not here — two live regions racing
 * each other is how announcements get swallowed.
 */

import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export interface SequenceControlsProps {
  step: number;
  stepCount: number;
  playing: boolean;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onRestart: () => void;
}

export function SequenceControls({
  step,
  stepCount,
  playing,
  onPlayPause,
  onStepBack,
  onStepForward,
  onRestart,
}: SequenceControlsProps): React.JSX.Element {
  const atStart = step <= 0;
  const atEnd = step >= stepCount;

  return (
    <div
      role="group"
      aria-label="Playback controls"
      className="flex flex-wrap items-center gap-1.5 border-t border-border bg-card px-3 py-2"
    >
      <button
        type="button"
        onClick={onRestart}
        disabled={atStart && !playing}
        aria-label="Restart from the beginning"
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        <RotateCcw aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onStepBack}
        disabled={atStart}
        aria-label="Step back"
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onPlayPause}
        // Play restarts from 0 when the run has finished — a play button
        // that does nothing at the end is a dead control.
        aria-label={playing ? "Pause playback" : "Play"}
        className={buttonClasses({ variant: "primary", size: "sm" })}
      >
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        {playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={onStepForward}
        disabled={atEnd}
        aria-label="Step forward"
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        <ChevronRight aria-hidden="true" />
      </button>

      <p className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
        {step} / {stepCount}
      </p>

      <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
        Space play/pause · ← → step · Esc clears focus
      </p>
    </div>
  );
}
