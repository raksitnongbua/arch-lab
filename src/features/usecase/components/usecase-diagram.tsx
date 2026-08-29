"use client";

/**
 * The read-only use-case diagram: pure SVG drawn from `layoutUseCase`'s
 * result. This component computes NO geometry of its own — every x/y it
 * paints comes off the layout, which is what keeps the renderer, the
 * exporter and the check script agreeing. All-SVG for the flowchart's three
 * reasons (one coordinate system, one dim rule per <g>, the drawing scales
 * as one object); the cost — no native text wrapping — is absorbed by the
 * layout's measured line breaks.
 *
 * PAINT ORDER (SVG has no z-index; document order is stacking order):
 * boundary rectangles first (they are context, everything sits ON them),
 * then edges with their labels, then elements (an ellipse must cover any
 * line that passes behind its row), then the heading.
 *
 * ACTORS ARE STICK FIGURES — head, body, arms, legs (lib/shapes.ts) — the
 * one thing that makes this diagram recognisable at a glance. The label
 * hangs below the figure; lines attach at the torso. The figure, the
 * ellipses and every line share ONE stroke weight (`UC_STROKE`), because a
 * drawing in two pen weights reads as two hands — the exporter draws with
 * the same constant and the check measures the equality on real markup.
 *
 * EDGES, per kind, and the marks are the meaning:
 *   - association     a plain line, NO arrowhead — undirected by type;
 *   - dependency      dashed, a filled head, and the «stereotype» beside it;
 *   - generalization  solid, ending in a HOLLOW (canvas-filled) triangle at
 *                     the parent — filled would read as a plain arrow.
 *
 * FOCUS: clicking an element emphasises it and keeps its incident edges and
 * their far endpoints lit; clicking an edge keeps its two endpoints lit;
 * everything else recedes on opacity only. Dimming is a class-driven
 * opacity transition (`motion-reduce:transition-none` parks it), so reduced
 * motion costs the model nothing.
 *
 * MOTION — THE REVEAL (styles/usecase-motion.css carries the full design
 * argument): one first-paint pass — actors, then the boundary, then the use
 * cases, then the lines — and then stillness. Deliberately QUIETER than the
 * flowchart: no idle pulse, no marching dash, because a use-case diagram
 * has no flow along which light could travel. This component contributes
 * only the class hooks (`af-uc-body`, `af-uc-boundary`, `af-uc-draw` /
 * `af-uc-fade`, `af-uc-head`, `af-uc-elabel`); every duration is a
 * check-pinned stylesheet fallback, and reduced motion is handled entirely
 * by the stylesheet's `prefers-reduced-motion: no-preference` gate. The
 * reveal animates the INNER `af-uc-body`/edge parts, never the outer
 * dimmable group, so its `both` fill can never fight the focus dim. The
 * heading stays still — it is the map, not the journey.
 *
 * Interactivity: elements and edges are real keyboard-operable controls
 * (role="button", tabIndex, Enter/Space). The SVG is not aria-hidden; the
 * viewer adds the details dock beside it. Clearing focus belongs to the
 * VIEWER's pane backdrop, same reasoning as the other canvases.
 */

import { useId } from "react";

// Cross-feature on purpose (the sequence and flowchart renderers'
// precedent): the tag-fill rebuild is the ONE definition of "a hue at our
// validated card lightness".
import { CanvasField } from "@/components/ui/canvas-field";
import {
  resolveTagColor,
  tagFillCss,
  TEXTURE_BY_ROLE,
} from "@/features/editor/lib/node-colors";
import { RoleTextureDefs } from "@/components/ui/role-texture";
import { WashGradient } from "@/components/ui/wash-gradient";
import { textureFill } from "@/lib/role-texture";
import { TINT_WASH_OPACITY } from "@/lib/tint";
import { cn } from "@/lib/utils";

import type {
  LaidUseCaseActor,
  LaidUseCaseEdge,
  LaidUseCaseElement,
  LaidUseCaseEllipse,
  UseCaseLayout,
} from "../lib/layout";
import { UC } from "../lib/layout";
import { usecaseBreathPhase } from "../lib/motion";
import {
  actorFigure,
  BOUNDARY_RADIUS,
  DEPENDENCY_DASH,
  dependencyHeadPath,
  generalizationTrianglePath,
  polylinePath,
  focusRing,
  UC_FOCUS_STROKE,
  UC_HIT_STROKE,
  UC_STROKE,
  USECASE_KIND_TOKENS,
  USECASE_ROLE_BY_KIND,
} from "../lib/shapes";

