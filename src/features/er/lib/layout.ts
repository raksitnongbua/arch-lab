/**
 * Pure geometry for an ER diagram: `ErLabFile` in, absolute coordinates out.
 * No React, no DOM, no measurement — the same contract as
 * `features/usecase/lib/layout.ts` and `features/flowchart/lib/layout.ts`,
 * so the canvas, the SVG exporter and `scripts/er-layout-check.mjs` all read
 * one geometry rather than three that must agree.
 *
 * WHAT MAKES ER's LAYOUT DIFFERENT FROM EVERY KIND ALREADY HERE. The other
 * four place a shape whose size is a function of ONE string. An entity is a
 * table: its height is its column count and its width is the widest of
 * `label`, and of every `name  type  keys` row. So the box is measured
 * first, from the document, and placement happens around boxes whose sizes
 * are already known — the reverse of the flowchart, which places ranks and
 * then fits labels.
 *
 * THE PLACEMENT MODEL: columns by dependency depth, and why not a grid.
 * `purpose.md` forbids falling back to a grid, and for ER a grid is
 * especially wrong — the whole point of the diagram is which table points at
 * which, so the geometry must come from the relationships:
 *
 *   1. Depth is the longest path FROM a root, where a root is an entity
 *      nothing points at. In schema terms the roots are the tables that own
 *      themselves (a `customer`), and depth grows toward the tables that
 *      exist only because something else does (an `order_line`). That is the
 *      reading order of a schema and it puts the parents on the left.
 *   2. Cycles are normal in a schema — two tables can reference each other —
 *      so depth is computed with a visited set and a cycle contributes no
 *      depth rather than looping forever. A cyclic pair simply shares a
 *      column, which is the honest drawing of "neither is upstream".
 *   3. Within a column, entities keep DECLARATION ORDER. The model says
 *      order is data; re-sorting a column by name or by degree would be the
 *      layout overruling the author about something they can see.
 *
 * THE CONNECTOR RULE. An ER line joins two BOXES, and the crow's foot must
 * sit against the box's edge, not float near its corner. Every connector
 * therefore leaves and enters through a side chosen from the boxes' relative
 * positions, and runs orthogonally: out horizontally, across, in
 * horizontally. Labels sit on the middle segment's midpoint and never on the
 * line itself — `new-diagram-type.md` states both rules, and
 * `scripts/er-layout-check.mjs` measures them rather than restating them.
 *
 * Imported by `scripts/er-layout-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  ErAttribute,
  ErCardinality,
  ErEntity,
  ErLabFile,
  ErRelationship,
  ErRelationshipKind,
} from "@/types";

import { CHAR_WIDTH_RATIO } from "@/lib/text-metrics";

/**
 * Every tunable distance in the ER canvas, in px, in one table.
 *
 * ONE OBJECT rather than scattered literals, matching `UC` in the use-case
 * layout: the export renderer and the layout check both read these, so a
 * spacing change cannot leave the exported SVG disagreeing with the canvas.
 */
export const ER = {
  /** Title bar height inside an entity box. */
  headerHeight: 38,
  /** One column row's height. */
  rowHeight: 26,
  /** Left and right padding inside a box. */
  padX: 14,
  /** Minimum box width, so a one-column table is still a box and not a slot. */
  minWidth: 168,
  /** Horizontal gap between two columns of entities. */
  columnGap: 96,
  /** Vertical gap between two entities in one column. */
  rowGap: 44,
  /** Canvas padding around the whole diagram. */
  margin: 40,
  /** How far a connector runs straight out of a box before it turns. */
  stub: 26,
  /** Font size of the entity label. */
  labelSize: 15,
  /** Font size of a column row. */
  rowSize: 12.5,
  /** The crow's-foot marker's reach back along the line. */
  footLength: 13,
  /** Half-height of a crow's foot, and the radius of the optional-`o` ring. */
  footSpread: 7,
  /** Gap between a key badge and the type it sits left of. */
  keyGap: 10,
} as const;

/* -------------------------------------------------------------------------- */
/* Laid-out shapes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One column row, already positioned relative to the canvas.
 *
 * THE THREE X POSITIONS ARE COMPUTED HERE, not in the renderer, because
 * placing the key badge needs the TYPE's rendered width and this module is
 * the only one that measures. The first cut nudged the badge with a `dy` to
 * dodge the type, which put it on the row above and made `PK` look like it
 * belonged to the previous column — visible on every keyed row in the first
 * screenshot of this canvas.
 *
 * The row reads `name … [KEYS] type`, all three on one baseline: the name
 * left-anchored, the type end-anchored at the right padding, and the badge
 * end-anchored just left of the type. The badge sits INSIDE the row rather
 * than beyond the type, because the type is the row's most variable string
 * and anchoring the badge to the box edge would make the gap between them
 * jump from row to row.
 */
