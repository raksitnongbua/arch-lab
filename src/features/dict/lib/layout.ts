/**
 * Pure geometry for a data dictionary: `DictLabFile` in, absolute coordinates
 * out. No React, no DOM — the same contract as every other `lib/layout.ts`, so
 * the canvas, the SVG exporter and `scripts/dict-layout-check.mjs` read one
 * geometry rather than three that must agree.
 *
 * WHAT MAKES THIS LAYOUT DIFFERENT FROM ALL FIVE OTHERS: there is no graph.
 * The other kinds solve positions from relationships — ranks, columns, actor
 * flanks, dependency depth — because something connects to something else.
 * A dictionary connects nothing: it is a TABLE, and the layout's whole job is
 * column widths and row heights.
 *
 * That makes the hard problem the opposite one. A graph layout fails by
 * overlapping; a table layout fails by CLIPPING — a description longer than
 * its column, a type wider than the space left for it. So every column here is
 * measured from the widest cell it must hold, the description column takes
 * whatever remains, and its text is WRAPPED rather than truncated: a dictionary
 * exists to be read, and a cut-off sentence is worse than a taller row.
 *
 * THE COLUMN ORDER IS THE READING ORDER and is not configurable: name, type,
 * flags, description, source. A reader scans down the names to find their
 * field, then rightward. Putting the description first was tried on paper and
 * rejected — it makes the names a ragged column nobody can scan.
 *
 * Imported by `scripts/dict-layout-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { DictField, DictLabFile } from "@/types";

import { CHAR_WIDTH_RATIO } from "@/lib/text-metrics";

/** Every tunable distance in the dictionary canvas, in px, in one table. */
export const DICT = {
  /** Default canvas width when the caller does not say how much room it has.
   * A dictionary is read as a column of text, so it takes a page width and
   * wraps into it rather than growing sideways without limit. */
  width: 940,
  /**
   * The widest the MEANING column may get, however much room there is.
   *
   * A dictionary in a 1600px pane could give its descriptions 900px, and that
   * is worse to read, not better: past roughly 90 characters the eye loses
   * the start of the next line. So extra room widens the table only up to
   * here, and beyond that the page stays put and centres. This is the number
   * that keeps "use the space" from becoming "stretch the text".
   */
  maxDescription: 560,
  /** Height of the document title band above the first section. */
  titleHeight: 54,
  /** Height of a section heading band. */
  sectionHeight: 46,
  /** Height of the column-header row under a heading. */
  headerHeight: 26,
  /** Minimum height of a field row; a wrapped description makes it taller. */
  rowHeight: 30,
  /** One line of wrapped description text. */
  lineHeight: 16,
  /** Gap between two sections. */
  sectionGap: 26,
  /** Canvas padding. */
  margin: 28,
  /** Cell padding, left and right. */
  padX: 12,
  /** Font sizes. */
  labelSize: 15,
  headerSize: 10.5,
  cellSize: 12.5,
  /** Minimum width of the description column before the layout stops giving
   * space to the others. */
  minDescription: 220,
} as const;

/**
 * Badge geometry, owned HERE and imported by the canvas rather than declared
 * in both.
 *
 * THE BUG THIS SHAPE PREVENTS: the flags column was sized from the flag names
 * joined with spaces, while the canvas drew rounded badges with 7px of padding
 * each — so a three-flag field needed 147px in a 138px column and the last
 * badge hung outside it. A space is not a badge, and approximating one with
 * the other under-measures by exactly the padding. The column is measured with
 * `badgeRunWidth` now, which is the same arithmetic the canvas draws.
 */
export const BADGE = {
  height: 15,
  radius: 7.5,
  padX: 7,
  gap: 5,
  size: 9,
  /** Character-width ratio of the badge's bold, slightly tracked label. */
  ratio: 0.62,
} as const;

/** The exact width a run of badges occupies — what the canvas draws and what
 * the column must therefore hold. */
export function badgeRunWidth(flags: readonly string[]): number {
  if (flags.length === 0) return 0;
  return flags.reduce(
    (sum, flag) =>
      sum + flag.length * BADGE.size * BADGE.ratio + BADGE.padX * 2 + BADGE.gap,
    -BADGE.gap,
  );
}

/** The five columns, in reading order. `flex` columns share what is left after
 * the measured ones; today only the description flexes. */
