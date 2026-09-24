/**
 * Geometry for the decomposition tree, solved from the nesting.
 *
 * DERIVED, NEVER GRIDDED (`new-diagram-type.md`). Nothing here places a node
 * at a coordinate an author wrote, and nothing falls back to a grid when the
 * solve is hard: a column is a DEPTH and a row is a LEAF, and every other
 * position follows from those two facts. That is the whole solver, and it is
 * short on purpose — a tree is the one shape whose layout is genuinely
 * determined, so any cleverness here would be inventing a choice the notation
 * does not have.
 *
 * THE TWO RULES, in the order they run:
 *
 *   1. **Leaves own the vertical axis.** Every leaf is given the next row, in
 *      declaration order. A leaf is the only thing whose height is its own;
 *      everything else is a summary of what is under it.
 *   2. **A parent is centred against the span of its children.** Not against
 *      the count — against the first and last child's centres, so a branch
 *      with one deep child and one shallow one still points at the middle of
 *      what it holds. This is what makes the elbow connectors read as one
 *      bracket rather than a fan.
 *
 * WHY CENTRES AND NOT MIDPOINT-OF-EXTENT: a child's own centre is already the
 * centre of ITS children, so centring on centres makes the rule recursive and
 * the picture stable when a deep subtree grows. Centring on the extent (top
 * of the first child to bottom of the last) drifts the parent whenever a leaf
 * is added at either end, which moves boxes a reader was not looking at.
 *
 * COLUMN WIDTHS ARE PER-DEPTH, not per-node: every node at depth 3 is the
 * same width, so the elbows at that depth all turn on one x and the eye
 * follows a single vertical rule down the page. A ragged column is the
 * fastest way to make a tree look like a mind map, which is the thing this
 * notation is not.
 *
 * THE CELL COLUMNS SIT RIGHT OF THE DEEPEST NODE COLUMN and are aligned for
 * the whole document, which is the second thing this notation adds over the
 * data dictionary (`src/types/tree.ts`). They do NOT indent with depth: a
 * five-deep leaf and a two-deep one put their "Expected result" under the
 * same header, or the header is not a header.
 */

import type { TreeFile, TreeNode } from "@/types/tree";

/* -------------------------------------------------------------------------- */
/* Tunables                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The metrics the solve is expressed in. Exported because `check:tree-layout`
 * asserts against them rather than against copies — a check that hardcodes a
 * number proves the number, not the layout.
 */
export const TREE_METRICS = {
  /** Height of one leaf row, and so the vertical rhythm of the whole tree. */
  rowHeight: 44,
  /** Gap between two sibling rows. */
  rowGap: 8,
  /** Width of a node box at any depth. */
  nodeWidth: 208,
  /** Horizontal gap between one depth's column and the next. */
  depthGap: 40,
  /** Width of one cell column, when the document declares any. */
  cellWidth: 240,
  /** Gap between the deepest node column and the first cell column. */
  cellGap: 24,
  /** Padding around the whole drawing. */
  padding: 24,
} as const;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** One node, placed. */
export interface TreePlacement {
  id: string;
  label: string;
  description?: string;
  /** Depth from the root, which is 0. Also the column index. */
  depth: number;
  /** Top-left of the box. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Centre of the box on the vertical axis, which is what elbows join. */
  centerY: number;
  /** True when this node has no children. */
  leaf: boolean;
  /**
   * Which top-level branch this node descends from, or `null` for the root
   * itself. The accent is derived from this and nothing else — see
   * `src/types/tree.ts` on why colour is never declared.
   */
  branch: number | null;
  /** The cells this node fills, padded to the document's column count. */
  cells: string[];
}

/** One elbow, from a parent's right edge to a child's left edge. */
export interface TreeConnector {
  parentId: string;
  childId: string;
  /** Where the line leaves the parent. */
  fromX: number;
  fromY: number;
  /** Where it arrives at the child. */
  toX: number;
  toY: number;
  /** The x the line turns on — shared by every child of this parent. */
  elbowX: number;
  /** Inherited from the child, so a connector is lit with its own branch. */
  branch: number | null;
}

