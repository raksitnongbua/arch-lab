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
  /**
   * Unique per RECTANGLE, where `id` is unique per frame. A frame whose
   * members sit in separated clusters draws one rectangle each (see
   * `placeFrames`), so `id` is no longer a usable React key or SVG id —
   * this is. Renderers key on this; selection and the detail panel still
   * use `id`, because both clusters are the same boundary.
   */
  key: string;
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

  /** Every node that belongs to `id`, directly or through a descendant. */
  const membersOf = (id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (frameId: string, seen: Set<string>): void => {
      if (seen.has(frameId)) return;
      seen.add(frameId);
      for (const node of directNodes.get(frameId) ?? []) out.add(node.id);
      for (const child of childIds.get(frameId) ?? []) walk(child, seen);
    };
    walk(id, new Set());
    return out;
  };

  const encloses = (box: Box, node: C4Node): boolean => {
    const centreX = node.position.x + node.size.width / 2;
    const centreY = node.position.y + node.size.height / 2;
    return (
      centreX > box.minX &&
      centreX < box.maxX &&
      centreY > box.minY &&
      centreY < box.maxY
    );
  };

  const pad = (box: Box): Box => ({
    minX: box.minX - PAD,
    minY: box.minY - PAD - LABEL_BAND,
    maxX: box.maxX + PAD,
    maxY: box.maxY + PAD,
  });

  const boxes = new Map<string, Box[]>();
  const visiting = new Set<string>();

  /**
   * A frame's rectangles — usually one, but ONE PER CLUSTER when its members
   * are scattered.
   *
   * WHY IT IS NOT ALWAYS ONE BOX. A frame's rectangle was the bounding box of
   * everything in it, which is correct only while its members sit together. On
   * the reported diagram they did not: an "Edge and ingress" boundary held the
   * inbound gateway near the top of the flow and the webhook gateway near the
   * bottom, so its box spanned the whole diagram and ENCLOSED the two frames
   * and eight elements between them — three nested dashed rectangles, none of
   * which meant what it looked like. The layout is what scatters them, and the
   * layout cannot be changed without moving coordinates people have on disk.
   *
   * So the invariant is the one that was actually broken: A FRAME'S RECTANGLE
   * MUST NOT ENCLOSE A NODE THAT IS NOT ITS MEMBER. Clusters start as one box
   * per member and merge only while the merged rectangle stays legal by that
   * rule, nearest pair first. A frame whose members sit together merges all
   * the way back to one box, so every diagram that looked right still does.
   *
   * Two rectangles for one boundary is a real convention — the diagram the
   * report came from draws its own namespace twice, for the same reason — and
   * both carry the label, because a rectangle with no caption is scenery.
   */
  const boxesOf = (id: string): Box[] => {
    const cached = boxes.get(id);
    if (cached !== undefined) return cached;
    // A cycle should be impossible — the parser and validate.ts both refuse
    // one — but this runs per render, so bail rather than recurse forever.
    if (visiting.has(id)) return [];
    visiting.add(id);

    let parts: Box[] = [];
    for (const node of directNodes.get(id) ?? []) {
      parts.push(boxOfNode(node));
    }
    for (const child of childIds.get(id) ?? []) {
      parts.push(...boxesOf(child).map((box) => box));
    }
    visiting.delete(id);

    if (parts.length === 0) {
      boxes.set(id, []);
      return [];
    }

    const mine = membersOf(id);
    const foreign = diagram.nodes.filter((node) => !mine.has(node.id));
    const legal = (box: Box): boolean =>
      !foreign.some((node) => encloses(pad(box), node));

    /* Merge the nearest legal pair until none is left. Nearest first so the
     * clusters that form are the ones a reader would group by eye, and the
     * legality test is applied to the MERGED box, which is what makes the
     * invariant hold by construction rather than by inspection afterwards. */
    for (;;) {
      let best: { i: number; j: number; cost: number } | null = null;
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          const merged = union(parts[i], parts[j]);
          if (!legal(merged)) continue;
          const cost =
            (merged.maxX - merged.minX) * (merged.maxY - merged.minY);
          if (best === null || cost < best.cost) best = { i, j, cost };
        }
      }
      if (best === null) break;
      const merged = union(parts[best.i], parts[best.j]);
      parts = parts.filter((_, index) => index !== best.i && index !== best.j);
      parts.push(merged);
    }

    // Deterministic order: top-left first, so ids and paint order are stable.
    parts.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
    const padded = parts.map(pad);
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
    boxesOf(frame.id).forEach((box, part) => {
      placed.push({
        id: frame.id,
        key: `${frame.id}#${part}`,
        label: frame.label,
        depth: depthOf(frame.id),
        x: box.minX,
        y: box.minY,
        width: box.maxX - box.minX,
        height: box.maxY - box.minY,
      });
    });
  }
  // Outermost first. Ties broken by the per-rectangle key so the order is
  // deterministic, which keeps the SVG exporter's output byte-stable.
  placed.sort((a, b) => a.depth - b.depth || (a.key < b.key ? -1 : 1));
  return placed;
}

/** Height of the label band, for renderers positioning the caption. */
export const FRAME_LABEL_BAND = LABEL_BAND;
