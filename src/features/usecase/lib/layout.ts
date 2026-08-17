/**
 * Use-case layout — the ONE place geometry is derived from a
 * `UseCaseLabFile`. The renderer, the viewer, the SVG exporter and the
 * layout check script (`scripts/usecase-layout-check.mjs`) all read this
 * result; none of them ever computes a coordinate of its own — the same
 * single-source-of-truth discipline as `flowchart/lib/layout.ts`, for the
 * same reason: two geometry computations WILL disagree, and the
 * disagreement shows up as a line that almost meets its ellipse.
 *
 * Pure and framework-free on purpose (no DOM, no React, no CSS): the check
 * script loads this file through Node's type stripping. Deterministic by
 * construction — every pass iterates arrays in declaration order and every
 * sort is stable — so the same model in gives byte-identical geometry out,
 * which the check script asserts literally.
 *
 * THE LAYOUT IS NOT A FLOWCHART LAYOUT, and that is the whole reason the
 * document type exists (`src/types/usecase.ts` carries the argument): a
 * use-case diagram has no flow to rank by longest path. Its picture is
 *
 *   - the SYSTEM BOUNDARY, a titled rectangle with its use cases arranged
 *     inside it (boundaries stack vertically on one axis when there are
 *     several);
 *   - ACTORS standing OUTSIDE that rectangle, in columns flanking it left
 *     and right;
 *   - straight spoke-like lines between them — the hand-drawn register of
 *     every UML use-case diagram, kept deliberately (orthogonal routing
 *     here would make the actors read as flowchart terminators).
 *
 * THE ACTOR SPLIT (left vs right), decided in this order, deterministically:
 *
 *   1. Actors joined by a generalization form a FAMILY and share a side — a
 *      hollow triangle stretched across the system box would be the longest,
 *      worst line in the picture, crossing every association on its way.
 *   2. Families are assigned in declaration order to whichever side holds
 *      fewer actors, LEFT on ties. Left-first is the UML reading
 *      convention: the primary actors an author names first belong on the
 *      left, secondary/supporting cast on the right.
 *   3. Use cases then FOLLOW their actors: with more than one column inside
 *      a boundary, a use case joins the column on its actors' majority
 *      side. That is the "short lines" rule seen from the other end — an
 *      actor talking only to left-column use cases IS on the left, because
 *      the use cases moved toward it.
 *   4. Within a side, actors order by the mean centre-y of the use cases
 *      they associate with (families kept contiguous, declaration order as
 *      the stable tiebreak), and each actor is then placed at that mean
 *      height where space allows — an actor talking to use cases high in
 *      the box sits high, which is what keeps same-side associations from
 *      crossing each other.
 *
 * Use cases inside a boundary pack into columns (max `maxPerColumn` per
 * column) in declaration order — the author's narration order, which the
 * model calls out as data. Use cases in NO boundary are legal and placed
 * OUTSIDE: below the last boundary, centred on the same axis, packed the
 * same way — outside the rectangle is the statement they make, and below
 * (not beside) keeps the flanks free for the actors.
 *
 * EDGES, per kind:
 *   - association     straight line, NO arrowhead (undirected by type);
 *   - dependency      straight when the straight line is clear of every
 *                     foreign element, else a three-segment detour up a
 *                     side corridor beside the column; the «stereotype» is
 *                     the label;
 *   - generalization  straight, ending one triangle-length short of the
 *                     PARENT's outline; `tip` marks the apex on the parent
 *                     boundary and the renderer draws the hollow triangle
 *                     from `points`' last entry (the base) to `tip`.
 *
 * ELLIPSE SIZING — the diamond problem, worse. A centred text box w × h
 * fits inside an ellipse with semi-axes rx, ry iff every corner satisfies
 * (w/2)²/rx² + (h/2)²/ry² ≤ 1; the balanced solution is rx = (w/2)·√2,
 * ry = (h/2)·√2, so each semi-axis is the half-extent times √2 plus
 * padding — which fits BY CONSTRUCTION with room to spare, and the check
 * script re-tests the inequality at all four measured corners rather than
 * trusting this formula.
 *
 * Text is measured with the shared conservative estimate
 * (`@/lib/text-metrics`): SVG has no synchronous text measurement outside a
 * live DOM, and a DOM measurement here would make the layout untestable in
 * Node and non-deterministic across font fallbacks.
 */

import { CHAR_WIDTH_RATIO, wrapText } from "@/lib/text-metrics";
import type { UseCaseEdgeKind, UseCaseElement, UseCaseLabFile } from "@/types";

/* -------------------------------------------------------------------------- */
/* Constants — exported so the check script asserts against the same numbers   */
/* -------------------------------------------------------------------------- */

