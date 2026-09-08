/**
 * The data dictionary canvas: one SVG drawn from `layoutDict`'s coordinates.
 *
 * SVG, not an HTML table, and the choice is not obvious — this is the one kind
 * here whose content genuinely is tabular, and `<table>` would give wrapping
 * and column sizing for free. It is SVG anyway because everything downstream
 * of this file assumes it: the share image, the PNG and SVG exports and the
 * `/demo` preview all render the same element tree, and an HTML table would
 * need a second renderer to produce any of them. The cost is that the layout
 * has to solve column widths itself, which is why `lib/layout.ts` measures.
 *
 * WHAT IT DRAWS. A section heading band, a column-header row, then one row per
 * field: name, type, flag badges, the wrapped meaning, and the source. `values`
 * and `example` sit UNDER the meaning rather than in columns of their own —
 * they are read with the description, not scanned down like a name, and giving
 * them columns would have taken 200px from the one column that needs it.
 *
 * FLAGS ARE BADGES, not text, and `pii` is drawn loudest. The consequence of
 * missing a `required` is a bug; the consequence of missing a `pii` is legal,
 * so it gets the one colour on this canvas that is allowed to shout.
 *
 * SERVER-SAFE and pure: no hooks, no state. A no-JS reader gets the whole
 * dictionary, which for this kind matters more than for any other — a
 * dictionary is a reference document, and a reference that needs JavaScript is
 * one a search engine cannot quote.
 *
 * THE ONE INTERACTIVE THING IT DRAWS is the reorder chip, and only when the
 * viewer hands it a `reorder` surface — a static render, an export and the
 * `/demo` preview pass nothing and get the table they always got.
 */

import { DIAGRAM_SURFACE_RADIUS } from "@/lib/diagram-surface";
// The house glyph-width estimate, which the layout's own columns are measured
// with — so the title's press target ends where its words do.
import { CHAR_WIDTH_RATIO } from "@/lib/text-metrics";
import { cn } from "@/lib/utils";
import type { DictLabFile } from "@/types";

import {
  BADGE,
  COLUMN_LABEL,
  DICT,
  DICT_HANDLE,
  dictHandleChip,
  layoutDict,
} from "../lib/layout";
import type { DictColumn, LaidDictField } from "../lib/layout";

/**
 * Which token paints each flag.
 *
 * SOLID FILLS WITH THEIR OWN FOREGROUND, not a tinted wash. The first cut drew
 * every badge as its colour at 16% opacity with the SAME colour as the text,
 * which is a contrast failure by construction — text and background differing
 * only in alpha can never reach a usable ratio, and on the dark themes the
 * `required` badge came out as grey-on-grey. Each entry now pairs a fill with
 * the foreground token that theme already guarantees against it, which is the
 * pairing `check:themes` measures for every other surface.
 *
 * `derived` and `deprecated` are deliberately the QUIET pair — they say
 * "handle with care", not "look here" — so they take the muted surface rather
 * than a colour, and are the only two that read as outlines.
 */
const FLAG_PAINT: Readonly<
  Record<string, { mark: string; solid?: boolean; text?: string }>
> = {
  required: { mark: "var(--primary)" },
  unique: { mark: "var(--accent)" },
  derived: { mark: "var(--node-meta)" },
  /* THE ONE SOLID BADGE. Its fill and its foreground are a pair the theme
     already guarantees against each other, and it is solid because the
     consequence of missing a `pii` is legal rather than a bug — this is the
     one thing on the canvas allowed to shout. */
  pii: {
    mark: "var(--destructive)",
    solid: true,
    text: "var(--destructive-foreground)",
  },
  deprecated: { mark: "var(--node-meta)" },
};

/* `BADGE` is imported from the layout, not declared here: the column width is
   measured from the same numbers this draws with, which is the only thing that
   keeps a badge run inside the column reserved for it. */

/* -------------------------------------------------------------------------- */
/* The reorder surface                                                        */
/* -------------------------------------------------------------------------- */

/** Which way a block trades places with its neighbour. Named for the READING
 * ORDER, because that is what the text records — the same two words the
 * gesture module writes with. */