export interface LaidErAttribute {
  name: string;
  type: string;
  keys: string;
  description?: string;
  /** Absolute y of the row's vertical centre. */
  y: number;
  /** Left-anchored x of the column name. */
  nameX: number;
  /** End-anchored x of the type. */
  typeX: number;
  /** End-anchored x of the key badge, or `null` when the row carries none. */
  keysX: number | null;
}

export interface LaidErEntity {
  id: string;
  label: string;
  technology?: string;
  description?: string;
  tags?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  attributes: LaidErAttribute[];
  /** Column index — the entity's dependency depth. Drives the entrance
   * stagger, so motion names the layout's own placement rather than
   * inventing an order the document never states. */
  depth: number;
}

/** One end of a drawn relationship: where the line meets the box, which way
 * it points, and what glyph belongs there. */
export interface LaidErEnd {
  x: number;
  y: number;
  /** Unit direction pointing AWAY from the box, along the stub. The marker
   * renderer needs it to orient a crow's foot without re-deriving which side
   * it landed on. */
  dx: number;
  dy: number;
  cardinality: ErCardinality;
}

export interface LaidErRelationship {
  from: string;
  to: string;
  kind: ErRelationshipKind;
  label?: string;
  /** The orthogonal path, already routed. Always at least three points. */
  points: { x: number; y: number }[];
  fromEnd: LaidErEnd;
  toEnd: LaidErEnd;
  /** Where the label sits — on the middle segment, never on a box. */
  labelX: number;
  labelY: number;
}

export interface ErLayout {
  width: number;
  height: number;
  entities: LaidErEntity[];
  relationships: LaidErRelationship[];
  /** Highest depth + 1 — the column count, which the entrance uses to cap
   * its stagger so a wide schema compresses instead of trickling. */
  columns: number;
}

/* -------------------------------------------------------------------------- */
/* Measurement                                                                 */
/* -------------------------------------------------------------------------- */

/** Key roles as drawn on a row, e.g. `PK FK`. Uppercase here and only here:
 * the model is lowercase, and this is presentation. */
const keysText = (attribute: ErAttribute): string =>
  attribute.keys === undefined
    ? ""
    : attribute.keys.map((key) => key.toUpperCase()).join(" ");

/** Approximate rendered width of a string at a font size — the same
 * character-ratio estimate the C4 exporter and the sequence layout use
 * (`CHAR_WIDTH_RATIO`), because this module must stay pure and a real
 * measurement needs a DOM. */
const textWidth = (text: string, size: number): number =>
  text.length * size * CHAR_WIDTH_RATIO;

/**
 * A box's width: the widest thing that has to fit inside it.
 *
 * A ROW IS THREE COLUMNS — name, type, keys — so its width is the sum, not
 * the max. Measuring only the longest single word was tried and was wrong:
 * it produced boxes whose type column overflowed the right border on exactly
 * the rows that carry a key role, because those rows are the widest and the
 * key role is the part that sits furthest right.
 */
function entityWidth(entity: ErEntity): number {
  let widest = textWidth(entity.label, ER.labelSize);
  for (const attribute of entity.attributes ?? []) {
    const keys = keysText(attribute);
    const row =
      textWidth(attribute.name, ER.rowSize) +
      textWidth(attribute.type, ER.rowSize) +
      (keys === "" ? 0 : textWidth(keys, ER.rowSize) + ER.keyGap) +
      /* One more gutter between the name and whatever follows it, so the
         three never touch even on the widest row. The gap RESERVED here is
         the same constant the placement subtracts, or a badge could be
         pushed off the left edge of its own row. */
      ER.keyGap * 1.6;
    if (row > widest) widest = row;
  }
  return Math.max(ER.minWidth, Math.ceil(widest + ER.padX * 2));
}

const entityHeight = (entity: ErEntity): number =>
  ER.headerHeight + (entity.attributes?.length ?? 0) * ER.rowHeight;

/* -------------------------------------------------------------------------- */
/* Depth                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Dependency depth per entity — the column each one sits in.
 *
 * Longest path from a root, computed depth-first with an in-progress set so a
 * CYCLE contributes no depth instead of recursing forever. Schemas have
 * cycles (two tables referencing each other is ordinary), so a layout that
 * assumed a DAG would not be a layout with a bug in it — it would be a
 * layout that cannot draw ordinary schemas.
 */
