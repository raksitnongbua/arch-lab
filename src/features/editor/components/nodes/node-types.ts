/**
 * React Flow node registry. The exported name and type
 * (`nodeTypes: NodeTypes`, keys = every `C4NodeType`) are the frozen contract
 * from; `canvas.tsx` (final) consumes it.
 *
 * All 8 keys map to the one `C4NodeComponent`, which branches on
 * `data.node.type` only — one component, one prop contract, eight
 * visual treatments.
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