export type DictReorderDirection = "earlier" | "later";

/** What a reorder addresses: a section by its label, a field by its name
 * nested under its section's, because a field name is unique inside its
 * section and not across the file. */
export type DictReorderTarget =
  | { kind: "section"; sectionLabel: string }
  | { kind: "field"; sectionLabel: string; fieldName: string };

/**
 * What the canvas needs in order to draw a reorder control, as the VIEWER
 * assembles it.
 *
 * DECLARED HERE RATHER THAN IMPORTED from the gesture module that honours it,
 * so the dependency runs one way: the playground knows about the dictionary
 * feature and not the reverse. Both sides are structural, so the host's
 * `dictReorderRefusal` binding satisfies `refusal` without either file naming
 * the other.
 *
 * `onPress` IS CALLED FOR AN UNAVAILABLE CONTROL TOO. This renderer decides
 * how a refused control LOOKS; what a press on one does — say the reason out
 * loud — is policy, and policy lives with the live region in the viewer.
 */
export interface DictReorderSurface {
  /** Why this control cannot act, or `null` when it can. The sentence is the
   * gesture module's own, so a reason read off a handle matches one read
   * anywhere else. */
  refusal: (
    target: DictReorderTarget,
    direction: DictReorderDirection,
  ) => string | null;
  onPress: (target: DictReorderTarget, direction: DictReorderDirection) => void;
}

/* -------------------------------------------------------------------------- */
/* The heading surface                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What the canvas needs in order to make the drawn title the affordance for
 * rewriting it, as the VIEWER assembles it.
 *
 * THE TITLE, AND NOTHING ELSE. The gesture writes the shared header's `title`
 * and `description` lines, but this canvas draws only a title band — the
 * "description" in `layoutDict` is a FIELD's meaning, the table's widest
 * column, and has nothing to do with the document's own. A description box
 * here would edit a line the reader cannot see the effect of, which is why
 * `CANVAS_EDIT_OFFERS` promises the title alone for this notation.
 *
 * DECLARED HERE RATHER THAN IMPORTED, on `DictReorderSurface`'s terms above:
 * both sides are structural, so the host satisfies this without the dictionary
 * naming the playground.
 *
 * THE FORM IS THE VIEWER'S. This renderer is pure and server-renderable, which
 * is what lets the crawlable pages ship the whole table; an editor is state.
 * What it contributes is the one thing only the layout knows — where the title
 * is drawn.
 */
export interface DictRetitleSurface {
  /** Begin editing — pressing the drawn title. */
  onOpen: () => void;
  /** The viewer's field while it is open, and `null` while the title is only
   *  pressable. */
  form: React.ReactNode | null;
}

/**
 * The document title's type size, in LAYOUT UNITS.
 *
 * NAMED because the press target has to be measured from the size the title is
 * actually drawn at: an estimate off a different size gives a control that
 * ends before the words do, and a reader pointing at the tail of their own
 * title would hit the canvas instead.
 */
const DICT_TITLE_SIZE = 22;

/**
 * The room the title's editor asks for, in LAYOUT UNITS — a field and its
 * Apply row.
 *
 * CLAMPED INTO THE DRAWING rather than trusted: an `<svg>` clips its viewport,
 * so an editor hanging past the edge of a one-section dictionary would have
 * its Apply button shaved off with nothing on screen to say so. The form
 * scrolls inside whatever room it is given.
 *
 * MAINTAINED BY HAND against `HEADING_EDITOR` in `usecase-diagram.tsx`, which
 * a feature may not deep-import from. Only the reasoning is shared — that
 * canvas edits two lines and needs the room for both.
 */
const DICT_TITLE_EDITOR = { width: 300, height: 112 };

/**
 * A handle's identity in the DOM, so focus can be put back on the control the
 * reader pressed after the row it moves has been re-rendered somewhere else.
 *
 * JSON RATHER THAN A JOINED STRING: a section label may contain any character
 * a reader can type, separator included, and two different targets colliding
 * on one key would move focus to the wrong row.
 */
