/**
 * A bundled example reduced to its SHAPE — the geometry with the words taken
 * out.
 *
 * WHY THE INDEX NEEDED THIS AT ALL. `/demo` is the page that answers "does
 * this thing draw the kind of picture I have in mind", and it answered it with
 * `12 steps · 14 arrows · 3 decisions`. A page selling diagrams that shows no
 * diagram is the failure `purpose.md` calls out by name: correct and ugly.
 *
 * WHY NOT THE REAL EXPORTER. `render*Svg()` would give a true miniature, and
 * cannot run here: it paints with `resolveExportTheme()`, which reads live
 * computed styles through a 2D canvas (`viewer/export/theme.ts`) and so needs
 * a browser. Feeding it a literal colour table from the server would be a
 * second copy of the palette with nothing like `check:themes` guarding it, and
 * the palette drifting silently is a worse bug than the one being fixed. The
 * `layout*()` functions, by contrast, are pure by contract — every one of them
 * says so — so the geometry is already available on the server. This module
 * takes the geometry and leaves the paint to CSS.
 *
 * WHY THE LABELS ARE DROPPED rather than shrunk. A preview is ~320px wide and
 * a document is 800–2000 units across, so every string in it lands between one
 * and four pixels tall. Drawing them would produce grey mush that reads as a
 * rendering fault; dropping them leaves the one thing that IS legible at that
 * size and that actually distinguishes the nine notations — a rhombus, a
 * crow's foot, two lifelines, a stepped rail of bars, a spine with a branch
 * coming back to it. The glyphs in `KIND_CHROME` make the same bet at 16px.
 *
 * WHAT IT PROMISES. Every shape here comes from the real document through the
 * real layout. Nothing is illustrative and nothing is hand-placed, so a
 * preview cannot flatter an example the canvas would draw differently — which
 * is the only reason showing a picture beats showing a count.
 */

import { loadDictExample } from "@/features/dict/service/example-service";
import { loadErExample } from "@/features/er/service/example-service";
import { loadFlowchartExample } from "@/features/flowchart/service/example-service";
import { loadGanttExample } from "@/features/gantt/service/example-service";
import { loadLifecycleExample } from "@/features/lifecycle/service/example-service";
import { loadSequenceExample } from "@/features/sequence/service/example-service";
import { loadTimelineExample } from "@/features/timeline/service/example-service";
import { loadUseCaseExample } from "@/features/usecase/service/example-service";
/* Deep-imported for the reason the demo page states about its own imports:
   these features' barrels re-export `"use client"` canvases, and this module
   runs on the server. The one exception is the viewer, whose barrel the demo
   page already imports from safely. */
import { loadViewerModel } from "@/features/viewer/service/model-service";

import { DICT, layoutDict } from "@/features/dict/lib/layout";
import { ER, layoutEr } from "@/features/er/lib/layout";
import { layoutFlowchart } from "@/features/flowchart/lib/layout";
import { GANTT, layoutGantt } from "@/features/gantt/lib/layout";
import { LIFECYCLE, layoutLifecycle } from "@/features/lifecycle/lib/layout";
import { SEQ, layoutSequence } from "@/features/sequence/lib/layout";
import { TIMELINE, layoutTimeline } from "@/features/timeline/lib/layout";
import { layoutUseCase } from "@/features/usecase/lib/layout";

import type { SeedKind } from "@/features/playground/input/parse";

/**
 * How a shape is painted, in terms of ROLE rather than colour.
 *
 * Three is the whole vocabulary because three is what survives the scale: a
 * thing that holds text, a thing that connects two of them, and the one mark
 * per notation that carries meaning — a decision, a critical bar, an actor at
 * the system's edge. The section's `--kind` supplies the hue, so a preview
 * wears its own kind's colour without this file naming one.
 */
export type WireTone = "body" | "link" | "accent";

