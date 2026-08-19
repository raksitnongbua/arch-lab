#!/usr/bin/env node
/**
 * Dictionary layout check. Loads the REAL `layoutDict` via Node's type
 * stripping, so it measures the geometry the canvas and the exporter draw.
 *
 * A TABLE LAYOUT FAILS DIFFERENTLY FROM A GRAPH LAYOUT, and this check is
 * shaped around that. The other kinds' layout checks hunt for OVERLAP; here
 * the failure is CLIPPING — a cell wider than its column, a row shorter than
 * its own wrapped text. Every assertion below is measured, never a restatement
 * of a constant.
 *
 * Run with: pnpm check:dict-layout
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
        if (existsSync(`${asPath}.ts`))
          resolved = pathToFileURL(`${asPath}.ts`).href;
        else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { parseDictText } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { layoutDict, DICT, wrapToWidth, badgeRunWidth } = await import(
  pathToFileURL(path.join(ROOT, "src/features/dict/lib/layout.ts")).href
);
const { DICT_EXAMPLE } = await import(
  pathToFileURL(path.join(ROOT, "src/features/dict/input/example.ts")).href
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

const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");
const width = (text, size) => text.length * size * CHAR_WIDTH_RATIO;
const layout = layoutDict(parseDictText(DICT_EXAMPLE));
const ORDER = ["name", "type", "flags", "description", "source"];

console.log("cells fit their columns");

{
  const clipped = [];
  for (const section of layout.sections) {
    for (const field of section.fields) {
      for (const cell of field.cells) {
        const available = layout.columnWidth[cell.column] - DICT.padX * 2;
        for (const line of cell.lines) {
          if (width(line, DICT.cellSize) > available + 0.5) {
            clipped.push(`${section.label}.${field.name}/${cell.column}`);
          }
        }
      }
    }
  }
  check(
    "no cell's text is wider than its column",
    clipped.length === 0,
    clipped.join(", "),
  );

  const overlapping = [];
  for (const section of layout.sections) {
    for (const field of section.fields) {
      for (const cell of field.cells) {
        const next = ORDER[ORDER.indexOf(cell.column) + 1];
        if (next !== undefined && cell.x >= layout.columnX[next]) {
          overlapping.push(`${field.name}/${cell.column}`);
        }
      }
    }
  }
  check(
    "no cell starts inside the next column",
    overlapping.length === 0,
    overlapping.join(", "),
  );
}

console.log("badges fit the column the layout reserved for them");

{
  /* THE BUG THIS EXISTS FOR: the canvas stacked flag badges VERTICALLY while
     `lib/layout.ts` measured them as one space-joined horizontal line — so a
     two-flag field drew a badge into the row below it and a three-flag field
     into the row below that. Nothing caught it, because each half was
     self-consistent; only the PAIR was wrong.

     So this recomputes the badge run with the renderer's own geometry (read
     from the component, not restated) and asserts it fits the column the
     layout sized. If either side changes shape alone, this fails. */
  const diagram = read("src/features/dict/components/dict-diagram.tsx");
  check(
    "the canvas imports its badge geometry from the layout, not its own copy",
    /import \{[^}]*\bBADGE\b/.test(diagram),
    "two copies of the badge padding is how a run came to need 147px in a 138px column",
  );
  check(
    "badges are drawn on ONE line, not stacked into the next row",
    !/index \* 1[0-9]/.test(diagram),
    "a per-index vertical offset is how the badges escaped their row",
  );

  const tooWide = [];
  for (const section of layout.sections) {
    for (const field of section.fields) {
      if (field.flags.length === 0) continue;
      const drawn = badgeRunWidth(field.flags);
      if (drawn > layout.columnWidth.flags - DICT.padX * 2 + 0.5) {
        tooWide.push(
          `${field.name} (${field.flags.join(" ")}) needs ${Math.round(drawn)}px`,
        );
      }
    }
  }
  check(
    `every badge run fits its column (${layout.columnWidth.flags - DICT.padX * 2}px available)`,
    tooWide.length === 0,
    tooWide.join(", "),
  );
  check(
    "the example carries a multi-flag field, so the run is actually exercised",
    layout.sections.some((s) => s.fields.some((f) => f.flags.length >= 2)),
    "no field has two flags — this whole section would pass vacuously",
  );
}

console.log("badge paint survives the high-contrast theme");

