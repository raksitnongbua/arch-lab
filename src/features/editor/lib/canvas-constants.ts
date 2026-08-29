/**
 * Canvas numbers. Frozen after Batch 1 — every ticket reads
 * these constants; nobody writes a magic number for any of them.
 */

/** Node positions quantise to this grid while dragging. */
export const GRID_SIZE = 8;

/**
 * Quantise a coordinate to {@link GRID_SIZE}.
 *
 * Here rather than at each call site for the reason in this file's header: the
 * rounding is part of the grid decision, and three components had each written
 * their own one-line `snap` over the same constant.
 *
 * `state/model.ts` deliberately keeps its own copy — the store enforces the
 * ×8 invariant with no UI present and must not import from `lib/`. Those two
 * are kept in step by hand; see the geometry-constants note there.
 */
export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * THE CANVAS WELL'S FIELD, and the one seam a theme can rule its own sheet with.
 *
 * The well is drawn by THREE stacked `<Background>` layers, which is React
 * Flow's own documented arrangement for a major/minor grid (its `<Background>`
 * doc block shows exactly this, two `Lines` layers at different gaps with
 * different colours; each layer needs a unique `id`). Stacking is why this is a
 * seam at all — a single layer takes one `color` prop and can only ever be one
 * strength.
 *
 * The three layers paint three TOKENS, and the tokens are what make it opt-in:
 * `--canvas-dot` defaults to `var(--canvas-grid)` and the two rule tokens
 * default to `transparent`, so a theme that says nothing gets exactly the dot
 * field it has always had and the two rule layers draw literally nothing. Only
 * `blueprint` opts in. See the tokens in `globals.css` for WHY it is opt-in
 * rather than a set every theme completes.
 *
 * THE LAYERS ARE ALWAYS MOUNTED, even when two of them are transparent, and
 * that is deliberate rather than lazy. Rendering them conditionally would mean
 * JavaScript reading the active theme, and this app decides theme-dependent
 * presentation in CSS precisely so it is right on the very first frame with no
 * post-hydration swap (`layout/theme-toggle.tsx` makes the same argument for
 * its trigger icon). The cost is two extra `<svg>` elements per canvas that
 * paint nothing; the alternative costs a frame of wrong grid on every load.
 */

/** Pitch of the minor field — dots, and the minor rule where one is used. */
export const CANVAS_FIELD_GAP = GRID_SIZE * 2;

/**
 * How many minor pitches to a major rule. FIVE, the drafting convention, and an
 * INTEGER on purpose: a major gap that is not a whole multiple of the minor one
 * puts heavy lines between light ones instead of on top of them, which reads as
 * moire rather than as ruling. `check:canvas-grid` asserts the multiple.
 */
export const CANVAS_RULE_MAJOR_STEP = 5;

/**
 * Stroke weights. The major rule is heavier as well as brighter, because a
 * ruled sheet separates its two rules by WEIGHT first — colour alone would make
 * the major line merely a lighter minor line. Weight is a constant rather than
 * a token: a theme that does not opt in paints both rules transparent, so the
 * weight of a line nobody can see costs nothing.
 */
export const CANVAS_RULE_WIDTH = 1;
export const CANVAS_RULE_MAJOR_WIDTH = 1.5;

/** Distance (flow units) at which alignment guides appear and snap. */
export const ALIGNMENT_THRESHOLD = 6;

/** Zoom clamp: 10%–400%. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4.0;

export const MIN_NODE_SIZE = { width: 120, height: 64 } as const;
export const DEFAULT_NODE_SIZE = { width: 176, height: 88 } as const;

/** Offset applied by paste/duplicate (v0.2) and overlap-avoidance on create. */
export const PASTE_OFFSET = 16;

/** Fit-to-view padding around the node bounds, in screen pixels. */
export const FIT_VIEW_PADDING_PX = 48;

/**
 * How far off a connection handle a release still counts, in flow units.
 *
 * One decision expressed once: this is also the dots' hit box in
 * `node-chrome.tsx` (`after:-inset-3` → 32px). Deliberately small — node
 * INTERIORS are covered by the full-bleed body handle there, not by this
 * radius, so widening it would only start reaching into neighbouring nodes and
 * silently retargeting the drop.
 */
export const CONNECT_SNAP_RADIUS = 32;

/** Arrow-key nudge distances: plain vs `Shift`-held. */
export const NUDGE_STEP = 8;
export const NUDGE_STEP_FINE = 1;