export type WireShape =
  | {
      s: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      /** Corner radius. Omitted means square, which the tables want. */
      r?: number;
      tone: WireTone;
    }
  | {
      s: "diamond";
      cx: number;
      cy: number;
      w: number;
      h: number;
      tone: WireTone;
    }
  | {
      s: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      tone: WireTone;
    }
  | { s: "dot"; cx: number; cy: number; r: number; tone: WireTone }
  /** A polyline, never a curve — see the note on `frame` about bounds. */
  | {
      s: "line";
      points: readonly WirePoint[];
      tone: WireTone;
      dashed?: boolean;
    };

export interface WirePoint {
  x: number;
  y: number;
}

export interface Wireframe {
  /** The bounding box of the shapes, plus `PAD`. Origin is always 0,0. */
  width: number;
  height: number;
  shapes: readonly WireShape[];
}

/** Breathing room around the drawn bounds, in document units. */
const PAD = 24;

/* -------------------------------------------------------------------------- */
/* Framing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shifts a pile of shapes to the origin and measures what is left.
 *
 * THE BOUNDS ARE MEASURED, NOT TAKEN FROM `layout.width/height`, for two
 * reasons that pull the same way. Every layout reserves a heading block whose
 * text this module drops, so the layout's own height would leave a band of
 * nothing across the top of every preview. And two layouts do not start at the
 * origin at all — the sequence's `minX` goes negative for a left-hand note,
 * and a C4 diagram's node positions are authored wherever the author dragged
 * them. Measuring handles all three without a per-kind special case.
 *
 * This is also why `line` carries points rather than an SVG `d` string: a path
 * string cannot be measured without parsing it, and a curve cannot be measured
 * without solving it. At preview scale a polyline through the same points is
 * indistinguishable from the curve anyway.
 */
function frame(shapes: readonly WireShape[]): Wireframe | null {
  if (shapes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const shape of shapes) {
    switch (shape.s) {
      case "rect":
        grow(shape.x, shape.y);
        grow(shape.x + shape.w, shape.y + shape.h);
        break;
      case "diamond":
        grow(shape.cx - shape.w / 2, shape.cy - shape.h / 2);
        grow(shape.cx + shape.w / 2, shape.cy + shape.h / 2);
        break;
      case "ellipse":
        grow(shape.cx - shape.rx, shape.cy - shape.ry);
        grow(shape.cx + shape.rx, shape.cy + shape.ry);
        break;
      case "dot":
        grow(shape.cx - shape.r, shape.cy - shape.r);
        grow(shape.cx + shape.r, shape.cy + shape.r);
        break;
      case "line":
        for (const point of shape.points) grow(point.x, point.y);
        break;
    }
  }

  // Every branch above is unreachable only for an empty list, excluded already.
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const dx = PAD - minX;
  const dy = PAD - minY;
  return {
    width: maxX - minX + PAD * 2,
    height: maxY - minY + PAD * 2,
    shapes: shapes.map((shape) => shift(shape, dx, dy)),
  };
}

/**
 * The topmost y a shape reaches.
 *
 * Exported for the panel, which crops tall documents and would otherwise ship
 * the markup for every shape below the fold — a third of them, measured on the
 * built page before this existed. Knowing where a shape starts is this
 * module's business; deciding what to do about it is the panel's.
 */
export function shapeTop(shape: WireShape): number {
  switch (shape.s) {
    case "rect":
      return shape.y;
    case "diamond":
      return shape.cy - shape.h / 2;
    case "ellipse":
      return shape.cy - shape.ry;
    case "dot":
      return shape.cy - shape.r;
    case "line":
      return shape.points.reduce(
        (top, point) => Math.min(top, point.y),
        Infinity,
      );
  }
}

function shift(shape: WireShape, dx: number, dy: number): WireShape {
  switch (shape.s) {
    case "rect":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case "diamond":
    case "ellipse":
    case "dot":
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case "line":
      return {
        ...shape,
        points: shape.points.map((point) => ({
          x: point.x + dx,
          y: point.y + dy,
        })),
      };
  }
}

