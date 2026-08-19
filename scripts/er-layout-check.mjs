#!/usr/bin/env node
/**
 * ER layout check. Loads the REAL `layoutEr` from `src/features/er/lib/` via
 * Node's type stripping, so this measures the geometry the canvas and the SVG
 * exporter actually draw rather than a copy of it.
 *
 * Every assertion here is RELATIONAL or MEASURED — "left of", "inside",
 * "does not overlap" — never a restatement of a constant. An assertion that
 * says `headerHeight === 38` passes forever and catches nothing;
 * `codebase.md` names that failure mode directly.
 *
 * What it proves, and which shipped defect bought each rule:
 *
 *   1. NO TWO BOXES OVERLAP. The whole diagram is boxes; two on top of each
 *      other is the one failure that makes it unreadable rather than ugly.
 *   2. THE KEY BADGE SITS BETWEEN THE NAME AND THE TYPE, on its own row and
 *      inside its own box. THE DEFECT THIS EXISTS FOR: the first canvas
 *      nudged the badge with a `dy` to dodge the type, which put `PK` on the
 *      row ABOVE — so on every keyed row the badge appeared to belong to the
 *      previous column. It was visible in the first screenshot of the canvas
 *      and no check caught it, because nothing measured where the badge
 *      landed.
 *   3. NO LABEL LANDS ON A BOX. `new-diagram-type.md` states the rule
 *      ("labels never sit on a line, edges never cross a node they do not
 *      touch"); a verb drawn over a table is unreadable and looks like a bug
 *      in the renderer.
 *   4. CONNECTORS LEAVE AND ENTER ORTHOGONALLY, and their end direction
 *      actually points away from the box. The crow's feet are oriented from
 *      those vectors, so a wrong one draws a foot facing into the table.
 *   5. DEPTH IS DERIVED FROM THE RELATIONSHIPS, parents before children, and
 *      a CYCLE terminates. `purpose.md` forbids a grid fallback, and a schema
 *      with two tables referencing each other is ordinary — a layout that
 *      assumed a DAG would not be a layout with a bug, it would be a layout
 *      that cannot draw ordinary schemas.
 *   6. DECLARATION ORDER SURVIVES within a column. The model says order is
 *      data.
 *
 * Exits non-zero on any failure. Run with: pnpm check:er-layout
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      if (!(existsSync(asPath) && statSync(asPath).isFile())) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { parseErText } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { layoutEr, ER, labelPlateWidth, LABEL_PLATE_HALF_HEIGHT } = await import(
  pathToFileURL(path.join(ROOT, "src/features/er/lib/layout.ts")).href
);
const { ER_EXAMPLE } = await import(
  pathToFileURL(path.join(ROOT, "src/features/er/input/example.ts")).href
);
const { listErExampleIds, loadErExample } = await import(
  pathToFileURL(path.join(ROOT, "src/features/er/service/example-service.ts"))
    .href
);
const { CHAR_WIDTH_RATIO } = await import(
  pathToFileURL(path.join(ROOT, "src/lib/text-metrics.ts")).href
);

let failures = 0;
let assertions = 0;
const check = (label, condition, detail) => {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};

const width = (text, size) => text.length * size * CHAR_WIDTH_RATIO;
const layout = layoutEr(parseErText(ER_EXAMPLE));

/* EVERY REGISTERED EXAMPLE, not just the seed. The label-vs-foot bug was
   invisible on the seed and plain on `course-catalogue`, and a check that
   measures one fixture is a check that measures one fixture. Derived from the
   registry so a third example is covered the day it is added. */
const ALL_LAYOUTS = [
  ["seed", layout],
  ...listErExampleIds().map((id) => {
    const example = loadErExample(id);
    return [id, example.status === "ok" ? layoutEr(example.file) : null];
  }),
].filter(([, value]) => value !== null);

/* ----------------------------------------------------------------------- */
console.log("boxes");

