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
 *   7. A PIN MOVES THE DRAWN BOX AND NOTHING ELSE, and the frame grows to
 *      contain it. THE DEFECTS THIS EXISTS FOR: the flowchart shipped a pin
 *      whose coordinate outside the solved bounds was CROPPED — a step drawn
 *      64% off the picture on screen and baked into every PNG at the same
 *      crop (ADR 0002, amended) — and the whole reason `ErEntity.position`
 *      could be added without a major bump is that a document stating none
 *      lays out to the same pixel it always did. Neither claim is provable by
 *      reading the code, so both are measured here.
 *
 * Exits non-zero on any failure. Run with: pnpm check:er-layout
 */

import { existsSync, readFileSync, statSync } from "node:fs";
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
/** A rectangle in one line, for a failure message that says where. */
const box = (r) => `[x ${r.x}, y ${r.y}, w ${r.width}, h ${r.height}]`;
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
console.log("pins");

/* THE SAME SCHEMA TWICE: once stating nothing, once pinning one entity a long
   way from where the solver put it. Every pin assertion below is a comparison
   between these two layouts, because that is the only way to tell "the pin
   moved this" from "the layout always did this". */
const PIN_FREE = `archlab 1.0 er
title "Orders"

@er
  entity customer "Customer"
    attr id uuid pk
    attr email string uk
  entity order "Order"
    attr id uuid pk
    attr customer_id uuid pk fk
    attr placed_at timestamptz
  entity order_line "Order line"
    attr id uuid pk
    attr order_id uuid fk
  entity product "Product"
    attr id uuid pk
    attr name string

  customer ||--o{ order : places
  order ||--|{ order_line : contains
  product ||--o{ order_line : "is sold as"
`;
const unpinned = layoutEr(parseErText(PIN_FREE));

{
  /* THE NON-BREAKING GUARANTEE, as a golden rather than a claim. These
     coordinates were read off the layout as it stood BEFORE `position`
     existed — `[id, depth, x, y, width, height]` — and every `.alab` ER
     document on disk and in every share link states no `(x,y)`, so if the pin
     pass can move any of these numbers then adding the field was a breaking
     change that shipped as a minor one. A golden is the wrong shape for a
     spacing rule and the right one for this: the value being protected is
     "unchanged", which nothing relational can express. Update it only
     alongside a changelog entry saying every existing ER diagram moved. */
  const BEFORE_PINS_EXISTED = [
    ["customer", 0, 40, 40, 168, 90],
    ["product", 0, 40, 202, 168, 90],
    ["order", 1, 376, 108, 199, 116],
    ["order_line", 2, 743, 121, 168, 90],
  ];
  const actual = unpinned.entities.map((e) => [
    e.id,
    e.depth,
    e.x,
    e.y,
    e.width,
    e.height,
  ]);
  check(
    "a document that states no (x,y) lays out exactly where it did before the field existed — the property that made `position` a minor change",
    JSON.stringify(actual) === JSON.stringify(BEFORE_PINS_EXISTED) &&
      unpinned.width === 951 &&
      unpinned.height === 332,
    `${JSON.stringify(actual)} at ${unpinned.width}x${unpinned.height}`,
  );

  /* And the frame it reports is the frame every renderer used to compute for
     itself. A pin-free schema whose bounds differ from `0 0 width height`
     would move the viewBox of every diagram already published. */
  const originFramed = ALL_LAYOUTS.every(
    ([, l]) =>
      l.bounds.x === 0 &&
      l.bounds.y === 0 &&
      l.bounds.width === l.width &&
      l.bounds.height === l.height,
  );
  check(
    "every registered example — all of them token-free — reports bounds identical to its origin-measured canvas",
    originFramed && unpinned.bounds.x === 0 && unpinned.bounds.y === 0,
    ALL_LAYOUTS.map(([id, l]) => `${id} ${box(l.bounds)}`).join(" "),
  );
}

/** The same schema with one entity's declaration line carrying an `(x,y)`. */
const pinnedAt = (id, at) =>
  layoutEr(
    parseErText(
      PIN_FREE.replace(
        new RegExp(`^  entity ${id} ("[^"]*")$`, "m"),
        `  entity ${id} $1 ${at}`,
      ),
    ),
  );
const entityOf = (layout, id) =>
  layout.entities.find((entity) => entity.id === id);

