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
 */

import type { DictLabFile } from "@/types";

import { BADGE, COLUMN_LABEL, DICT, layoutDict } from "../lib/layout";
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

function Row({
  field,
  columnX,
  columnWidth,
  striped,
}: {
  field: LaidDictField;
  columnX: Record<DictColumn, number>;
  columnWidth: Record<DictColumn, number>;
  striped: boolean;
}): React.JSX.Element {
  const description = field.cells.find((cell) => cell.column === "description");
  const baseline = field.y + DICT.lineHeight * 1.15;
  return (
    <g className="af-dict-row">
      {/* A HAIRLINE BETWEEN ROWS, not a zebra fill. A wide row with a wrapped
          cell in the middle is exactly where an eye loses its line, so rows
          need separating — but the default theme separates by OUTLINE rather
          than by fill (`purpose.md`), and a 3.5%-opacity stripe there is
          either invisible or a smudge. A rule is the device the theme itself
          uses, works identically in all six, and does not depend on
          alternating parity to be legible. */}
      {striped ? (
        <line
          x1={columnX.name}
          y1={field.y}
          x2={columnX.source + columnWidth.source}
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
    </g>
  );
}

export interface DictDiagramProps {
  file: DictLabFile;
  className?: string;
}

export function DictDiagram({
  file,
  className,
}: DictDiagramProps): React.JSX.Element {
  const layout = layoutDict(file);
  const right = layout.columnX.source + layout.columnWidth.source;

  return (
    <svg
      className={["af-dict-canvas", className].filter(Boolean).join(" ")}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
      /* CAPPED AT ITS OWN WIDTH. `width="100%"` on an SVG scales the whole
         drawing to its container, and a dictionary in a wide pane was being
         blown up ~1.9x — 12.5px type rendering at 24px, which reads as a
         slide rather than a reference table. Every other canvas here is a
         DIAGRAM and gains from filling the space; this one is a page of text
         and gains from staying at its designed size. */
      style={{ maxWidth: `${layout.width}px` }}
      role="img"
      aria-label={`Data dictionary: ${file.metadata?.title ?? "untitled"}, ${layout.sections.length} sections`}
    >
      {layout.sections.map((section) => (
        <g
          key={section.label}
          className="af-dict-section"
          style={{ "--dict-wave": section.index } as React.CSSProperties}
        >
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
              field={field}
              columnX={layout.columnX}
              columnWidth={layout.columnWidth}
              /* Every row but the first gets a rule ABOVE it, so the run is
                 separated without a line hanging under the last one. */
              striped={index > 0}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