{
  const hits = [];
  for (let i = 0; i < layout.entities.length; i += 1) {
    for (let j = i + 1; j < layout.entities.length; j += 1) {
      const a = layout.entities[i];
      const b = layout.entities[j];
      if (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
      ) {
        hits.push(`${a.id} over ${b.id}`);
      }
    }
  }
  check("no two entity boxes overlap", hits.length === 0, hits.join(", "));

  const clipped = layout.entities.filter(
    (entity) =>
      entity.x < 0 ||
      entity.y < 0 ||
      entity.x + entity.width > layout.width ||
      entity.y + entity.height > layout.height,
  );
  check(
    "every box is inside the canvas it reports",
    clipped.length === 0,
    clipped.map((entity) => entity.id).join(", "),
  );

  /* A box must be tall enough for its own rows. Measured against the model's
     row count rather than against `height`, which is what computed it. */
  const short = layout.entities.filter(
    (entity) =>
      entity.height < ER.headerHeight + entity.attributes.length * ER.rowHeight,
  );
  check(
    "every box is tall enough for its header and every row",
    short.length === 0,
    short.map((entity) => entity.id).join(", "),
  );
}

/* ----------------------------------------------------------------------- */
console.log("column rows");

{
  /* THE BADGE DEFECT. Each of these three would have caught the shipped bug
     where `PK` rendered on the row above its own column. */
  const overlapsName = [];
  const overlapsType = [];
  const outsideBox = [];
  const offRow = [];
  let keyed = 0;

  for (const entity of layout.entities) {
    for (const attribute of entity.attributes) {
      const rowTop = attribute.y - ER.rowHeight / 2;
      const rowBottom = attribute.y + ER.rowHeight / 2;
      if (rowTop < entity.y + ER.headerHeight - 0.5) {
        offRow.push(`${entity.id}.${attribute.name}`);
      }
      if (rowBottom > entity.y + entity.height + 0.5) {
        offRow.push(`${entity.id}.${attribute.name}`);
      }
      if (attribute.keysX === null) continue;
      keyed += 1;
      const nameRight = attribute.nameX + width(attribute.name, ER.rowSize);
      const keysLeft =
        attribute.keysX - width(attribute.keys, ER.rowSize - 1.5);
      const typeLeft = attribute.typeX - width(attribute.type, ER.rowSize);
      if (keysLeft < nameRight) {
        overlapsName.push(`${entity.id}.${attribute.name}`);
      }
      if (attribute.keysX > typeLeft) {
        overlapsType.push(`${entity.id}.${attribute.name}`);
      }
      if (keysLeft < entity.x || attribute.keysX > entity.x + entity.width) {
        outsideBox.push(`${entity.id}.${attribute.name}`);
      }
    }
  }

  check(
    `the example exercises key badges at all (${keyed} keyed rows)`,
    keyed >= 4,
    `only ${keyed} — this whole section would pass vacuously`,
  );
  check(
    "a key badge never overlaps its row's column name",
    overlapsName.length === 0,
    overlapsName.join(", "),
  );
  check(
    "a key badge never overlaps its row's type",
    overlapsType.length === 0,
    overlapsType.join(", "),
  );
  check(
    "a key badge stays inside its own box",
    outsideBox.length === 0,
    outsideBox.join(", "),
  );
  check(
    "every row sits between its box's header and its floor",
    offRow.length === 0,
    offRow.join(", "),
  );
}

/* ----------------------------------------------------------------------- */
console.log("connectors");