export function dictHandleKey(
  target: DictReorderTarget,
  direction: DictReorderDirection,
): string {
  return JSON.stringify(
    target.kind === "section"
      ? [target.kind, target.sectionLabel, direction]
      : [target.kind, target.sectionLabel, target.fieldName, direction],
  );
}

/** The chevrons, drawn on `DICT_HANDLE.grid`. Inline paths rather than a
 * lucide import: this glyph scales with the table's own units rather than
 * arriving at a fixed pixel size, and two chevrons is less code than the
 * import that would bring them. */
const HANDLE_GLYPH: Readonly<Record<DictReorderDirection, string>> = {
  earlier: "M4 10.25 L8 6.25 L12 10.25",
  later: "M4 5.75 L8 9.75 L12 5.75",
};

/**
 * What pressing does, as the accessible name — never a state word.
 *
 * THE NAME IS THE ONLY CHANNEL a screen-reader or voice-control user has,
 * which is the argument `canvas-lock-button.tsx` makes for its own wordless
 * padlock: with no printed label beside it, an icon-only control that is
 * named for what it IS rather than what it DOES leaves the reader guessing
 * that pressing is even allowed. It names the thing being moved as well as the
 * direction, because a dictionary offers as many of these as it has rows.
 */
function handleAction(
  target: DictReorderTarget,
  direction: DictReorderDirection,
): string {
  return target.kind === "section"
    ? `Move section “${target.sectionLabel}” ${direction} in the dictionary`
    : `Move field “${target.fieldName}” ${direction} in “${target.sectionLabel}”`;
}

/**
 * One band's or row's pair of controls.
 *
 * NATIVE `<button>`s IN A `foreignObject`, and this is the one place the
 * dictionary canvas departs from its neighbours — read this before "fixing" it
 * to the button-role shapes the flowchart, sequence and ER canvases use. Those
 * canvases give that role to the DRAWING: a node, an arrow, an entity box IS
 * the control, so it cannot be anything but a shape, and `@/lib/key-activate`
 * exists to give those shapes the Enter and Space the role promises. This chip
 * is not part of the drawing. It is a two-button toolbar floated over a table,
 * and a real button brings the keyboard behaviour, the focus ring the theme
 * already paints, the hover states and the `aria-disabled` semantics that would
 * otherwise all be re-implemented on a `<rect>`.
 *
 * That also keeps the canvas out of `check:view-input`'s selection sweep
 * honestly rather than by exemption: that sweep is every diagram component
 * that makes a SHAPE a button, and it asks each one for a focus selection and
 * a way to deselect. This dictionary has neither and must not grow them — the
 * viewer's header argues why a dictionary has no focus mode at all.
 *
 * IT NEVER REACHES AN EXPORT, which is what makes the departure safe: the
 * share image, the PNG and the SVG download all render from the model through
 * `export/render-svg.ts`, and a static or exported drawing passes no `reorder`
 * surface at all — so no `foreignObject` is ever serialised.
 *
 * NO POINTER ARBITRATION, and no `moved` flag or client-pixel threshold as the
 * node canvases carry: the pane's drag-to-pan already stands down for a press
 * that lands inside a `button`. There is also no drag to tell from a click —
 * a dictionary is a TABLE whose column grid is solved from the whole document
 * at once, so a block dropped at a point would be re-solved back onto the grid
 * by the next parse. Handles are what a table gets instead of a drag.
 *
 * AN UNAVAILABLE CONTROL IS `aria-disabled`, NEVER `disabled`. A disabled
 * button is not focusable, so the press that reaches the end of a run would
 * drop the reader's focus out of the table — exactly the moment a reader
 * walking a section to the top with Enter needs it least. It keeps its place
 * and its name, and carries the refusal.
 */
