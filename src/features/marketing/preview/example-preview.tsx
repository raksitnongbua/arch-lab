import {
  shapeTop,
  type Wireframe,
  type WireShape,
  type WireTone,
} from "./wireframe";

/**
 * A `Wireframe` painted into a card-sized panel.
 *
 * THE PANEL IS A FIXED 16:10 and the document is whatever shape it is, so the
 * two have to be reconciled. Shrinking each document to fit would put a 40-row
 * dictionary and a 4-box context diagram at wildly different scales, and the
 * dictionary would arrive as grey dust — so instead every preview is drawn at
 * ONE scale, and a document too tall for the panel shows its top and fades out
 * at the bottom edge rather than being guillotined, which is what says "this
 * continues" instead of "this is all there is".
 *
 * That scale is set by `REFERENCE_WIDTH` rather than by each document's own
 * width, which is the correction the first version of this file needed and the
 * reason that constant carries the longer note. Fitting each document's width
 * sounds like the same thing and is not: it magnifies a narrow document until
 * the panel holds almost none of its height.
 *
 * STROKES ARE NON-SCALING. A connector is about 1.5 document units wide and
 * the panel draws a document at roughly a third scale, so an ordinary stroke
 * would come out at half a pixel — visible on a retina screen, gone on
 * everything else, and different per preview because the scale is. With
 * `vector-effect: non-scaling-stroke` the width is stated in screen pixels and
 * every preview's lines land at the same weight regardless of how big its
 * document is.
 *
 * DECORATIVE TO ASSISTIVE TECH. The card's link already carries the example's
 * title and destination in its accessible name; a screen reader gains nothing
 * from a shape with no words in it, and hearing one per card is noise.
 */

/** The panel's aspect, and the crop the wireframe is measured against. */
const PANEL_RATIO = 10 / 16;

/**
 * The narrowest slice of document the panel will ever zoom in to, in document
 * units.
 *
 * FITTING THE WIDTH ALONE WAS WRONG FOR NARROW DOCUMENTS, and it took
 * measuring the built page to see it: a timeline's content is about 300 units
 * across and hundreds tall, so fitting its width magnified it until the panel
 * held 190 units of height — three events out of eight — and a C4 context
 * diagram showed two of its five marks. Both looked like a rendering fault
 * rather than a preview.
 *
 * So a narrow document is CENTRED IN A WIDER VIEW instead of being blown up.
 * 900 is about the width of the documents that are not narrow — the dictionary
 * page is 940, a mid-sized flowchart 550 to 1100 — which keeps the whole set
 * at one honest scale and lets a tall document show far more of itself.
 */
const REFERENCE_WIDTH = 900;

/**
 * How far past the reference scale the panel will zoom OUT to avoid cropping.
 *
 * A document only slightly too tall for the panel is better shown whole and a
 * little smaller than cropped: a C4 context diagram is three boxes in a column,
 * so cropping it lost a third of a five-mark picture while the panel had half
 * its width sitting empty either side. Past this much, zooming out stops being
 * worth it — a document several times too tall shrinks to a thread nobody can
 * read — so those crop and fade instead.
 *
 * The value is deliberately generous, and most bundled examples now land inside
 * it. That is the intended outcome, not a sign the crop is dead: it is what
 * keeps the fade for documents that genuinely have no business being shown
 * whole, and a longer example will meet it.
 */
const FIT_OVERSHOOT = 1.6;

/**
 * How each tone paints, in tokens.
 *
 * Everything that carries meaning is tinted with the section's `--kind`, which
 * the card inherits — so a preview wears the same colour as its heading rule
 * and its mark in the jump bar, and the three read as one group. Connectors
 * take `--edge`, the canvas's own connector token, so they recede behind the
 * things they join exactly as they do in the diagram.
 */
const TONE: Record<
  WireTone,
  { fill: string; fillOpacity?: number; stroke: string; width: number }
> = {
  body: {
    fill: "var(--kind)",
    fillOpacity: 0.12,
    stroke: "color-mix(in oklch, var(--kind) 55%, transparent)",
    width: 1.1,
  },
  link: { fill: "none", stroke: "var(--edge)", width: 1 },
  accent: {
    fill: "var(--kind)",
    fillOpacity: 0.3,
    stroke: "var(--kind)",
    width: 1.25,
  },
};

