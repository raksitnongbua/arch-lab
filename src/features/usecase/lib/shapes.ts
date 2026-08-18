/**
 * Use-case shape geometry and the kind→colour table — shared by the live
 * renderer (`components/usecase-diagram.tsx`) and the SVG exporter
 * (`export/render-svg.ts`). One definition, because the exporter re-renders
 * from the model: if each consumer drew its own stick figure, "the export
 * matches the screen" would be a hope rather than a property.
 *
 * Pure and erasable (no DOM, no React) so the check script can load anything
 * that imports it through Node's type stripping.
 */

import { arrowheadPathAt } from "@/lib/arrowhead";
import { fmt } from "@/lib/svg-markup";
import type { UseCaseElementKind } from "@/types";

import type {
  LaidUseCaseActor,
  LaidUseCaseEdge,
  LaidUseCaseElement,
  UCPoint,
} from "./layout";
import { UC } from "./layout";

/**
 * Which contrast-audited colour pair each element kind wears — the
 * flowchart's `FLOW_SHAPE_TOKENS` idiom for this canvas's two kinds. This
 * table holds the TOKEN NAMES: the screen renderer wraps them in `var()`,
 * the exporter resolves the same pairs to concrete sRGB through
 * `USECASE_ROLE_BY_KIND` below.
 *
 * Both tokens are `var()` ALIASES of role pairs, declared once in `:root`
 * in `globals.css` (the flowchart's start/step/io/call precedent): an alias
 * resolves against the active theme's role tokens on its own, so every
 * theme in `THEMES` is complete without a per-theme edit, and the contrast
 * ratios annotated on the role tokens — and re-measured by `check:themes` —
 * cover these for free. The mapping is SEMANTIC, not a colour budget dodge:
 * an actor IS the C4 person (the violet a reader of the C4 canvas already
 * decodes as "a human"), and a use case is the system's own behaviour — the
 * internal blue, the default working element everywhere else. The alias ⇄
 * role pairing is pinned against `globals.css` by
 * `scripts/usecase-layout-check.mjs`, so neither side can drift.
 */
export const USECASE_KIND_TOKENS: Record<
  UseCaseElementKind,
  { fill: string; border: string }
> = {
  actor: { fill: "--uc-actor", border: "--uc-actor-border" },
  usecase: { fill: "--uc-usecase", border: "--uc-usecase-border" },
};

/** Which C4 role pair each kind's tokens alias — the exporter reads its
 * concrete colours through `ExportTheme.nodeRoles` with this, so the export
 * and the stylesheet cannot name different pairs. */
export const USECASE_ROLE_BY_KIND: Record<
  UseCaseElementKind,
  "person" | "internal"
> = {
  actor: "person",
  usecase: "internal",
};

/** Dependency arrowhead, matched to the flowchart arrow's weight. */
export const UC_ARROW_LENGTH = 9;
export const UC_ARROW_HALF_WIDTH = 4.5;

/**
 * THE one stroke weight of the whole drawing — ellipses, actor figure,
 * boundary, every edge kind, in the renderer AND the exporter. One weight is
 * what makes the diagram read as ONE hand; the figure and the ellipses used
 * to sit at different weights and looked like two different pens, which is
 * the defect `check:usecase-layout` now pins against the real exported
 * markup (equal `stroke-width` on figure, ellipse and line). Focus emphasis
 * (2) is the deliberate exception — emphasis is the point of focus.
 */
export const UC_STROKE = 1.25;

/** Focus emphasis — the one deliberate exception to the single weight above,
 * because standing out IS what focus means. Named rather than typed inline so
 * the check can pin "every stroke is one of exactly these two". */
export const UC_FOCUS_STROKE = 2;

/** The INVISIBLE hit stroke that makes a 1.25-wide line clickable: a pointer
 * target, never paint (`stroke="transparent"`), so it is exempt from the one-
 * weight rule above — and named rather than typed inline so the check can tell
 * a widened hit area apart from a drawing that has quietly grown a second pen. */
export const UC_HIT_STROKE = 14;

/** Corner rounding of the system boundary's rectangle — generous, because a
 * soft-cornered box is both more minimal and friendlier than a hard frame
 * (the restyle direction: cute by being minimal). */
export const BOUNDARY_RADIUS = 16;

/**
 * The dash a dependency wears — dashed IS the kind's identity in UML. The
 * pattern sums to 10 ON PURPOSE: the idle march reuses the shared
 * `af-frame-march` keyframes (globals.css), whose cycle travels exactly
 * -10px, so one animation cycle is exactly one dash period and the wrap is
 * seamless. A pattern with any other sum jerks by the difference every
 * cycle — `check:usecase-motion` pins the sum to the keyframe's travel.
 */
export const DEPENDENCY_DASH = "6 4";

/** A straight polyline as a path (use-case lines are straight spokes —
 * no rounding, unlike the flowchart's orthogonal corners). */
/**
 * How far a focus ring sits outside the shape it marks. Big enough to read as
 * a ring rather than a doubled outline, small enough that two neighbouring
 * ellipses' rings do not touch.
 */
export const FOCUS_RING_PAD = 5;

/**
 * The focus ring's own geometry — which FOLLOWS THE SHAPE.
 *
 * A CSS `outline` was here first and drew a rectangle: `outline` boxes the
 * bounding box, always, so a focused ellipse wore a rectangle and a focused
 * stick figure wore one too. On a canvas whose whole vocabulary is shapes,
 * that reads as a rendering fault rather than as focus, which is what the user
 * reported.
 *
 * An ellipse's ring is a bigger ellipse. An ACTOR's is a capsule — a stick
 * figure has no outline to trace, and a fully-rounded box is both the honest
 * shape for "this region" and the friendlier one beside the round heads.
 */