function ReorderHandles({
  target,
  rightEdge,
  centerY,
  surface,
}: {
  target: DictReorderTarget;
  rightEdge: number;
  centerY: number;
  surface: DictReorderSurface;
}): React.JSX.Element {
  const chip = dictHandleChip(rightEdge, centerY);
  return (
    <foreignObject
      className="af-dict-handles"
      x={chip.x}
      y={chip.y}
      width={chip.width}
      height={chip.height}
    >
      {/* THE CHIP'S BACKING IS OPAQUE, because it is drawn OVER the table
          rather than in space reserved for it (see `dictHandleChip`): under a
          row it covers the tail of the source column, under a band the
          technology label, and only while that row or band is the one being
          pointed at. `--node` ruled with `--node-border` rather than a tint —
          the default theme separates by OUTLINE, so a wash would read as a
          smudge, and this is the pair every canvas here already measures.

          THE GEOMETRY IS PASSED IN, not restated in the stylesheet: CSS cannot
          import `DICT_HANDLE`, and a padding typed in both places is how the
          badge run came to need more room than its column had. */}
      <div
        className="af-dict-chip"
        style={{
          gap: DICT_HANDLE.gap,
          padding: DICT_HANDLE.pad,
          borderRadius: DICT_HANDLE.radius,
        }}
      >
        {(["earlier", "later"] as const).map((direction) => {
          const refusal = surface.refusal(target, direction);
          const action = handleAction(target, direction);
          /* ONE STRING FOR BOTH the tooltip and the accessible name, so hover
             and assistive tech cannot drift apart — the rule
             `canvas-lock-button.tsx` pins for the other wordless control here.
             The refusal rides on the END of the action rather than replacing
             it: a reader who cannot act still needs to know what the control
             is for. */
          const name = refusal === null ? action : `${action}. ${refusal}`;
          return (
            <button
              key={direction}
              type="button"
              className={cn(
                "af-dict-handle",
                refusal !== null && "af-dict-handle-off",
              )}
              data-af-dict-handle={dictHandleKey(target, direction)}
              style={{
                width: DICT_HANDLE.button,
                height: DICT_HANDLE.button,
                borderRadius: DICT_HANDLE.radius - DICT_HANDLE.pad,
              }}
              aria-disabled={refusal === null ? undefined : true}
              aria-label={name}
              title={name}
              onClick={(event) => {
                /* The press is the chip's, not the pane's — see the ER
                   canvas's own note on a click a backdrop would otherwise
                   eat. */
                event.stopPropagation();
                surface.onPress(target, direction);
              }}
            >
              <svg
                aria-hidden="true"
                viewBox={`0 0 ${DICT_HANDLE.grid} ${DICT_HANDLE.grid}`}
                width="100%"
                height="100%"
                fill="none"
                /* The button owns the ink, so one CSS rule answers for the
                   resting, hovered and unavailable glyph. */
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={HANDLE_GLYPH[direction]} />
              </svg>
            </button>
          );
        })}
      </div>
    </foreignObject>
  );
}

/**
 * The document title's press target, and the viewer's field once it is open.
 *
 * A NATIVE `<button>` IN A `foreignObject`, on the terms `ReorderHandles`
 * above sets out — and the same thing is at stake here: a real control brings
 * the keyboard behaviour, the focus ring the theme already paints and the
 * hover state, and it keeps this canvas out of `check:view-input`'s selection
 * sweep honestly. Giving a SHAPE the button role would put the dictionary in
 * that sweep, which asks every member for a focus selection and a way to
 * deselect — and the viewer's header argues why a dictionary has neither.
 *
 * THAT SWEEP READS THE SOURCE WITH ITS COMMENTS INTACT, so the role's own
 * spelling is deliberately not written out anywhere in this file: a sentence
 * explaining why the dictionary is not in the sweep put it in the sweep, and
 * four assertions failed on a comment.
 *
 * ONE BOX, TWO SIZES. Closed, it covers the title as drawn — measured from
 * `DICT_TITLE_SIZE` with the estimate the layout's own columns are measured
 * with, so it ends where the words do. Open, it is `DICT_TITLE_EDITOR` pulled
 * back inside the drawing; see that constant for the clip the clamp avoids.
 */