export function ExamplePreview({
  wireframe,
}: {
  /** `null` when the example does not parse — see `exampleWireframe`. */
  wireframe: Wireframe | null;
}): React.JSX.Element {
  if (wireframe === null) {
    /* NOT A BROKEN-IMAGE PLACEHOLDER. A bundled example that fails to parse
       already gets a row that says so in words; an empty tinted panel here
       keeps the grid's rhythm without inventing a second error state. */
    return (
      <div
        aria-hidden="true"
        className="aspect-16/10 w-full rounded-t-[inherit] bg-secondary/30"
      />
    );
  }

  /* The view. Width first — never narrower than the reference, so a slim
     document is centred rather than magnified — then the height that width
     buys at the panel's aspect. A document shorter than that band is
     letterboxed by `preserveAspectRatio` instead, which is why the height is a
     `min` and not a clamp in the other direction too. */
  const atReference = Math.max(wireframe.width, REFERENCE_WIDTH);
  /* The width at which the whole document would fit the panel's aspect. Taken
     when it is within reach of the reference, so a nearly-fitting document is
     shown whole rather than cropped. */
  const toFitWhole = wireframe.height / PANEL_RATIO;
  const viewWidth =
    toFitWhole > atReference && toFitWhole <= atReference * FIT_OVERSHOOT
      ? toFitWhole
      : atReference;
  const viewX = (wireframe.width - viewWidth) / 2;
  const viewHeight = Math.min(wireframe.height, viewWidth * PANEL_RATIO);
  const cropped = viewHeight < wireframe.height - 1;

  /* Nothing below the fold is drawn. On the first build of this page a third
     of all the markup shipped was shapes outside their own viewBox — 22KB of
     coordinates for a browser to parse and never paint. */
  const visible = cropped
    ? wireframe.shapes.filter((shape) => shapeTop(shape) < viewHeight)
    : wireframe.shapes;

  return (
    <div
      aria-hidden="true"
      className="relative aspect-16/10 w-full overflow-hidden rounded-t-[inherit] bg-secondary/30"
    >
      <svg
        viewBox={`${round(viewX)} 0 ${round(viewWidth)} ${round(viewHeight)}`}
        preserveAspectRatio="xMidYMid meet"
        className="size-full"
        fill="none"
      >
        {visible.map((shape, index) => (
          <Mark key={index} shape={shape} />
        ))}
      </svg>
      {/* The bottom of a cropped document, faded into the card rather than cut.
          `--card` because that is the ground the panel sits on; a fade to a
          colour the card is not would read as a band. */}
      {cropped ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-b from-transparent to-card" />
      ) : null}
    </div>
  );
}

function Mark({ shape }: { shape: WireShape }): React.JSX.Element {
  const tone = TONE[shape.tone];
  /* `vector-effect` rather than dividing a width by the scale: the scale is
     not known here, and the browser is the thing that knows it. */
  const paint = {
    fill: tone.fill,
    fillOpacity: tone.fillOpacity,
    stroke: tone.stroke,
    strokeWidth: tone.width,
    vectorEffect: "non-scaling-stroke" as const,
  };

  switch (shape.s) {
    case "rect":
      return (
        <rect
          x={round(shape.x)}
          y={round(shape.y)}
          width={round(Math.max(shape.w, 1))}
          height={round(Math.max(shape.h, 1))}
          rx={shape.r === undefined ? undefined : round(shape.r)}
          {...paint}
        />
      );
    case "diamond":
      return (
        <path
          d={diamondPath(shape.cx, shape.cy, shape.w, shape.h)}
          {...paint}
          strokeLinejoin="round"
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={round(shape.cx)}
          cy={round(shape.cy)}
          rx={round(shape.rx)}
          ry={round(shape.ry)}
          {...paint}
        />
      );
    case "dot":
      return (
        <circle
          cx={round(shape.cx)}
          cy={round(shape.cy)}
          r={round(shape.r)}
          {...paint}
        />
      );
    case "line":
      return (
        <path
          d={polylinePath(shape.points)}
          {...paint}
          fill="none"
          fillOpacity={undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={shape.dashed === true ? "2 3" : undefined}
        />
      );
  }
}

function diamondPath(cx: number, cy: number, w: number, h: number): string {
  const halfW = w / 2;
  const halfH = h / 2;
  return [
    `M${round(cx)} ${round(cy - halfH)}`,
    `L${round(cx + halfW)} ${round(cy)}`,
    `L${round(cx)} ${round(cy + halfH)}`,
    `L${round(cx - halfW)} ${round(cy)}`,
    "Z",
  ].join("");
}

function polylinePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`,
    )
    .join("");
}

/** One decimal is under a tenth of a pixel at preview scale, and it is the
 * difference between a 40KB page of coordinates and a 12KB one. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