/* -------------------------------------------------------------------------- */
/* One adapter per notation                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Nine adapters, and there is no way to have fewer: nine notations produce
 * nine differently-shaped layouts, and the whole point of the preview is that
 * it shows what makes each one different. What they DO share is the vocabulary
 * above and `frame` below them, so each of these is a reading of one layout
 * and nothing else — no measuring, no colour, no framing arithmetic.
 *
 * Each returns `null` when the example does not parse. A broken bundled
 * example is a bug in this repo and the row still says so in words; a preview
 * that invented something would be the one way to hide it.
 */

function c4Wireframe(id: string): Wireframe | null {
  const result = loadViewerModel(id);
  if (result.status !== "ok") return null;
  const diagram = result.model.diagrams[result.model.rootDiagramId];
  if (diagram === undefined) return null;

  const centres = new Map<string, WirePoint>();
  const shapes: WireShape[] = [];
  for (const node of diagram.nodes) {
    centres.set(node.id, {
      x: node.position.x + node.size.width / 2,
      y: node.position.y + node.size.height / 2,
    });
    shapes.push({
      s: "rect",
      x: node.position.x,
      y: node.position.y,
      w: node.size.width,
      h: node.size.height,
      r: 8,
      tone: "body",
    });
  }

  /* Centre to centre, through the authored waypoints. The real canvas routes
     these as splines around the boxes; at preview scale the difference is
     under a pixel, and a straight run keeps the module free of a router. */
  const edges: WireShape[] = [];
  for (const edge of diagram.edges) {
    const from = centres.get(edge.source);
    const to = centres.get(edge.target);
    if (from === undefined || to === undefined) continue;
    edges.push({
      s: "line",
      points: [from, ...(edge.waypoints ?? []), to],
      tone: "link",
    });
  }

  // Connectors first so the boxes sit on top of them, as on the canvas.
  return frame([...edges, ...shapes]);
}

function sequenceWireframe(id: string): Wireframe | null {
  const result = loadSequenceExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutSequence(result.file);
  const shapes: WireShape[] = [];

  for (const participant of layout.participants) {
    // The header card, then the lifeline hanging from it.
    shapes.push({
      s: "rect",
      x: participant.x - participant.headerWidth / 2,
      y: layout.headerTop,
      w: participant.headerWidth,
      h: layout.headerHeight,
      r: 6,
      tone: "body",
    });
    shapes.push({
      s: "line",
      points: [
        { x: participant.x, y: layout.lifelineTop },
        { x: participant.x, y: layout.footerTop },
      ],
      tone: "link",
      dashed: true,
    });
  }

  for (const activation of layout.activations) {
    shapes.push({
      s: "rect",
      x: activation.x,
      y: activation.y0,
      w: activation.width,
      h: activation.y1 - activation.y0,
      tone: "accent",
    });
  }

  /* THE MESSAGES ARE THE DIAGRAM. A self-call is drawn as the little loop out
     and back rather than a zero-length line, because a run of them is what a
     retry or a poll looks like and a dot would say nothing. */
  for (const message of layout.messages) {
    shapes.push(
      message.self
        ? {
            s: "line",
            points: [
              { x: message.fromX, y: message.y },
              { x: message.fromX + SEQ.selfLoopWidth, y: message.y },
              {
                x: message.fromX + SEQ.selfLoopWidth,
                y: message.y + SEQ.selfLoopHeight,
              },
              { x: message.toX, y: message.y + SEQ.selfLoopHeight },
            ],
            tone: "accent",
          }
        : {
            s: "line",
            points: [
              { x: message.fromX, y: message.y },
              { x: message.toX, y: message.y },
            ],
            tone: "accent",
            dashed: message.lineStyle === "dotted",
          },
    );
  }

  return frame(shapes);
}

