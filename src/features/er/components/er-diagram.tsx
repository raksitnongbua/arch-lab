/**
 * The ER canvas: one SVG drawn straight from `layoutEr`'s coordinates.
 *
 * SVG RATHER THAN `@xyflow/react`, which the C4 canvas uses. Nothing in an ER
 * diagram is dragged, drilled into or selected as a graph node — it is a
 * schema you read — so a node-graph runtime would buy panning this canvas
 * gets from its container anyway, and cost the ability to hand the SAME
 * element tree to the SVG exporter. The use-case and flowchart canvases made
 * the same call for the same reason.
 *
 * WHAT IT DRAWS, and why each part is shaped as it is:
 *
 *   - An ENTITY is a table, not a labelled shape: a header bar carrying the
 *     name (and `[technology]` when the document sets one), then one row per
 *     column with the name, the type, and the key roles. The key roles are
 *     drawn in the accent colour and right-aligned, because `PK` is what a
 *     reader scans an entity for and a left-aligned one hides behind the
 *     type.
 *   - A CONNECTOR is an orthogonal polyline with a crow's foot at each end.
 *     The feet are drawn HERE rather than as SVG `marker` elements, because a
 *     marker inherits `orient` from the path's own tangent and an ER foot has
 *     to face the box it touches — at the `to` end that is the opposite of
 *     the tangent, and `orient="auto-start-reverse"` only fixes one of the
 *     two. Drawing them from the layout's `dx`/`dy` makes both ends honest
 *     and keeps the exporter identical to the canvas.
 *   - The LABEL sits on the middle segment with a canvas-coloured plate
 *     behind it, so a verb never has a line running through it.
 *
 * MOTION lives in `../styles/er-motion.css` and is opt-out twice — the
 * media query holds it still for `prefers-reduced-motion`, and the app-wide
 * idle-motion toggle stops the ambient gesture. The per-entity stagger is
 * stamped as an inline custom property here because it is SERVER-RENDERED:
 * a first-paint animation cannot wait for JavaScript to write a variable
 * (`usecase/lib/motion.ts` argues this at length, and the rule is the same).
 *
 * The stagger names the LAYOUT'S OWN ORDER — an entity's column, which is its
 * dependency depth — so the reveal says "parents, then what depends on them",
 * which is what the geometry already drew. It states no ranking the document
 * does not.
 */

import type {
  LaidErEnd,
  LaidErEntity,
  LaidErRelationship,
} from "../lib/layout";
import { ER, layoutEr } from "../lib/layout";
import type { ErLabFile } from "@/types";

/** How many columns' worth of stagger before the beat stops growing, so a
 * wide schema compresses instead of trickling in. The flowchart's rank-cap
 * rule, held here in TS and in the stylesheet's `--er-wave-cap`. */
const WAVE_CAP = 6;

/* -------------------------------------------------------------------------- */
/* Crow's feet                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One end's glyph, built from the layout's outward direction.
 *
 * The four cardinalities are two independent marks, which is why this is
 * composed rather than a table of four shapes: a BAR across the line means
 * "at least one", a RING on the line means "zero is allowed", and a FOOT
 * (the three-toed fan) means "many". `one` is a bar; `zero-or-one` is a ring
 * plus a bar; `one-or-more` is a bar plus a foot; `zero-or-more` is a ring
 * plus a foot. Reading them as two marks is also how a reader learns them,
 * so the drawing matches the explanation.
 */