/* -------------------------------------------------------------------------- */
/* Focus model                                                                  */
/* -------------------------------------------------------------------------- */

export type UseCaseFocus =
  { kind: "element"; id: string } | { kind: "edge"; index: number } | null;

/**
 * THE focus set: which elements and edges a focus keeps lit. One function,
 * exported, because the renderer (dimming) and the viewer (announcement +
 * dock) both need the same answer. Returns null for no focus and for a
 * dangling focus — a focus pointing at nothing must read as no focus.
 */
export function resolveUseCaseFocus(
  layout: UseCaseLayout,
  focus: UseCaseFocus,
): { elements: ReadonlySet<string>; edges: ReadonlySet<number> } | null {
  if (focus === null) return null;
  if (focus.kind === "element") {
    if (!layout.elements.some((e) => e.id === focus.id)) return null;
    const elements = new Set([focus.id]);
    const edges = new Set<number>();
    for (const edge of layout.edges) {
      if (edge.from === focus.id || edge.to === focus.id) {
        edges.add(edge.index);
        elements.add(edge.from);
        elements.add(edge.to);
      }
    }
    return { elements, edges };
  }
  const edge = layout.edges.find((e) => e.index === focus.index);
  if (edge === undefined) return null;
  return {
    elements: new Set([edge.from, edge.to]),
    edges: new Set([edge.index]),
  };
}

/** A reader-facing name for an edge's kind — one table, shared by the aria
 * labels here and the viewer's announcements/dock. */
export const USECASE_EDGE_KIND_LABEL: Record<LaidUseCaseEdge["kind"], string> =
  {
    association: "association",
    dependency: "dependency",
    generalization: "generalization",
  };

export interface UseCaseDiagramProps {
  layout: UseCaseLayout;
  title: string;
  /** `metadata.tagColors` — author colour overrides, keyed by tag. */
  tagColors?: Readonly<Record<string, string>>;
  focus: UseCaseFocus;
  /** The sequence/flowchart sizing contract verbatim: `"fit"` scales the
   * whole diagram into the pane; a number is SVG units per CSS pixel. */
  zoom: number | "fit";
  onFocusElement: (id: string) => void;
  onFocusEdge: (index: number) => void;
}

/** The one dim rule: outside the focus set, recede on opacity only. */
const DIMMABLE =
  "transition-opacity duration-300 motion-reduce:transition-none";
const DIM = "opacity-25";