function flowchartWireframe(id: string): Wireframe | null {
  const result = loadFlowchartExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutFlowchart(result.file);
  const shapes: WireShape[] = [];

  for (const group of layout.groups) {
    shapes.push({
      s: "rect",
      x: group.x,
      y: group.y,
      w: group.width,
      h: group.height,
      r: 10,
      tone: "link",
    });
  }

  for (const edge of layout.edges) {
    shapes.push({ s: "line", points: edge.points, tone: "link" });
  }

  /* THE RHOMBUS IS THE TELL — it is what no other notation draws, and at
     320px it is the whole reason a reader can name this preview a flowchart
     without reading the heading. So a decision gets the accent, and the
     terminators get their stadium radius; everything else is a box. */
  for (const node of layout.nodes) {
    if (node.shape === "decision") {
      shapes.push({
        s: "diamond",
        cx: node.cx,
        cy: node.cy,
        w: node.width,
        h: node.height,
        tone: "accent",
      });
      continue;
    }
    shapes.push({
      s: "rect",
      x: node.x,
      y: node.y,
      w: node.width,
      h: node.height,
      r: node.shape === "start" || node.shape === "end" ? node.height / 2 : 6,
      tone: "body",
    });
  }

  return frame(shapes);
}

function usecaseWireframe(id: string): Wireframe | null {
  const result = loadUseCaseExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutUseCase(result.file);
  const shapes: WireShape[] = [];

  for (const boundary of layout.boundaries) {
    shapes.push({
      s: "rect",
      x: boundary.x,
      y: boundary.y,
      w: boundary.width,
      h: boundary.height,
      r: 10,
      tone: "link",
    });
  }

  for (const edge of layout.edges) {
    shapes.push({
      s: "line",
      points: edge.points,
      tone: "link",
      dashed: edge.kind !== "association",
    });
  }

  /* An actor against an ellipse is the pairing no other notation draws, so
     the actor wears the accent: the stick figure is small, and at this scale
     an untinted one would read as a dropped shape rather than a person. */
  for (const element of layout.elements) {
    if (element.kind === "usecase") {
      shapes.push({
        s: "ellipse",
        cx: element.cx,
        cy: element.cy,
        rx: element.rx,
        ry: element.ry,
        tone: "body",
      });
      continue;
    }
    const headR = element.width / 6;
    const headY = element.y + headR;
    const shoulderY = headY + headR * 1.6;
    const hipY = element.y + element.height * 0.62;
    shapes.push({
      s: "dot",
      cx: element.cx,
      cy: headY,
      r: headR,
      tone: "accent",
    });
    shapes.push({
      s: "line",
      points: [
        { x: element.cx, y: headY + headR },
        { x: element.cx, y: hipY },
      ],
      tone: "accent",
    });
    shapes.push({
      s: "line",
      points: [
        { x: element.x, y: shoulderY },
        { x: element.x + element.width, y: shoulderY },
      ],
      tone: "accent",
    });
    shapes.push({
      s: "line",
      points: [
        { x: element.x, y: element.y + element.height },
        { x: element.cx, y: hipY },
        { x: element.x + element.width, y: element.y + element.height },
      ],
      tone: "accent",
    });
  }

  return frame(shapes);
}

