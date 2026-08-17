"use client";

/**
 * The read-only flowchart: pure SVG drawn from `layoutFlowchart`'s result.
 * This component computes NO geometry of its own — every x/y it paints comes
 * off the layout, which is what keeps the renderer, the exporter and the
 * check script agreeing. All-SVG for the same three reasons the sequence
 * diagram is (one coordinate system, one dim rule per <g>, the drawing
 * scales as one object); the cost — no native text wrapping — is absorbed by
 * the layout's measured line breaks.
 *
 * PAINT ORDER (SVG has no z-index; document order is stacking order):
 * group frames first (they are context, everything sits ON them), then
 * edges, then edge labels (over the lines they annotate), then nodes (a box
 * must cover any lane that passes behind its row), then the heading.
 *
 * FOCUS: clicking a node emphasises it and keeps its incident edges and
 * their far endpoints lit; clicking an edge keeps its two endpoints lit;
 * everything else recedes on opacity only. Dimming is a class-driven
 * opacity transition (`motion-reduce:transition-none` parks it), so reduced
 * motion costs the model nothing — the complete diagram is already the
 * resting state.
 *
 * MOTION — THE TRACE (styles/flowchart-motion.css carries the full design
 * argument): on first paint the chart reveals along its RANKS — nodes rise
 * in per rank, forward edges draw out of their source rank into their
 * target, back edges fade in whole wearing their loop dash. This component
 * contributes exactly two things to that: the class hooks the stylesheet
 * animates (`af-flow-body`, `af-flow-draw`/`af-flow-fade`, `af-flow-head`,
 * `af-flow-elabel`) and a `--flow-rank` INLINE custom property per element,
 * taken from the layout's own rank (an edge wears its SOURCE's rank — its
 * clock starts when the box it leaves does). Inline style is server-rendered
 * markup, so the rank is present at first paint; the durations are the
 * stylesheet's check-pinned fallbacks; reduced motion is handled entirely by
 * the stylesheet's `prefers-reduced-motion: no-preference` gate, because a
 * first-paint animation cannot be suppressed by a JS-written property. The
 * trace animates the INNER `af-flow-body`/edge parts, never the outer
 * dimmable group, so its `both` fill can never fight the focus dim's opacity
 * transition. The heading and group frames deliberately do not join the
 * trace — they are the map, not the journey, and keeping them still means
 * the drawing is never a blank canvas, on screen or in any GIF frame.
 *
 * MOTION — THE IDLE PULSE (same stylesheet, idle block): once the trace has
 * settled, and only while the app-wide idle-motion preference allows it, a
 * band of light re-walks the forward edges on the trace's own beat. This
 * component contributes only the TRACKS — a display-gated `af-flow-pulse`
 * band trio (tail, glow, head) per forward/self edge, never on back edges (the pulse travels
 * the happy path; a perpetually circling loop would say "stuck"). The gate
 * attribute (`data-af-idle`) is stamped by the VIEWER from the shared
 * preference; this renderer stays a pure function of (layout, focus).
 *
 * Interactivity: nodes and edges are real keyboard-operable controls
 * (role="button", tabIndex, Enter/Space), not bare onClick shapes. The SVG
 * is not aria-hidden; the viewer adds the details dock beside it. Clearing
 * focus belongs to the VIEWER's pane backdrop, same reasoning as the
 * sequence diagram: "empty canvas" is bigger than this element in fit mode.
 */

import { useId } from "react";

// Cross-feature on purpose (the sequence renderer's precedent): the tag-fill
// rebuild is the ONE definition of "a hue at our validated card lightness".
import { resolveTagColor, tagFillCss } from "@/features/editor/lib/node-colors";
import { WashGradient } from "@/components/ui/wash-gradient";
import { TINT_WASH_OPACITY } from "@/lib/tint";
import { cn } from "@/lib/utils";

import type {
  FlowchartLayout,
  LaidFlowEdge,
  LaidFlowNode,
} from "../lib/layout";
import { FLOW } from "../lib/layout";
import { flowPulsePhase } from "../lib/motion";
import {
  arrowHeadPath,
  FLOW_SHAPE_TOKENS,
  roundedPolylinePath,
  shapeGeometry,
} from "../lib/shapes";