export const UC = {
  /** Same estimate as every other layout — one fact. */
  charWidthRatio: CHAR_WIDTH_RATIO,

  marginX: 28,
  marginTop: 20,
  marginBottom: 28,

  nodeFontSize: 13,
  metaFontSize: 11,
  labelFontSize: 12,
  /** Per-line advance of wrapped label text. */
  lineHeight: 17,
  /** Height of the `[technology]` line under a label. */
  techLineHeight: 15,

  /**
   * Widest a use-case label wraps before growing the ellipse. Tighter than
   * the flowchart's box cap because every pixel of line width costs √2 on
   * the ellipse's horizontal axis (see the sizing banner above).
   */
  ucMaxTextWidth: 150,
  /** Clearance between the text box's √2 envelope and the ellipse. */
  ellipsePadX: 8,
  ellipsePadY: 6,
  ellipseMinRx: 56,
  ellipseMinRy: 28,

  /** The stick figure's box; the label hangs below it. The head is
   * deliberately OVERSIZED against the body (radius 9 on a 48 figure —
   * ~37% of the height as head) because a big round head is the single
   * strongest "friendly" cue a monoline figure has; the box is wide enough
   * for the bowed arms' full span plus their round caps. */
  actorFigureWidth: 30,
  actorFigureHeight: 48,
  actorHeadRadius: 9,
  actorLabelGap: 6,
  actorMaxTextWidth: 110,
  actorMinWidth: 48,

  /** Vertical gap between stacked use cases in one column. */
  ucGapY: 26,
  /** Horizontal gap between columns inside a boundary. */
  ucColumnGap: 48,
  /** A column takes at most this many use cases before a new one opens. */
  maxPerColumn: 4,

  /* Boundary padding is generous ON PURPOSE (the minimal restyle): the
   * soft-cornered box has to breathe around its members, or the rounding
   * reads as crowding rather than calm. */
  boundaryPadX: 34,
  /** Room inside the boundary's top for the title band. */
  boundaryPadTop: 48,
  boundaryPadBottom: 28,
  boundaryTitleFontSize: 12,
  /** Gap between the boundary's top border and its title text. */
  boundaryTitlePad: 10,
  /** Vertical gap between stacked boundaries, and above unbounded cases. */
  boundaryGap: 40,

  /** Gap between an actor column and the nearest boundary edge — wide, so
   * the cast visibly stands APART from the system it uses. */
  actorGapX: 76,
  /** Vertical gap between stacked actors in one column. */
  actorGapY: 30,

  /** First dependency corridor's offset from a column's content edge. */
  depCorridorGap: 18,
  /** Spacing between stacked corridors on one side. */
  depLaneStep: 14,
  /** How far a bent association's via point clears the target ellipse. */
  bendGap: 14,

  /** Hollow generalization triangle (drawn by `lib/shapes.ts`). */
  triangleLength: 12,
  triangleHalfWidth: 7,

  /** Edge-label box padding and the gap that keeps it OFF its own line. */
  labelPadX: 5,
  labelPadY: 3,
  labelGap: 8,
  /** Inflation used when testing a label box against lines and boxes. */
  labelClearance: 2,
  labelLineHeight: 15,
  labelMaxWidth: 120,

  /* ---- the heading block: the document's title and description ------------
   * Inside the drawing, not the page chrome, for the reason the sequence and
   * flowchart diagrams stamp theirs: the export renders this geometry, and a
   * title in HTML would be missing from every file anyone sends on. */
  titleFontSize: 15,
  titleLineHeight: 20,
  descriptionFontSize: 12,
  descriptionLineHeight: 17,
  titleDescriptionGap: 6,
  headingGap: 18,
  titleMinWrapWidth: 320,
  descriptionMaxLines: 3,
} as const;

function estimateWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * UC.charWidthRatio);
}

/* -------------------------------------------------------------------------- */
/* Result shapes                                                               */
/* -------------------------------------------------------------------------- */

export interface UCRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UCPoint {
  x: number;
  y: number;
}

interface LaidUseCaseElementBase {
  id: string;
  label: string;
  /** The label WRAPPED, one entry per rendered line — the renderer draws
   * these, never `label`, because SVG text does not wrap. */
  lines: readonly string[];
  technology?: string;
  tags?: readonly string[];
  /** Focus-only detail; shown in the viewer's dock, never drawn here. */
  description?: string;
  /** Bounding box (an ellipse's box circumscribes it). */
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  /**
   * The measured text block. For a use case it is centred in the ellipse —
   * exported so the check script can prove containment (the ellipse
   * inequality at each corner) without re-deriving text metrics. For an
   * actor it hangs below the figure.
   */
  labelBox: UCRect;
}

export interface LaidUseCaseActor extends LaidUseCaseElementBase {
  kind: "actor";
  /**
   * The actor's position in the layout's VERTICAL placement order across
   * both flanks (0-based; ties broken by centre-x, then declaration). The
   * reveal staggers the cast's walk-on by this, and it exists here — not
   * derived in the renderer — because the layout already chose this order
   * when it placed the flanks; a renderer re-deriving it is a second
   * placement opinion waiting to disagree.
   */
  cast: number;
}

export interface LaidUseCaseEllipse extends LaidUseCaseElementBase {
  kind: "usecase";
  rx: number;
  ry: number;
  /**
   * The COLUMN this use case packed into within its zone (0-based, left to
   * right). The reveal staggers use cases by this — a column fill reads as
   * the box filling in, never as a ranking, because columns are visibly a
   * packing artifact rather than a list the document wrote.
   */
  wave: number;
}

export type LaidUseCaseElement = LaidUseCaseActor | LaidUseCaseEllipse;

export interface LaidUseCaseEdge {
  /** Index into `file.edges` — the stable identity focus and checks key on. */
  index: number;
  kind: UseCaseEdgeKind;
  from: string;
  to: string;
  /**
   * The line's polyline, source end first — straight (two points) except
   * for a detoured dependency. A generalization's LINE ends at the hollow
   * triangle's base; `tip` carries the apex.
   */
  points: readonly UCPoint[];
  /** Generalization only: the triangle's apex, ON the parent's outline. */
  tip: UCPoint | null;
  /** Placed clear of every line and label; null when there is no label. */
  labelBox: UCRect | null;
  /** Wrapped label lines — «stereotype» for a dependency, the multiplicity
   * or role for an association, empty otherwise. */
  labelLines: readonly string[];
}

export interface LaidUseCaseBoundary {
  label: string;
  /** Normalised `#rrggbb`, when the document gave one. */
  tint?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The title band's measured text box — kept clear of the border and of
   * every member, which the check script asserts. */
  labelBox: UCRect;
  usecases: readonly string[];
}

