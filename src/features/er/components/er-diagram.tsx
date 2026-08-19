/**
 * The ER canvas: one SVG drawn straight from `layoutEr`'s coordinates.
 *
 * SVG RATHER THAN `@xyflow/react`, which the C4 canvas uses. Nothing in an ER
 * diagram is dragged or drilled into — it is a schema you read — so a
 * node-graph runtime would buy panning this canvas gets from its container
 * anyway, and cost the ability to hand the SAME element tree to the SVG
 * exporter. The use-case and flowchart canvases made the same call.
 *
 * WHAT IT DRAWS, and why each part is shaped as it is:
 *
 *   - An ENTITY is a table, not a labelled shape: a tinted header band
 *     carrying the name (and `[technology]` when set), then one row per
 *     column reading `name … [KEYS] type`. All three sit on ONE baseline,
 *     at x positions the layout computed — the first cut nudged the key
 *     badge with a `dy` and landed it on the row above, so `PK` appeared to
 *     belong to the previous column.
 *   - A CONNECTOR is an orthogonal polyline with a crow's foot at each end.
 *     The feet are drawn HERE rather than as SVG `marker` elements, because a
 *     marker takes its orientation from the path's tangent and an ER foot has
 *     to face the box it touches — at the `to` end that is the opposite, and
 *     `orient="auto-start-reverse"` fixes one end while breaking the other.
 *   - The LABEL sits on the middle segment with a canvas-coloured plate
 *     behind it, so a verb never has a line running through it.
 *
 * FOCUS. Clicking an entity dims everything it is not joined to and lights
 * the relationships that touch it, which is the question a reader actually
 * brings to a schema: "what does this table talk to?" The first cut had no
 * focus at all on the argument that an ER box already shows its detail —
 * that was wrong twice over. It ignored `desc`, which is the one thing the
 * box CANNOT show, and it left the fifth canvas as the only one a reader
 * cannot interrogate.
 *
 * SERVER-SAFE. `onFocus` is optional and no hook runs here, so this component
 * renders in a server component and a no-JS reader gets the whole diagram —
 * which is what lets the crawlable example pages ship the SVG in their HTML.
 * `check:seo` cares: an AI crawler does not run JavaScript.
 *
 * MOTION lives in `../styles/er-motion.css` and is opt-out twice. The
 * per-entity stagger is stamped as an inline custom property here because it
 * is SERVER-RENDERED: a first-paint animation cannot wait for JavaScript to
 * write a variable (`usecase/lib/motion.ts` argues this at length).
 */

import type {
  LaidErEnd,
  LaidErEntity,
  LaidErRelationship,
} from "../lib/layout";
import { CHAR_WIDTH_RATIO } from "@/lib/text-metrics";

import { ER, layoutEr } from "../lib/layout";
import type { ErLabFile } from "@/types";

/**
 * What is focused: a table, a relationship, or nothing.
 *
 * A UNION rather than an entity id, because a reader has two questions about
 * a schema and only one is about a table. "What does this table talk to" is
 * answered by focusing the box; "what does THIS line mean" — which
 * cardinality sits on which end, is it identifying — is answered by focusing
 * the line, and a crow's foot is exactly the notation a reader has not
 * memorised. Making only the box clickable left the harder question
 * unanswerable.
 *
 * A relationship is addressed by INDEX, not by its `from`/`to` pair: two
 * tables may be joined more than once (an order has a billing address and a
 * shipping address), and an id pair cannot tell those two lines apart.
 */
export type ErFocus =
  | { kind: "entity"; id: string }
  | { kind: "relationship"; index: number }
  | null;

/** How many columns' worth of stagger before the beat stops growing, so a
 * wide schema compresses instead of trickling in. The flowchart's rank-cap
 * rule, held here in TS and in the stylesheet's `--er-wave-cap`. */
const WAVE_CAP = 6;

/**
 * The plate a relationship label sits on, wide enough for the text.
 *
 * Measured with the SAME character ratio the layout measures every other
 * string with, rather than a hand-tuned multiplier: the previous
 * `length * 6.8 + 14` was a guess that ran narrow on a long verb, so
 * "ships to" overhung its own plate on both sides.
 */
const labelWidth = (label: string): number =>
  Math.max(34, label.length * ER.rowSize * CHAR_WIDTH_RATIO + 18);

/** A rectangle rounded on its TOP corners only — the header band, which has
 * to follow the box's own radius above and sit flush on the rule below. */
function topRoundedPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, height);
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    "Z",
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/* Crow's feet                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One end's glyph, built from the layout's outward direction.
 *
 * The four cardinalities are TWO INDEPENDENT MARKS, which is why this is
 * composed rather than a table of four shapes: a BAR across the line means
 * "at least one", a RING on the line means "zero is allowed", and a FOOT (the
 * three-toed fan) means "many". `one` is a bar; `zero-or-one` a ring and a
 * bar; `one-or-more` a bar and a foot; `zero-or-more` a ring and a foot.
 * Reading them as two marks is how a reader learns them, so the drawing
 * matches the explanation.
 */
function EndGlyph({
  end,
  stroke,
}: {
  end: LaidErEnd;
  stroke: string;
}): React.JSX.Element {
  const { x, y, dx, dy, cardinality } = end;
  const ax = dx * ER.footLength;
  const ay = dy * ER.footLength;
  const px = -dy * ER.footSpread;
  const py = dx * ER.footSpread;

  const many = cardinality === "one-or-more" || cardinality === "zero-or-more";
  const optional =
    cardinality === "zero-or-one" || cardinality === "zero-or-more";

  /* The bar sits further out when a foot shares the end, so the two marks
     read as two marks instead of overlapping into a blob. */
  const barT = many ? 1 : 0.55;
  const bx = x + ax * barT;
  const by = y + ay * barT;

  return (
    <g fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round">
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
          cx={x + ax * (many ? 1.7 : 1.4)}
          cy={y + ay * (many ? 1.7 : 1.4)}
          r={ER.footSpread * 0.6}
          fill="var(--canvas)"
        />
      ) : null}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                    */
/* -------------------------------------------------------------------------- */