function TitleControl({
  title,
  x,
  centerY,
  maxRight,
  canvas,
  retitle,
}: {
  title: string;
  x: number;
  centerY: number;
  /** The table's right edge — the press target never reaches past it, so a
   *  long title cannot hand the reader a control wider than the drawing. */
  maxRight: number;
  canvas: { width: number; height: number };
  retitle: DictRetitleSurface;
}): React.JSX.Element {
  const fields = retitle.form;
  const width =
    fields === null
      ? Math.min(
          maxRight - x,
          title.length * DICT_TITLE_SIZE * CHAR_WIDTH_RATIO + DICT.padX * 2,
        )
      : Math.min(DICT_TITLE_EDITOR.width, canvas.width);
  const height =
    fields === null
      ? DICT_TITLE_SIZE * TITLE_HIT_LEADING
      : Math.min(DICT_TITLE_EDITOR.height, canvas.height);
  return (
    <foreignObject
      x={Math.max(0, Math.min(x, canvas.width - width))}
      y={Math.max(0, Math.min(centerY - height / 2, canvas.height - height))}
      width={width}
      height={height}
    >
      {fields ?? (
        <button
          type="button"
          /* The identity focus is put back on after the edit — `dict-viewer.tsx`
             explains why a re-parse blurs whatever the reader pressed. */
          data-af-dict-heading=""
          /* A DASHED HAIRLINE, NEVER A FILL, and drawn at rest rather than only
             on hover: the title is the affordance, so a reader has to see that
             it is one without pointing at it first. A fill of any strength
             would sit over the `<text>` beneath this box and dim the very title
             it offers to change.

             THE RING IS INSET for the reason the handle stylesheet records: a
             `foreignObject` clips to its own box, and an outline paints outside
             the border box, so the indicator would be shaved off at the
             corners — where a keyboard reader is looking. */
          className="size-full cursor-text rounded-md border border-dashed border-node-border/50 bg-transparent hover:border-node-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
          aria-label={`Rewrite the dictionary title — currently “${title}”`}
          title="Rewrite the title"
          onClick={(event) => {
            /* The press is the title's, not the pane's — see the reorder
               handle's own note on a click a backdrop would otherwise eat. */
            event.stopPropagation();
            retitle.onOpen();
          }}
        />
      )}
    </foreignObject>
  );
}

/** How much taller than its type size the title's press target is drawn — the
 *  leading a single line of text sits in, so the control covers the words
 *  rather than only their x-height. */
const TITLE_HIT_LEADING = 1.6;

/** The reveal's hit area — the whole band or row, so hovering the white space
 * between two columns counts as pointing at it. An SVG group is hovered only
 * through a painted child, and a row is mostly gaps. */
function RevealArea({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}): React.JSX.Element {
  return (
    <rect
      aria-hidden="true"
      /* Not a control, and deliberately not given a role: a press here pans
         the canvas exactly as it did before this surface existed. */
      x={x}
      y={y}
      width={width}
      height={height}
      fill="transparent"
    />
  );
}