function erWireframe(id: string): Wireframe | null {
  const result = loadErExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutEr(result.file);
  const shapes: WireShape[] = [];

  for (const relationship of layout.relationships) {
    shapes.push({
      s: "line",
      points: relationship.points,
      tone: "link",
      dashed: relationship.kind === "non-identifying",
    });
  }

  /* A TABLE, NOT A BOX: the header rule and the attribute rows are what make
     this an ER preview rather than a C4 one, and they are the only text-shaped
     thing in this module drawn at all — as rules, which survive the scale
     where the words in them do not. */
  for (const entity of layout.entities) {
    shapes.push({
      s: "rect",
      x: entity.x,
      y: entity.y,
      w: entity.width,
      h: entity.height,
      r: 4,
      tone: "body",
    });
    shapes.push({
      s: "line",
      points: [
        { x: entity.x, y: entity.y + ER.headerHeight },
        { x: entity.x + entity.width, y: entity.y + ER.headerHeight },
      ],
      tone: "accent",
    });
    for (const attribute of entity.attributes) {
      shapes.push({
        s: "line",
        points: [
          { x: entity.x + ER.padX, y: attribute.y },
          { x: entity.x + entity.width - ER.padX, y: attribute.y },
        ],
        tone: "link",
      });
    }
  }

  return frame(shapes);
}

function dictWireframe(id: string): Wireframe | null {
  const result = loadDictExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutDict(result.file);
  const shapes: WireShape[] = [];

  /* A dictionary has no geometry to speak of — it is a table — so the preview
     is the table's RHYTHM: a tinted rule per section heading, and a pair of
     ruled cells per field. That is what tells a reader at a glance whether an
     example is six tidy sections or one flat dump of ninety fields, which is
     the only question this preview can honestly answer. */
  for (const section of layout.sections) {
    shapes.push({
      s: "rect",
      x: 0,
      y: section.headerY - DICT.lineHeight,
      w: layout.width * 0.42,
      h: DICT.lineHeight,
      r: 2,
      tone: "accent",
    });
    for (const field of section.fields) {
      shapes.push({
        s: "rect",
        x: layout.columnX.name,
        y: field.y,
        w: layout.columnWidth.name,
        h: DICT.lineHeight,
        r: 2,
        tone: "body",
      });
      shapes.push({
        s: "rect",
        x: layout.columnX.type,
        y: field.y,
        w: layout.columnWidth.type + layout.columnWidth.description,
        h: DICT.lineHeight,
        r: 2,
        tone: "link",
      });
    }
  }

  return frame(shapes);
}

function ganttWireframe(id: string): Wireframe | null {
  const result = loadGanttExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutGantt(result.file);
  const shapes: WireShape[] = [];

  // The measured rail first — a gantt without one is a stack of bars.
  for (const tick of layout.ticks) {
    shapes.push({
      s: "line",
      points: [
        { x: tick.x, y: 0 },
        { x: tick.x, y: layout.height },
      ],
      tone: "link",
      dashed: true,
    });
  }

  /* THE CRITICAL PATH IS THE ACCENT, matching what the canvas tints and what
     `KIND_CHROME` gives this kind for a colour — so the one bar a reader's eye
     lands on in the preview is the one the diagram is about. */
  for (const item of layout.items) {
    if (item.milestone) {
      shapes.push({
        s: "diamond",
        cx: item.x0,
        cy: item.midY,
        w: GANTT.milestoneRadius * 2,
        h: GANTT.milestoneRadius * 2,
        tone: "accent",
      });
      continue;
    }
    shapes.push({
      s: "rect",
      x: item.x0,
      y: item.barY,
      w: Math.max(item.x1 - item.x0, 2),
      h: GANTT.barHeight,
      r: 3,
      tone: item.critical ? "accent" : "body",
    });
  }

  return frame(shapes);
}