export type FocusRing =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number };

export function focusRing(element: LaidUseCaseElement): FocusRing {
  const pad = FOCUS_RING_PAD;
  if (element.kind === "usecase") {
    return {
      kind: "ellipse",
      cx: element.cx,
      cy: element.cy,
      rx: element.rx + pad,
      ry: element.ry + pad,
    };
  }
  const height = element.height + pad * 2;
  return {
    kind: "rect",
    x: element.x - pad,
    y: element.y - pad,
    width: element.width + pad * 2,
    height,
    // Fully rounded: a capsule, not a rounded rectangle.
    rx: height / 2,
  };
}

export function polylinePath(points: readonly UCPoint[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p.x)} ${fmt(p.y)}`)
    .join(" ");
}

/** The dependency's filled arrowhead at the line's target end. */
export function dependencyHeadPath(points: readonly UCPoint[]): string {
  return arrowheadPathAt(points, UC_ARROW_LENGTH, UC_ARROW_HALF_WIDTH);
}

/**
 * The generalization's HOLLOW triangle: apex at the layout's `tip` (on the
 * parent's outline), base centred on the line's trimmed end. Hollow —
 * canvas-filled with the edge's stroke — is the UML "is-a" mark; a filled
 * triangle here would read as a plain arrow, the exact ambiguity the three
 * edge kinds exist to avoid.
 */
export function generalizationTrianglePath(
  edge: Pick<LaidUseCaseEdge, "points" | "tip">,
): string {
  if (edge.tip === null || edge.points.length < 2) return "";
  const base = edge.points[edge.points.length - 1];
  const tip = edge.tip;
  const len = Math.hypot(tip.x - base.x, tip.y - base.y) || 1;
  const ux = (tip.x - base.x) / len;
  const uy = (tip.y - base.y) / len;
  const leftX = base.x - uy * UC.triangleHalfWidth;
  const leftY = base.y + ux * UC.triangleHalfWidth;
  const rightX = base.x + uy * UC.triangleHalfWidth;
  const rightY = base.y - ux * UC.triangleHalfWidth;
  return `M ${fmt(tip.x)} ${fmt(tip.y)} L ${fmt(leftX)} ${fmt(leftY)} L ${fmt(rightX)} ${fmt(rightY)} Z`;
}

/* -------------------------------------------------------------------------- */
/* The stick figure                                                            */
/* -------------------------------------------------------------------------- */

export interface ActorFigure {
  /** The head, a circle — the fill wears the kind's token pair. */
  head: { cx: number; cy: number; r: number };
  /** Body, arms and legs, as stroke-only paths. */
  strokes: readonly string[];
}

/**
 * The one thing that makes this diagram recognisable at a glance: head,
 * body, arms, legs — a box with a label is not an actor, and this stays a
 * real UML stick figure, not an avatar silhouette. The EXECUTION is the
 * cute part, deliberately, after the first straight-stick cut was read as
 * crude:
 *   - the head is OVERSIZED (`UC.actorHeadRadius` 9 against a 48 figure) —
 *     the strongest single "friendly" cue a monoline figure has, and an
 *     open outlined circle, never a filled ink dot;
 *   - arms and legs are gently BOWED quadratics, not straight diagonals —
 *     a soft curve reads as a person standing, a straight stick as a
 *     technical glyph;
 *   - every limb is one even weight (`UC_STROKE`, the drawing's one pen)
 *     with round caps and joins, applied by both consumers — no tapering,
 *     no hairlines, no sharp ends;
 *   - the stance is symmetric and feet-apart, so the figure stands rather
 *     than tips.
 * Derived from the element's laid box so the renderer and the exporter draw
 * the identical figure.
 */
export function actorFigure(
  element: Pick<LaidUseCaseActor, "x" | "y" | "cx">,
): ActorFigure {
  const { cx } = element;
  const top = element.y;
  const r = UC.actorHeadRadius;
  const height = UC.actorFigureHeight;
  const neckY = top + r * 2;
  const hipY = top + Math.round(height * 0.65);
  const footY = top + height;
  // Spans stay inside `UC.actorFigureWidth` including the round caps.
  const armSpan = 11;
  const armTipY = neckY + 8;
  const legSpan = 9;
  return {
    head: { cx, cy: top + r, r },
    strokes: [
      // Body: neck to hip, the one straight line (a bowed spine slouches).
      `M ${fmt(cx)} ${fmt(neckY)} V ${fmt(hipY)}`,
      // Arms: one gentle arch over the shoulders, tips relaxed downward.
      `M ${fmt(cx - armSpan)} ${fmt(armTipY)} Q ${fmt(cx)} ${fmt(neckY + 1)} ${fmt(cx + armSpan)} ${fmt(armTipY)}`,
      // Legs: bowed slightly outward from the hip to planted feet.
      `M ${fmt(cx)} ${fmt(hipY)} Q ${fmt(cx - 3)} ${fmt(hipY + 9)} ${fmt(cx - legSpan)} ${fmt(footY)}`,
      `M ${fmt(cx)} ${fmt(hipY)} Q ${fmt(cx + 3)} ${fmt(hipY + 9)} ${fmt(cx + legSpan)} ${fmt(footY)}`,
    ],
  };
}