function Row({
  field,
  index,
  columnX,
  columnWidth,
  striped,
  sectionLabel,
  reorder,
}: {
  field: LaidDictField;
  index: number;
  columnX: Record<DictColumn, number>;
  columnWidth: Record<DictColumn, number>;
  striped: boolean;
  sectionLabel: string;
  reorder?: DictReorderSurface;
}): React.JSX.Element {
  const description = field.cells.find((cell) => cell.column === "description");
  const baseline = field.y + DICT.lineHeight * 1.15;
  const right = columnX.source + columnWidth.source;
  return (
    <g
      className="af-dict-row"
      style={{ "--dict-row": index } as React.CSSProperties}
    >
      {reorder === undefined ? null : (
        <RevealArea
          x={columnX.name - DICT.padX}
          y={field.y}
          width={right - columnX.name + DICT.padX * 2}
          height={field.height}
        />
      )}
      {/* A HAIRLINE BETWEEN ROWS, not a zebra fill. A wide row with a wrapped
          cell in the middle is exactly where an eye loses its line, so rows
          need separating — but the default theme separates by OUTLINE rather
          than by fill (`purpose.md`), and a 3.5%-opacity stripe there is
          either invisible or a smudge. A rule is the device the theme itself
          uses, works identically in all six, and does not depend on
          alternating parity to be legible. */}
      {striped ? (
        <line
          x1={columnX.name - DICT.padX * 0.4}
          y1={field.y}
          x2={right + DICT.padX * 0.4}
          y2={field.y}
          stroke="var(--node-border)"
          strokeWidth={1}
          opacity={0.55}
        />
      ) : null}

      {field.cells.map((cell) => {
        if (cell.column === "flags") {
          /* HORIZONTAL, not stacked. THE BUG THIS FIXES: the badges were drawn
             one under another while `lib/layout.ts` measured them as a single
             space-joined line — so a two-flag field drew a badge into the row
             below it, and a three-flag field into the row below that. The
             renderer and the measurement have to agree about the shape, and
             the measurement is the one the column width comes from. */
          let x = cell.x;
          return (
            <g key={cell.column}>
              {field.flags.map((flag) => {
                const paint = FLAG_PAINT[flag] ?? FLAG_PAINT.derived;
                const width =
                  flag.length * BADGE.size * BADGE.ratio + BADGE.padX * 2;
                const left = x;
                x += width + BADGE.gap;
                return (
                  <g key={flag}>
                    <rect
                      x={left}
                      y={field.y + (DICT.lineHeight * 1.15 - BADGE.height / 2)}
                      width={width}
                      height={BADGE.height}
                      rx={BADGE.radius}
                      /* OUTLINED, NOT FILLED, for every badge but `pii`. The
                         default theme is High contrast, which separates by
                         OUTLINE rather than by fill (`purpose.md`), so a
                         tinted pill is the wrong device there — it reads as a
                         smudge where a ruled shape reads as a token. The
                         outline also fixes the contrast honestly: the label
                         sits on the CANVAS, against which each of these colour
                         tokens is already measured, instead of on a wash of
                         its own colour. */
                      fill={paint.solid === true ? paint.mark : "none"}
                      stroke={paint.mark}
                      strokeWidth={1.3}
                    />
                    <text
                      x={left + width / 2}
                      y={field.y + DICT.lineHeight * 1.15}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={BADGE.size}
                      fontWeight={700}
                      letterSpacing={0.2}
                      fill={paint.text ?? paint.mark}
                    >
                      {flag}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        }
        return (
          <g key={cell.column}>
            {cell.lines.map((line, index) => (
              <text
                key={index}
                x={cell.x}
                y={baseline + index * DICT.lineHeight}
                dominantBaseline="central"
                fontSize={DICT.cellSize}
                fontWeight={cell.column === "name" ? 600 : 400}
                fontFamily={
                  cell.column === "name" || cell.column === "type"
                    ? "var(--font-mono, monospace)"
                    : undefined
                }
                fill={
                  cell.column === "description"
                    ? "var(--node-foreground)"
                    : "var(--node-meta)"
                }
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {/* `values` and `example` under the meaning, each prefixed so the line
          says what it is without a column heading to lean on. */}
      {[
        field.values === undefined ? null : `Values: ${field.values}`,
        field.example === undefined ? null : `e.g. ${field.example}`,
      ]
        .filter((line): line is string => line !== null)
        .map((line, index) => (
          <text
            key={line}
            x={description?.x ?? columnX.description + DICT.padX}
            y={
              baseline +
              (Math.max(1, description?.lines.length ?? 1) + index) *
                DICT.lineHeight
            }
            dominantBaseline="central"
            fontSize={DICT.cellSize - 1}
            fontStyle="italic"
            fill="var(--muted-foreground)"
          >
            {line}
          </text>
        ))}

      {/* LAST, so the chip is painted over the columns it overlaps rather than
          under them. */}
      {reorder === undefined ? null : (
        <ReorderHandles
          target={{ kind: "field", sectionLabel, fieldName: field.name }}
          rightEdge={right}
          centerY={field.y + field.height / 2}
          surface={reorder}
        />
      )}
    </g>
  );
}

export interface DictDiagramProps {
  file: DictLabFile;
  className?: string;
  /** How much width the table may use. Omitted for a static render, which
   * takes the fixed page width. */
  availableWidth?: number;
  /**
   * The reorder controls, or absent for a read-only drawing.
   *
   * PRESENCE IS THE OFFER, as on the flowchart and ER canvases: a locked or
   * read-only canvas passes nothing and this renders no editing chrome at all,
   * rather than a table of controls that cannot change anything.
   */
  reorder?: DictReorderSurface;
  /**
   * The title, made typeable, or absent for a read-only drawing — the same
   * offer-by-presence the `reorder` surface above is, and for the same reason:
   * an export renders from the model and passes nothing, so no `foreignObject`
   * is ever serialised.
   */
  retitle?: DictRetitleSurface;
}

export function DictDiagram({
  file,
  className,
  availableWidth,
  reorder,
  retitle,
}: DictDiagramProps): React.JSX.Element {
  const layout = layoutDict(file, { availableWidth });
  const right = layout.columnX.source + layout.columnWidth.source;
  /* The title's two states, read once: pressable, or open with the viewer's
     field in it. */
  const titleFields = retitle?.form ?? null;

  return (
    <svg
      className={["af-dict-canvas", className].filter(Boolean).join(" ")}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      /* NO `maxWidth` HERE ANY MORE. It was capping the drawing at its own
         designed width, which was right when the viewer had no camera — a
         dictionary blown up to fill a wide pane reads as a slide rather than
         a reference table. The viewer now sizes its wrapper from the camera's
         scale, so the cap would fight it: zooming in would widen the wrapper
         and the SVG would refuse to follow. Fit is the default, which
         preserves the behaviour the cap was protecting. */
      /* `img` WHILE THERE IS NOTHING TO PRESS, `group` ONCE THERE IS. A
         picture has no buttons in it, and assistive technology prunes the
         subtree of a `role="img"` — so leaving it here would have left every
         handle's accessible name unreadable while the handles themselves
         stayed in the tab order, which is the worst of both. */
      role={reorder === undefined && retitle === undefined ? "img" : "group"}
      aria-label={`Data dictionary: ${file.metadata?.title ?? "untitled"}, ${layout.sections.length} sections${reorder === undefined ? "" : ". Every section and field carries move-earlier and move-later buttons — Tab reaches them."}${retitle === undefined ? "" : " The title is a button — press it to rewrite it."}`}
    >
      {/* ---- the title band, and the one control that edits the DOCUMENT
            rather than a row.

            THE DRAWN TITLE IS THE AFFORDANCE. It is already at the top of the
            table in the place a reader would point at to change it, so the
            press target is laid over it and the `<text>` keeps the typography
            the export ships — an HTML copy in the `foreignObject` would drift
            from it at every zoom.

            NOTHING IS OFFERED WHEN THERE IS NO TITLE, and that is not a gap to
            fill: the gesture patches the header's existing `title` line, and a
            document without one never parsed. */}
      {layout.title !== null ? (
        <g>
          <text
            className={cn(
              "af-dict-title",
              /* The field is opaque and stands where the title does, so the
                 drawn copy would only show at its edges — and would be going
                 stale as the reader types. */
              titleFields !== null && "hidden",
            )}
            x={layout.columnX.name - DICT.padX}
            y={layout.titleY}
            dominantBaseline="central"
            fontSize={DICT_TITLE_SIZE}
            fontWeight={700}
            fill="var(--foreground)"
          >
            {layout.title}
          </text>
          {retitle === undefined ? null : (
            <TitleControl
              title={layout.title}
              x={layout.columnX.name - DICT.padX}
              centerY={layout.titleY}
              maxRight={right}
              canvas={{ width: layout.width, height: layout.height }}
              retitle={retitle}
            />
          )}
        </g>
      ) : null}

      {layout.sections.map((section) => (
        <g
          key={section.label}
          className="af-dict-section"
          style={{ "--dict-wave": section.index } as React.CSSProperties}
        >
          {/* THE HEADING BAND AS ONE GROUP, so pointing anywhere along it
              reveals the section's own controls — the label, the technology
              and the chip are read together and there is nothing else in the
              band to point at. */}
          <g className="af-dict-band">
            {reorder === undefined ? null : (
              <RevealArea
                x={layout.columnX.name - DICT.padX}
                y={section.y}
                width={right - layout.columnX.name + DICT.padX * 2}
                height={DICT.sectionHeight}
              />
            )}
            <text
              x={layout.columnX.name}
              y={section.y + DICT.sectionHeight / 2 - 4}
              dominantBaseline="central"
              fontSize={DICT.labelSize}
              fontWeight={650}
              fill="var(--foreground)"
            >
              {section.label}
            </text>
            {section.technology !== undefined ? (
              <text
                x={right}
                y={section.y + DICT.sectionHeight / 2 - 4}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={DICT.cellSize - 1}
                fill="var(--muted-foreground)"
              >
                {section.technology}
              </text>
            ) : null}
            {reorder === undefined ? null : (
              <ReorderHandles
                target={{ kind: "section", sectionLabel: section.label }}
                rightEdge={right}
                centerY={section.y + DICT.sectionHeight / 2 - 4}
                surface={reorder}
              />
            )}
          </g>

          {/* THE TABLE'S OWN SURFACE, drawn before the headings so everything
              sits on it. `--node` on `--canvas` is the pair every other canvas
              here uses for a shape against its background, so it is already
              measured in all nine themes — which is why the panel is that pair
              rather than a hand-picked tint of the canvas colour, and why it
              lifts the table without the high-contrast theme losing the
              distinction. This argument outlived the dictionary: the three
              sheet-mounting notations adopted the same pair for their whole
              drawing surface, and `lib/diagram-surface.ts` carries it now.

              THE GEOMETRY STAYS THE DICTIONARY'S OWN. `DiagramSurface` frames
              one drawing; this frames one SECTION, and a dictionary has as
              many panels as it has tables. Only the corner is shared, as
              `DIAGRAM_SURFACE_RADIUS` — it was a hand-typed 10 here and
              another in the exporter, and the four renditions now cut one
              corner. `check:canvas-grid` pins each.

              The SECTION HEADING STAYS OUTSIDE IT, above the top edge: the
              heading names the table, and a name printed inside the thing it
              names reads as a first row. */}
          <rect
            x={layout.columnX.name - DICT.padX}
            y={section.headerY - DICT.padX * 0.5}
            width={right - layout.columnX.name + DICT.padX * 2}
            height={
              section.y + section.height - section.headerY + DICT.padX * 0.5
            }
            rx={DIAGRAM_SURFACE_RADIUS}
            fill="var(--node)"
            stroke="var(--node-border)"
            strokeWidth={1}
          />

          {/* The column headings, and the rule under them. A dictionary is
              read by column, so the headings repeat per section rather than
              sitting once at the top where a reader scrolling the third
              section can no longer see them. */}
          {(Object.keys(COLUMN_LABEL) as DictColumn[]).map((column) => (
            <text
              key={column}
              x={layout.columnX[column] + DICT.padX}
              y={section.headerY + DICT.headerHeight / 2}
              dominantBaseline="central"
              fontSize={DICT.headerSize}
              fontWeight={600}
              letterSpacing={0.6}
              fill="var(--muted-foreground)"
            >
              {COLUMN_LABEL[column].toUpperCase()}
            </text>
          ))}
          <line
            x1={layout.columnX.name}
            y1={section.headerY + DICT.headerHeight}
            x2={right}
            y2={section.headerY + DICT.headerHeight}
            stroke="var(--node-border)"
            strokeWidth={1}
          />

          {section.fields.map((field, index) => (
            <Row
              key={field.name}
              /* The row's own index, stamped for the reveal: a dictionary
                 fills in top to bottom, which is the order it is read. */
              index={index}
              field={field}
              columnX={layout.columnX}
              columnWidth={layout.columnWidth}
              /* Every row but the first gets a rule ABOVE it, so the run is
                 separated without a line hanging under the last one. */
              striped={index > 0}
              /* The row's own section, because a field is addressed by its
                 name UNDER a label — the name alone is unique inside its
                 section and not across the file. */
              sectionLabel={section.label}
              reorder={reorder}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
