"use client";

/**
 * The control that exists only while a path is being walked: the beat's
 * sentence, where it sits in the walk, the way forward and back, and the way
 * out. Gone the moment the path is left.
 *
 * This is the only place a path's prose ever appears on screen. Everything the
 * reference concept pinned permanently around the canvas — a header block,
 * numbered chips, three caption cards below the drawing — lives here instead
 * and is on screen only while someone is actually reading it.
 *
 * NOT A MODAL AND NOT A FOCUS TRAP, the same argument the tour records: it
 * controls a canvas the reader can still see and use underneath it, so its
 * controls are real buttons in the tab order and the page behind stays live.
 */

import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  PATH_PLAY_MAX_MS,
  PATH_PLAY_MS_PER_BEAT,
  PATH_PLAY_BASE_MS,
} from "../lib/motion";

interface ViewerPathPlayerProps {
  title: string;
  caption: string;
  /** 0-based. */
  beat: number;
  beatCount: number;
  onStep: (delta: number) => void;
  onGoTo: (beat: number) => void;
  onLeave: () => void;
}

/** How long Play rests on one beat: reading-paced, by the caption's length. */
function dwellFor(caption: string): number {
  return Math.min(
    PATH_PLAY_BASE_MS + PATH_PLAY_MS_PER_BEAT * caption.length,
    PATH_PLAY_MAX_MS,
  );
}

export function ViewerPathPlayer({
  title,
  caption,
  beat,
  beatCount,
  onStep,
  onGoTo,
  onLeave,
}: ViewerPathPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  // An invoked control receives focus, so the arrows work with no further
  // setup. Only on ENTERING — a beat change must never move focus, or a reader
  // stepping with the keyboard would have the ring yanked out from under them.
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  /**
   * Play. Rests on each beat for as long as its sentence takes to read, and
   * ends by leaving — stepping past the last beat is what `onStep` already
   * does, so autoplay and a reader pressing → end the walk the same way.
   *
   * Any manual step stops it: the timer is keyed on the beat, so a press that
   * changes the beat tears this effect down, and `setPlaying(false)` on every
   * control below makes the stop explicit rather than a race.
   */
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => onStep(1), dwellFor(caption));
    return () => clearTimeout(timer);
  }, [playing, beat, caption, onStep]);

  /**
   * Beat keys, and they live HERE rather than on the canvas for two reasons:
   * the canvas is pinned by `check:canvas-edit` to exactly two keydown
   * listeners, and this component is mounted only while a walk is on — so the
   * listener exists exactly while the keys mean something.
   *
   * PageDown/PageUp are aliases because that is what a presentation remote
   * sends. It is the difference between a path being a thing you click and a
   * path being a thing you can present from the back of a room.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // The same form-field exemption the Escape ladder and the edit keys
      // make, for the same reason: the details panel's inputs are siblings of
      // this listener.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const delta =
        event.key === "ArrowRight" || event.key === "PageDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "PageUp"
            ? -1
            : 0;
      if (delta === 0) return;
      event.preventDefault();
      setPlaying(false);
      onStep(delta);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onStep]);

  const buttonClass =
    "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div
      role="group"
      aria-label={`Path: ${title}`}
      className="flex w-fit max-w-[min(36rem,calc(100vw-2rem))] flex-col gap-1 rounded-lg border border-border/70 bg-card/80 px-3 py-2 shadow-sm backdrop-blur"
    >
      {/* The caption announces itself, position first, because a listener who
          cannot see the dim needs to know where in the walk they are before
          they hear what it says. */}
      <p aria-live="polite" className="line-clamp-2 text-sm font-medium">
        <span className="sr-only">
          {`Beat ${(beat + 1).toString()} of ${beatCount.toString()}: `}
        </span>
        {caption}
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">
          {title}
        </span>
        <span aria-hidden="true" className="hidden items-center gap-1 sm:flex">
          {Array.from({ length: beatCount }, (_, index) => (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              onClick={() => {
                setPlaying(false);
                onGoTo(index);
              }}
              className={`size-1.5 rounded-full transition-colors ${
                index === beat ? "bg-primary" : "bg-muted-foreground/40"
              }`}
            />
          ))}
        </span>
        <span
          aria-hidden="true"
          className="ml-auto font-mono text-xs text-muted-foreground tabular-nums"
        >
          {`${(beat + 1).toString()}/${beatCount.toString()}`}
        </span>
        <button
          type="button"
          aria-label="Previous beat"
          aria-keyshortcuts="ArrowLeft"
          disabled={beat === 0}
          onClick={() => {
            setPlaying(false);
            onStep(-1);
          }}
          className={buttonClass}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play the walk"}
          onClick={() => setPlaying((wasPlaying) => !wasPlaying)}
          className={buttonClass}
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
        </button>
        <button
          ref={nextRef}
          type="button"
          aria-label="Next beat"
          aria-keyshortcuts="ArrowRight"
          onClick={() => {
            setPlaying(false);
            onStep(1);
          }}
          className={buttonClass}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Leave path (Escape)"
          onClick={onLeave}
          className={buttonClass}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
