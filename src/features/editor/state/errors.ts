/**
 * Typed errors thrown by the store's mutations.
 *
 * They are thrown *before* any model change or history entry is made, so a
 * caught error always means "nothing happened".
 */

import type { C4Level, C4NodeType } from "@/types";

/**
 * Thrown by `createNode` when `type` is not legal on a diagram at `level`
 *. The message names the valid types so the UI can show
 * it verbatim.
 */
export class InvalidNodeTypeError extends Error {
  readonly level: C4Level;
  readonly attempted: C4NodeType;
  readonly valid: readonly C4NodeType[];

  constructor(
    level: C4Level,
    attempted: C4NodeType,
    valid: readonly C4NodeType[],
  ) {
    super(
      `Node type "${attempted}" is not valid at level "${level}". ` +
        `Valid types: ${valid.join(", ")}.`,
    );
    this.name = "InvalidNodeTypeError";
    this.level = level;
    this.attempted = attempted;
    this.valid = valid;
  }
}

/**
 * Thrown by `createChildDiagram` when the containing diagram is already at
 * `code` — there is no level below it.
 */
export class MaxDepthError extends Error {
  constructor(message = 'Cannot create a child diagram below level "code".') {
    super(message);
    this.name = "MaxDepthError";
  }
}

/**
 * Thrown by `createEdge` when `source` and `target` do not both resolve to
 * nodes in the same diagram (cross-level relationships are
 * illegal).
 */
export class CrossDiagramEdgeError extends Error {
  constructor(message = "An edge must connect two nodes in the same diagram.") {
    super(message);
    this.name = "CrossDiagramEdgeError";
  }
}
