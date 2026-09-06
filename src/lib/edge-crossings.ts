/**
 * Where two connectors cross, and which of them steps over the other.
 *
 * A CROSSING IS AMBIGUOUS UNTIL ONE LINE CLAIMS TO BE ON TOP. Two connectors
 * meeting at a point read as four lines leaving a junction, and the eye joins
 * the wrong pair — the same failure the fan in `edge-fan.ts` fixes at a node,
 * arriving instead in open space. The remedy is the standard one: the line that
 * goes over is interrupted by a small arc, so the crossing reads as a bridge.
 *
 * WHICH LINE HOPS: THE SHORTER ONE, and this was a decision rather than a
 * default. The rule as usually written says "the less important connector"
 * hops — but C4 has no importance ranking, relationships are peers, so
 * "important" would have to be invented here. Two candidates were drawn out and
 * compared:
 *
 *   - THE DOCUMENT DECIDES (the later-declared line hops) is stable under a
 *     drag and honest about being an authored choice. It was rejected because
 *     it gives line order a meaning `.alab` has never given it: someone tidying
 *     their relationships into alphabetical order would change the picture,
 *     with nothing in the document explaining why.
 *   - THE GEOMETRY DECIDES (the shorter line hops) keeps the arc inside the
 *     smaller visual span — an arc partway along a long connector reads as that
 *     connector having two halves — and cannot be disturbed by reordering.
 *
 * Its one cost is that two connectors of nearly equal length could trade the
 * hop when a node moves a few pixels, so the tie-break is the EDGE ID and the
 * comparison is made with a tolerance: lengths within `TIE_TOLERANCE` are
 * treated as equal and settled by id, which is stable across renders and
 * across a drag.
 *
 * WHAT IT DECLINES. A crossing in the first or last `END_MARGIN` of a
 * connector is left alone: an arc there lands on an arrowhead or against the
 * node it just left, and a bridge drawn on top of a box does not read as a
 * bridge. A connector that crosses many others is capped, because a line
 * carrying six bumps has stopped being a line. Both are declined rather than
 * approximated, in the manner `curve-clearance.ts` declines a centred
 * obstruction.
 *
 * PURE, AND THAT IS LOAD-BEARING — no imports, no DOM, no React, so
 * `check:connector-density` can compute the geometry rather than read the code
 * and believe it. Same reason `curve-clearance.ts` and `edge-fan.ts` live here.
 */

/** A point in the same flow coordinates a path string is written in. */
export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * A connector's curve, recovered from the path string that will be drawn.
 *
 * READ BACK FROM THE PATH RATHER THAN RECOMPUTED. Two shapes reach this module:
 * React Flow's own cubic, for a connector with nothing in its way, and the
 * quadratic `edge-geometry.ts` builds when the curve is offset for a parallel
 * group or bowed past a box. Re-deriving the first would mean reimplementing
 * `getBezierPath`, and a second implementation that disagreed by a pixel would
 * put every hop slightly off the crossing it is meant to bridge. Parsing the
 * string the renderer is actually about to use cannot disagree with it.
 */