function EndGlyph({
  end,
  stroke,
}: {
  end: LaidErEnd;
  stroke: string;
}): React.JSX.Element {
  const { x, y, dx, dy, cardinality } = end;
  /* Along the line, away from the box. Perpendicular, for the bar's width
     and the foot's spread. */
  const ax = dx * ER.footLength;
  const ay = dy * ER.footLength;
  const px = -dy * ER.footSpread;
  const py = dx * ER.footSpread;

  const many = cardinality === "one-or-more" || cardinality === "zero-or-more";
  const optional =
    cardinality === "zero-or-one" || cardinality === "zero-or-more";

  /* The bar sits one glyph-length out when a foot shares the end, so the two
     marks read as two marks instead of overlapping into a blob. */
  const barT = many ? 1 : 0.55;
  const bx = x + ax * barT;
  const by = y + ay * barT;

  return (
    <g className="af-er-foot" fill="none" stroke={stroke} strokeWidth={1.6}>
      {many ? (
        <>
          <line x1={x} y1={y} x2={x + ax + px} y2={y + ay + py} />
          <line x1={x} y1={y} x2={x + ax - px} y2={y + ay - py} />
          <line x1={x} y1={y} x2={x + ax} y2={y + ay} />
        </>
      ) : null}
      <line x1={bx + px} y1={by + py} x2={bx - px} y2={by - py} />
      {optional ? (
        <circle
          cx={x + ax * (many ? 1.65 : 1.35)}
          cy={y + ay * (many ? 1.65 : 1.35)}
          r={ER.footSpread * 0.62}
          fill="var(--canvas)"
        />
      ) : null}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                    */
/* -------------------------------------------------------------------------- */

function Entity({ entity }: { entity: LaidErEntity }): React.JSX.Element {
  const headerY = entity.y + ER.headerHeight;
  return (
    <g
      className="af-er-entity"
      style={
        {
          "--er-wave": Math.min(entity.depth, WAVE_CAP),
        } as React.CSSProperties
      }
    >
      <rect
        x={entity.x}
        y={entity.y}
        width={entity.width}
        height={entity.height}
        rx={10}
        fill="var(--node)"
        stroke="var(--node-border)"
        strokeWidth={1.2}
      />
      {/* The header's floor. Drawn as a line rather than a filled band so a
          theme that separates by outline rather than by fill — the default —
          still shows the split. */}
      {entity.attributes.length > 0 ? (
        <line
          x1={entity.x}
          y1={headerY}
          x2={entity.x + entity.width}
          y2={headerY}
          stroke="var(--node-border)"
          strokeWidth={1.2}
        />
      ) : null}
      <text
        x={entity.x + ER.padX}
        y={entity.y + ER.headerHeight / 2}
        dominantBaseline="central"
        fontSize={ER.labelSize}
        fontWeight={600}
        fill="var(--node-foreground)"
      >
        {entity.label}
      </text>
      {entity.technology !== undefined ? (
        <text
          x={entity.x + entity.width - ER.padX}
          y={entity.y + ER.headerHeight / 2}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={ER.rowSize - 1}
          fill="var(--node-meta)"
        >
          {entity.technology}
        </text>
      ) : null}
      {entity.attributes.map((attribute) => (
        <g key={attribute.name}>
          <text
            x={entity.x + ER.padX}
            y={attribute.y}
            dominantBaseline="central"
            fontSize={ER.rowSize}
            fill="var(--node-foreground)"
          >
            {attribute.name}
          </text>
          <text
            x={entity.x + entity.width - ER.padX}
            y={attribute.y}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={ER.rowSize}
            fill="var(--node-meta)"
          >
            {attribute.type}
          </text>
          {attribute.keys !== "" ? (
            <text
              x={entity.x + entity.width - ER.padX}
              y={attribute.y}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={ER.rowSize - 1.5}
              fontWeight={600}
              fill="var(--primary)"
              /* Pushed left of the type by the type's own width would need a
                 measurement; instead the key rides one row-height above the
                 baseline's right edge via a dx, which is stable at every
                 font because it is expressed in the row's own units. */
              dx={-4}
              dy={-ER.rowHeight * 0.42}
            >
              {attribute.keys}
            </text>
          ) : null}
        </g>
      ))}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Relationships                                                               */
/* -------------------------------------------------------------------------- */

function Relationship({
  relationship,
  index,
}: {
  relationship: LaidErRelationship;
  index: number;
}): React.JSX.Element {
  const d = relationship.points
    .map((point, at) => `${at === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const stroke = "var(--edge)";
  const dashed = relationship.kind === "non-identifying";

  return (
    <g
      className={`af-er-edge${dashed ? "af-er-edge-dashed" : ""}`}
      style={{ "--er-edge": index } as React.CSSProperties}
    >
      <path
        className="af-er-edge-line"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        /* The dash is the notation, not decoration: a non-identifying
           relationship IS a dashed line. The stylesheet therefore fades this
           kind in rather than drawing it with a dashoffset, which would
           overwrite the dash that carries the meaning. */
        strokeDasharray={dashed ? "6 5" : undefined}
      />
      <EndGlyph end={relationship.fromEnd} stroke={stroke} />
      <EndGlyph end={relationship.toEnd} stroke={stroke} />
      {relationship.label !== undefined ? (
        <g className="af-er-edge-label">
          {/* A plate the canvas colour, so the verb sits ON the diagram
              rather than having a line drawn through it. */}
          <rect
            x={relationship.labelX - relationship.label.length * 3.4 - 6}
            y={relationship.labelY - 9}
            width={relationship.label.length * 6.8 + 12}
            height={18}
            rx={5}
            fill="var(--canvas)"
          />
          <text
            x={relationship.labelX}
            y={relationship.labelY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11.5}
            fill="var(--muted-foreground)"
          >
            {relationship.label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* The canvas                                                                  */
/* -------------------------------------------------------------------------- */

export interface ErDiagramProps {
  file: ErLabFile;
  className?: string;
}

/**
 * Draws an ER document. Pure — it takes a file and renders; there is no
 * state, so it is safe in a server component and the no-JS reader gets the
 * whole diagram.
 */
export function ErDiagram({
  file,
  className,
}: ErDiagramProps): React.JSX.Element {
  const layout = layoutEr(file);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      role="img"
      aria-label={`Entity-relationship diagram: ${file.metadata?.title ?? "untitled"}, ${layout.entities.length} entities`}
      style={{ "--er-wave-cap": WAVE_CAP } as React.CSSProperties}
    >
      {/* Relationships first, so a line can never be drawn over a box it
          merely passes. */}
      {layout.relationships.map((relationship, index) => (
        <Relationship
          key={`${relationship.from}->${relationship.to}-${index}`}
          relationship={relationship}
          index={index}
        />
      ))}
      {layout.entities.map((entity) => (
        <Entity key={entity.id} entity={entity} />
      ))}
    </svg>
  );
}
