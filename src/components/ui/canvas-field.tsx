/**
 * THE WELL'S RULE LAYER, for every canvas that is not React Flow.
 *
 * `lib/canvas-ground.ts` owns the model — an adaptive ladder of world-space
 * pitches, of which only the levels whose ON-SCREEN pitch lands inside a
 * readable band are painted. THIS is that ladder drawn in SVG, for the eight
 * notations that draw plain SVG; the two C4 canvases get the identical levels
 * through React Flow's `<Background>` in `canvas-ground-layers.tsx`. Both read
 * `groundLevels()`, so the two mechanisms cannot rule at different pitches.
 *
 * IT IS DRAWN INSIDE THE DIAGRAM'S OWN `<svg>`, IN THE DIAGRAM'S OWN
 * COORDINATES, and that is what makes it a rule rather than a sheet. A ground
 * painted on the pane stays still while the drawing slides over it, which tells
 * the reader the paper is not under the drawing — that model shipped once and
 * was rejected on sight. A `<pattern>` in `userSpaceOnUse` units is in the
 * drawing's coordinate space by construction, so it pans, scrolls and zooms
 * with the drawing without a line of camera maths.
 *
 * WHAT THE CAMERA IS FOR, then, since the pattern does not need it to move.
 * The ladder needs to know which levels are currently READABLE, and that is a
 * question about screen pixels: `screenPitch = worldPitch × scale`. So `scale`
 * selects the levels and sizes the marks, and the drawing's own transform
 * places them. It is the host's existing camera — never a second measurement
 * of the same thing.
 *
 * THE MARKS ARE SIZED IN SCREEN PIXELS, DIVIDED BACK OUT. A stroke of
 * `lineWidthPx / scale` user units renders as `lineWidthPx` on screen once the
 * drawing's transform is applied. Under the previous model the weight scaled
 * with the camera too, so at 400% the grid was drawn in 4px lines and at 10% it
 * was invisible. Engraving on a ruler does not get thicker when you lean in.
 *
 * IT MARKS THE SHEET, NOT THE PANE, and that is deliberate. The rect is the
 * diagram's own box, so on a pane wider than the drawing the field ends where
 * the drawing ends. C4's field is infinite because a C4 canvas is an infinite
 * surface you pan around; these eight are finite drawings, and a finite drawing
 * on a ruled sheet is what a sheet of paper is.
 *
 * IT IS NOT IN ANY EXPORT AS A LADDER. An export has no camera, so there is no
 * `scale` to select a level with — see `check:canvas-grid`, which pins the
 * exporters, and note that `sequence/export/render-svg.ts` CLONES the live
 * `<svg>` rather than building a string, so for that one exporter the absence
 * has to be arranged rather than assumed.
 *
 * A FIXED id PER KIND, not the per-instance one `<WashGradient>` uses. A wash
 * gradient is built from the node's OWN fill, so two nodes sharing an id paint
 * each other's colour. The field is the same tokens on every canvas of every
 * kind, so two diagrams sharing it resolve identically — and a fixed id also
 * keeps this usable from the server-rendered example views, which cannot call
 * `useId`. `af-gantt-hatch` is the same call for the same reason.
 */

import { CANVAS_FIELD_CLASS, groundLevels } from "@/lib/canvas-ground";

/** The diagram's own box, in its own user units — normally its viewBox. */
export interface CanvasFieldBox {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export function CanvasField({
  id,
  x = 0,
  y = 0,
  width,
  height,
  scale,
}: CanvasFieldBox & {
  id: string;
  /**
   * Drawing units → screen pixels, from the host's camera. `1` is the right
   * answer for a canvas drawn at natural size, not a placeholder.
   */
  scale: number;
}): React.JSX.Element {
  const levels = groundLevels(scale);
  /* The patterns are ANCHORED TO THE BOX, not to the user-space origin: a
     sequence diagram's viewBox starts at a negative x, and a lattice anchored
     at 0 would put its first rule at a different place inside the drawing than
     the same lattice does on every other kind. */
  const anchor = { x, y };
  return (
    <>
      <defs>
        {levels.map((level) => {
          const dotRadius = level.dotSizePx / 2 / scale;
          const lineWidth = level.lineWidthPx / scale;
          return (
            <g key={level.index}>
              <pattern
                id={`${id}-dots-${level.index}`}
                patternUnits="userSpaceOnUse"
                width={level.worldPitch}
                height={level.worldPitch}
                {...anchor}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={dotRadius}
                  fill="var(--canvas-rule-dot)"
                />
              </pattern>
              <pattern
                id={`${id}-lines-${level.index}`}
                patternUnits="userSpaceOnUse"
                width={level.worldPitch}
                height={level.worldPitch}
                {...anchor}
              >
                <path
                  d={`M ${level.worldPitch} 0 L 0 0 L 0 ${level.worldPitch}`}
                  fill="none"
                  stroke="var(--canvas-rule-line)"
                  strokeWidth={lineWidth}
                />
              </pattern>
            </g>
          );
        })}
      </defs>
      {/* A rect per pattern rather than one with several fills: SVG has no fill
          stacking. Finest first, so a coarser level's heavier line lies ON the
          finer one at every intersection they share.
          BOTH SHAPES ARE ALWAYS MOUNTED and one of them is transparent, which
          is the same call `role-texture.tsx` makes: whether a theme rules in
          dots or in lines is a THEME decision, and this app resolves those in
          CSS so they are right on the very first frame with no post-hydration
          swap. The cost is a rect that paints nothing; the alternative is a
          frame of the wrong ground on every load.
          `pointer-events: none` throughout — the field lies under the drawing
          and must never take a click meant for it. */}
      <g
        aria-hidden="true"
        className={`${CANVAS_FIELD_CLASS} pointer-events-none`}
      >
        {levels.map((level) => (
          <g key={level.index} opacity={level.opacity}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={`url(#${id}-dots-${level.index})`}
            />
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              fill={`url(#${id}-lines-${level.index})`}
            />
          </g>
        ))}
      </g>
    </>
  );
}
