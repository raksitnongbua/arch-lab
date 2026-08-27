/**
 * The zoom pill's CHROME — the bottom-RIGHT cluster every canvas in this app
 * wears: the two C4 canvases, the sequence, flowchart, use-case and ER
 * viewers, and the data dictionary.
 *
 * The corner is shared for a reason worth recording: before it was, two of the
 * seven already disagreed — the ER and dictionary viewers pinned the pill
 * bottom-right while the other five pinned it bottom-left — so the drift this
 * module was written to stop had already happened in POSITION while the
 * controls stayed in step. `check:canvas-chrome` now pins the corner too.
 *
 * Only the look lives here, deliberately. The three canvases zoom by genuinely
 * different mechanisms (React Flow's viewport in the two C4 canvases, a
 * hand-rolled SVG scale in the sequence viewer) and clamp at different limits
 * (`viewer/lib/canvas-constants.ts` allows less extreme zoom than the editor's,
 * each argued in its own file). Merging the behaviour would flatten those
 * decisions; leaving the classes copied three times is what let one pill grow
 * `+`/`−` buttons while the other two kept only a readout, which is the drift
 * this module exists to stop.
 *
 * `ZOOM_STEP` is here for the same reason: "one press of `+`" must mean the
 * same amount of zoom on all three canvases, or the control is only nominally
 * the same control.
 */

/** The container: a translucent, blurred capsule pinned over the canvas. */
export const ZOOM_PILL_CLASSES =
  "flex items-center gap-0.5 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur";

/** An icon button inside the pill (zoom in, zoom out, fit). */
export const ZOOM_BUTTON_CLASSES =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * The percentage readout, which is also the "back to 100%" button. Wider than
 * an icon button and `tabular-nums` so the pill does not resize as the digits
 * change under a drag-zoom.
 */
export const ZOOM_READOUT_CLASSES =
  "min-w-11 rounded-md px-1.5 py-1 text-center text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * One press of `+` or `−`, as a multiplier. 1.25 rather than 2: doubling
 * overshoots what you were looking at, and four presses to cross one octave is
 * a control you can steer.
 */
export const ZOOM_STEP = 1.25;

/**
 * Gesture hints for the buttons' `title`, so the pointer-free route out of
 * "the diagram is too small" is discoverable from the control itself rather
 * than only from a shortcut sheet. Both C4 canvases and the sequence viewer
 * claim ctrl/⌘ + scroll and the trackpad pinch, so one wording covers all
 * three.
 */
export const ZOOM_IN_TITLE = "Zoom in — or pinch, or hold ⌘/Ctrl and scroll";
export const ZOOM_OUT_TITLE = "Zoom out — or pinch, or hold ⌘/Ctrl and scroll";