{
  /* BY EXTENTS, NOT BY THE CENTRE POINT. The first version of this assertion
     asked whether the label's CENTRE fell inside a box — which a ~100px plate
     can clear while still overhanging two of them, and that is precisely what
     shipped: "requires" sat on the Course box and "is taken as" was clipped by
     its right edge, with this check green. A test that measures a point cannot
     catch a rectangle. */
  const onBox = [];
  for (const [name, laid] of ALL_LAYOUTS) {
    for (const relationship of laid.relationships) {
      if (relationship.label === undefined) continue;
      const half = labelPlateWidth(relationship.label) / 2;
      for (const entity of laid.entities) {
        if (
          relationship.labelX + half > entity.x &&
          relationship.labelX - half < entity.x + entity.width &&
          relationship.labelY + LABEL_PLATE_HALF_HEIGHT > entity.y &&
          relationship.labelY - LABEL_PLATE_HALF_HEIGHT <
            entity.y + entity.height
        ) {
          onBox.push(`${name}: ${relationship.label} over ${entity.id}`);
        }
      }
    }
  }
  check(
    `no label plate overlaps a box (${ALL_LAYOUTS.length} documents, by extents)`,
    onBox.length === 0,
    onBox.join(", "),
  );

  /* THE DEFECT THESE EXIST FOR: the label sat at the midpoint of the middle
     segment, which keeps it off a BOX — the only thing asserted before — and
     nothing else. On the course-catalogue example "is taken as" was drawn
     straight through a crow's foot, and "takes" and "requires" landed on the
     lines beside them. A label printed over a glyph is not a label. */
  const onFoot = [];
  for (const [name, laid] of ALL_LAYOUTS)
    for (const relationship of laid.relationships) {
      if (relationship.label === undefined) continue;
      const half = labelPlateWidth(relationship.label) / 2;
      for (const end of [relationship.fromEnd, relationship.toEnd]) {
        /* The foot occupies from the box edge out to `footLength` along the
         stub, plus its spread across it. A generous box around that. */
        const fx = end.x + (end.dx * ER.footLength) / 2;
        const fy = end.y + (end.dy * ER.footLength) / 2;
        const reachX = Math.abs(end.dx) * ER.footLength + ER.footSpread;
        const reachY = Math.abs(end.dy) * ER.footLength + ER.footSpread;
        if (
          Math.abs(relationship.labelX - fx) < half + reachX &&
          Math.abs(relationship.labelY - fy) < LABEL_PLATE_HALF_HEIGHT + reachY
        ) {
          onFoot.push(`${name}: ${relationship.from}->${relationship.to}`);
        }
      }
    }
  check(
    `no label is drawn over a crow's foot (${ALL_LAYOUTS.length} documents)`,
    onFoot.length === 0,
    `${onFoot.join(", ")} — a label printed over a glyph is not a label`,
  );

  const collided = [];
  for (const [name, laid] of ALL_LAYOUTS) {
    const labelled = laid.relationships.filter((r) => r.label !== undefined);
    for (let i = 0; i < labelled.length; i += 1) {
      for (let j = i + 1; j < labelled.length; j += 1) {
        const a = labelled[i];
        const b = labelled[j];
        const halfA = labelPlateWidth(a.label) / 2;
        const halfB = labelPlateWidth(b.label) / 2;
        if (
          Math.abs(a.labelX - b.labelX) < halfA + halfB &&
          Math.abs(a.labelY - b.labelY) < LABEL_PLATE_HALF_HEIGHT * 2
        ) {
          collided.push(`${name}: ${a.label} / ${b.label}`);
        }
      }
    }
  }
  check(
    "no two relationship labels overlap each other",
    collided.length === 0,
    collided.join(", "),
  );

  const diagonal = [];
  for (const relationship of layout.relationships) {
    for (let i = 1; i < relationship.points.length; i += 1) {
      const a = relationship.points[i - 1];
      const b = relationship.points[i];
      if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) {
        diagonal.push(`${relationship.from}->${relationship.to}`);
      }
    }
  }
  check(
    "every connector segment is horizontal or vertical",
    diagonal.length === 0,
    diagonal.join(", "),
  );

  /* An end's direction must point AWAY from the box it touches — the crow's
     feet are oriented from these vectors, so a wrong one draws a foot facing
     into the table. */
  const inward = [];
  for (const relationship of layout.relationships) {
    for (const [end, id] of [
      [relationship.fromEnd, relationship.from],
      [relationship.toEnd, relationship.to],
    ]) {
      const entity = layout.entities.find((candidate) => candidate.id === id);
      if (entity === undefined) continue;
      const tipX = end.x + end.dx * ER.footLength;
      const tipY = end.y + end.dy * ER.footLength;
      const inside =
        tipX > entity.x + 0.5 &&
        tipX < entity.x + entity.width - 0.5 &&
        tipY > entity.y + 0.5 &&
        tipY < entity.y + entity.height - 0.5;
      if (inside)
        inward.push(`${relationship.from}->${relationship.to} at ${id}`);
    }
  }
  check(
    "every crow's foot points away from the box it touches",
    inward.length === 0,
    inward.join(", "),
  );

  const unit = layout.relationships.every(
    (relationship) =>
      Math.abs(relationship.fromEnd.dx) + Math.abs(relationship.fromEnd.dy) ===
        1 &&
      Math.abs(relationship.toEnd.dx) + Math.abs(relationship.toEnd.dy) === 1,
  );
  check("every end direction is a unit axis vector", unit);
}

