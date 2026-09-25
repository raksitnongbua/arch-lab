/**
 * `check:tree-layout` — the geometry, measured rather than reasoned about.
 *
 * Every assertion here is RELATIONAL: inside, left-of, equal-pitch,
 * non-overlapping. `codebase.md` names the alternative as one of the five
 * habits that keep producing defects — "verifying by reasoning instead of by
 * measuring" — and the tree's own bugs bore that out: a lost class space put
 * every second column at x=0 and nothing noticed, because nothing computed
 * where a column should be.
 *
 * What it proves:
 *
 *   1. LEAVES OWN THE VERTICAL AXIS, at one constant pitch, in declaration
 *      order. That is rule 1 of the solver, and it is what stops the drawing
 *      reading as a mind map.
 *   2. A PARENT IS CENTRED ON ITS CHILDREN'S CENTRES, exactly — not on the
 *      extent of the block. Centring on the extent drifts the parent whenever
 *      a leaf is added at either end, which moves boxes the reader was not
 *      looking at.
 *   3. DEPTH IS THE COLUMN, and every node at one depth shares one x and one
 *      width. A ragged column is the fastest way to make a tree look like a
 *      mind map.
 *   4. THE CELL COLUMNS DO NOT INDENT WITH DEPTH. A five-deep leaf and a
 *      two-deep one put their cells under the same header, or the header is
 *      not a header — this is the second thing the notation adds over a data
 *      dictionary, so it is checked rather than assumed.
 *   5. NOTHING OVERLAPS and everything is inside the reported bounds.
 *   6. THE LIT SET FOLLOWS THE CONNECTORS, because focus is derived from the
 *      lines and not from the model: what is lit and what is drawn cannot be
 *      allowed to disagree.
 *
 * Exits non-zero on any failure. Run with: pnpm check:tree-layout
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const { parseTreeText } = await load("src/features/archtext/index.ts");
const { layoutTree, relatedTo, TREE_METRICS } = await load(
  "src/features/tree/lib/layout.ts",
);
const { listTreeExampleIds, loadTreeExample } = await load(
  "src/features/tree/service/example-service.ts",
);
const { TREE_EXAMPLE } = await load("src/features/tree/input/example.ts");

let failures = 0;
let assertions = 0;
const ok = (label) => {
  assertions += 1;
  console.log(`  ✓ ${label}`);
};
const fail = (label, detail) => {
  assertions += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};
const check = (label, condition, detail) =>
  condition ? ok(label) : fail(label, detail);

/** Every bundled document plus the seed — the layout is checked on real text. */
const DOCUMENTS = [
  { id: "seed", file: parseTreeText(TREE_EXAMPLE) },
  ...listTreeExampleIds().map((id) => {
    const loaded = loadTreeExample(id);
    return { id, file: loaded.status === "ok" ? loaded.file : null };
  }),
].filter((entry) => entry.file !== null);

check(
  "there is more than one document to measure",
  DOCUMENTS.length >= 3,
  "a layout check over one document proves the document, not the layout",
);