const COLUMNS = ["name", "type", "flags", "description", "source"] as const;
export type DictColumn = (typeof COLUMNS)[number];

/** Column headings, drawn once per section. */
export const COLUMN_LABEL: Readonly<Record<DictColumn, string>> = {
  name: "Field",
  type: "Type",
  flags: "Rules",
  description: "Meaning",
  source: "Source",
};

const textWidth = (text: string, size: number): number =>
  text.length * size * CHAR_WIDTH_RATIO;

/**
 * Flags as drawn on a row, e.g. `required unique`.
 *
 * MEASURED AS ONE HORIZONTAL LINE, because that is how the canvas draws them.
 * The two disagreed once — the canvas stacked them vertically while this
 * measured a single line — and the result was a badge drawn into the row
 * below. The joined string is a deliberate approximation of the badge run: it
 * over-measures slightly (badge padding is wider than a space), which is the
 * safe direction for a column width.
 */
const flagsText = (field: DictField): string => (field.flags ?? []).join(" ");

/**
 * Greedy word wrap to a pixel width. Breaks on spaces only — a dictionary
 * description is prose, so a mid-word break would be a worse read than a
 * short line, and the one case that genuinely needs breaking (an unspaced
 * identifier longer than the column) is left long rather than sliced, because
 * slicing an identifier changes what it says.
 */