{
  /* PER-ELEMENT PRECEDENCE. `entity.position ?? solved`, resolved one entity
     at a time — so the stated coordinate wins for `order` and its three
     neighbours keep the slots the solver gave them. A pin implemented as a
     whole-layout mode instead would move everything, which is the failure
     this separates from a working one. */
  const pinned = pinnedAt("order", "(700,-260)");
  const moved = entityOf(pinned, "order");
  check(
    "a stated (x,y) is where that entity is drawn, to the pixel",
    moved.x === 700 && moved.y === -260,
    `${box(moved)}`,
  );
  check(
    "and its three unpinned neighbours are byte-identical to the pin-free layout — a pin is per element, not a mode the whole diagram enters",
    JSON.stringify(pinned.entities.filter((e) => e.id !== "order")) ===
      JSON.stringify(unpinned.entities.filter((e) => e.id !== "order")),
    JSON.stringify(pinned.entities.filter((e) => e.id !== "order")),
  );

  /* THE ROWS TRAVEL WITH THE BOX. Every row's y and its three x positions are
     absolute — computed during placement so the key badge can be measured
     against the type beside it — so a pin that moved only the box would leave
     `PK`, `email` and `string` printed where the box used to be. */
  const insideOwnBox = moved.attributes.every(
    (attribute) =>
      attribute.y > moved.y &&
      attribute.y < moved.y + moved.height &&
      attribute.nameX >= moved.x &&
      attribute.typeX <= moved.x + moved.width &&
      (attribute.keysX === null ||
        (attribute.keysX > moved.x && attribute.keysX < attribute.typeX)),
  );
  check(
    "the pinned entity's rows and key badges travel with it, still inside its own box",
    insideOwnBox,
    JSON.stringify(moved.attributes),
  );
}

{
  /* THE COLUMN IS NOT THE PIN'S TO CHANGE. An entity's column is its
     longest-path dependency depth, which is a fact about the relationships;
     ADR 0003 lists "structure is never overridden" as the thing NOT given up.
     Laid out at four wildly different pin positions, because one position
     proves nothing about invariance. */
  const columnsAt = ["(700,-260)", "(-900,900)", "(0,0)", "(4000,60)"].map(
    (at) => pinnedAt("order", at),
  );
  const expected = unpinned.entities.map((e) => `${e.id}:${e.depth}`).join(",");
  check(
    "pinning one entity leaves EVERY entity's column exactly where the relationships put it, at every pin position",
    columnsAt.every(
      (l) =>
        l.entities.map((e) => `${e.id}:${e.depth}`).join(",") === expected &&
        l.columns === unpinned.columns,
    ),
    columnsAt
      .map((l) => l.entities.map((e) => `${e.id}:${e.depth}`).join(","))
      .join(" vs "),
  );
  /* The other half of "structure is untouched": the connector side choice is
     read off the SOLVED boxes, so the crow's feet leave the faces the column
     earned even when the box has moved. ADR 0003 accepts the visible
     consequence — a connector into a pinned entity can leave the wrong face —
     as a cost, so what is asserted is that the DIRECTIONS did not change,
     which is exactly the thing a "fix" would break. */
  const sidesOf = (l) =>
    l.relationships
      .map(
        (r) =>
          `${r.from}>${r.to}:${r.fromEnd.dx},${r.fromEnd.dy}|${r.toEnd.dx},${r.toEnd.dy}`,
      )
      .join(" ");
  check(
    "and every connector still leaves and enters the faces the SOLVED geometry chose — the side choice is not a function of where a pin sits",
    columnsAt.every((l) => sidesOf(l) === sidesOf(unpinned)),
    columnsAt.map(sidesOf).join(" vs "),
  );
}

