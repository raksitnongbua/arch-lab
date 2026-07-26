/**
 * STUB — ownership transfers to T2-A in Batch 2.
 *
 * The exported name and type (`nodeTypes: NodeTypes`, keys = every
 * `C4NodeType`) are the frozen contract from dev-handoff §4.4; `canvas.tsx`
 * (final) consumes it. T2-A swaps the values for per-type components without
 * touching the canvas.
 */

import type { NodeTypes } from "@xyflow/react";

import { C4NodeComponent } from "./c4-node";

export const nodeTypes: NodeTypes = {
  person: C4NodeComponent,
  softwareSystem: C4NodeComponent,
  externalSystem: C4NodeComponent,
  container: C4NodeComponent,
  database: C4NodeComponent,
  queue: C4NodeComponent,
  component: C4NodeComponent,
  codeElement: C4NodeComponent,
};