function depthByEntity(
  entities: ErEntity[],
  relationships: ErRelationship[],
): Map<string, number> {
  const parents = new Map<string, string[]>();
  for (const entity of entities) parents.set(entity.id, []);
  for (const relationship of relationships) {
    /* `from` is the parent side: `customer ||--o{ order` reads "one customer
       has many orders", so `order` sits downstream of `customer`. */
    parents.get(relationship.to)?.push(relationship.from);
  }

  const depth = new Map<string, number>();
  const inProgress = new Set<string>();

  const resolve = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (inProgress.has(id)) return 0;
    inProgress.add(id);
    let best = 0;
    for (const parent of parents.get(id) ?? []) {
      if (parent === id) continue;
      const candidate = resolve(parent) + 1;
      if (candidate > best) best = candidate;
    }
    inProgress.delete(id);
    depth.set(id, best);
    return best;
  };

  for (const entity of entities) resolve(entity.id);
  return depth;
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                     */
/* -------------------------------------------------------------------------- */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a connector leaves one box for another, and the orthogonal path
 * between them.
 *
 * SIDES ARE CHOSEN FROM THE BOXES' RELATIVE POSITIONS, never fixed: two
 * entities in the same column connect top-to-bottom, and entities in
 * different columns connect side-to-side. A fixed left/right rule was tried
 * and was wrong — a relationship between two boxes stacked vertically drew a
 * line that left the right edge, doubled back across its own box, and
 * entered the other's right edge, crossing both boxes it joined.
 */
function route(
  from: Box,
  to: Box,
): { points: { x: number; y: number }[]; fromEnd: Vec; toEnd: Vec } {
  const fromCx = from.x + from.width / 2;
  const toCx = to.x + to.width / 2;
  const fromCy = from.y + from.height / 2;
  const toCy = to.y + to.height / 2;

  const horizontal =
    Math.abs(toCx - fromCx) >= Math.abs(toCy - fromCy) ||
    /* Boxes that overlap horizontally have no clean side-to-side run. */
    to.x > from.x + from.width ||
    from.x > to.x + to.width;

  if (horizontal) {
    const leftToRight = toCx >= fromCx;
    const startX = leftToRight ? from.x + from.width : from.x;
    const endX = leftToRight ? to.x : to.x + to.width;
    const dir = leftToRight ? 1 : -1;
    const midX = (startX + dir * ER.stub + (endX - dir * ER.stub)) / 2;
    return {
      points: [
        { x: startX, y: fromCy },
        { x: midX, y: fromCy },
        { x: midX, y: toCy },
        { x: endX, y: toCy },
      ],
      fromEnd: { x: startX, y: fromCy, dx: dir, dy: 0 },
      toEnd: { x: endX, y: toCy, dx: -dir, dy: 0 },
    };
  }

  const topToBottom = toCy >= fromCy;
  const startY = topToBottom ? from.y + from.height : from.y;
  const endY = topToBottom ? to.y : to.y + to.height;
  const dir = topToBottom ? 1 : -1;
  const midY = (startY + dir * ER.stub + (endY - dir * ER.stub)) / 2;
  return {
    points: [
      { x: fromCx, y: startY },
      { x: fromCx, y: midY },
      { x: toCx, y: midY },
      { x: toCx, y: endY },
    ],
    fromEnd: { x: fromCx, y: startY, dx: 0, dy: dir },
    toEnd: { x: toCx, y: endY, dx: 0, dy: -dir },
  };
}