/* -------------------------------------------------------------------------- */
/* Focus model                                                                  */
/* -------------------------------------------------------------------------- */

export type FlowchartFocus =
  { kind: "node"; id: string } | { kind: "edge"; index: number } | null;

/**
 * THE focus set: which nodes and edges a focus keeps lit. One function,
 * exported, because the renderer (dimming) and the viewer (announcement +
 * dock) both need the same answer. Returns null for no focus and for a
 * dangling focus (an id or index a re-parse removed) — a focus pointing at
 * nothing must read as no focus.
 */
export function resolveFlowFocus(
  layout: FlowchartLayout,
  focus: FlowchartFocus,
): { nodes: ReadonlySet<string>; edges: ReadonlySet<number> } | null {
  if (focus === null) return null;
  if (focus.kind === "node") {
    if (!layout.nodes.some((n) => n.id === focus.id)) return null;
    const nodes = new Set([focus.id]);
    const edges = new Set<number>();
    for (const edge of layout.edges) {
      if (edge.from === focus.id || edge.to === focus.id) {
        edges.add(edge.index);
        nodes.add(edge.from);
        nodes.add(edge.to);
      }
    }
    return { nodes, edges };
  }
  const edge = layout.edges.find((e) => e.index === focus.index);
  if (edge === undefined) return null;
  return {
    nodes: new Set([edge.from, edge.to]),
    edges: new Set([edge.index]),
  };
}

export interface FlowchartDiagramProps {
  layout: FlowchartLayout;
  title: string;
  /** `metadata.tagColors` — author colour overrides, keyed by tag. */
  tagColors?: Readonly<Record<string, string>>;
  focus: FlowchartFocus;
  /**
   * Sizing in the pane — the sequence diagram's contract verbatim: `"fit"`
   * scales the whole chart into the pane (preserveAspectRatio "meet"); a
   * number is SVG user units per CSS pixel and the pane scrolls.
   */
  zoom: number | "fit";
  onFocusNode: (id: string) => void;
  onFocusEdge: (index: number) => void;
}

/** The one dim rule: outside the focus set, recede on opacity only. */
const DIMMABLE =
  "transition-opacity duration-300 motion-reduce:transition-none";
const DIM = "opacity-25";