/** The whole solved drawing. */
export interface TreeLayout {
  placements: TreePlacement[];
  connectors: TreeConnector[];
  /** Header positions, empty when the document declares no columns. */
  columns: { label: string; x: number; width: number }[];
  width: number;
  height: number;
  /** The deepest depth present, so callers can size a column rule. */
  maxDepth: number;
}

/* -------------------------------------------------------------------------- */
/* Solve                                                                       */
/* -------------------------------------------------------------------------- */

/** The children of a node, tolerating both absent and empty. */
function childrenOf(node: TreeNode): TreeNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

/**
 * Places every node, then every connector.
 *
 * ONE PASS DOWN AND ONE BACK UP. The walk descends in declaration order
 * handing out rows to leaves, and returns each node's centre to its parent so
 * the parent can centre itself — which is rule 2 expressed as a return value
 * rather than as a second traversal over a half-built map.
 */
export function layoutTree(file: TreeFile): TreeLayout {
  const { rowHeight, rowGap, nodeWidth, depthGap, cellWidth, cellGap, padding } =
    TREE_METRICS;

  const columnCount = file.columns?.length ?? 0;
  const placements: TreePlacement[] = [];
  const connectors: TreeConnector[] = [];

  let nextRow = 0;
  let maxDepth = 0;

  const xForDepth = (depth: number) =>
    padding + depth * (nodeWidth + depthGap);

  /* Returns the node's centre on the vertical axis, which is what its parent
     needs and the only thing it needs. */
  function place(
    node: TreeNode,
    depth: number,
    branch: number | null,
  ): number {
    if (depth > maxDepth) maxDepth = depth;

    const kids = childrenOf(node);
    const leaf = kids.length === 0;

    /* Kept so the connector loop below can join centre to centre without
       searching the placement list for a child it just placed. */
    let childCentres: number[] = [];

    let centerY: number;
    if (leaf) {
      /* Rule 1: a leaf takes the next row outright. */
      centerY = padding + nextRow * (rowHeight + rowGap) + rowHeight / 2;
      nextRow += 1;
    } else {
      /* Rule 2: centre against the first and last CHILD CENTRES. The children
         are placed first, which is what makes this recursive rather than a
         second pass. */
      childCentres = kids.map((kid, index) =>
        place(kid, depth + 1, branch ?? index),
      );
      centerY = (childCentres[0] + childCentres[childCentres.length - 1]) / 2;
    }

    const cells = Array.from(
      { length: columnCount },
      (_unused, index) => node.cells?.[index] ?? "",
    );

    placements.push({
      id: node.id,
      label: node.label,
      description: node.description,
      depth,
      x: xForDepth(depth),
      y: centerY - rowHeight / 2,
      width: nodeWidth,
      height: rowHeight,
      centerY,
      leaf,
      branch,
      cells,
    });

    /* The elbow turns halfway through the gap, so every child of this parent
       shares one turning x and the bracket reads as one shape. */
    const elbowX = xForDepth(depth) + nodeWidth + depthGap / 2;
    kids.forEach((kid, index) => {
      connectors.push({
        parentId: node.id,
        childId: kid.id,
        fromX: xForDepth(depth) + nodeWidth,
        fromY: centerY,
        toX: xForDepth(depth + 1),
        toY: childCentres[index],
        elbowX,
        branch: branch ?? index,
      });
    });

    return centerY;
  }

  place(file.root, 0, null);

  /* Cell columns sit right of the DEEPEST node column, aligned for the whole
     document — they never indent with depth. */
  const cellsStart = xForDepth(maxDepth) + nodeWidth + cellGap;
  const columns = (file.columns ?? []).map((label, index) => ({
    label,
    x: cellsStart + index * cellWidth,
    width: cellWidth,
  }));

  const contentRight =
    columnCount > 0
      ? cellsStart + columnCount * cellWidth
      : xForDepth(maxDepth) + nodeWidth;

  return {
    placements,
    connectors,
    columns,
    width: contentRight + padding,
    height: padding + nextRow * (rowHeight + rowGap) - rowGap + padding,
    maxDepth,
  };
}