function Entity({
  entity,
  state,
  onFocus,
}: {
  entity: LaidErEntity;
  state: "none" | "focused" | "related" | "dimmed";
  onFocus?: (focus: ErFocus) => void;
}): React.JSX.Element {
  const headerY = entity.y + ER.headerHeight;
  const interactive = onFocus !== undefined;
  const border =
    state === "focused"
      ? "var(--primary)"
      : state === "related"
        ? "var(--edge-drift)"
        : "var(--node-border)";

  return (
    <g
      className={["af-er-entity", `af-er-${state}`].join(" ")}
      style={
        { "--er-wave": Math.min(entity.depth, WAVE_CAP) } as React.CSSProperties
      }
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-pressed": state === "focused",
            "aria-label": `${entity.label}: ${entity.attributes.length} columns`,
            onClick: (event: React.MouseEvent) => {
              /* Stopped, or the backdrop clears the focus this click set. */
              event.stopPropagation();
              onFocus(
                state === "focused" ? null : { kind: "entity", id: entity.id },
              );
            },
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onFocus(
                state === "focused" ? null : { kind: "entity", id: entity.id },
              );
            },
          }
        : {})}
    >
      {/* The description is the ONE thing the box cannot draw, so it rides a
          native tooltip as well as the detail panel — a reader who never
          clicks still finds it. */}
      {entity.description !== undefined ? (
        <title>{`${entity.label} — ${entity.description}`}</title>
      ) : null}

      <rect
        x={entity.x}
        y={entity.y}
        width={entity.width}
        height={entity.height}
        rx={12}
        fill="var(--node)"
        stroke={border}
        strokeWidth={state === "focused" ? 2 : 1.2}
        filter="url(#af-er-shadow)"
      />
      {/* A tinted header band, not a bare rule. It is what makes the box read
          as a TABLE rather than a bordered list — the header of every table a
          reader has seen is a band — and it is drawn as a low-opacity fill of
          the accent so every theme gets it from its own palette rather than
          from a hardcoded grey. */}
      <path
        d={topRoundedPath(
          entity.x,
          entity.y,
          entity.width,
          ER.headerHeight,
          12,
        )}
        fill="var(--primary)"
        opacity={state === "focused" ? 0.2 : 0.11}
      />
      {entity.attributes.length > 0 ? (
        <line
          x1={entity.x}
          y1={headerY}
          x2={entity.x + entity.width}
          y2={headerY}
          stroke={border}
          strokeWidth={1.2}
        />
      ) : null}

      <text
        x={entity.x + ER.padX}
        y={entity.y + ER.headerHeight / 2}
        dominantBaseline="central"
        fontSize={ER.labelSize}
        fontWeight={650}
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
          {attribute.description !== undefined ? (
            <title>{`${attribute.name} — ${attribute.description}`}</title>
          ) : null}
          <text
            x={attribute.nameX}
            y={attribute.y}
            dominantBaseline="central"
            fontSize={ER.rowSize}
            fill="var(--node-foreground)"
          >
            {attribute.name}
          </text>
          {attribute.keysX !== null ? (
            <text
              x={attribute.keysX}
              y={attribute.y}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={ER.rowSize - 1.5}
              fontWeight={700}
              letterSpacing={0.3}
              fill="var(--primary)"
            >
              {attribute.keys}
            </text>
          ) : null}
          <text
            x={attribute.typeX}
            y={attribute.y}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={ER.rowSize}
            fill="var(--node-meta)"
          >
            {attribute.type}
          </text>
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
  state,
  onFocus,
}: {
  relationship: LaidErRelationship;
  index: number;
  state: "none" | "lit" | "dimmed";
  onFocus?: (focus: ErFocus) => void;
}): React.JSX.Element {
  const d = relationship.points
    .map((point, at) => `${at === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const stroke = state === "lit" ? "var(--primary)" : "var(--edge)";
  const dashed = relationship.kind === "non-identifying";
  const interactive = onFocus !== undefined;
  const toggle = (): void =>
    onFocus?.(state === "lit" ? null : { kind: "relationship", index });

  return (
    <g
      className={[
        "af-er-edge",
        `af-er-${state}`,
        dashed ? "af-er-edge-dashed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--er-edge": index } as React.CSSProperties}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `Relationship from ${relationship.from} to ${relationship.to}`,
            onClick: (event: React.MouseEvent) => {
              /* Stopped, or the backdrop would clear the focus this click just
                 set: the backdrop is a sibling covering the whole canvas, so
                 the event reaches it on the way up. */
              event.stopPropagation();
              toggle();
            },
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggle();
            },
          }
        : {})}
    >
      {/* A WIDE INVISIBLE HIT PATH. A 1.5px line is not a click target — the
          pointer has to land within a pixel of it — so the same geometry is
          drawn again at 18px and transparent, purely to be hit.
          `pointer-events: stroke` is set explicitly because a transparent
          stroke receives no events by default. */}
      {interactive ? (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          strokeLinejoin="round"
          style={{ cursor: "pointer", pointerEvents: "stroke" }}
        />
      ) : null}
      <path
        className="af-er-edge-line"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={state === "lit" ? 2 : 1.5}
        strokeLinejoin="round"
        /* The dash is the NOTATION, not decoration: a non-identifying
           relationship IS a dashed line. The stylesheet therefore fades this
           kind in rather than drawing it with a dashoffset, which would
           overwrite the dash that carries the meaning. */
        strokeDasharray={dashed ? "6 5" : undefined}
      />
      {/* THE AMBIENT PULSE, a SECOND path over the first rather than a dash on
          the line itself. Dashing the base line would destroy the notation — a
          solid line means identifying and a dashed one means it is not, so
          animating a solid line into a dashed one changes what the diagram
          says about identity. A short travelling segment on top leaves the
          base line exactly as it was and still gives every connector the
          motion the other four canvases have, which
          `new-diagram-type.md` requires: "line connectors are always
          animated". */}
      <path
        className="af-er-edge-pulse"
        d={d}
        fill="none"
        stroke="var(--edge-drift)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <EndGlyph end={relationship.fromEnd} stroke={stroke} />
      <EndGlyph end={relationship.toEnd} stroke={stroke} />
      {relationship.label !== undefined ? (
        <g className="af-er-edge-label">
          {/* A PLATE ON THE NODE SURFACE, outlined, not a bare canvas-coloured
              patch. Three things made the verb hard to read: it was painted in
              `--muted-foreground`, which is the token for text that should
              RECEDE and this text is the only thing naming what a line means;
              the plate was the canvas colour, so on a canvas with a dot grid
              or a gradient the label sat on whatever happened to be behind it;
              and 11.5px with no outline left it competing with the line it
              covers. It is now the node surface with the node's own border —
              the same pair every box on this canvas uses, so it reads as a
              label belonging to the diagram — and the text is
              `--node-foreground`, which that surface is measured against. */}
          <rect
            x={relationship.labelX - labelWidth(relationship.label) / 2}
            y={relationship.labelY - 11}
            width={labelWidth(relationship.label)}
            height={22}
            rx={11}
            fill="var(--node)"
            stroke={state === "lit" ? "var(--primary)" : "var(--node-border)"}
            strokeWidth={1}
          />
          <text
            x={relationship.labelX}
            y={relationship.labelY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={500}
            fill={state === "lit" ? "var(--primary)" : "var(--node-foreground)"}
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
  /** What is focused, or null. Omit both this and `onFocus` for a static,
   * server-rendered diagram. */
  focus?: ErFocus;
  onFocus?: (focus: ErFocus) => void;
}

export function ErDiagram({
  file,
  className,
  focus = null,
  onFocus,
}: ErDiagramProps): React.JSX.Element {
  const layout = layoutEr(file);
  const focusId = focus?.kind === "entity" ? focus.id : null;
  const focusEdge = focus?.kind === "relationship" ? focus.index : null;

  /* Which entities the focused one actually touches. Computed from the
     RELATIONSHIPS rather than from proximity, because "what does this table
     talk to" is the question focus answers and adjacency on the canvas is not
     the same thing. */
  const related = new Set<string>();
  if (focusId !== null) {
    related.add(focusId);
    for (const relationship of layout.relationships) {
      if (relationship.from === focusId) related.add(relationship.to);
      if (relationship.to === focusId) related.add(relationship.from);
    }
  }
  /* Focusing a LINE lights the two tables it joins — the line's whole meaning
     is which two, so dimming both would hide the answer it was clicked for. */
  if (focusEdge !== null) {
    const relationship = layout.relationships[focusEdge];
    if (relationship !== undefined) {
      related.add(relationship.from);
      related.add(relationship.to);
    }
  }

  return (
    <svg
      className={[
        "af-er-canvas",
        focus !== null ? "af-er-has-focus" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      role="img"
      aria-label={`Entity-relationship diagram: ${file.metadata?.title ?? "untitled"}, ${layout.entities.length} entities`}
      style={{ "--er-wave-cap": WAVE_CAP } as React.CSSProperties}
    >
      <defs>
        {/* A soft lift, not a drop shadow — the boxes should read as sitting
            ON the canvas, which is what separates a diagram meant to be
            PRESENTED from one that merely renders (`purpose.md`). */}
        <filter id="af-er-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="1.5"
            stdDeviation="3"
            floodColor="var(--node-foreground)"
            floodOpacity="0.10"
          />
        </filter>
        {/* The focus glow. A blur of the mark merged UNDER the mark itself, so
            the travelling segment keeps its own sharp edge and gains a halo —
            a blur alone would just make it soft and dim. It exists as a
            filter rather than a second stroked path because the halo has to
            follow the same dash offset as the mark, and two paths would need
            their animations kept in step by hand. */}
        <filter id="af-er-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="halo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* THE BACKDROP. A transparent rect over the whole canvas, FIRST so it
          sits under everything, whose only job is to catch a click that hit
          nothing and clear the focus. Without it the only ways out are the
          panel's close button and clicking the focused item again, and neither
          is what a reader reaches for — clicking the empty space around a
          diagram to deselect is the convention every canvas tool shares, and
          its absence reads as the focus being stuck. */}
      {onFocus !== undefined ? (
        <rect
          x={0}
          y={0}
          width={layout.width}
          height={layout.height}
          fill="transparent"
          onClick={() => onFocus(null)}
          /* A click TARGET, not a control: keyboard users clear focus with
             Escape, which the viewer owns, so putting this in the tab order
             would announce "backdrop" for no gain. */
          aria-hidden="true"
        />
      ) : null}

      {/* Relationships first, so a line can never be drawn over a box it
          merely passes. */}
      {layout.relationships.map((relationship, index) => (
        <Relationship
          key={`${relationship.from}->${relationship.to}-${index}`}
          relationship={relationship}
          index={index}
          onFocus={onFocus}
          state={
            focus === null
              ? "none"
              : focusEdge !== null
                ? index === focusEdge
                  ? "lit"
                  : "dimmed"
                : relationship.from === focusId || relationship.to === focusId
                  ? "lit"
                  : "dimmed"
          }
        />
      ))}
      {layout.entities.map((entity) => (
        <Entity
          key={entity.id}
          entity={entity}
          state={
            focus === null
              ? "none"
              : entity.id === focusId
                ? "focused"
                : related.has(entity.id)
                  ? "related"
                  : "dimmed"
          }
          onFocus={onFocus}
        />
      ))}
    </svg>
  );
}