export function FlowchartDiagram({
  layout,
  title,
  tagColors,
  focus,
  zoom,
  onFocusNode,
  onFocusEdge,
}: FlowchartDiagramProps): React.JSX.Element {
  const focusSet = resolveFlowFocus(layout, focus);
  const nodeDimmed = (id: string): boolean =>
    focusSet !== null && !focusSet.nodes.has(id);
  const edgeDimmed = (index: number): boolean =>
    focusSet !== null && !focusSet.edges.has(index);
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  const keyActivate =
    (action: () => void) => (event: React.KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        action();
      }
    };

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      {...(zoom === "fit"
        ? { width: "100%", height: "100%" }
        : {
            width: Math.round(layout.width * zoom),
            height: Math.round(layout.height * zoom),
          })}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Flowchart: ${title}. ${layout.nodes.length} nodes, ${layout.edges.length} arrows. Nodes and arrows are buttons — Tab reaches them.`}
      className="af-flow-svg block"
    >
      {/* ---- group frames: context first, everything sits on them ---- */}
      {layout.groups.map((group, index) => (
        <g
          key={`group-${index}`}
          aria-hidden="true"
          className="pointer-events-none"
        >
          <rect
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            rx={10}
            fill={group.tint ?? "var(--canvas)"}
            // Fixed wash opacity, never the document's: a tint strong enough
            // to hide the nodes it frames would defeat the frame.
            fillOpacity={group.tint !== undefined ? TINT_WASH_OPACITY : 0.45}
            stroke="var(--node-border)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <text
            x={group.x + 10}
            y={group.y + FLOW.groupLabelFontSize + 7}
            fontSize={FLOW.groupLabelFontSize}
            fontWeight={600}
            fill="var(--muted-foreground)"
          >
            {group.label}
          </text>
        </g>
      ))}

      {/* ---- edges, then their labels ---- */}
      {layout.edges.map((edge) => (
        <Edge
          key={`edge-${edge.index}`}
          edge={edge}
          sourceRank={nodeById.get(edge.from)?.rank ?? 0}
          fromLabel={nodeById.get(edge.from)?.label ?? edge.from}
          toLabel={nodeById.get(edge.to)?.label ?? edge.to}
          focused={focus?.kind === "edge" && focus.index === edge.index}
          dimmed={edgeDimmed(edge.index)}
          onFocus={() => onFocusEdge(edge.index)}
          onKeyDown={keyActivate(() => onFocusEdge(edge.index))}
        />
      ))}

      {/* ---- nodes ---- */}
      {layout.nodes.map((node) => (
        <Node
          key={node.id}
          node={node}
          tagColors={tagColors}
          focused={focus?.kind === "node" && focus.id === node.id}
          dimmed={nodeDimmed(node.id)}
          onFocus={() => onFocusNode(node.id)}
          onKeyDown={keyActivate(() => onFocusNode(node.id))}
        />
      ))}

      {/* ---- the heading: inside the drawing, so it travels with exports.
            aria-hidden — the <svg>'s aria-label already opens with it. ---- */}
      <g aria-hidden="true" className="pointer-events-none">
        <text
          x={FLOW.marginX}
          y={FLOW.marginTop + FLOW.titleFontSize}
          fontSize={FLOW.titleFontSize}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {layout.heading.titleLines.map((line, index) => (
            <tspan
              key={index}
              x={FLOW.marginX}
              {...(index === 0 ? {} : { dy: FLOW.titleLineHeight })}
            >
              {line}
            </tspan>
          ))}
        </text>
        {layout.heading.descriptionLines.length > 0 ? (
          <text
            x={FLOW.marginX}
            y={
              FLOW.marginTop +
              layout.heading.titleLines.length * FLOW.titleLineHeight +
              FLOW.titleDescriptionGap +
              FLOW.descriptionFontSize
            }
            fontSize={FLOW.descriptionFontSize}
            fill="var(--muted-foreground)"
          >
            {layout.heading.descriptionLines.map((line, index) => (
              <tspan
                key={index}
                x={FLOW.marginX}
                {...(index === 0 ? {} : { dy: FLOW.descriptionLineHeight })}
              >
                {line}
              </tspan>
            ))}
          </text>
        ) : null}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* One node                                                                     */
/* -------------------------------------------------------------------------- */

function Node({
  node,
  tagColors,
  focused,
  dimmed,
  onFocus,
  onKeyDown,
}: {
  node: LaidFlowNode;
  tagColors?: Readonly<Record<string, string>>;
  focused: boolean;
  dimmed: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element {
  /* Colour: the author's tagColors entry wins (the same precedence
     `nodeColorStyle` gives C4 nodes — a residue default must never override
     a colour the author typed); otherwise the shape's audited token pair. */
  const tagColor = resolveTagColor(
    { tags: node.tags === undefined ? undefined : [...node.tags] },
    tagColors,
  );
  const tokens = FLOW_SHAPE_TOKENS[node.shape];
  const fill =
    tagColor !== null ? tagFillCss(tagColor) : `var(${tokens.fill})`;
  const stroke = tagColor ?? `var(${tokens.border})`;
  const geometry = shapeGeometry(node);
  // The surface wash (the C4 canvas's polish layer): a per-instance gradient
  // because a CSS background cannot follow a rhombus — same mechanism as the
  // cylinder/pipe silhouettes. It reads --node-fill/--node-stroke, stamped
  // on the group below, so tagColors overrides recolour the wash for free.
  // useId's delimiters are not valid inside url(#…) — the silhouettes'
  // sanitising rule.
  const washId = `af-flow-wash-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Focus escalates the border to --primary — the same "escalation, not a
  // new colour system" rule the sequence line follows.
  const strokeColor = focused ? "var(--primary)" : stroke;
  const strokeWidth = focused ? 2 : 1.5;

  const textTop = node.cy - node.labelBox.height / 2;
  const ariaLabel =
    `${node.shape} ${node.label}` +
    (node.technology !== undefined ? `, ${node.technology}` : "") +
    (node.description !== undefined ? ". Has details" : "");

  return (
    <g
      className={cn(DIMMABLE, "af-flow-node", dimmed && DIM)}
      data-node-id={node.id}
      /* The trace's beat for this node — the layout's rank, never a render
         index (a barycentre re-order must not re-time the reveal). Inherited
         by the af-flow-body the stylesheet animates. --node-fill/--node-stroke
         feed the wash gradient's stops (components/ui/wash-gradient.tsx),
         exactly how the C4 canvas recolours its wash per node. */
      style={
        {
          "--flow-rank": node.rank,
          "--node-fill": fill,
          "--node-stroke": stroke,
        } as React.CSSProperties
      }
    >
      {/* The animated wrapper. The trace lives on this inner group rather
          than the dimmable outer one so its `both` fill can never hold
          opacity against the focus dim's transition; the hit rect stays
          OUTSIDE it, so keyboard tab targets exist from the first frame
          rather than materialising rank by rank. */}
      <g className="af-flow-body">
        <WashGradient id={washId} />
        {geometry.rect !== undefined ? (
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={geometry.rect.rx}
            fill={`url(#${washId})`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        ) : null}
        {geometry.path !== undefined ? (
          <path
            d={geometry.path}
            fill={`url(#${washId})`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        ) : null}
        {geometry.rails !== undefined
          ? geometry.rails.map((rail, index) => (
              <path
                key={index}
                d={rail}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1}
              />
            ))
          : null}
        <text
          x={node.cx}
          textAnchor="middle"
          fontSize={FLOW.nodeFontSize}
          fontWeight={600}
          fill="var(--node-foreground)"
          className="pointer-events-none"
        >
          {node.lines.map((line, index) => (
            <tspan
              key={index}
              x={node.cx}
              // Baseline sits most of a line-height below the line's top.
              y={textTop + index * FLOW.lineHeight + FLOW.nodeFontSize}
            >
              {line}
            </tspan>
          ))}
        </text>
        {node.technology !== undefined ? (
          <text
            x={node.cx}
            y={
              textTop +
              node.lines.length * FLOW.lineHeight +
              FLOW.metaFontSize +
              1
            }
            textAnchor="middle"
            fontSize={FLOW.metaFontSize}
            fill="var(--node-meta)"
            className="pointer-events-none"
          >
            [{node.technology}]
          </text>
        ) : null}
      </g>
      {/* The whole shape is the click/keyboard target. An invisible rect over
          the bounding box rather than the outline path: a diamond's corners
          are exactly where a pointer aims for it, and a boundary-accurate
          target there is precision nobody asked for. */}
      <rect
        className="af-flow-hit cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        fill="transparent"
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          onFocus();
        }}
        onKeyDown={onKeyDown}
      />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* One edge                                                                     */
