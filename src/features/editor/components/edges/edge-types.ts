/**
 * STUB — ownership transfers to T2-A in Batch 2.
 *
 * The exported name and type (`edgeTypes: EdgeTypes`, single key `"c4"`) are
 * the frozen contract from dev-handoff §4.4; `canvas.tsx` (final) consumes it.
 */

import type { EdgeTypes } from "@xyflow/react";

import { C4EdgeComponent } from "./c4-edge";

export const edgeTypes: EdgeTypes = {
  c4: C4EdgeComponent,
};