{
  /* THE FRAME GROWS AROUND A FAR-FLUNG PIN. This is the flowchart's shipped
     defect, transplanted: `viewBox="0 0 width height"` cropped a pinned step
     off the picture on screen and cropped it identically in the PNG. The
     fixture pins BOTH ways past the origin-measured canvas so neither
     direction can pass vacuously. */
  const far = pinnedAt("order", "(2400,1500)");
  const negative = pinnedAt("order", "(-620,-410)");
  const frameContains = (l, e) =>
    e.x >= l.bounds.x &&
    e.y >= l.bounds.y &&
    e.x + e.width <= l.bounds.x + l.bounds.width &&
    e.y + e.height <= l.bounds.y + l.bounds.height;

  check(
    "the fixtures really do pin outside the origin-measured canvas — otherwise the containment clauses below prove nothing about pins",
    entityOf(far, "order").x > unpinned.width &&
      entityOf(negative, "order").x < 0 &&
      entityOf(negative, "order").y < 0,
    `far ${box(entityOf(far, "order"))} vs canvas ${unpinned.width}x${unpinned.height}, negative ${box(entityOf(negative, "order"))}`,
  );
  check(
    "a pin beyond the solved bounds GROWS width and height rather than being cropped out of the picture",
    far.width > unpinned.width &&
      far.height > unpinned.height &&
      far.bounds.width > unpinned.bounds.width &&
      far.bounds.height > unpinned.bounds.height,
    `${far.width}x${far.height} vs ${unpinned.width}x${unpinned.height}`,
  );
  check(
    "and every box in that layout — pinned and solved alike — lies inside the reported bounds, which is what all three renderers set their viewBox to",
    far.entities.every((e) => frameContains(far, e)),
    far.entities
      .filter((e) => !frameContains(far, e))
      .map((e) => `${e.id} ${box(e)}`)
      .join(" "),
  );

  /* A NEGATIVE COORDINATE IS A PLACE, NOT AN ERROR. Clamping it to 0 was the
     tempting fix and it is the wrong one: it silently relocates the box the
     author placed, which is the deformation `.claude/rules` calls out as worse
     than a refusal. The drawing is not slid back to reach the pin either —
     the solved boxes must not move — so the frame is what reaches out. */
  const negOrder = entityOf(negative, "order");
  check(
    "a negative (x,y) is honoured rather than clamped to the origin",
    negOrder.x === -620 && negOrder.y === -410,
    box(negOrder),
  );
  check(
    "the bounds reach past the origin to contain it while the solved boxes stay put — the frame grows, the drawing does not shift",
    negative.bounds.x < 0 &&
      negative.bounds.y < 0 &&
      negative.entities.every((e) => frameContains(negative, e)) &&
      JSON.stringify(negative.entities.filter((e) => e.id !== "order")) ===
        JSON.stringify(unpinned.entities.filter((e) => e.id !== "order")),
    `bounds ${box(negative.bounds)}`,
  );
  check(
    "the bounds always CONTAIN the origin-measured canvas, so no existing diagram's frame can shrink",
    [unpinned, far, negative].every(
      (l) =>
        l.bounds.x <= 0 &&
        l.bounds.y <= 0 &&
        l.bounds.x + l.bounds.width >= l.width &&
        l.bounds.y + l.bounds.height >= l.height,
    ),
    [unpinned, far, negative].map((l) => box(l.bounds)).join(" "),
  );
}

{
  /* THE FRAME IS ONLY REAL IF THE RENDERERS READ IT. Two halves of one thing,
     each self-consistent, that disagree is the most expensive defect class in
     this repo (`codebase.md`) — and it is exactly what shipped on the
     flowchart: the layout reported a grown frame while the canvas and the
     exporter still wrote `0 0 width height`. Read from the FILES, so a
     renderer that quietly goes back to the origin fails here. */
  const diagramSrc = readFileSync(
    path.join(ROOT, "src/features/er/components/er-diagram.tsx"),
    "utf8",
  );
  const exportSrc = readFileSync(
    path.join(ROOT, "src/features/er/export/render-svg.ts"),
    "utf8",
  );
  const viewerSrc = readFileSync(
    path.join(ROOT, "src/features/er/components/er-viewer.tsx"),
    "utf8",
  );
  check(
    "the canvas sets its viewBox from the layout's bounds, not from `0 0 width height`",
    /viewBox=\{`\$\{layout\.bounds\.x\} \$\{layout\.bounds\.y\} \$\{layout\.bounds\.width\} \$\{layout\.bounds\.height\}`\}/.test(
      diagramSrc,
    ) && !/viewBox=\{`0 0 /.test(diagramSrc),
  );
  check(
    "the SVG exporter frames the file from the same bounds, so the screen and the PNG cannot crop differently",
    /const frame = layout\.bounds;/.test(exportSrc) &&
      /viewBox="\$\{frame\.x\} \$\{frame\.y\} \$\{frame\.width\} \$\{frame\.height\}"/.test(
        exportSrc,
      ),
  );
  check(
    "and the camera measures the content from the bounds, so fit-to-view frames the pin instead of scrolling past it",
    /contentWidth: size\.bounds\.width/.test(viewerSrc) &&
      /contentHeight: size\.bounds\.height/.test(viewerSrc),
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