/* ----------------------------------------------------------------------- */
console.log("depth");

{
  const depth = new Map(layout.entities.map((e) => [e.id, e.depth]));
  check(
    "the example is deep enough to be a layout, not a row",
    layout.columns >= 3,
    `columns=${layout.columns}`,
  );
  check(
    "a parent is never placed right of its child",
    layout.relationships
      .filter((r) => r.from !== r.to)
      .every((r) => depth.get(r.from) <= depth.get(r.to)),
    layout.relationships
      .filter((r) => r.from !== r.to && depth.get(r.from) > depth.get(r.to))
      .map(
        (r) => `${r.from}(${depth.get(r.from)})->${r.to}(${depth.get(r.to)})`,
      )
      .join(", "),
  );

  /* Declaration order inside a column — the model says order is data. */
  const source = parseErText(ER_EXAMPLE).entities.map((e) => e.id);
  const byColumn = new Map();
  for (const entity of layout.entities) {
    const list = byColumn.get(entity.depth) ?? [];
    list.push(entity);
    byColumn.set(entity.depth, list);
  }
  let reordered = 0;
  for (const list of byColumn.values()) {
    const sorted = [...list].sort((a, b) => a.y - b.y).map((e) => e.id);
    const declared = source.filter((id) => sorted.includes(id));
    if (sorted.join(",") !== declared.join(",")) reordered += 1;
  }
  check(
    "entities keep declaration order within their column",
    reordered === 0,
    `${reordered} column(s) reordered`,
  );

  /* A CYCLE MUST TERMINATE. Two tables referencing each other is an ordinary
     schema, so this is not an edge case — it is the case a DAG assumption
     would hang on. */
  const cyclic = `archlab 1.0 er
title "Cycle"

@er
  entity a "A"
    attr id uuid pk
  entity b "B"
    attr id uuid pk

  a ||--o{ b : has
  b ||--o{ a : backref
`;
  let laid = null;
  try {
    laid = layoutEr(parseErText(cyclic));
  } catch (error) {
    laid = error;
  }
  check(
    "a two-table cycle lays out instead of hanging or throwing",
    laid !== null && Array.isArray(laid.entities) && laid.entities.length === 2,
    laid instanceof Error ? laid.message : String(laid),
  );

  /* A self-join routes BESIDE its box, never through it. */
  const selfJoin = layoutEr(
    parseErText(`archlab 1.0 er
title "Self"

@er
  entity node "Node"
    attr id uuid pk
    attr parent_id uuid fk

  node ||--o{ node : parent
`),
  );
  const box = selfJoin.entities[0];
  const through = selfJoin.relationships[0].points.some(
    (point) =>
      point.x > box.x + 1 &&
      point.x < box.x + box.width - 1 &&
      point.y > box.y + 1 &&
      point.y < box.y + box.height - 1,
  );
  check("a self-join routes beside its box, not through it", !through);
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