export interface Curve {
  kind: "cubic" | "quadratic";
  /** 3 points for a quadratic (P0, C, P1), 4 for a cubic (P0, C0, C1, P1). */
  points: CurvePoint[];
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?(?:e-?\d+)?`;
const CUBIC_RE = new RegExp(
  String.raw`^M\s*(${NUMBER})[ ,](${NUMBER})\s*C\s*(${NUMBER})[ ,](${NUMBER})\s*[ ,]\s*(${NUMBER})[ ,](${NUMBER})\s*[ ,]\s*(${NUMBER})[ ,](${NUMBER})\s*$`,
);
const QUADRATIC_RE = new RegExp(
  String.raw`^M\s*(${NUMBER})[ ,](${NUMBER})\s*Q\s*(${NUMBER})[ ,](${NUMBER})\s*[ ,]?\s*(${NUMBER})[ ,](${NUMBER})\s*$`,
);

/**
 * The curve a path string draws, or `null` when it is not one this module
 * knows how to split.
 *
 * NULL IS A REAL ANSWER, not a failure to handle. A path shape that is not
 * recognised keeps its connector out of the crossing pass entirely, so the line
 * draws exactly as it did — which is the right outcome for a shape nobody has
 * taught this module to cut in half. Silently guessing at an unknown path would
 * produce a connector with a gap in it.
 */
export function parseCurve(path: string): Curve | null {
  const cubic = CUBIC_RE.exec(path.trim());
  if (cubic !== null) {
    const n = cubic.slice(1).map(Number);
    return {
      kind: "cubic",
      points: [
        { x: n[0], y: n[1] },
        { x: n[2], y: n[3] },
        { x: n[4], y: n[5] },
        { x: n[6], y: n[7] },
      ],
    };
  }
  const quad = QUADRATIC_RE.exec(path.trim());
  if (quad !== null) {
    const n = quad.slice(1).map(Number);
    return {
      kind: "quadratic",
      points: [
        { x: n[0], y: n[1] },
        { x: n[2], y: n[3] },
        { x: n[4], y: n[5] },
      ],
    };
  }
  return null;
}

const lerp = (a: CurvePoint, b: CurvePoint, t: number): CurvePoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** The point at parameter `t`, by de Casteljau — one algorithm, both degrees. */
export function pointAt(curve: Curve, t: number): CurvePoint {
  let level = curve.points;
  while (level.length > 1) {
    const next: CurvePoint[] = [];
    for (let i = 0; i < level.length - 1; i += 1) {
      next.push(lerp(level[i], level[i + 1], t));
    }
    level = next;
  }
  return level[0];
}

/**
 * The curve cut at `t`, as its two halves.
 *
 * De Casteljau again: the intermediate points of the evaluation ARE the control
 * points of the two halves, which is why the same loop that finds a point also
 * splits the curve and why neither degree needs its own formula.
 */
export function splitAt(curve: Curve, t: number): [Curve, Curve] {
  const left: CurvePoint[] = [];
  const right: CurvePoint[] = [];
  let level = curve.points;
  while (level.length > 0) {
    left.push(level[0]);
    right.unshift(level[level.length - 1]);
    if (level.length === 1) break;
    const next: CurvePoint[] = [];
    for (let i = 0; i < level.length - 1; i += 1) {
      next.push(lerp(level[i], level[i + 1], t));
    }
    level = next;
  }
  return [
    { kind: curve.kind, points: left },
    { kind: curve.kind, points: right },
  ];
}

/** The curve as `count + 1` points, for intersection and arc-length work. */
export function sampleCurve(curve: Curve, count: number): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let i = 0; i <= count; i += 1) out.push(pointAt(curve, i / count));
  return out;
}

/** How finely a curve is sampled when looking for crossings. */
const CROSSING_SAMPLES = 48;

/**
 * Where two straight segments cross, as the parameter along each — or `null`.
 * Endpoints touching is not a crossing: shared endpoints are how connectors
 * meet a node, and every pair sharing one would otherwise report a bridge.
 */
function segmentCrossing(
  a1: CurvePoint,
  a2: CurvePoint,
  b1: CurvePoint,
  b2: CurvePoint,
): { ta: number; tb: number } | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null; // parallel or degenerate
  const ta = ((b1.x - a1.x) * sy - (b1.y - a1.y) * sx) / denominator;
  const tb = ((b1.x - a1.x) * ry - (b1.y - a1.y) * rx) / denominator;
  if (ta <= 0 || ta >= 1 || tb <= 0 || tb >= 1) return null;
  return { ta, tb };
}

/** One connector, as much of it as deciding a crossing needs. */
export interface CrossingEdge {
  id: string;
  curve: Curve;
}

/**
 * How near an end a crossing may be before the hop is declined, as a fraction
 * of the curve's parameter. An arc inside this band lands on the arrowhead or
 * against the node the connector just left, where a bridge does not read as
 * one.
 */
const END_MARGIN = 0.12;

/** Lengths within this many units of each other are settled by edge id. */
const TIE_TOLERANCE = 1;

/**
 * The most bumps one connector may carry. Past this it has stopped reading as a
 * line, and the honest report is that the diagram has too many crossings — not
 * a line drawn as a dotted arc.
 */
export const MAX_HOPS_PER_EDGE = 3;

/** Approximate arc length, from the sampled polyline. */
export function curveLength(curve: Curve): number {
  const points = sampleCurve(curve, CROSSING_SAMPLES);
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  }
  return total;
}

/**
 * Which connector hops at a crossing between `a` and `b`.
 *
 * Shorter first; equal-within-tolerance settled by id so a drag cannot make the
 * two trade places every frame.
 */
function hopper(
  a: CrossingEdge,
  aLength: number,
  b: CrossingEdge,
  bLength: number,
): string {
  if (Math.abs(aLength - bLength) > TIE_TOLERANCE) {
    return aLength < bLength ? a.id : b.id;
  }
  return a.id < b.id ? a.id : b.id;
}

/**
 * Edge id → the parameters along ITS OWN curve at which it steps over another.
 *
 * Every connector appears in the result at most once; an edge with no hops is
 * absent rather than present with an empty list, so a caller cannot come to
 * treat "no hops" and "not considered" as different things.
 */
export function assignHops(
  edges: readonly CrossingEdge[],
): Map<string, number[]> {
  const samples = edges.map((edge) =>
    sampleCurve(edge.curve, CROSSING_SAMPLES),
  );
  const lengths = edges.map((edge) => curveLength(edge.curve));
  const hops = new Map<string, number[]>();

  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const winner = hopper(edges[i], lengths[i], edges[j], lengths[j]);
      const [self, other] =
        winner === edges[i].id ? [i, j] : ([j, i] as [number, number]);

      for (let s = 1; s < samples[self].length; s += 1) {
        let crossed = false;
        for (let o = 1; o < samples[other].length; o += 1) {
          const hit = segmentCrossing(
            samples[self][s - 1],
            samples[self][s],
            samples[other][o - 1],
            samples[other][o],
          );
          if (hit === null) continue;
          const t = (s - 1 + hit.ta) / CROSSING_SAMPLES;
          if (t < END_MARGIN || t > 1 - END_MARGIN) continue;
          const list = hops.get(edges[self].id) ?? [];
          list.push(t);
          hops.set(edges[self].id, list);
          crossed = true;
          break;
        }
        if (crossed) break;
      }
    }
  }

  for (const [id, list] of hops) {
    list.sort((a, b) => a - b);
    /* A crossing found twice — two connectors meeting at nearly the same place
       — is one bridge, not two overlapping arcs. */
    const distinct = list.filter(
      (t, index) => index === 0 || t - list[index - 1] > 2 * END_MARGIN,
    );
    if (distinct.length > MAX_HOPS_PER_EDGE) hops.delete(id);
    else hops.set(id, distinct);
  }
  return hops;
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

/** The bridge's radius, and so half its span. */
export const HOP_RADIUS = 8;

const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

function curveCommand(curve: Curve): string {
  const [, ...rest] = curve.points;
  const letter = curve.kind === "cubic" ? "C" : "Q";
  return `${letter} ${rest.map((p) => `${round(p.x)},${round(p.y)}`).join(" ")}`;
}

/**
 * The parameter `distance` units of arc length before (`-1`) or after (`+1`)
 * `t`, clamped inside the curve. Walked along the sampled polyline rather than
 * solved, for `curve-clearance.ts`'s reason: the answer only has to be right at
 * the resolution a reader can see.
 */
function paramAtDistance(
  curve: Curve,
  t: number,
  distance: number,
  direction: -1 | 1,
): number {
  const step = 1 / (CROSSING_SAMPLES * 4);
  let walked = 0;
  let current = t;
  let previous = pointAt(curve, current);
  while (walked < distance) {
    const next = current + direction * step;
    if (next <= 0) return 0;
    if (next >= 1) return 1;
    const point = pointAt(curve, next);
    walked += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
    current = next;
  }
  return current;
}

/**
 * `path` redrawn with a bridge at each parameter in `hops`.
 *
 * The curve is CUT and rejoined rather than having an arc painted over it: a
 * bridge only reads as one if the line it belongs to is actually interrupted,
 * and an arc laid on top would still show the straight-through line under it at
 * any zoom. De Casteljau makes the cut exact, so the two halves are the same
 * curve and nothing shifts.
 *
 * Returns `path` unchanged when there is nothing to do or the shape is one this
 * module does not know how to cut — the connector then draws exactly as it did.
 */
export function pathWithHops(
  path: string,
  hops: readonly number[],
  radius = HOP_RADIUS,
): string {
  if (hops.length === 0) return path;
  const curve = parseCurve(path);
  if (curve === null) return path;

  const first = curve.points[0];
  const commands = [`M ${round(first.x)},${round(first.y)}`];

  let remaining = curve;
  /* Parameters are measured on the ORIGINAL curve, and each split re-scales
     what is left of it — so every hop after the first is remapped onto the
     remainder before being used. Splitting at the raw value instead put the
     second bridge progressively further along than the crossing it was for. */
  let consumed = 0;

  for (const t of hops) {
    const before = paramAtDistance(curve, t, radius, -1);
    const after = paramAtDistance(curve, t, radius, 1);
    if (before <= consumed || after >= 1) continue;

    const enter = (before - consumed) / (1 - consumed);
    const [head, tail] = splitAt(remaining, enter);
    commands.push(curveCommand(head));

    const from = pointAt(curve, before);
    const to = pointAt(curve, after);
    const chord = Math.hypot(to.x - from.x, to.y - from.y);
    /* An arc whose chord is wider than its diameter is not drawable; SVG would
       silently scale the radius up. Doing it here keeps the bridge a
       semicircle, which is what makes it read as a bridge rather than a kink. */
    const r = round(Math.max(radius, chord / 2));
    commands.push(`A ${r} ${r} 0 0 1 ${round(to.x)},${round(to.y)}`);

    const exit = (after - before) / (1 - before);
    remaining = splitAt(tail, exit)[1];
    consumed = after;
  }

  commands.push(curveCommand(remaining));
  return commands.join(" ");
}
