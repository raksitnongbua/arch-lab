/**
 * Palette drag payload codec.
 *
 * WIRE FORMAT — FROZEN. `canvas.tsx` (Batch-1 final) could not import this
 * file and still build in Batch 1, so its `onDrop` inlines the exact same
 * format: MIME `application/x-arch-lab-node-type` carrying JSON
 * `{ "nodeType": C4NodeType, "level": C4Level }`. Any change here silently
 * breaks palette drops — keep the encoder byte-compatible with
 * `readPaletteDrag` in `components/canvas.tsx`.
 */

import {
  C4_LEVELS,
  isNodeTypeValidAtLevel,
  type C4Level,
  type C4NodeType,
} from "@/types";

export const PALETTE_DRAG_MIME = "application/x-arch-lab-node-type";

export interface PaletteDragPayload {
  nodeType: C4NodeType;
  /** The level the palette was showing; canvas rejects a mismatch with the active level. */
  level: C4Level;
}

/**
 * Writes the payload onto a palette item's `dragstart` DataTransfer. The JSON
 * key order (`nodeType` first, then `level`) matches the documented wire
 * format; the reader is key-order-agnostic either way.
 */
export function encodePaletteDrag(
  dt: DataTransfer,
  payload: PaletteDragPayload,
): void {
  dt.setData(
    PALETTE_DRAG_MIME,
    JSON.stringify({ nodeType: payload.nodeType, level: payload.level }),
  );
  dt.effectAllowed = "copy";
}

/**
 * Reads a payload back off a DataTransfer, returning `null` for anything
 * malformed, unknown, or level-invalid — mirroring `canvas.tsx`'s inlined
 * `readPaletteDrag` validation exactly.
 */
export function decodePaletteDrag(dt: DataTransfer): PaletteDragPayload | null {
  const raw = dt.getData(PALETTE_DRAG_MIME);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  const level = candidate.level;
  const nodeType = candidate.nodeType;
  if (typeof level !== "string" || typeof nodeType !== "string") return null;
  if (!(C4_LEVELS as readonly string[]).includes(level)) return null;
  const typedLevel = level as C4Level;
  if (!isNodeTypeValidAtLevel(nodeType as C4NodeType, typedLevel)) return null;
  return { nodeType: nodeType as C4NodeType, level: typedLevel };
}