/* -------------------------------------------------------------------------- */

function Edge({
  edge,
  sourceRank,
  fromLabel,
  toLabel,
  focused,
  dimmed,
  onFocus,
  onKeyDown,
}: {
  edge: LaidFlowEdge;
  /** The trace's clock for this edge — its SOURCE node's rank. */
  sourceRank: number;
  fromLabel: string;
  toLabel: string;
  focused: boolean;
  dimmed: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element | null {
  if (edge.points.length < 2) return null;
  const d = roundedPolylinePath(edge.points);
  const head = arrowHeadPath(edge.points);
  const stroke = focused ? "var(--primary)" : "var(--edge)";
  const ariaLabel =
    `Arrow: ${fromLabel} to ${toLabel}` +
    (edge.label !== undefined ? ` — ${edge.label}` : "") +
    (edge.back ? " (loops back)" : edge.self ? " (self)" : "");

  return (
    <g
      className={cn(DIMMABLE, "af-flow-edge", dimmed && DIM)}
      data-edge-index={edge.index}
      // The trace draws this edge on its source's beat — layout rank, never
      // a render index. Read by the --flow-edge-at calc in the stylesheet.
      style={
        {
          "--flow-rank": sourceRank,
          /* The idle pulse's own phase — scattered per edge so a resting
             chart reads as traffic rather than as a cascade on a reel. A
             HASH of the edge index, not Math.random(): a re-render must not
             reshuffle a resting chart, and the GIF exporter's determinism is
             pinned. The trace's beat above is untouched. */
          "--flow-jitter": `${flowPulsePhase(edge.index)}ms`,
        } as React.CSSProperties
      }
    >
      {/* Forward and self edges DRAW (af-flow-draw + pathLength 1, so one
          dash unit is the whole polyline); BACK edges FADE (af-flow-fade) —
          a dashoffset draw would overwrite the 6 4 loop dash and a loop must
          never spend a frame looking like a forward arrow. pathLength stays
          off the back edge for the same reason: normalising it would stretch
          the dash out of proportion to every other loop's. */}
      <path
        className={cn(
          edge.back ? "af-flow-fade" : "af-flow-draw",
          /* A dashed line MARCHES, reusing the canvas-wide `af-frame-march`
             (globals.css) rather than a fourth copy of the same six-plus-four
             walk: the frame focus ring, the hero's reply arrow and this loop
             all animate one dash pattern at one speed. The house rule it
             obeys is stated with that keyframe — only a line that is ALREADY
             dashed may march, because a march on a solid arrow reads as async
             — and a flowchart loop qualifies. Ambient, so it is gated with
             the pulse on `data-af-idle` (the stylesheet's idle block); the
             shared class carries its own reduced-motion stop. */
          edge.back && "af-flow-loop-march",
        )}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={focused ? 2 : 1.5}
        // A loop reads differently on purpose: dashed says "back around",
        // without inventing a second arrowhead vocabulary.
        {...(edge.back ? { strokeDasharray: "6 4" } : { pathLength: 1 })}
      />
      <path className="af-flow-head" d={head} fill={stroke} stroke="none" />
      {/* The idle pulse's tracks — tail, glow and head bands that ride this edge
          once per idle period (the idle block in styles/flowchart-motion.css
          carries the design argument). Forward and self edges only: the
          pulse travels the happy path, and a back edge in perpetual motion
          would claim the system is stuck in its retry loop. pathLength=1 so
          the bands' dash maths are fractions of THIS path, the draw's own
          normalisation. Rendered BEFORE the label group, so a guard stays
          legible over passing light; display-gated to nothing unless idle
          motion is on, so SSR and reduced motion never paint a band. */}
      {!edge.back ? (
        <g aria-hidden="true" className="af-flow-pulse pointer-events-none">
          {/* THREE bands, widest and faintest first: the light falls off from
              a sharp head through a glow into a long soft tail, which is what
              makes the pulse read as a graded comet rather than a bead
              sliding along the line. Ordered back-to-front so the head paints
              over its own trail. */}
          <path
            className="af-flow-pulse-band af-flow-pulse-tail"
            d={d}
            pathLength={1}
          />
          <path
            className="af-flow-pulse-band af-flow-pulse-glow"
            d={d}
            pathLength={1}
          />
          <path
            className="af-flow-pulse-band af-flow-pulse-head"
            d={d}
            pathLength={1}
          />
        </g>
      ) : null}
      {edge.labelBox !== null ? (
        <g className="af-flow-elabel pointer-events-none">
          {/* A canvas-coloured backing plate, from the SAME box the layout
              cleared of collisions — the halo is what keeps a guard legible
              when a group wash sits behind it. */}
          <rect
            x={edge.labelBox.x}
            y={edge.labelBox.y}
            width={edge.labelBox.width}
            height={edge.labelBox.height}
            rx={4}
            fill="var(--canvas)"
            fillOpacity={0.88}
          />
          <text
            x={edge.labelBox.x + FLOW.labelPadX}
            fontSize={FLOW.labelFontSize}
            fontStyle="italic"
            fill="var(--muted-foreground)"
          >
            {edge.labelLines.map((line, index) => (
              <tspan
                key={index}
                x={
                  edge.labelBox === null ? 0 : edge.labelBox.x + FLOW.labelPadX
                }
                y={
                  (edge.labelBox === null ? 0 : edge.labelBox.y) +
                  FLOW.labelPadY +
                  index * FLOW.labelLineHeight +
                  FLOW.labelFontSize -
                  2
                }
              >
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ) : null}
      {/* The hit target: the same polyline, invisibly wide. `stroke` hit
          testing only — a filled hit path over an open polyline would claim
          the whole area the line encloses. */}
      <path
        className="af-flow-hit cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ pointerEvents: "stroke" }}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          onFocus();
        }}
        onKeyDown={onKeyDown}
      />
    </g>
  );
}
