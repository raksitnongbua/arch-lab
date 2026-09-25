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

import { wrapText } from "@/lib/text-metrics";
import type { TreeLabFile, TreeNode } from "@/types/tree";

/* -------------------------------------------------------------------------- */
/* Tunables                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The metrics the solve is expressed in. Exported because `check:tree-layout`
 * asserts against them rather than against copies — a check that hardcodes a
 * number proves the number, not the layout.
 */
export const TREE_METRICS = {
  /* THE ROW HEIGHT IS NO LONGER A CONSTANT. It used to be 68, chosen by eye
     for a three-line precondition, which clipped a four-line one and padded
     every one-line document. Now that the layout wraps the text itself it can
     measure instead: `layoutTree` derives one row height for the whole
     document from the tallest wrapped cell. `44` survives as the floor there,
     which is what a row of short labels wants. */
  /** Gap between two sibling rows. */
  rowGap: 8,
  /** Width of a node box at any depth. */
  nodeWidth: 208,
  /** Horizontal gap between one depth's column and the next. */
  depthGap: 40,
  /** Width of one cell column, when the document declares any. */
  cellWidth: 264,
  /** Gap between the deepest node column and the first cell column. */
  cellGap: 24,
  /** Padding around the whole drawing. */
  padding: 24,
  /* THE TYPE SCALE, here rather than only in CSS, because the layout now wraps
     the text itself (see `wrapAll`) and a wrap needs a font size. The
     stylesheet and the SVG export both draw at these numbers;
     `check:tree-motion` pins the stylesheet against them so the two cannot
     drift. */
  labelSize: 13,
  idSize: 10.5,
  cellSize: 11.5,
  lineHeight: 1.35,
  /** Horizontal padding inside a node box and inside a cell. */
  boxPadX: 10,
  cellPadX: 11,
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
  /**
   * The label, already broken into lines, and each cell likewise.
   *
   * WRAPPED HERE AND NOWHERE ELSE. The canvas used to let the browser wrap its
   * HTML boxes, which reads beautifully and cannot be reproduced by an SVG
   * export — SVG `<text>` does not wrap, so the export would have had to
   * estimate its own line breaks and would have disagreed with the screen on
   * every Thai sentence. One wrap, computed from `wrapText` (which splits Thai
   * between grapheme clusters), is what lets the exported file BE the picture
   * rather than resemble it.
   */
  labelLines: string[];
  cellLines: string[][];
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

/** One header above a column, whether that column is a depth or a cell. */
export interface TreeHeader {
  label: string;
  x: number;
  width: number;
}

/** The whole solved drawing. */
export interface TreeLayout {
  placements: TreePlacement[];
  connectors: TreeConnector[];
  /** Header positions, empty when the document declares no columns. */
  columns: TreeHeader[];
  /**
   * Headers above the DEPTH columns, empty when the document names none.
   *
   * A SEPARATE LIST FROM `columns` because the two are positioned by different
   * rules: a depth header sits over `xForDepth(n)` and is one node wide, where
   * a cell header sits right of the deepest node column and is a cell wide.
   * One list would have to carry which rule placed each entry, which is the
   * discriminant this absence removes.
   */
  levels: TreeHeader[];
  width: number;
  height: number;
  /** The deepest depth present, so callers can size a column rule. */
  maxDepth: number;
  /**
   * One band per vertical column — every depth, then every cell column.
   *
   * WHY THE DRAWING NEEDS THESE AT ALL: a tree centres its root, so the
   * outermost column holds one box and a great deal of nothing, and the same
   * is true of every branch column above a deep subtree. Without a band the
   * emptiness reads as a rendering fault rather than as the shape of the
   * document. The band gives an empty column an identity, which is what the
   * separators in a test-plan table do.
   */
  lanes: { x: number; width: number; depth: number | null }[];
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
export function layoutTree(file: TreeLabFile): TreeLayout {
  const { rowGap, nodeWidth, depthGap, cellWidth, cellGap, padding } =
    TREE_METRICS;

  const columnCount = file.columns?.length ?? 0;
  const { labelSize, idSize, cellSize, lineHeight, boxPadX, cellPadX } =
    TREE_METRICS;

  /* THE ROW HEIGHT IS DERIVED, not a constant, now that the wrap is known: a
     leaf whose precondition runs to four lines needs a taller row than its
     neighbour, and the old fixed 68 either clipped the long one or padded
     every short one. One row height for the WHOLE document rather than per
     row, because the cell columns are a table and a table with ragged row
     heights stops reading as one. */
  const wrapFor = (node: TreeNode) => {
    const labelLines = wrapText(node.label, nodeWidth - boxPadX * 2, labelSize);
    const cellLines = Array.from({ length: columnCount }, (_u, index) =>
      wrapText(node.cells?.[index] ?? "", cellWidth - cellPadX * 2, cellSize),
    );
    return { labelLines, cellLines };
  };
  const placements: TreePlacement[] = [];
  const connectors: TreeConnector[] = [];

  /* One pass to find the tallest row, before anything is placed: a leaf's box
     carries an id line above its label, a branch's does not, and a cell may be
     taller than both. */
  let tallestLines = 1;
  let tallestIsLeaf = false;
  const measure = (node: TreeNode): void => {
    const kids = childrenOf(node);
    const { labelLines, cellLines } = wrapFor(node);
    const cellMax = cellLines.reduce(
      (most, lines) => Math.max(most, lines.length),
      0,
    );
    const lines = Math.max(labelLines.length, cellMax, 1);
    if (lines > tallestLines || (lines === tallestLines && kids.length === 0)) {
      tallestLines = Math.max(tallestLines, lines);
      if (kids.length === 0) tallestIsLeaf = true;
    }
    for (const kid of kids) measure(kid);
  };
  measure(file.root);

  const idBand = tallestIsLeaf ? idSize * lineHeight + 3 : 0;
  const rowHeight = Math.max(
    44,
    Math.round(tallestLines * labelSize * lineHeight + idBand + 14),
  );

  let nextRow = 0;
  let maxDepth = 0;

  const xForDepth = (depth: number) => padding + depth * (nodeWidth + depthGap);

  /* Returns the node's centre on the vertical axis, which is what its parent
     needs and the only thing it needs. */
  function place(node: TreeNode, depth: number, branch: number | null): number {
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

    const wrapped = wrapFor(node);
    placements.push({
      id: node.id,
      label: node.label,
      labelLines: wrapped.labelLines,
      cellLines: wrapped.cellLines,
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

  /* Named depths beyond the tree's actual depth are refused by the parser, so
     this never draws a header over a column that does not exist. */
  const levels = (file.levels ?? [])
    .slice(0, maxDepth + 1)
    .map((label, depth) => ({
      label,
      x: xForDepth(depth),
      width: nodeWidth,
    }));

  const contentRight =
    columnCount > 0
      ? cellsStart + columnCount * cellWidth
      : xForDepth(maxDepth) + nodeWidth;

  /* Depth lanes span the node column plus the gap after it, so the elbow
     between two depths sits INSIDE the parent's lane rather than in a seam. */
  const lanes: { x: number; width: number; depth: number | null }[] = [];
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    lanes.push({
      x: xForDepth(depth) - (depth === 0 ? padding : depthGap / 2),
      width: nodeWidth + depthGap,
      depth,
    });
  }
  for (const column of columns) {
    lanes.push({ x: column.x, width: column.width, depth: null });
  }

  return {
    placements,
    connectors,
    columns,
    levels,
    lanes,
    width: contentRight + padding,
    height: padding + nextRow * (rowHeight + rowGap) - rowGap + padding,
    maxDepth,
  };
}

/* -------------------------------------------------------------------------- */
/* Focus                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The ids lit when `id` is focused: the node itself, every ancestor up to the
 * root, and every descendant under it.
 *
 * ANCESTORS AND DESCENDANTS, NOT SIBLINGS — the lit set is exactly what a
 * connector can be followed to and from. A reader clicking a leaf is asking
 * "what is this part of, and what is under it"; lighting its siblings would
 * answer a question they did not ask and would put the whole branch back on
 * screen, which is the dimming undone.
 *
 * Derived from the connectors rather than from the model, so this cannot
 * disagree with what is drawn: the lines are the relationship.
 */
export function relatedTo(layout: TreeLayout, id: string): Set<string> {
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const wire of layout.connectors) {
    parentOf.set(wire.childId, wire.parentId);
    const kids = childrenOf.get(wire.parentId) ?? [];
    kids.push(wire.childId);
    childrenOf.set(wire.parentId, kids);
  }

  const lit = new Set<string>([id]);
  for (let at = parentOf.get(id); at !== undefined; at = parentOf.get(at)) {
    lit.add(at);
  }
  const queue = [id];
  while (queue.length > 0) {
    const next = queue.pop() as string;
    for (const kid of childrenOf.get(next) ?? []) {
      if (lit.has(kid)) continue;
      lit.add(kid);
      queue.push(kid);
    }
  }
  return lit;
}