interface Vec {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/* -------------------------------------------------------------------------- */
/* The layout                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Lays out an ER document. Pure and deterministic: the same file always
 * produces the same coordinates, so an export and the canvas cannot drift and
 * a diff between two renders is a real diff.
 */
export function layoutEr(file: ErLabFile): ErLayout {
  const entities = file.entities ?? [];
  const relationships = file.relationships ?? [];
  const depth = depthByEntity(entities, relationships);

  /* Group by column, keeping declaration order inside each — the model says
     order is data, and a column re-sorted by name would be the layout
     overruling something the author can see. */
  const columns: ErEntity[][] = [];
  for (const entity of entities) {
    const index = depth.get(entity.id) ?? 0;
    (columns[index] ??= []).push(entity);
  }

  /* Column widths first: every box in a column shares the widest, so the
     column has one right edge for connectors to leave from. */
  const columnWidth = columns.map((column) =>
    column.reduce((widest, entity) => Math.max(widest, entityWidth(entity)), 0),
  );

  const laid: LaidErEntity[] = [];
  const boxById = new Map<string, Box>();
  let x = ER.margin;
  let tallest = 0;

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index] ?? [];
    const width = columnWidth[index] ?? ER.minWidth;
    const heights = column.map((entity) => entityHeight(entity));
    const total =
      heights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, column.length - 1) * ER.rowGap;
    /* Columns are centred against one another, so a short column sits beside
       the middle of a tall one rather than hanging off its top. */
    let y = ER.margin;
    const columnTop = y;
    for (let position = 0; position < column.length; position += 1) {
      const entity = column[position];
      const height = heights[position];
      const box: Box = { x, y, width, height };
      boxById.set(entity.id, box);
      laid.push({
        id: entity.id,
        label: entity.label,
        ...(entity.technology !== undefined
          ? { technology: entity.technology }
          : {}),
        ...(entity.description !== undefined
          ? { description: entity.description }
          : {}),
        ...(entity.tags !== undefined ? { tags: entity.tags } : {}),
        x,
        y,
        width,
        height,
        depth: index,
        attributes: (entity.attributes ?? []).map((attribute, row) => {
          const keys = keysText(attribute);
          const typeX = x + width - ER.padX;
          return {
            name: attribute.name,
            type: attribute.type,
            keys,
            ...(attribute.description !== undefined
              ? { description: attribute.description }
              : {}),
            y: y + ER.headerHeight + row * ER.rowHeight + ER.rowHeight / 2,
            nameX: x + ER.padX,
            typeX,
            keysX:
              keys === ""
                ? null
                : typeX - textWidth(attribute.type, ER.rowSize) - ER.keyGap,
          };
        }),
      });
      y += height + ER.rowGap;
    }
    tallest = Math.max(tallest, columnTop + total);
    x += width + ER.columnGap;
  }

  /* Vertical centring, applied after the fact so each column's own stacking
     stays untouched — shifting a whole column is one number per box, where
     centring during placement would need the total height before the loop
     that computes it. */
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index] ?? [];
    const heights = column.map((entity) => entityHeight(entity));
    const total =
      heights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, column.length - 1) * ER.rowGap;
    const shift = (tallest - ER.margin - total) / 2;
    if (shift <= 0) continue;
    for (const entity of column) {
      const box = boxById.get(entity.id);
      const item = laid.find((candidate) => candidate.id === entity.id);
      if (box === undefined || item === undefined) continue;
      box.y += shift;
      item.y += shift;
      for (const attribute of item.attributes) attribute.y += shift;
    }
  }

  const drawn: LaidErRelationship[] = [];
  for (const relationship of relationships) {
    const from = boxById.get(relationship.from);
    const to = boxById.get(relationship.to);
    /* A relationship naming an entity the document never declared cannot be
       drawn. The parser refuses that document, so reaching here means the
       model was hand-built — skip the line rather than draw it to (0,0),
       which would look like a real edge to nowhere. */
    if (from === undefined || to === undefined) continue;
    if (relationship.from === relationship.to) {
      /* A self-relationship: a hook out of the right side and back into the
         top, beside the box rather than through it — the flowchart's loop
         rule, which exists so a returning line never crosses what it left. */
      const hookX = from.x + from.width + ER.stub;
      const midY = from.y - ER.stub;
      drawn.push({
        from: relationship.from,
        to: relationship.to,
        kind: relationship.kind,
        ...(relationship.label !== undefined
          ? { label: relationship.label }
          : {}),
        points: [
          { x: from.x + from.width, y: from.y + from.height / 2 },
          { x: hookX, y: from.y + from.height / 2 },
          { x: hookX, y: midY },
          { x: from.x + from.width / 2, y: midY },
          { x: from.x + from.width / 2, y: from.y },
        ],
        fromEnd: {
          x: from.x + from.width,
          y: from.y + from.height / 2,
          dx: 1,
          dy: 0,
          cardinality: relationship.fromCardinality,
        },
        toEnd: {
          x: from.x + from.width / 2,
          y: from.y,
          dx: 0,
          dy: -1,
          cardinality: relationship.toCardinality,
        },
        labelX: hookX + 8,
        labelY: midY + (from.y + from.height / 2 - midY) / 2,
      });
      continue;
    }

    const { points, fromEnd, toEnd } = route(from, to);
    /* The label sits on the MIDDLE segment — the one that spans the gap
       between the boxes — so it can never land on a box or on a stub that
       touches one. */
    const a = points[1];
    const b = points[2];
    drawn.push({
      from: relationship.from,
      to: relationship.to,
      kind: relationship.kind,
      ...(relationship.label !== undefined
        ? { label: relationship.label }
        : {}),
      points,
      fromEnd: { ...fromEnd, cardinality: relationship.fromCardinality },
      toEnd: { ...toEnd, cardinality: relationship.toCardinality },
      labelX: (a.x + b.x) / 2,
      labelY: (a.y + b.y) / 2,
    });
  }

  const width =
    laid.reduce(
      (widest, entity) => Math.max(widest, entity.x + entity.width),
      0,
    ) + ER.margin;
  const height =
    laid.reduce(
      (tallestSoFar, entity) =>
        Math.max(tallestSoFar, entity.y + entity.height),
      0,
    ) + ER.margin;

  return {
    width: Math.max(width, ER.margin * 2),
    height: Math.max(height, ER.margin * 2),
    entities: laid,
    relationships: drawn,
    columns: columns.length,
  };
}