export interface UseCaseLayout {
  width: number;
  height: number;
  heading: {
    titleLines: readonly string[];
    descriptionLines: readonly string[];
    height: number;
    width: number;
  };
  /** Declaration order — actors and use cases interleaved as authored. */
  elements: LaidUseCaseElement[];
  boundaries: LaidUseCaseBoundary[];
  edges: LaidUseCaseEdge[];
  /** Use cases in no boundary, placed below the boundaries. */
  unbounded: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Pass 1 — element sizing                                                     */
/* -------------------------------------------------------------------------- */

interface Sized {
  element: UseCaseElement;
  lines: string[];
  textWidth: number;
  textHeight: number;
  width: number;
  height: number;
  /** Ellipse semi-axes; 0 for an actor. */
  rx: number;
  ry: number;
}

function sizeElement(element: UseCaseElement): Sized {
  const maxText =
    element.kind === "actor" ? UC.actorMaxTextWidth : UC.ucMaxTextWidth;
  const lines = wrapText(element.label, maxText, UC.nodeFontSize);
  let textWidth = lines.reduce(
    (max, line) => Math.max(max, estimateWidth(line, UC.nodeFontSize)),
    0,
  );
  let textHeight = lines.length * UC.lineHeight;
  if (element.technology !== undefined) {
    textWidth = Math.max(
      textWidth,
      estimateWidth(`[${element.technology}]`, UC.metaFontSize),
    );
    textHeight += UC.techLineHeight;
  }
  if (element.kind === "usecase") {
    // The √2 envelope: each semi-axis is the text half-extent × √2 plus
    // padding, so the corner inequality holds by construction (file header).
    const rx = Math.max(
      UC.ellipseMinRx,
      (textWidth / 2) * Math.SQRT2 + UC.ellipsePadX,
    );
    const ry = Math.max(
      UC.ellipseMinRy,
      (textHeight / 2) * Math.SQRT2 + UC.ellipsePadY,
    );
    return {
      element,
      lines,
      textWidth,
      textHeight,
      width: rx * 2,
      height: ry * 2,
      rx,
      ry,
    };
  }
  const width = Math.max(UC.actorMinWidth, UC.actorFigureWidth, textWidth);
  const height = UC.actorFigureHeight + UC.actorLabelGap + textHeight;
  return { element, lines, textWidth, textHeight, width, height, rx: 0, ry: 0 };
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

interface Placed extends Sized {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

/** Where edges attach conceptually: an ellipse's centre; an actor's torso
 * (the figure's mid-height), so lines meet the FIGURE, not the label. */
function anchor(p: Placed): UCPoint {
  if (p.element.kind === "usecase") return { x: p.cx, y: p.cy };
  return { x: p.cx, y: p.y + UC.actorFigureHeight / 2 };
}

/** The point on `p`'s outline along the ray from its anchor toward `toward`.
 * Ellipse: the exact conic intersection. Actor: the bounding-box exit (the
 * figure has no useful closed outline to trim against). */
function outlinePoint(p: Placed, toward: UCPoint): UCPoint {
  const a = anchor(p);
  const dx = toward.x - a.x;
  const dy = toward.y - a.y;
  if (dx === 0 && dy === 0) return a;
  if (p.element.kind === "usecase") {
    const t = 1 / Math.sqrt((dx / p.rx) ** 2 + (dy / p.ry) ** 2);
    return { x: a.x + dx * t, y: a.y + dy * t };
  }
  // Slab exit of the ray from an interior point of the actor's box.
  const tx =
    dx > 0 ? (p.x + p.width - a.x) / dx : dx < 0 ? (p.x - a.x) / dx : Infinity;
  const ty =
    dy > 0 ? (p.y + p.height - a.y) / dy : dy < 0 ? (p.y - a.y) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function rectsOverlap(a: UCRect, b: UCRect, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.width &&
    a.x + a.width + pad > b.x &&
    a.y - pad < b.y + b.height &&
    a.y + a.height + pad > b.y
  );
}

/** General (not axis-aligned) segment vs rect, rect inflated by `pad`. */
function segmentHitsRect(
  a: UCPoint,
  b: UCPoint,
  rect: UCRect,
  pad = 0,
): boolean {
  const r = {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const inside = (p: UCPoint): boolean =>
    p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
  if (inside(a) || inside(b)) return true;
  const corners: UCPoint[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
  for (let i = 0; i < 4; i += 1) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

function segmentsIntersect(
  p1: UCPoint,
  p2: UCPoint,
  p3: UCPoint,
  p4: UCPoint,
): boolean {
  const d = (a: UCPoint, b: UCPoint, c: UCPoint): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

const boxOf = (p: Placed): UCRect => ({
  x: p.x,
  y: p.y,
  width: p.width,
  height: p.height,
});

/* -------------------------------------------------------------------------- */
/* The layout                                                                  */
/* -------------------------------------------------------------------------- */

export function layoutUseCase(file: UseCaseLabFile): UseCaseLayout {
  const sized = new Map(
    file.elements.map((element) => [element.id, sizeElement(element)]),
  );
  const declIndex = new Map(file.elements.map((e, i) => [e.id, i]));
  const actors = file.elements.filter((e) => e.kind === "actor");
  const usecases = file.elements.filter((e) => e.kind === "usecase");

  /* ---- zones: one per boundary, in declaration order, plus one trailing
   * zone for use cases outside every boundary. ---- */
  const boundaries = file.boundaries ?? [];
  const zoneOf = new Map<string, number>();
  boundaries.forEach((boundary, zone) => {
    for (const id of boundary.usecases) zoneOf.set(id, zone);
  });
  const unbounded = usecases.filter((u) => !zoneOf.has(u.id)).map((u) => u.id);
  const unboundedZone = boundaries.length;
  for (const id of unbounded) zoneOf.set(id, unboundedZone);
  const zoneMembers: string[][] = Array.from(
    { length: boundaries.length + (unbounded.length > 0 ? 1 : 0) },
    () => [],
  );
  // Membership in DECLARATION order — the author's narration is the order
  // the columns read in.
  for (const u of usecases) zoneMembers[zoneOf.get(u.id) ?? 0]?.push(u.id);

  /* ---- actor families and sides (the split rule in the file header) ---- */
  const familyOf = new Map<string, string>(actors.map((a) => [a.id, a.id]));
  const findFamily = (id: string): string => {
    let root = id;
    while (familyOf.get(root) !== root) root = familyOf.get(root) ?? root;
    return root;
  };
  for (const edge of file.edges) {
    if (edge.kind !== "generalization") continue;
    if (!familyOf.has(edge.from) || !familyOf.has(edge.to)) continue;
    // Union toward the earlier-declared member, so the family's root — and
    // through it every downstream tiebreak — is declaration-stable.
    const a = findFamily(edge.from);
    const b = findFamily(edge.to);
    if (a === b) continue;
    const keep = (declIndex.get(a) ?? 0) <= (declIndex.get(b) ?? 0) ? a : b;
    familyOf.set(a === keep ? b : a, keep);
  }
  const familyMembers = new Map<string, string[]>();
  for (const a of actors) {
    const root = findFamily(a.id);
    const list = familyMembers.get(root);
    if (list === undefined) familyMembers.set(root, [a.id]);
    else list.push(a.id);
  }
  const sideOf = new Map<string, -1 | 1>(); // -1 left, 1 right
  {
    let left = 0;
    let right = 0;
    for (const a of actors) {
      const root = findFamily(a.id);
      if (sideOf.has(root)) continue;
      const members = familyMembers.get(root) ?? [root];
      const side: -1 | 1 = left <= right ? -1 : 1;
      for (const id of members) sideOf.set(id, side);
      if (side === -1) left += members.length;
      else right += members.length;
      sideOf.set(root, side);
    }
  }
  const actorSide = (id: string): -1 | 1 => sideOf.get(id) ?? -1;

  /* ---- use-case columns per zone (use cases follow their actors) ---- */
  const associationsOf = (id: string): string[] => {
    const out: string[] = [];
    for (const edge of file.edges) {
      if (edge.kind !== "association") continue;
      if (edge.from === id) out.push(edge.to);
      else if (edge.to === id) out.push(edge.from);
    }
    return out;
  };

  const placed = new Map<string, Placed>();
  /** Column index per use case — becomes the element's `wave`. */
  const waveOf = new Map<string, number>();
  interface ZoneShape {
    contentLeft: number;
    contentRight: number;
    contentTop: number;
    contentBottom: number;
  }
  const zoneShapes: ZoneShape[] = [];

  let zoneCursorY = 0;
  zoneMembers.forEach((members, zone) => {
    const isBoundary = zone < boundaries.length;
    const columnCount = Math.max(
      1,
      Math.ceil(members.length / UC.maxPerColumn),
    );
    const capacity = Math.ceil(members.length / columnCount);
    const columns: string[][] = Array.from({ length: columnCount }, () => []);
    for (const id of members) {
      let target = 0;
      if (columnCount > 1) {
        // Majority side of the associated actors: left actors pull toward
        // column 0, right actors toward the last column; nobody votes →
        // the emptiest column (leftmost on ties) for balance.
        const votes = associationsOf(id)
          .filter((other) => sideOf.has(other))
          .reduce((sum, other) => sum + actorSide(other), 0);
        target =
          votes < 0
            ? 0
            : votes > 0
              ? columnCount - 1
              : columns.reduce(
                  (best, col, i) =>
                    col.length < columns[best].length ? i : best,
                  0,
                );
        if (columns[target].length >= capacity) {
          target = columns.reduce(
            (best, col, i) => (col.length < columns[best].length ? i : best),
            0,
          );
        }
      }
      columns[target].push(id);
    }

    const colWidths = columns.map((col) =>
      col.reduce((max, id) => Math.max(max, sized.get(id)?.width ?? 0), 0),
    );
    const colHeights = columns.map((col) => {
      const total = col.reduce(
        (sum, id) => sum + (sized.get(id)?.height ?? 0),
        0,
      );
      return total + UC.ucGapY * Math.max(0, col.length - 1);
    });
    const totalWidth =
      colWidths.reduce((sum, w) => sum + w, 0) +
      UC.ucColumnGap * Math.max(0, columnCount - 1);
    const maxColHeight = Math.max(0, ...colHeights);
    const contentTop = zoneCursorY + (isBoundary ? UC.boundaryPadTop : 0);

    let colX = -totalWidth / 2;
    columns.forEach((col, c) => {
      for (const id of col) waveOf.set(id, c);
      // Shorter columns centre on the tallest, so a two-column boundary
      // reads as one composed group rather than two ragged lists.
      let y = contentTop + (maxColHeight - colHeights[c]) / 2;
      for (const id of col) {
        const s = sized.get(id);
        if (s === undefined) continue;
        const x = colX + (colWidths[c] - s.width) / 2;
        placed.set(id, {
          ...s,
          x,
          y,
          cx: x + s.width / 2,
          cy: y + s.height / 2,
        });
        y += s.height + UC.ucGapY;
      }
      colX += colWidths[c] + UC.ucColumnGap;
    });

    zoneShapes.push({
      contentLeft: -totalWidth / 2,
      contentRight: totalWidth / 2,
      contentTop,
      contentBottom: contentTop + maxColHeight,
    });
    zoneCursorY =
      contentTop +
      maxColHeight +
      (isBoundary ? UC.boundaryPadBottom : 0) +
      UC.boundaryGap;
  });

  /* ---- side refinement: the split rule's step 3 read back off geometry.
   * Phase 1 balanced families blindly; the use cases have coordinates now,
   * so each family's side is re-read from where its use cases actually
   * landed: mean centre-x left of the axis → LEFT, right → RIGHT, no
   * associations (or dead centre) → the balanced side stands. This is the
   * "an actor talking only to left-column use cases belongs on the left"
   * rule made literal — without it, an actor balanced onto the far side
   * sends every association sweeping across the whole boundary (and
   * through whatever sits in between). Columns are NOT re-derived from the
   * refined sides: one refinement is a fixpoint step, a loop is a
   * ping-pong. Family iteration is insertion (declaration) order. */
  for (const members of familyMembers.values()) {
    const cxs: number[] = [];
    for (const id of members) {
      for (const other of associationsOf(id)) {
        const p = placed.get(other);
        if (p !== undefined) cxs.push(p.cx);
      }
    }
    if (cxs.length === 0) continue;
    const mean = cxs.reduce((sum, cx) => sum + cx, 0) / cxs.length;
    if (mean < -0.5) for (const id of members) sideOf.set(id, -1);
    else if (mean > 0.5) for (const id of members) sideOf.set(id, 1);
  }

  /* ---- edge scaffolding ---- */
  const edges: LaidUseCaseEdge[] = file.edges.map((edge, index) => ({
    index,
    kind: edge.kind,
    from: edge.from,
    to: edge.to,
    points: [],
    tip: null,
    labelBox: null,
    labelLines: [],
  }));

  const foreignBoxes = (from: string, to: string): UCRect[] => {
    const out: UCRect[] = [];
    for (const [id, p] of placed) {
      if (id === from || id === to) continue;
      out.push(boxOf(p));
    }
    return out;
  };
  const segmentsClear = (
    points: readonly UCPoint[],
    from: string,
    to: string,
  ): boolean => {
    const boxes = foreignBoxes(from, to);
    for (let i = 0; i + 1 < points.length; i += 1) {
      for (const box of boxes) {
        if (segmentHitsRect(points[i], points[i + 1], box, 2)) return false;
      }
    }
    return true;
  };

  /**
   * A use-case↔use-case line: straight when clear; otherwise a detour up a
   * corridor beside the column — RIGHT tried first, LEFT when the right
   * run would cross something (a left-column source's horizontal run would
   * pass through the right column). Lanes step outward per zone and side,
   * in edge order, so two detours never share an x.
   */
  const laneCounters = new Map<string, number>();
  const corridorMax = new Map<number, { left: number; right: number }>();
  function routeUsecasePair(fromId: string, toId: string): UCPoint[] {
    const from = placed.get(fromId);
    const to = placed.get(toId);
    if (from === undefined || to === undefined) return [];
    const direct = [
      outlinePoint(from, anchor(to)),
      outlinePoint(to, anchor(from)),
    ];
    if (segmentsClear(direct, fromId, toId)) return direct;

    const fromZone = zoneOf.get(fromId) ?? 0;
    const toZone = zoneOf.get(toId) ?? 0;
    const shapes =
      fromZone === toZone
        ? [zoneShapes[fromZone]]
        : [zoneShapes[fromZone], zoneShapes[toZone]];
    const contentRight = Math.max(...shapes.map((s) => s.contentRight));
    const contentLeft = Math.min(...shapes.map((s) => s.contentLeft));
    const zoneKey = fromZone === toZone ? String(fromZone) : "global";
    // A cross-zone corridor must clear the boundary RECTANGLES it passes,
    // not just their content — an extra boundary pad keeps the vertical run
    // outside the box borders instead of grazing along their inside.
    const gap =
      fromZone === toZone
        ? UC.depCorridorGap
        : UC.boundaryPadX + UC.depCorridorGap;

    const attempt = (side: -1 | 1, lane: number): UCPoint[] => {
      const corridorX =
        side === 1
          ? contentRight + gap + lane * UC.depLaneStep
          : contentLeft - gap - lane * UC.depLaneStep;
      const exit: UCPoint = { x: from.cx + side * from.rx, y: from.cy };
      const entry: UCPoint = { x: to.cx + side * to.rx, y: to.cy };
      return [
        exit,
        { x: corridorX, y: from.cy },
        { x: corridorX, y: to.cy },
        entry,
      ];
    };
    for (const side of [1, -1] as const) {
      const lane = laneCounters.get(`${zoneKey}:${side}`) ?? 0;
      const points = attempt(side, lane);
      if (segmentsClear(points, fromId, toId)) {
        laneCounters.set(`${zoneKey}:${side}`, lane + 1);
        const extent = corridorMax.get(fromZone) ?? {
          left: Infinity,
          right: -Infinity,
        };
        if (fromZone === toZone) {
          if (side === 1) extent.right = Math.max(extent.right, points[1].x);
          else extent.left = Math.min(extent.left, points[1].x);
          corridorMax.set(fromZone, extent);
        }
        return points;
      }
    }
    return direct; // Both corridors blocked: the straight line, honestly.
  }

  /* ---- dependencies and use-case generalizations (need no actors) ---- */
  file.edges.forEach((edge, index) => {
    const isUcPair =
      placed.has(edge.from) &&
      placed.has(edge.to) &&
      edge.kind !== "association";
    if (!isUcPair) return;
    const points = routeUsecasePair(edge.from, edge.to);
    if (points.length < 2) return;
    if (edge.kind === "generalization") {
      applyTriangle(edges[index], points);
    } else {
      edges[index] = { ...edges[index], points };
    }
  });

  /* ---- boundary rectangles ---- */
  const boundaryRects: LaidUseCaseBoundary[] = boundaries.map(
    (boundary, zone) => {
      const shape = zoneShapes[zone];
      const corridors = corridorMax.get(zone);
      const labelWidth = estimateWidth(
        boundary.label,
        UC.boundaryTitleFontSize,
      );
      let left = Math.min(
        shape.contentLeft - UC.boundaryPadX,
        corridors === undefined || corridors.left === Infinity
          ? Infinity
          : corridors.left - UC.depCorridorGap,
      );
      let right = Math.max(
        shape.contentRight + UC.boundaryPadX,
        corridors === undefined || corridors.right === -Infinity
          ? -Infinity
          : corridors.right + UC.depCorridorGap,
      );
      // The rectangle must also hold its own title with side clearance —
      // grown symmetrically so the members stay centred under the name.
      const short = labelWidth + UC.boundaryPadX * 2 - (right - left);
      if (short > 0) {
        left -= short / 2;
        right += short / 2;
      }
      const y = shape.contentTop - UC.boundaryPadTop;
      const height = shape.contentBottom + UC.boundaryPadBottom - y;
      const labelBox: UCRect = {
        x: (left + right) / 2 - labelWidth / 2,
        y: y + UC.boundaryTitlePad,
        width: labelWidth,
        height: UC.boundaryTitleFontSize + 4,
      };
      return {
        label: boundary.label,
        ...(typeof boundary.tint === "string" ? { tint: boundary.tint } : {}),
        x: left,
        y,
        width: right - left,
        height,
        labelBox,
        usecases: boundary.usecases,
      };
    },
  );

  /* ---- actors: flanking columns, outside every boundary ---- */
  const contentLeftEdge = Math.min(
    0,
    ...boundaryRects.map((r) => r.x),
    ...zoneShapes.map((s) => s.contentLeft),
  );
  const contentRightEdge = Math.max(
    0,
    ...boundaryRects.map((r) => r.x + r.width),
    ...zoneShapes.map((s) => s.contentRight),
  );
  const contentTopEdge = Math.min(
    0,
    ...boundaryRects.map((r) => r.y),
    ...zoneShapes.map((s) => s.contentTop),
  );

  interface ActorPlan {
    id: string;
    /** Mean centre-y of associated use cases; null with no associations. */
    meanCy: number | null;
    familyRoot: string;
  }
  const plans: ActorPlan[] = actors.map((a) => {
    const cys = associationsOf(a.id)
      .map((other) => placed.get(other)?.cy)
      .filter((cy): cy is number => cy !== undefined);
    return {
      id: a.id,
      meanCy:
        cys.length === 0
          ? null
          : cys.reduce((sum, cy) => sum + cy, 0) / cys.length,
      familyRoot: findFamily(a.id),
    };
  });
  const familyKey = new Map<string, number>();
  for (const plan of plans) {
    if (plan.meanCy === null) continue;
    const current = familyKey.get(plan.familyRoot);
    familyKey.set(
      plan.familyRoot,
      current === undefined ? plan.meanCy : Math.min(current, plan.meanCy),
    );
  }

  for (const side of [-1, 1] as const) {
    const sidePlans = plans
      .filter((p) => actorSide(p.id) === side)
      .sort((a, b) => {
        // Families contiguous (a generalization between separated members
        // would strike through whoever sat between them), families and
        // members ordered by the height of the use cases they talk to —
        // the crossing reducer — with declaration order breaking every tie.
        const ka = familyKey.get(a.familyRoot) ?? Infinity;
        const kb = familyKey.get(b.familyRoot) ?? Infinity;
        if (ka !== kb) return ka - kb;
        if (a.familyRoot !== b.familyRoot) {
          return (
            (declIndex.get(a.familyRoot) ?? 0) -
            (declIndex.get(b.familyRoot) ?? 0)
          );
        }
        const ma = a.meanCy ?? Infinity;
        const mb = b.meanCy ?? Infinity;
        if (ma !== mb) return ma - mb;
        return (declIndex.get(a.id) ?? 0) - (declIndex.get(b.id) ?? 0);
      });
    const columnWidth = sidePlans.reduce(
      (max, p) => Math.max(max, sized.get(p.id)?.width ?? 0),
      0,
    );
    let prevBottom = contentTopEdge - UC.actorGapY;
    for (const plan of sidePlans) {
      const s = sized.get(plan.id);
      if (s === undefined) continue;
      // At the mean height of its use cases where space allows; pushed down
      // just enough when the slot above is taken. Deterministic: the sorted
      // order is fixed, so the push-down cascade is too.
      const desired = plan.meanCy ?? -Infinity;
      const cy = Math.max(desired, prevBottom + UC.actorGapY + s.height / 2);
      const cx =
        side === -1
          ? contentLeftEdge - UC.actorGapX - columnWidth / 2
          : contentRightEdge + UC.actorGapX + columnWidth / 2;
      const x = cx - s.width / 2;
      const y = cy - s.height / 2;
      placed.set(plan.id, { ...s, x, y, cx, cy });
      prevBottom = y + s.height;
    }
  }

  /* ---- the cast order: the walk-on the reveal staggers by ------------------
   * Read back off the FINAL geometry (vertical order across both flanks,
   * centre-x then declaration breaking ties) rather than off the per-side
   * plan lists, so the number restates exactly what a reader sees — the
   * flanks filling downward — and stays deterministic for the same reasons
   * the placement is. */
  const castOf = new Map<string, number>();
  actors
    .map((a) => ({ id: a.id, p: placed.get(a.id) }))
    .sort((a, b) => {
      if (a.p === undefined || b.p === undefined) return 0;
      if (a.p.cy !== b.p.cy) return a.p.cy - b.p.cy;
      if (a.p.cx !== b.p.cx) return a.p.cx - b.p.cx;
      return (declIndex.get(a.id) ?? 0) - (declIndex.get(b.id) ?? 0);
    })
    .forEach((entry, i) => castOf.set(entry.id, i));

  /* ---- associations and actor generalizations ---- */
  file.edges.forEach((edge, index) => {
    if (edges[index].points.length >= 2) return; // already routed
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (from === undefined || to === undefined) return;
    if (edge.kind === "generalization") {
      // Actor–actor: straight child → parent (same column by the family
      // rule, so this is a short vertical line between neighbours).
      applyTriangle(edges[index], [
        outlinePoint(from, anchor(to)),
        outlinePoint(to, anchor(from)),
      ]);
      return;
    }
    // Association: straight when clear; else bend over the ellipse's top or
    // bottom vertex, whichever route clears — the classic hand-drawn dodge
    // around a column the line would otherwise strike through.
    const usecaseEnd = from.element.kind === "usecase" ? from : to;
    const actorEnd = usecaseEnd === from ? to : from;
    const direct = [
      outlinePoint(from, anchor(to)),
      outlinePoint(to, anchor(from)),
    ];
    let points: UCPoint[] = direct;
    if (!segmentsClear(direct, edge.from, edge.to)) {
      // Via candidates step outward (k grows) so the bend clears not just
      // the immediate neighbour but a whole column the line would cross —
      // first clear candidate wins, above before below, near before far.
      found: for (const vertical of [-1, 1] as const) {
        for (let k = 1; k <= 6; k += 1) {
          const via: UCPoint = {
            x: usecaseEnd.cx,
            y:
              vertical === -1
                ? usecaseEnd.y - UC.bendGap * k
                : usecaseEnd.y + usecaseEnd.height + UC.bendGap * k,
          };
          const vertex: UCPoint = {
            x: usecaseEnd.cx,
            y:
              vertical === -1 ? usecaseEnd.y : usecaseEnd.y + usecaseEnd.height,
          };
          const bent =
            usecaseEnd === to
              ? [outlinePoint(actorEnd, via), via, vertex]
              : [vertex, via, outlinePoint(actorEnd, via)];
          if (segmentsClear(bent, edge.from, edge.to)) {
            points = bent;
            break found;
          }
        }
      }
    }
    edges[index] = { ...edges[index], points };
  });

  /* ---- edge labels: beside the line, clear of everything ------------------
   * The multiplicity/role of an association and the «stereotype» of a
   * dependency. A deterministic candidate walk around the line's midpoint —
   * perpendicular offsets on either side, stepped outward and along — takes
   * the first spot clear of EVERY line, element box, boundary title and
   * already-placed label; the check script re-tests all four clearances. */
  const elementBoxes = [...placed.values()].map(boxOf);
  const placedLabels: UCRect[] = [...boundaryRects.map((b) => b.labelBox)];
  file.edges.forEach((edge, index) => {
    const laid = edges[index];
    if (laid.points.length < 2) return;
    const text =
      edge.kind === "dependency"
        ? `«${edge.stereotype}»`
        : edge.kind === "association" && edge.label !== undefined
          ? edge.label
          : null;
    if (text === null) return;
    const lines = wrapText(text, UC.labelMaxWidth, UC.labelFontSize);
    const width =
      lines.reduce(
        (max, line) => Math.max(max, estimateWidth(line, UC.labelFontSize)),
        0,
      ) +
      UC.labelPadX * 2;
    const height = lines.length * UC.labelLineHeight + UC.labelPadY * 2;

    // A detoured line anchors on its corridor run (the long segment a
    // reader traces); a straight or bent one on its first segment.
    const segIndex = laid.points.length === 4 ? 1 : 0;
    const a = laid.points[segIndex];
    const b = laid.points[segIndex + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = { x: -u.y, y: u.x };

    // The box's half-projection onto the line's NORMAL — for a diagonal
    // line the box's width, not its height, is what can reach back and
    // touch the line, so a height-only offset ships labels ON their own
    // spokes (caught by this file's own check the first time).
    const halfProj = (Math.abs(n.x) * width) / 2 + (Math.abs(n.y) * height) / 2;
    const candidates: UCPoint[] = [];
    for (let step = 0; step < 5; step += 1) {
      const off = UC.labelGap + halfProj + step * 7;
      for (const along of [0, 16, -16, 32, -32]) {
        for (const dir of [1, -1]) {
          candidates.push({
            x: mid.x + n.x * off * dir + u.x * along,
            y: mid.y + n.y * off * dir + u.y * along,
          });
        }
      }
    }
    let box: UCRect = {
      x: candidates[0].x - width / 2,
      y: candidates[0].y - height / 2,
      width,
      height,
    };
    for (const candidate of candidates) {
      const trial: UCRect = {
        x: candidate.x - width / 2,
        y: candidate.y - height / 2,
        width,
        height,
      };
      if (labelClear(trial, edges, elementBoxes, placedLabels)) {
        box = trial;
        break;
      }
    }
    placedLabels.push(box);
    edges[index] = { ...laid, labelBox: box, labelLines: lines };
  });

  /* ---- heading, extents, shift -------------------------------------------- */
  const contentSpan = contentRightEdge - contentLeftEdge;
  const heading = layoutHeading(file, contentSpan);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const stretch = (rect: UCRect): void => {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  };
  for (const p of placed.values()) stretch(boxOf(p));
  for (const b of boundaryRects) stretch(b);
  for (const e of edges) {
    for (const point of [...e.points, ...(e.tip === null ? [] : [e.tip])]) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    if (e.labelBox !== null) stretch(e.labelBox);
  }
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const dx = UC.marginX - minX;
  const dy = UC.marginTop + heading.height - minY;
  const shiftRect = (rect: UCRect): UCRect => ({
    ...rect,
    x: rect.x + dx,
    y: rect.y + dy,
  });
  const shiftPoint = (p: UCPoint): UCPoint => ({ x: p.x + dx, y: p.y + dy });

  const elements: LaidUseCaseElement[] = file.elements.map((element) => {
    const p = placed.get(element.id);
    if (p === undefined) {
      // Unreachable for a parsed file — every declared element is placed —
      // but the map access is typed optional and a throw keeps this total.
      throw new Error(`element "${element.id}" was never placed`);
    }
    const x = p.x + dx;
    const y = p.y + dy;
    const base = {
      id: element.id,
      label: element.label,
      lines: p.lines,
      ...(element.technology !== undefined
        ? { technology: element.technology }
        : {}),
      ...(element.tags !== undefined ? { tags: element.tags } : {}),
      ...(element.description !== undefined
        ? { description: element.description }
        : {}),
      x,
      y,
      width: p.width,
      height: p.height,
      cx: p.cx + dx,
      cy: p.cy + dy,
    };
    if (element.kind === "usecase") {
      return {
        ...base,
        kind: "usecase",
        rx: p.rx,
        ry: p.ry,
        wave: waveOf.get(element.id) ?? 0,
        labelBox: {
          x: base.cx - p.textWidth / 2,
          y: base.cy - p.textHeight / 2,
          width: p.textWidth,
          height: p.textHeight,
        },
      };
    }
    return {
      ...base,
      kind: "actor",
      cast: castOf.get(element.id) ?? 0,
      labelBox: {
        x: base.cx - p.textWidth / 2,
        y: y + UC.actorFigureHeight + UC.actorLabelGap,
        width: p.textWidth,
        height: p.textHeight,
      },
    };
  });

  const shiftedEdges = edges.map((edge) => ({
    ...edge,
    points: edge.points.map(shiftPoint),
    tip: edge.tip === null ? null : shiftPoint(edge.tip),
    labelBox: edge.labelBox === null ? null : shiftRect(edge.labelBox),
  }));
  const shiftedBoundaries = boundaryRects.map((boundary) => ({
    ...boundary,
    x: boundary.x + dx,
    y: boundary.y + dy,
    labelBox: shiftRect(boundary.labelBox),
  }));

  const width = Math.ceil(
    Math.max(maxX + dx, UC.marginX + heading.width) + UC.marginX,
  );
  const height = Math.ceil(maxY + dy + UC.marginBottom);
  return {
    width,
    height,
    heading,
    elements,
    boundaries: shiftedBoundaries,
    edges: shiftedEdges,
    unbounded,
  };
}

/** Trim a generalization's line one triangle-length short of the parent's
 * outline and record the apex — the renderer and the exporter draw the
 * hollow triangle from these two, never from geometry of their own. */
function applyTriangle(edge: LaidUseCaseEdge, points: UCPoint[]): void {
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const base: UCPoint = {
    x: tip.x - ((tip.x - prev.x) / len) * UC.triangleLength,
    y: tip.y - ((tip.y - prev.y) / len) * UC.triangleLength,
  };
  edge.points = [...points.slice(0, -1), base];
  edge.tip = tip;
}

/** True when `box` (inflated by the clearance) touches no line, element,
 * boundary title or already-placed label. */
function labelClear(
  box: UCRect,
  edges: readonly LaidUseCaseEdge[],
  elementBoxes: readonly UCRect[],
  labels: readonly UCRect[],
): boolean {
  const c = UC.labelClearance;
  const inflated: UCRect = {
    x: box.x - c,
    y: box.y - c,
    width: box.width + c * 2,
    height: box.height + c * 2,
  };
  for (const other of [...elementBoxes, ...labels]) {
    if (rectsOverlap(inflated, other)) return false;
  }
  for (const edge of edges) {
    const points = edge.tip === null ? edge.points : [...edge.points, edge.tip];
    for (let i = 0; i + 1 < points.length; i += 1) {
      if (segmentHitsRect(points[i], points[i + 1], inflated)) return false;
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* The heading                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Same design as the sequence and flowchart headings, same reasons: wrap to
 * the DRAWING's span (floored at `titleMinWrapWidth`) so a long title never
 * widens a small diagram, and report the measured width so the canvas
 * widens for the one case wrapping cannot solve.
 */
function layoutHeading(
  file: UseCaseLabFile,
  contentSpan: number,
): UseCaseLayout["heading"] {
  const wrapWidth = Math.max(UC.titleMinWrapWidth, contentSpan);
  const titleLines = wrapText(file.metadata.title, wrapWidth, UC.titleFontSize);
  const description = file.metadata.description;
  let descriptionLines: string[] = [];
  if (description !== undefined && description.trim() !== "") {
    const all = wrapText(description, wrapWidth, UC.descriptionFontSize);
    descriptionLines = all.slice(0, UC.descriptionMaxLines);
    if (all.length > descriptionLines.length) {
      const last = descriptionLines.length - 1;
      descriptionLines[last] = `${descriptionLines[last]}…`;
    }
  }
  const height =
    titleLines.length * UC.titleLineHeight +
    (descriptionLines.length === 0
      ? 0
      : UC.titleDescriptionGap +
        descriptionLines.length * UC.descriptionLineHeight) +
    UC.headingGap;
  const width = Math.max(
    0,
    ...titleLines.map((line) => estimateWidth(line, UC.titleFontSize)),
    ...descriptionLines.map((line) =>
      estimateWidth(line, UC.descriptionFontSize),
    ),
  );
  return { titleLines, descriptionLines, height, width };
}