{
  /* THE DEFAULT THEME IS HIGH CONTRAST, and it separates by OUTLINE rather
     than by fill (`purpose.md`). Two contrast failures shipped on this canvas
     before these assertions existed:

       1. Every badge was drawn as its colour at 16% opacity with the SAME
          colour as its text. Text and background differing only in alpha
          cannot reach a usable ratio at any alpha — on the dark themes
          `required` came out grey on grey.
       2. The row separator was a 3.5%-opacity fill, which on a theme that
          separates by outline is either invisible or a smudge.

     Neither is measurable from here without a rasteriser, so what is asserted
     is the SHAPE that made them possible: a badge must not paint its label in
     the same token as a filled background behind it, and the row separator
     must be a rule rather than a wash. */
  const diagram = read("src/features/dict/components/dict-diagram.tsx");

  check(
    "no badge paints its label on a wash of its own colour",
    !/opacity=\{[^}]*\}[\s\S]{0,400}?fill=\{paint\.(mark|fill)\}/.test(
      diagram,
    ) && !/fill=\{paint\.fill\}[\s\S]{0,300}?opacity=\{0?\.\d/.test(diagram),
    "a tinted fill under same-coloured text cannot reach a usable contrast ratio",
  );
  check(
    "badges are outlined, and only the loud one is solid",
    /stroke=\{paint\.mark\}/.test(diagram) &&
      /paint\.solid === true/.test(diagram),
    "the default theme separates by outline — a tinted pill reads as a smudge there",
  );
  check(
    "rows are separated by a rule, not by a low-opacity fill",
    !/fill="var\(--node-foreground\)"[\s\S]{0,120}opacity=\{0\.0/.test(diagram),
    "a 3.5% stripe is invisible on the theme that separates by outline",
  );
}

console.log("rows hold their own content");

{
  const short = [];
  for (const section of layout.sections) {
    for (const field of section.fields) {
      const description = field.cells.find((c) => c.column === "description");
      const extras = [field.values, field.example].filter(
        (v) => v !== undefined,
      ).length;
      const needed =
        (Math.max(1, description.lines.length) + extras) * DICT.lineHeight;
      if (field.height < needed) short.push(field.name);
    }
  }
  check(
    "every row is tall enough for its wrapped description and its extras",
    short.length === 0,
    short.join(", "),
  );

  const escaping = [];
  for (const section of layout.sections) {
    for (const field of section.fields) {
      if (field.y < section.headerY + DICT.headerHeight - 0.5) {
        escaping.push(`${field.name} above its header`);
      }
      if (field.y + field.height > section.y + section.height + 0.5) {
        escaping.push(`${field.name} past its section`);
      }
    }
  }
  check(
    "every row sits inside its section",
    escaping.length === 0,
    escaping.join(", "),
  );

  let previousBottom = null;
  let stacked = true;
  for (const section of layout.sections) {
    for (const field of section.fields) {
      if (previousBottom !== null && field.y < previousBottom - 0.5)
        stacked = false;
      previousBottom = field.y + field.height;
    }
    previousBottom = null;
  }
  check("rows never overlap each other", stacked);
}

console.log("the table uses its room, but not past readable");

{
  /* "Use the space" must not become "stretch the text". Past roughly 90
     characters a line loses the eye on the way back, so extra pane width
     widens the table only up to `maxDescription`. Asserted at three widths,
     because the interesting behaviour is the CAP and a single measurement
     cannot show a ceiling. */
  const narrow = layoutDict(parseDictText(DICT_EXAMPLE), {
    availableWidth: 700,
  });
  const roomy = layoutDict(parseDictText(DICT_EXAMPLE), {
    availableWidth: 1400,
  });
  const absurd = layoutDict(parseDictText(DICT_EXAMPLE), {
    availableWidth: 4000,
  });

  check(
    "a wider pane gives the meaning column more room",
    roomy.columnWidth.description > narrow.columnWidth.description,
    `${narrow.columnWidth.description} -> ${roomy.columnWidth.description}`,
  );
  check(
    `the meaning column stops growing at its readable cap (${DICT.maxDescription}px)`,
    roomy.columnWidth.description <= DICT.maxDescription &&
      absurd.columnWidth.description === roomy.columnWidth.description,
    `roomy ${roomy.columnWidth.description}, absurd ${absurd.columnWidth.description}`,
  );
  check(
    "a pane narrower than the page still gets the readable minimum",
    narrow.columnWidth.description >= DICT.minDescription,
    `${narrow.columnWidth.description}`,
  );
  check(
    "nothing clips at any of the three widths",
    [narrow, roomy, absurd].every((candidate) =>
      candidate.sections.every((section) =>
        section.fields.every((field) =>
          field.cells.every((cell) =>
            cell.lines.every(
              (line) =>
                width(line, DICT.cellSize) <=
                candidate.columnWidth[cell.column] - DICT.padX * 2 + 0.5,
            ),
          ),
        ),
      ),
    ),
  );
}

console.log("one grid, and it wraps");

{
  check(
    "the example exercises wrapping at all",
    layout.sections.some((s) =>
      s.fields.some(
        (f) => f.cells.find((c) => c.column === "description").lines.length > 1,
      ),
    ),
    "no description wrapped — the whole clipping section would pass vacuously",
  );
  check(
    "the description column never falls below its readable minimum",
    layout.columnWidth.description >= DICT.minDescription,
    `${layout.columnWidth.description}px`,
  );
  check(
    "the canvas is at least as wide as its columns need",
    layout.width >= layout.columnX.source + layout.columnWidth.source,
    `${layout.width} vs ${layout.columnX.source + layout.columnWidth.source}`,
  );
  /* Column x positions are shared across sections, or two sections read as
     two unrelated tables rather than one document with headings in it. */
  check(
    "every section shares one column grid",
    layout.sections.every((section) =>
      section.fields.every((field) =>
        field.cells.every(
          (cell) => cell.x === layout.columnX[cell.column] + DICT.padX,
        ),
      ),
    ),
  );
  check(
    "wrapping never drops or duplicates a word",
    wrapToWidth("one two three four five six", 60, 12.5).join(" ") ===
      "one two three four five six",
    JSON.stringify(wrapToWidth("one two three four five six", 60, 12.5)),
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