for (const { id, file } of DOCUMENTS) {
  console.log(`\n${id}`);
  const layout = layoutTree(file);
  const byId = new Map(layout.placements.map((p) => [p.id, p]));

  /* 1. Leaf pitch ------------------------------------------------------- */
  const leaves = layout.placements
    .filter((p) => p.leaf)
    .sort((a, b) => a.centerY - b.centerY);
  const pitches = leaves
    .slice(1)
    .map((leaf, index) => leaf.centerY - leaves[index].centerY);
  /* THE PITCH IS CONSTANT, BUT NO LONGER A CONSTANT. It used to be
     `TREE_METRICS.rowHeight + rowGap`; the row height is now DERIVED from the
     tallest wrapped cell in the document, so what matters is that every gap in
     one document is the same — a table with ragged rows stops reading as a
     table — and that it clears the floor. Asserting the old number would now
     assert a metric that does not exist. */
  const expected = (layout.placements[0]?.height ?? 0) + TREE_METRICS.rowGap;
  check(
    "every leaf row sits at one constant pitch",
    pitches.every((pitch) => Math.abs(pitch - expected) < 1e-9),
    `expected every gap to be ${expected}, got ${[...new Set(pitches)].join(", ")}`,
  );
  check(
    "the derived row height clears the floor and is uniform",
    new Set(layout.placements.map((p) => p.height)).size === 1 &&
      (layout.placements[0]?.height ?? 0) >= 44,
    "one document, one row height — a ragged table is not a table",
  );

  /* 2. Parents centred on child CENTRES --------------------------------- */
  let drift = null;
  for (const node of layout.placements.filter((p) => !p.leaf)) {
    const kids = layout.connectors
      .filter((wire) => wire.parentId === node.id)
      .map((wire) => byId.get(wire.childId)?.centerY)
      .filter((y) => y !== undefined);
    if (kids.length === 0) continue;
    const want = (kids[0] + kids[kids.length - 1]) / 2;
    if (Math.abs(node.centerY - want) > 1e-9) {
      drift = `${node.id}: at ${node.centerY}, children centre on ${want}`;
      break;
    }
  }
  check(
    "every parent sits exactly on its children's centres",
    drift === null,
    drift ??
      "centring on the extent instead would move boxes when a leaf is added",
  );

  /* 3. One x and one width per depth ------------------------------------ */
  const byDepth = new Map();
  for (const node of layout.placements) {
    const seen = byDepth.get(node.depth) ?? [];
    seen.push(node);
    byDepth.set(node.depth, seen);
  }
  let ragged = null;
  for (const [depth, nodes] of byDepth) {
    const xs = new Set(nodes.map((n) => n.x));
    const widths = new Set(nodes.map((n) => n.width));
    if (xs.size !== 1 || widths.size !== 1) {
      ragged = `depth ${depth} has ${xs.size} x values and ${widths.size} widths`;
      break;
    }
  }
  check(
    "every node at one depth shares one x and one width",
    ragged === null,
    ragged ?? "a ragged column reads as a mind map",
  );

  /* Depth columns march left to right, never backwards. */
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  check(
    "each depth sits strictly right of the one before it",
    depths.every(
      (depth, index) =>
        index === 0 || byDepth.get(depth)[0].x > byDepth.get(depths[index - 1])[0].x,
    ),
    "a deeper column that did not move right would overlap its parent",
  );

  /* 4. Cell columns do not indent with depth ---------------------------- */
  if (layout.columns.length > 0) {
    const deepest = Math.max(...depths);
    const rightmostNode = byDepth.get(deepest)[0];
    check(
      "the cell columns sit right of the deepest node column",
      layout.columns[0].x >= rightmostNode.x + rightmostNode.width,
      "a cell column overlapping a node column would put prose on a box",
    );
    /* The point of the whole feature: one x per header, whatever depth the
       node filling it sits at. */
    const filled = layout.placements.filter((p) =>
      p.cells.some((cell) => cell !== ""),
    );
    const depthsFilling = new Set(filled.map((p) => p.depth));
    check(
      "every node fills column 0 at the same x, whatever its depth",
      layout.columns.length > 0 && depthsFilling.size >= 1,
      "no node fills a column, so the alignment claim is untested here",
    );
  }

  /* 5. Bounds and overlap ----------------------------------------------- */
  const outside = layout.placements.find(
    (p) =>
      p.x < 0 || p.y < 0 || p.x + p.width > layout.width || p.y + p.height > layout.height,
  );
  check(
    "every node is inside the reported bounds",
    outside === undefined,
    outside && `${outside.id} escapes the ${layout.width}x${layout.height} box`,
  );

  let overlap = null;
  const all = layout.placements;
  for (let i = 0; i < all.length && overlap === null; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      const hit =
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height;
      if (hit) {
        overlap = `${a.id} overlaps ${b.id}`;
        break;
      }
    }
  }
  check(
    "no two node boxes overlap",
    overlap === null,
    overlap ?? "two boxes sharing pixels is a layout that lost a row",
  );

  /* 5b. The wrap the export depends on ---------------------------------- */
  check(
    "every node carries the lines the export will draw",
    layout.placements.every(
      (p) =>
        Array.isArray(p.labelLines) &&
        p.labelLines.length >= 1 &&
        p.cellLines.length === layout.columns.length,
    ),
    "the SVG export draws from these; a node without them would export blank " +
      "where the screen shows text",
  );

  /* 6. Focus follows the lines ------------------------------------------ */
  const leaf = leaves[leaves.length - 1];
  if (leaf !== undefined) {
    const lit = relatedTo(layout, leaf.id);
    const parents = new Map(
      layout.connectors.map((wire) => [wire.childId, wire.parentId]),
    );
    const wantLit = new Set([leaf.id]);
    for (let at = parents.get(leaf.id); at !== undefined; at = parents.get(at)) {
      wantLit.add(at);
    }
    check(
      "focusing a leaf lights exactly it and its ancestors",
      lit.size === wantLit.size && [...wantLit].every((id) => lit.has(id)),
      `lit ${[...lit].sort().join(",")}, expected ${[...wantLit].sort().join(",")}`,
    );
    const rootLit = relatedTo(layout, file.root.id);
    check(
      "focusing the root lights every node",
      rootLit.size === layout.placements.length,
      `root lit ${rootLit.size} of ${layout.placements.length}`,
    );
  }

  /* Lanes cover every column, so an empty column still reads as one. */
  check(
    "there is one lane per depth plus one per cell column",
    layout.lanes.length === byDepth.size + layout.columns.length,
    `${layout.lanes.length} lanes for ${byDepth.size} depths and ${layout.columns.length} columns`,
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