function timelineWireframe(id: string): Wireframe | null {
  const result = loadTimelineExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutTimeline(result.file);
  const shapes: WireShape[] = [];

  shapes.push({
    s: "line",
    points: [
      { x: layout.spineX, y: layout.spineY0 },
      { x: layout.spineX, y: layout.spineY1 },
    ],
    tone: "link",
  });

  for (const period of layout.periods) {
    shapes.push({
      s: "line",
      points: [
        { x: layout.spineX - TIMELINE.spineX * 0.4, y: period.ruleY },
        { x: layout.spineX + TIMELINE.spineX * 0.9, y: period.ruleY },
      ],
      tone: "accent",
    });
  }

  /* A DOT AND THE LABEL'S FOOTPRINT. The bands are sized by their content, so
     a stub the width of the dropped text is the one thing that keeps a
     timeline preview from reading as an evenly-spaced ruler — which is the
     gantt's shape, and the one this must not be mistaken for. */
  for (const event of layout.events) {
    shapes.push({
      s: "dot",
      cx: layout.spineX,
      cy: event.dotY,
      r: TIMELINE.dotRadius,
      tone: "body",
    });
    shapes.push({
      s: "line",
      points: [
        { x: layout.spineX + TIMELINE.dotRadius * 2.4, y: event.dotY },
        {
          x: layout.spineX + TIMELINE.dotRadius * 2.4 + labelStub(event.label),
          y: event.dotY,
        },
      ],
      tone: "link",
    });
  }

  return frame(shapes);
}

function lifecycleWireframe(id: string): Wireframe | null {
  const result = loadLifecycleExample(id);
  if (result.status !== "ok") return null;
  const layout = layoutLifecycle(result.file);
  const shapes: WireShape[] = [];

  shapes.push({
    s: "line",
    points: [
      { x: layout.spineX, y: layout.spineY0 },
      { x: layout.spineX, y: layout.spineY1 },
    ],
    tone: "link",
  });

  for (const state of layout.states) {
    shapes.push({
      s: "dot",
      cx: layout.spineX,
      cy: state.dotY,
      r: LIFECYCLE.dotRadius,
      tone: state.final ? "accent" : "body",
    });
  }

  /* THE RETURNING BRANCH IS THE WHOLE TELL — it is the only thing separating
     this preview from the timeline's, which is the same spine without one. It
     gets the accent for that reason, and it is drawn as the real routed
     channel (out to `channelX`, up, and back in) rather than a straight
     chord, because the chord would cross the spine and say the opposite. */
  for (const exit of layout.exits) {
    const rejoin = exit.rejoinPath;
    if (rejoin === null) {
      shapes.push({
        s: "line",
        points: [
          { x: layout.spineX, y: exit.dotY },
          { x: layout.spineX + LIFECYCLE.dotRadius * 4, y: exit.dotY },
        ],
        tone: "link",
      });
      continue;
    }
    shapes.push({
      s: "line",
      points: [
        { x: layout.spineX, y: rejoin.departY },
        { x: rejoin.channelX, y: rejoin.departY },
        { x: rejoin.channelX, y: rejoin.joinY },
        { x: layout.spineX, y: rejoin.joinY },
      ],
      tone: "accent",
    });
  }

  return frame(shapes);
}

/**
 * The footprint a dropped label would have occupied.
 *
 * Not a measurement — this module draws no text and needs none. It is the
 * same character-ratio estimate the pure layouts use, at a scale that keeps a
 * long event name visibly longer than a short one. Without it every stub is
 * the same length and the preview claims a regularity the document does not
 * have.
 */
function labelStub(label: string): number {
  return Math.min(Math.max(label.length, 4), 28) * 5.4;
}

/* -------------------------------------------------------------------------- */
/* The one entry point                                                         */
/* -------------------------------------------------------------------------- */

const ADAPTERS: Record<SeedKind, (id: string) => Wireframe | null> = {
  c4: c4Wireframe,
  sequence: sequenceWireframe,
  flowchart: flowchartWireframe,
  usecase: usecaseWireframe,
  er: erWireframe,
  dict: dictWireframe,
  gantt: ganttWireframe,
  timeline: timelineWireframe,
  lifecycle: lifecycleWireframe,
};

/**
 * The shape of one bundled example, or `null` if it does not parse.
 *
 * Called at build time from a server component, so the cost is nine layouts
 * per kind at compile and nothing at all at runtime.
 */
export function exampleWireframe(kind: SeedKind, id: string): Wireframe | null {
  return ADAPTERS[kind](id);
}