export function UseCaseDiagram({
  layout,
  title,
  tagColors,
  focus,
  zoom,
  onFocusElement,
  onFocusEdge,
}: UseCaseDiagramProps): React.JSX.Element {
  const focusSet = resolveUseCaseFocus(layout, focus);
  const elementDimmed = (id: string): boolean =>
    focusSet !== null && !focusSet.elements.has(id);
  const edgeDimmed = (index: number): boolean =>
    focusSet !== null && !focusSet.edges.has(index);
  const elementById = new Map(layout.elements.map((e) => [e.id, e]));

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
      aria-label={`Use-case diagram: ${title}. ${layout.elements.length} elements, ${layout.edges.length} relationships. Elements and lines are buttons — Tab reaches them.`}
      className="af-uc-svg block"
    >
      {/* THE WELL'S FIELD, under everything the diagram draws. In the
          diagram's OWN coordinates, so it pans, scrolls and zooms with the
          drawing rather than sitting still while the drawing moves over it
          — components/ui/canvas-field.tsx carries the measurement that
          rules out a ground painted on the pane. */}
      <CanvasField
        id="af-field-usecase"
        width={layout.width}
        height={layout.height}
      />
      {/* The role textures, once for the whole canvas — the shared-def rule in
          components/ui/role-texture.tsx. Inert under every theme but `eink`. */}
      <RoleTextureDefs />
      {/* ---- boundaries: context first, everything sits on them ---- */}
      {layout.boundaries.map((boundary, index) => (
        <g
          key={`boundary-${index}`}
          aria-hidden="true"
          className="af-uc-boundary pointer-events-none"
        >
          <rect
            x={boundary.x}
            y={boundary.y}
            width={boundary.width}
            height={boundary.height}
            rx={BOUNDARY_RADIUS}
            fill={boundary.tint ?? "var(--canvas)"}
            // Fixed wash opacity, never the document's: a tint strong
            // enough to hide the ellipses it frames would defeat the frame.
            fillOpacity={boundary.tint !== undefined ? TINT_WASH_OPACITY : 0.45}
            // SOLID border, unlike the flowchart's dashed group frame: the
            // system boundary is UML's own mark and dashed already means
            // «include»/«extend» on this canvas.
            stroke="var(--node-border)"
            strokeWidth={UC_STROKE}
          />
          {/* The title sits in its own band INSIDE the top border — the
              layout reserves boundaryPadTop for it, so it can collide with
              neither the border it names nor the members it encloses (the
              flowchart's group label sat on the dashed line; this one is
              placed from a measured box the check script tests). */}
          <text
            x={boundary.labelBox.x}
            y={boundary.labelBox.y + UC.boundaryTitleFontSize}
            fontSize={UC.boundaryTitleFontSize}
            fontWeight={600}
            fill="var(--muted-foreground)"
          >
            {boundary.label}
          </text>
        </g>
      ))}

      {/* ---- edges, then their labels ---- */}
      {layout.edges.map((edge) => (
        <Edge
          key={`edge-${edge.index}`}
          edge={edge}
          fromLabel={elementById.get(edge.from)?.label ?? edge.from}
          toLabel={elementById.get(edge.to)?.label ?? edge.to}
          focused={focus?.kind === "edge" && focus.index === edge.index}
          dimmed={edgeDimmed(edge.index)}
          onFocus={() => onFocusEdge(edge.index)}
          onKeyDown={keyActivate(() => onFocusEdge(edge.index))}
        />
      ))}

      {/* ---- elements ---- */}
      {layout.elements.map((element) =>
        element.kind === "actor" ? (
          <Actor
            key={element.id}
            element={element}
            tagColors={tagColors}
            focused={focus?.kind === "element" && focus.id === element.id}
            dimmed={elementDimmed(element.id)}
            onFocus={() => onFocusElement(element.id)}
            onKeyDown={keyActivate(() => onFocusElement(element.id))}
          />
        ) : (
          <UseCaseNode
            key={element.id}
            element={element}
            tagColors={tagColors}
            focused={focus?.kind === "element" && focus.id === element.id}
            dimmed={elementDimmed(element.id)}
            onFocus={() => onFocusElement(element.id)}
            onKeyDown={keyActivate(() => onFocusElement(element.id))}
          />
        ),
      )}

      {/* ---- the heading: inside the drawing, so it travels with exports.
            aria-hidden — the <svg>'s aria-label already opens with it. ---- */}
      <g aria-hidden="true" className="pointer-events-none">
        <text
          x={UC.marginX}
          y={UC.marginTop + UC.titleFontSize}
          fontSize={UC.titleFontSize}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {layout.heading.titleLines.map((line, index) => (
            <tspan
              key={index}
              x={UC.marginX}
              {...(index === 0 ? {} : { dy: UC.titleLineHeight })}
            >
              {line}
            </tspan>
          ))}
        </text>
        {layout.heading.descriptionLines.length > 0 ? (
          <text
            x={UC.marginX}
            y={
              UC.marginTop +
              layout.heading.titleLines.length * UC.titleLineHeight +
              UC.titleDescriptionGap +
              UC.descriptionFontSize
            }
            fontSize={UC.descriptionFontSize}
            fill="var(--muted-foreground)"
          >
            {layout.heading.descriptionLines.map((line, index) => (
              <tspan
                key={index}
                x={UC.marginX}
                {...(index === 0 ? {} : { dy: UC.descriptionLineHeight })}
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
/* Shared element chrome                                                       */
/* -------------------------------------------------------------------------- */

/** The author's tagColors entry beats the kind's audited token pair — the
 * same precedence every other canvas gives (`nodeColorStyle`). */
function elementPaint(
  element: LaidUseCaseElement,
  tagColors?: Readonly<Record<string, string>>,
): { fill: string; stroke: string } {
  const tagColor = resolveTagColor(
    { tags: element.tags === undefined ? undefined : [...element.tags] },
    tagColors,
  );
  const tokens = USECASE_KIND_TOKENS[element.kind];
  return {
    fill: tagColor !== null ? tagFillCss(tagColor) : `var(${tokens.fill})`,
    stroke: tagColor ?? `var(${tokens.border})`,
  };
}

function HitRect({
  element,
  ariaLabel,
  onFocus,
  onKeyDown,
}: {
  element: LaidUseCaseElement;
  ariaLabel: string;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element {
  // The bounding box is the target, not the outline: an ellipse's corners
  // and the air between a figure's legs are exactly where a pointer aims.
  // The RING it reveals is shaped, though — see `focusRing`.
  const ring = focusRing(element);
  return (
    <>
      <rect
        className="af-uc-hit cursor-pointer focus-visible:outline-none"
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
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
      {/* The focus ring, FOLLOWING THE SHAPE — a bigger ellipse for a use
          case, a capsule for an actor. It sits AFTER the hit target because
          CSS reveals it with a sibling combinator, and it is inert to the
          pointer so it can never steal the click from the target it marks.
          See `focusRing` for why a CSS outline could not do this. */}
      {ring.kind === "ellipse" ? (
        <ellipse
          aria-hidden="true"
          className="af-uc-ring pointer-events-none"
          cx={ring.cx}
          cy={ring.cy}
          rx={ring.rx}
          ry={ring.ry}
        />
      ) : (
        <rect
          aria-hidden="true"
          className="af-uc-ring pointer-events-none"
          x={ring.x}
          y={ring.y}
          width={ring.width}
          height={ring.height}
          rx={ring.rx}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* One actor                                                                    */
/* -------------------------------------------------------------------------- */

function Actor({
  element,
  tagColors,
  focused,
  dimmed,
  onFocus,
  onKeyDown,
}: {
  element: LaidUseCaseActor;
  tagColors?: Readonly<Record<string, string>>;
  focused: boolean;
  dimmed: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element {
  const paint = elementPaint(element, tagColors);
  const strokeColor = focused ? "var(--primary)" : paint.stroke;
  const figure = actorFigure(element);
  const ariaLabel =
    `actor ${element.label}` +
    (element.technology !== undefined ? `, ${element.technology}` : "") +
    (element.description !== undefined ? ". Has details" : "");

  return (
    <g
      className={cn(DIMMABLE, "af-uc-actor", dimmed && DIM)}
      data-element-id={element.id}
    >
      <g className="af-uc-body">
        {/* Head filled with the kind's fill so the figure carries the same
            colour identity as every other element, limbs in the border ink.

            DELIBERATELY UNTEXTURED, and it is the one element on this canvas
            that is. The texture channel exists to carry identity where hue
            cannot — and an actor is already the most strongly differentiated
            GEOMETRY in the drawing: nothing else here is a stick figure. The
            only fillable part is an 18px head, which a `person` stipple at an
            8px pitch would cross about twice, putting two dots on a face; and
            the head is oversized precisely because it is the figure's
            "friendly" cue (see `actorFigure`), which speckling undoes. Adding
            a second differentiator to a meaning that already has one is the
            failure `lib/role-texture.ts` warns about. */}
        <circle
          cx={figure.head.cx}
          cy={figure.head.cy}
          r={figure.head.r}
          fill={paint.fill}
          stroke={strokeColor}
          strokeWidth={UC_STROKE}
        />
        {figure.strokes.map((d, index) => (
          <path
            key={index}
            d={d}
            fill="none"
            stroke={strokeColor}
            strokeWidth={UC_STROKE}
            strokeLinecap="round"
          />
        ))}
        {/* The label is on the CANVAS, not on a fill — foreground ink. */}
        <text
          x={element.cx}
          textAnchor="middle"
          fontSize={UC.nodeFontSize}
          fontWeight={600}
          fill="var(--foreground)"
          className="pointer-events-none"
        >
          {element.lines.map((line, index) => (
            <tspan
              key={index}
              x={element.cx}
              y={element.labelBox.y + index * UC.lineHeight + UC.nodeFontSize}
            >
              {line}
            </tspan>
          ))}
        </text>
        {element.technology !== undefined ? (
          <text
            x={element.cx}
            y={
              element.labelBox.y +
              element.lines.length * UC.lineHeight +
              UC.metaFontSize +
              1
            }
            textAnchor="middle"
            fontSize={UC.metaFontSize}
            fill="var(--muted-foreground)"
            className="pointer-events-none"
          >
            [{element.technology}]
          </text>
        ) : null}
      </g>
      <HitRect
        element={element}
        ariaLabel={ariaLabel}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* One use case                                                                 */
/* -------------------------------------------------------------------------- */

function UseCaseNode({
  element,
  tagColors,
  focused,
  dimmed,
  onFocus,
  onKeyDown,
}: {
  element: LaidUseCaseEllipse;
  tagColors?: Readonly<Record<string, string>>;
  focused: boolean;
  dimmed: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element {
  const paint = elementPaint(element, tagColors);
  // The surface wash (the C4 canvas's polish layer): a per-instance
  // gradient because a CSS background cannot follow an ellipse — the same
  // mechanism as the flowchart's rhombus. It reads --node-fill/--node-stroke
  // stamped on the group, so tagColors overrides recolour the wash for free.
  // useId's delimiters are not valid inside url(#…) — the house sanitising.
  const washId = `af-uc-wash-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // Read through the kind→role table the exporter already resolves colours
  // with, never typed here: the geometry channel and the colour channel must
  // name the same role or a use case reads as one thing and paints as another.
  const texture = TEXTURE_BY_ROLE[USECASE_ROLE_BY_KIND[element.kind]];
  const strokeColor = focused ? "var(--primary)" : paint.stroke;
  const textTop = element.cy - element.labelBox.height / 2;
  const ariaLabel =
    `use case ${element.label}` +
    (element.technology !== undefined ? `, ${element.technology}` : "") +
    (element.description !== undefined ? ". Has details" : "");

  return (
    <g
      className={cn(DIMMABLE, "af-uc-node", dimmed && DIM)}
      data-element-id={element.id}
      style={
        {
          "--node-fill": paint.fill,
          "--node-stroke": paint.stroke,
        } as React.CSSProperties
      }
    >
      <g className="af-uc-body">
        <WashGradient id={washId} />
        <ellipse
          cx={element.cx}
          cy={element.cy}
          rx={element.rx}
          ry={element.ry}
          fill={`url(#${washId})`}
          stroke={strokeColor}
          strokeWidth={focused ? UC_FOCUS_STROKE : UC_STROKE}
        />
        {/* THE ROLE TEXTURE, over the wash and under the label — the gantt
            hatch's arrangement. The texture is read through the SAME kind→role
            table the exporter resolves its colours with, so the ellipse cannot
            wear `internal`'s blue and some other role's geometry. A second
            ellipse on the identical cx/cy/rx/ry rather than a `clipPath`: one
            geometry, and no clip to keep in step when the layout resizes a
            node. Inert to the pointer — `HitRect` below owns the input. */}
        {texture !== "plain" ? (
          <ellipse
            cx={element.cx}
            cy={element.cy}
            rx={element.rx}
            ry={element.ry}
            fill={textureFill(texture)}
            pointerEvents="none"
          />
        ) : null}
        <text
          x={element.cx}
          textAnchor="middle"
          fontSize={UC.nodeFontSize}
          fontWeight={600}
          fill="var(--node-foreground)"
          className="pointer-events-none"
        >
          {element.lines.map((line, index) => (
            <tspan
              key={index}
              x={element.cx}
              y={textTop + index * UC.lineHeight + UC.nodeFontSize}
            >
              {line}
            </tspan>
          ))}
        </text>
        {element.technology !== undefined ? (
          <text
            x={element.cx}
            y={
              textTop +
              element.lines.length * UC.lineHeight +
              UC.metaFontSize +
              1
            }
            textAnchor="middle"
            fontSize={UC.metaFontSize}
            fill="var(--node-meta)"
            className="pointer-events-none"
          >
            [{element.technology}]
          </text>
        ) : null}
      </g>
      <HitRect
        element={element}
        ariaLabel={ariaLabel}
        onFocus={onFocus}
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
  fromLabel,
  toLabel,
  focused,
  dimmed,
  onFocus,
  onKeyDown,
}: {
  edge: LaidUseCaseEdge;
  fromLabel: string;
  toLabel: string;
  focused: boolean;
  dimmed: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGElement>) => void;
}): React.JSX.Element | null {
  if (edge.points.length < 2) return null;
  const d = polylinePath(edge.points);
  const stroke = focused ? "var(--primary)" : "var(--edge)";
  const label = edge.labelLines.join(" ");
  const ariaLabel =
    `${USECASE_EDGE_KIND_LABEL[edge.kind]}: ${fromLabel} ${
      edge.kind === "generalization" ? "is a" : "to"
    } ${toLabel}` + (label === "" ? "" : ` — ${label}`);

  return (
    <g
      className={cn(DIMMABLE, "af-uc-edge", dimmed && DIM)}
      data-edge-index={edge.index}
      style={
        {
          /* The breath's own phase, scattered per edge so a resting diagram
             reads as a system in use rather than every association swelling in
             unison. A HASH of the edge index, never Math.random(): a re-render
             must not reshuffle a resting diagram, and the exporter must stay
             deterministic. */
          "--uc-breath-phase": `${usecaseBreathPhase(edge.index)}ms`,
        } as React.CSSProperties
      }
    >
      {/* Solid lines DRAW (pathLength 1, so one dash unit is the whole
          line); the dashed dependency FADES — a dashoffset draw would
          overwrite its «include»/«extend» dash, and a dependency must never
          spend a frame looking like a plain association. */}
      <path
        className={cn(
          edge.kind === "dependency" ? "af-uc-fade" : "af-uc-draw",
          /* A dashed line MARCHES, and only a dashed line may — the rule
             stated beside `af-frame-march` in globals.css, because a march on
             a solid line reads as async. A dependency is the only dashed edge
             here, so it is the only one that walks. Ambient, hence gated with
             the breath on `data-af-idle`. */
          edge.kind === "dependency" && "af-uc-march",
        )}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={focused ? UC_FOCUS_STROKE : UC_STROKE}
        {...(edge.kind === "dependency"
          ? { strokeDasharray: DEPENDENCY_DASH }
          : { pathLength: 1 })}
      />
      {/* The idle drift's tracks — an association only, and TWO of them:
          identical bands travelling opposite ways at one constant speed, so
          the pair has no net direction. That is what lets an undirected
          association carry travelling light at all; a single band would state a
          direction the relationship does not have. An in-place opacity swell
          came first and read as a blink rather than as motion.
          Rendered before the label so a multiplicity stays legible through the
          glow; display-gated to nothing unless idle motion is on, so SSR and
          reduced motion never paint it. */}
      {edge.kind === "association" ? (
        <>
          <path
            aria-hidden="true"
            className="af-uc-breath af-uc-drift-out pointer-events-none"
            d={d}
            pathLength={1}
          />
          <path
            aria-hidden="true"
            className="af-uc-breath af-uc-drift-back pointer-events-none"
            d={d}
            pathLength={1}
          />
        </>
      ) : null}
      {edge.kind === "dependency" ? (
        <path
          className="af-uc-head"
          d={dependencyHeadPath(edge.points)}
          fill={stroke}
          stroke="none"
        />
      ) : null}
      {edge.kind === "generalization" ? (
        // HOLLOW: canvas fill under the edge's stroke — the UML "is-a"
        // mark. A filled triangle here would be a plain arrow.
        <path
          className="af-uc-head"
          d={generalizationTrianglePath(edge)}
          fill="var(--canvas)"
          stroke={stroke}
          strokeWidth={UC_STROKE}
          strokeLinejoin="round"
        />
      ) : null}
      {edge.labelBox !== null ? (
        <g className="af-uc-elabel pointer-events-none">
          {/* A canvas-coloured backing plate, from the SAME box the layout
              cleared of collisions — keeps a multiplicity legible over a
              boundary wash. */}
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
            x={edge.labelBox.x + UC.labelPadX}
            fontSize={UC.labelFontSize}
            fontStyle="italic"
            fill="var(--muted-foreground)"
          >
            {edge.labelLines.map((line, index) => (
              <tspan
                key={index}
                x={edge.labelBox === null ? 0 : edge.labelBox.x + UC.labelPadX}
                y={
                  (edge.labelBox === null ? 0 : edge.labelBox.y) +
                  UC.labelPadY +
                  index * UC.labelLineHeight +
                  UC.labelFontSize -
                  2
                }
              >
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ) : null}
      {/* The hit target: the same line, invisibly wide. `stroke` hit
          testing only — a filled hit path over an open polyline would claim
          the whole area the line encloses. */}
      <path
        className="af-uc-hit cursor-pointer focus-visible:outline-none"
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={UC_HIT_STROKE}
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
      {/* The edge's focus ring is a HALO ALONG THE LINE, not a box round its
          bounding box — an edge's shape is its path, and a diagonal
          association's bounding box is a rectangle covering half the diagram.
          After the hit target, for the sibling reveal; inert to the pointer. */}
      <path
        aria-hidden="true"
        className="af-uc-ring pointer-events-none"
        d={d}
        fill="none"
      />
    </g>
  );
}
