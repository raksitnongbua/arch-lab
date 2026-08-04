/**
 * Where a frame's rectangle goes.
 *
 * `C4Frame` stores no geometry on purpose (see the type's own comment), so the
 * rectangle is derived here — once, from the members' bounding box — and the
 * viewer canvas, the editor canvas and the SVG exporter all read the same
 * result. One source of truth, the same rule the type→colour table and
 * `VALID_NODE_TYPES_BY_LEVEL` follow.
 *
 * The recursion is what makes nesting behave. A frame's box is the union of
 * its DIRECT member nodes and its CHILD FRAMES' finished boxes, inflated by a
 * uniform pad. Computing every frame straight from its transitive members
 * instead would let a parent and an only-child land on identical rectangles —
 * two borders on the same pixels, reading as one frame with a doubled edge.
 * Going through the child's finished box guarantees each nesting level is
 * strictly larger than the one inside it, by exactly `PAD`.
 *
 * Extra room at the top (`LABEL_BAND`) is for the frame's own label. It is
 * part of the rectangle rather than an overlay so that a child frame nested
 * against the top edge cannot slide under the parent's text.
 *
 * A frame with no members — directly or through its children — gets NO
 * rectangle and is absent from the result. Drawing a zero-size box at the
 * origin would be worse than drawing nothing, and the model deliberately keeps
 * empty frames so that emptying one while editing is not destructive.
 */

import type { C4Diagram, C4Frame, C4Node } from "@/types";

/** Gap between a frame's edge and whatever it encloses. */
const PAD = 28;

/** Additional height at the top of a frame, reserved for its label. */
const LABEL_BAND = 26;

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedFrame extends FrameRect {
  id: string;
  label: string;
  /**
   * 0 for a top-level frame, +1 per enclosing frame. Renderers use it to sit
   * outer frames further back, so a child's fill is never painted over by its
   * parent's.
   */
  depth: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function union(a: Box | null, b: Box): Box {
  if (a === null) return b;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function boxOfNode(node: C4Node): Box {
  return {
    minX: node.position.x,
    minY: node.position.y,
    maxX: node.position.x + node.size.width,
    maxY: node.position.y + node.size.height,
  };
}

/**
 * Rectangles for every frame of `diagram` that has something in it, outermost
 * first — so a renderer can paint the array in order and get correct stacking
 * without sorting it again.
 *
 * Defensive about cycles even though both readers reject them: this runs on
 * every render, and a hang is a far worse failure here than a missing frame.
 */
export function placeFrames(diagram: C4Diagram): PlacedFrame[] {
  const frames = diagram.frames;
  if (frames === undefined || frames.length === 0) return [];

  const byId = new Map<string, C4Frame>(frames.map((f) => [f.id, f]));
  const childIds = new Map<string, string[]>();
  for (const frame of frames) {
    const parent = frame.parentFrameId;
    if (typeof parent !== "string" || !byId.has(parent)) continue;
    const bucket = childIds.get(parent);
    if (bucket === undefined) childIds.set(parent, [frame.id]);
    else bucket.push(frame.id);
  }

  const directNodes = new Map<string, C4Node[]>();
  for (const node of diagram.nodes) {
    const frameId = node.frameId;
    if (frameId === undefined || !byId.has(frameId)) continue;
    const bucket = directNodes.get(frameId);
    if (bucket === undefined) directNodes.set(frameId, [node]);
    else bucket.push(node);
  }

  const boxes = new Map<string, Box>();
  const visiting = new Set<string>();

  const boxOf = (id: string): Box | null => {
    const cached = boxes.get(id);
    if (cached !== undefined) return cached;
    // A cycle should be impossible — the parser and validate.ts both refuse
    // one — but this runs per render, so bail rather than recurse forever.
    if (visiting.has(id)) return null;
    visiting.add(id);

    let box: Box | null = null;
    for (const node of directNodes.get(id) ?? []) {
      box = union(box, boxOfNode(node));
    }
    for (const child of childIds.get(id) ?? []) {
      const childBox = boxOf(child);
      if (childBox !== null) box = union(box, childBox);
    }
    visiting.delete(id);

    if (box === null) return null;
    const padded: Box = {
      minX: box.minX - PAD,
      minY: box.minY - PAD - LABEL_BAND,
      maxX: box.maxX + PAD,
      maxY: box.maxY + PAD,
    };
    boxes.set(id, padded);
    return padded;
  };

  const depthOf = (id: string): number => {
    let depth = 0;
    const seen = new Set<string>([id]);
    let cur = byId.get(id)?.parentFrameId;
    while (typeof cur === "string" && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      depth += 1;
      cur = byId.get(cur)?.parentFrameId;
    }
    return depth;
  };

  const placed: PlacedFrame[] = [];
  for (const frame of frames) {
    const box = boxOf(frame.id);
    if (box === null) continue;
    placed.push({
      id: frame.id,
      label: frame.label,
      depth: depthOf(frame.id),
      x: box.minX,
      y: box.minY,
      width: box.maxX - box.minX,
      height: box.maxY - box.minY,
    });
  }
  // Outermost first. Ties broken by id so the order is deterministic, which
  // keeps the SVG exporter's output byte-stable between runs.
  placed.sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : 1));
  return placed;
}

/** Height of the label band, for renderers positioning the caption. */
export const FRAME_LABEL_BAND = LABEL_BAND;