export function wrapToWidth(
  text: string,
  maxWidth: number,
  size: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (textWidth(candidate, size) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

export interface LaidDictCell {
  column: DictColumn;
  /** Left edge of the cell's text. */
  x: number;
  /** Wrapped lines. One entry for every column except the description, which
   * may have several. Empty when the field carries nothing for the column. */
  lines: string[];
}

export interface LaidDictField {
  name: string;
  flags: string[];
  /** Top edge of the row. */
  y: number;
  height: number;
  cells: LaidDictCell[];
  /** The extras that have no column of their own — drawn under the row's
   * description when present, because they are read WITH the meaning rather
   * than scanned down like a name. */
  values?: string;
  example?: string;
}

export interface LaidDictSection {
  label: string;
  technology?: string;
  description?: string;
  tags?: string[];
  y: number;
  height: number;
  /** Top edge of the column-header row. */
  headerY: number;
  fields: LaidDictField[];
  /** Section index — drives the entrance stagger, so motion names the
   * document's own order rather than inventing one. */
  index: number;
}

export interface DictLayout {
  width: number;
  height: number;
  /**
   * The document's own title, drawn at the top of the canvas.
   *
   * ON THE CANVAS, not only in the page chrome, because the canvas is what
   * gets EXPORTED and shared — an image of a dictionary with no title is a
   * table of fields belonging to nothing, and the reader it reaches is
   * usually not the one who exported it. The sequence canvas made this call
   * first and for the same reason.
   */
  title: string | null;
  /** Baseline y of the title, when there is one. */
  titleY: number;
  sections: LaidDictSection[];
  /** x of each column's left text edge, shared by every section so the table
   * reads as ONE table rather than as several that happen to be stacked. */
  columnX: Record<DictColumn, number>;
  columnWidth: Record<DictColumn, number>;
}

/**
 * Lays out a dictionary. Pure and deterministic.
 *
 * COLUMN WIDTHS ARE SOLVED ACROSS THE WHOLE DOCUMENT, not per section. Two
 * sections whose `name` columns differ by 30px read as two unrelated tables;
 * one shared grid reads as one document with headings in it, which is what a
 * dictionary is.
 */
export function layoutDict(
  file: DictLabFile,
  options: {
    /**
     * How much width the caller can actually give the table. The layout stays
     * PURE — it is told the number rather than measuring a pane — so the
     * export renderer and the check scripts can pass nothing and get the
     * fixed page width they have always had.
     */
    availableWidth?: number;
  } = {},
): DictLayout {
  const sections = file.sections ?? [];
  const every = sections.flatMap((section) => section.fields ?? []);

  const measure = (values: string[], heading: string, min: number): number =>
    Math.max(
      min,
      textWidth(heading, DICT.headerSize),
      ...values.map((value) => textWidth(value, DICT.cellSize)),
    ) +
    DICT.padX * 2;

  const nameWidth = measure(
    every.map((field) => field.name),
    COLUMN_LABEL.name,
    90,
  );
  const typeWidth = measure(
    every.map((field) => field.type),
    COLUMN_LABEL.type,
    72,
  );
  /* Measured as BADGES, not as text — see `BADGE`'s essay. */
  const flagsWidth =
    Math.max(
      64,
      textWidth(COLUMN_LABEL.flags, DICT.headerSize),
      ...every.map((field) => badgeRunWidth(field.flags ?? [])),
    ) +
    DICT.padX * 2;
  const sourceWidth = measure(
    every.flatMap((field) =>
      field.source === undefined ? [] : [field.source],
    ),
    COLUMN_LABEL.source,
    80,
  );

  const fixed = nameWidth + typeWidth + flagsWidth + sourceWidth;
  /* The description takes what is left, and never less than its minimum: a
     description column narrower than this wraps to two words a line, which is
     unreadable in a way a slightly wider canvas is not. */
  /* The description takes what is left of whatever room there is, floored at
     its readable minimum and CAPPED at `maxDescription` — a wide pane widens
     the table up to that point and then stops, rather than stretching prose
     across the whole screen. */
  const page = Math.max(DICT.width, options.availableWidth ?? DICT.width);
  const descriptionWidth = Math.min(
    DICT.maxDescription,
    Math.max(DICT.minDescription, page - DICT.margin * 2 - fixed),
  );

  const columnWidth: Record<DictColumn, number> = {
    name: nameWidth,
    type: typeWidth,
    flags: flagsWidth,
    description: descriptionWidth,
    source: sourceWidth,
  };

  const columnX = {} as Record<DictColumn, number>;
  let cursor = DICT.margin;
  for (const column of COLUMNS) {
    columnX[column] = cursor;
    cursor += columnWidth[column];
  }
  const width = Math.max(DICT.width, cursor + DICT.margin);

  const title =
    typeof file.metadata?.title === "string" && file.metadata.title !== ""
      ? file.metadata.title
      : null;

  const laid: LaidDictSection[] = [];
  let y = DICT.margin;
  const titleY = y + DICT.titleHeight / 2;
  /* The band is only reserved when there IS a title: an untitled document
     should not carry a band of empty space where one would have been. */
  if (title !== null) y += DICT.titleHeight;

  for (const [index, section] of sections.entries()) {
    const top = y;
    y += DICT.sectionHeight;
    const headerY = y;
    y += DICT.headerHeight;

    const fields: LaidDictField[] = [];
    for (const field of section.fields ?? []) {
      const descriptionLines =
        field.description === undefined
          ? []
          : wrapToWidth(
              field.description,
              descriptionWidth - DICT.padX * 2,
              DICT.cellSize,
            );
      /* The extras sit under the description, each on its own line, so a row's
         height is the description plus however many of them the field has. */
      const extras = [field.values, field.example].filter(
        (value) => value !== undefined,
      ).length;
      const height = Math.max(
        DICT.rowHeight,
        (Math.max(1, descriptionLines.length) + extras) * DICT.lineHeight +
          DICT.lineHeight * 0.75,
      );

      fields.push({
        name: field.name,
        flags: field.flags ?? [],
        y,
        height,
        ...(field.values !== undefined ? { values: field.values } : {}),
        ...(field.example !== undefined ? { example: field.example } : {}),
        cells: [
          { column: "name", x: columnX.name + DICT.padX, lines: [field.name] },
          { column: "type", x: columnX.type + DICT.padX, lines: [field.type] },
          {
            column: "flags",
            x: columnX.flags + DICT.padX,
            lines: flagsText(field) === "" ? [] : [flagsText(field)],
          },
          {
            column: "description",
            x: columnX.description + DICT.padX,
            lines: descriptionLines,
          },
          {
            column: "source",
            x: columnX.source + DICT.padX,
            lines: field.source === undefined ? [] : [field.source],
          },
        ],
      });
      y += height;
    }

    laid.push({
      label: section.label,
      ...(section.technology !== undefined
        ? { technology: section.technology }
        : {}),
      ...(section.description !== undefined
        ? { description: section.description }
        : {}),
      ...(section.tags !== undefined ? { tags: section.tags } : {}),
      y: top,
      height: y - top,
      headerY,
      fields,
      index,
    });
    y += DICT.sectionGap;
  }

  return {
    width,
    height: Math.max(y - DICT.sectionGap + DICT.margin, DICT.margin * 2),
    title,
    titleY,
    sections: laid,
    columnX,
    columnWidth,
  };
}
