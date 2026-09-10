#!/usr/bin/env node
/**
 * Sequence SERVER-RENDER check — proves
 * `src/features/sequence/export/render-file-svg.ts` draws the same diagram
 * the canvas draws, without a browser.
 *
 * WHY THIS EXISTS, and it is the whole price of the feature. The sequence
 * notation deliberately had ONE renderer: its download clones the live
 * canvas precisely so a second renderer could not drift from the first
 * (`sequence/export/render-svg.ts` argues it). `/api/render` has no canvas
 * to clone, so a from-model builder went in beside the clone — and the
 * argument that was true about drift is still true. This is what buys it
 * down, in the manner of `check:bezier-path` and `check:icon-markup`: the
 * two things a second renderer can get wrong are WHERE and WHAT COLOUR, so
 * every coordinate is asserted against `layoutSequence` and every colour
 * against the export palette, element by element.
 *
 * What it proves:
 *   1. It draws — every theme, every construct in the bundled example.
 *   2. Geometry is the LAYOUT's. Header cards, lifelines, footer cards,
 *      activation bars, notes, fragments and message endpoints are read out
 *      of the emitted markup and compared to `layoutSequence(file)`.
 *   3. The frame is the layout's own, `minX` included — a `note left` of the
 *      first participant draws at a negative x and a `0 0` viewBox would
 *      crop exactly those notes off the image.
 *   4. PAINT ORDER, which SVG expresses only as document order and the
 *      layout cannot see: fragment boxes, then activation bars, then chips,
 *      then notes, then messages. A chip drawn with its box was cut in half
 *      by a bar at the fragment's left edge once already — the canvas check
 *      pins the same ordering in the canvas.
 *   5. Self-containment: no `var()`, no `color-mix()`, no `oklch()`, no
 *      remote reference, and every `url(#id)` resolves to an id the file
 *      itself defines. A dangling paint reference renders black.
 *   6. No chrome and no motion — hit regions, fold pills and comet bands are
 *      for a reader who can point at the screen.
 *   7. The icon gate: a known slug draws its mark, an UNKNOWN slug draws
 *      nothing rather than the registry's type fallback, which is what the
 *      canvas does.
 *   8. `xml:space="preserve"` on every message label that carries a tspan.
 *      Without it the gaps around the step number and the technology suffix
 *      are leading/trailing whitespace in their own text node, which XML
 *      strips: "1.Clicks Place order[HTTPS]". It shipped that way for one
 *      commit and a non-breaking space did NOT fix it.
 *   9. The route refuses no notation any more.
 *
 * Exits non-zero on any failure. Run with: pnpm check:sequence-render
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const { renderSequenceFileSvg } = await load(
  "src/features/sequence/export/render-file-svg.ts",
);
const { layoutSequence, SEQ } = await load(
  "src/features/sequence/lib/layout.ts",
);
const { EXPORT_PALETTES } = await load(
  "src/features/viewer/export/palette.generated.ts",
);
const { ICON_MARKUP } = await load(
  "src/features/viewer/export/icon-markup.generated.ts",
);
const { parseSequenceText } = await load("src/features/archtext/index.ts");
const { SEQUENCE_EXAMPLE } = await load(
  "src/features/sequence/input/example.ts",
);
const { THEMES } = await load("src/lib/constants.ts");

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function check(label, condition, detail) {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

/** Every `<tag …/>` or `<tag …>` in document order, with its attributes. */
function elementsOf(svg) {
  const out = [];
  const re = /<([a-zA-Z:]+)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const attrs = {};
    /* The name class MUST carry digits: `x1`/`y2` are most of what this
       check reads, and a letters-only class silently captured none of
       them — every lifeline and divider assertion passed vacuously as
       "not found" until it did not. */
    const ar = /([a-zA-Z][a-zA-Z0-9:-]*)="([^"]*)"/g;
    let a;
    while ((a = ar.exec(m[2])) !== null) attrs[a[1]] = a[2];
    out.push({ tag: m[1], attrs, at: m.index });
  }
  return out;
}

const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

/* ----------------------------------------------------------------------- */
/* Fixture — the bundled example, every construct in realistic use          */
/* ----------------------------------------------------------------------- */

const file = parseSequenceText(SEQUENCE_EXAMPLE);
const layout = layoutSequence(file);
const theme = EXPORT_PALETTES.light;
const rendered = renderSequenceFileSvg(file, theme);
const svg = rendered.svg;
const elements = elementsOf(svg);

console.log("it draws");

check(
  "the bundled example renders to a non-trivial SVG",
  svg.startsWith("<svg ") && svg.endsWith("</svg>") && svg.length > 2000,
  `${svg.length} bytes`,
);
check(
  "the reported size is the layout's",
  rendered.width === Math.round(layout.width) &&
    rendered.height === Math.round(layout.height),
  `${rendered.width}x${rendered.height} vs layout ${layout.width}x${layout.height}`,
);

const root = elements[0];
check(
  "the frame is the layout's own, minX included",
  root.attrs.viewBox ===
    `${layout.minX} 0 ${layout.width} ${layout.height}`.replace(
      /(\d+\.\d\d)\d+/g,
      "$1",
    ) || root.attrs.viewBox.split(" ")[0] === String(layout.minX),
  `viewBox "${root.attrs.viewBox}" vs minX ${layout.minX}`,
);
check(
  "it carries an accessible name and description",
  / role="img"/.test(svg) && /<title id=/.test(svg) && /<desc id=/.test(svg),
  "an exported file is pasted where nothing else supplies alt text",
);

/* ----------------------------------------------------------------------- */
/* Geometry is the layout's, not a second derivation                        */
/* ----------------------------------------------------------------------- */

console.log("\ngeometry comes from lib/layout.ts");

const rects = elements.filter((e) => e.tag === "rect");
const lines = elements.filter((e) => e.tag === "line");

for (const participant of layout.participants) {
  const boxTop =
    layout.headerTop +
    (participant.kind === "actor" ? SEQ.actorGlyphHeight : 0);
  const boxHeight = layout.headerHeight - (boxTop - layout.headerTop);
  const header = rects.find(
    (r) =>
      near(Number(r.attrs.x), participant.x - participant.headerWidth / 2) &&
      near(Number(r.attrs.y), boxTop) &&
      near(Number(r.attrs.width), participant.headerWidth) &&
      near(Number(r.attrs.height), boxHeight),
  );
  check(
    `${participant.id}: the header card sits exactly where the layout put it`,
    header !== undefined,
    `wanted x ${participant.x - participant.headerWidth / 2}, y ${boxTop}, w ${participant.headerWidth}, h ${boxHeight}`,
  );

  const footer = rects.find(
    (r) =>
      near(Number(r.attrs.x), participant.x - participant.headerWidth / 2) &&
      near(Number(r.attrs.y), layout.footerTop) &&
      near(Number(r.attrs.height), layout.footerHeight),
  );
  check(
    `${participant.id}: the footer card repeats the name at footerTop`,
    footer !== undefined,
    `no footer rect at y ${layout.footerTop}`,
  );

  const lifeline = lines.find(
    (l) =>
      near(Number(l.attrs.x1), participant.x) &&
      near(Number(l.attrs.x2), participant.x) &&
      near(Number(l.attrs.y1), layout.lifelineTop),
  );
  check(
    `${participant.id}: the lifeline runs from lifelineTop down to the footer`,
    lifeline !== undefined && near(Number(lifeline.attrs.y2), layout.footerTop),
    lifeline === undefined
      ? "no lifeline on this column"
      : `y2 ${lifeline.attrs.y2}, wanted ${layout.footerTop} (footerTop, NOT lifelineBottom — the line must visibly join the card)`,
  );
}

check(
  "every activation bar is drawn at its own extent",
  layout.activations.every((bar) =>
    rects.some(
      (r) =>
        near(Number(r.attrs.x), bar.x) &&
        near(Number(r.attrs.y), bar.y0) &&
        near(Number(r.attrs.width), bar.width) &&
        near(Number(r.attrs.height), Math.max(0, bar.y1 - bar.y0)),
    ),
  ),
  `${layout.activations.length} bars in the layout`,
);

check(
  "every fragment box is drawn at its own rectangle",
  layout.fragments.every((fragment) =>
    rects.some(
      (r) =>
        near(Number(r.attrs.x), fragment.x) &&
        near(Number(r.attrs.y), fragment.y) &&
        near(Number(r.attrs.width), fragment.width) &&
        near(Number(r.attrs.height), fragment.height),
    ),
  ),
  `${layout.fragments.length} fragments in the layout`,
);

check(
  "every branch divider is ruled across its fragment",
  layout.fragments.every((fragment) =>
    fragment.dividers.every((divider) =>
      lines.some(
        (l) =>
          near(Number(l.attrs.y1), divider.y) &&
          near(Number(l.attrs.x1), fragment.x) &&
          near(Number(l.attrs.x2), fragment.x + fragment.width),
      ),
    ),
  ),
  "a divider that stops short of the box reads as an unrelated rule",
);

const paths = elements.filter((e) => e.tag === "path");
check(
  "every note is a dog-eared box at the layout's rectangle",
  layout.notes.every((note) =>
    paths.some((p) =>
      p.attrs.d.startsWith(
        `M ${note.x} ${note.y} H ${note.x + note.width - 10}`,
      ),
    ),
  ),
  `${layout.notes.length} notes in the layout`,
);
check(
  "a note draws one line of text per WRAPPED line, never the raw string",
  layout.notes.every((note) => {
    const texts = elements.filter(
      (e) =>
        e.tag === "text" &&
        near(Number(e.attrs.x), note.x + note.width / 2) &&
        Number(e.attrs.y) > note.y &&
        Number(e.attrs.y) < note.y + note.height,
    );
    return texts.length === note.lines.length;
  }),
  "SVG text does not wrap: the raw string runs through both walls of the box",
);

check(
  "every message line starts at its own fromX and y",
  layout.messages.every((message) =>
    paths.some((p) => p.attrs.d.startsWith(`M ${message.fromX} ${message.y} `)),
  ),
  `${layout.messages.length} messages in the layout`,
);
check(
  "a self-message draws the loop, not a straight run",
  layout.messages
    .filter((m) => m.self)
    .every((message) =>
      paths.some((p) =>
        p.attrs.d.startsWith(
          `M ${message.fromX} ${message.y} h ${SEQ.selfLoopWidth} v ${SEQ.selfLoopHeight}`,
        ),
      ),
    ),
  `${layout.messages.filter((m) => m.self).length} self-messages`,
);

check(
  "the heading draws one line per wrapped title line",
  layout.heading.titleLines.every((_, index) =>
    elements.some(
      (e) =>
        e.tag === "text" &&
        near(Number(e.attrs.x), SEQ.marginX) &&
        near(
          Number(e.attrs.y),
          SEQ.marginTop + SEQ.titleFontSize + index * SEQ.titleLineHeight,
        ),
    ),
  ),
  "the title lives INSIDE the drawing so it travels with the file",
);

/* ----------------------------------------------------------------------- */
/* Paint order — SVG has no z-index, so document order IS stacking order    */
/* ----------------------------------------------------------------------- */

console.log("\npaint order");

const firstFragment = layout.fragments[0];
const boxAt = svg.indexOf(
  `<rect x="${firstFragment.x}" y="${firstFragment.y}"`,
);
const barAt = svg.indexOf(
  `<rect x="${layout.activations[0].x}" y="${layout.activations[0].y0}"`,
);
const chipAt = svg.indexOf(`height="18" rx="6"`);
const noteAt = svg.indexOf(`M ${layout.notes[0].x} ${layout.notes[0].y} H`);
const messageAt = svg.indexOf(
  `M ${layout.messages[0].fromX} ${layout.messages[0].y} `,
);

check(
  "fragment boxes paint before the activation bars",
  boxAt !== -1 && barAt !== -1 && boxAt < barAt,
  `box at ${boxAt}, bar at ${barAt}`,
);
check(
  "fragment chips paint AFTER the activation bars",
  barAt !== -1 && chipAt !== -1 && barAt < chipAt,
  `bar at ${barAt}, chip at ${chipAt} — a bar at a fragment's left edge cut "rect" down to "r ct" when the chip painted first`,
);
check(
  "chips paint before the notes, and notes before the messages",
  chipAt < noteAt && noteAt < messageAt,
  `chip ${chipAt}, note ${noteAt}, message ${messageAt} — a label is a control, but the diagram is the content`,
);

/* ----------------------------------------------------------------------- */
/* Self-containment                                                         */
/* ----------------------------------------------------------------------- */

console.log("\nthe file stands alone");

for (const forbidden of ["var(--", "color-mix(", "oklch(", "currentColor"]) {
  /* `currentColor` is legal inside an EMBEDDED ICON, which inherits the
     `<g color>` wrapper the embedder writes; nothing else may use it, and no
     icon is embedded in this render. */
  check(
    `no \`${forbidden}\` survives into the file`,
    !svg.includes(forbidden),
    "a custom property or a modern colour function paints black once the file leaves the page",
  );
}
check(
  "nothing is fetched from anywhere",
  !/(?:href|src)\s*=\s*"(?:https?:)?\/\//.test(svg) &&
    !svg.includes("url(http"),
  "an export that needs the network is not an export",
);

const defined = new Set(
  [
    ...svg.matchAll(
      /<(?:linearGradient|radialGradient|pattern|filter|clipPath|mask)[^>]*\bid="([^"]+)"/g,
    ),
  ].map((m) => m[1]),
);
const referenced = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
const dangling = referenced.filter((id) => !defined.has(id));
check(
  "every url(#id) paint resolves to an id this file defines",
  dangling.length === 0,
  `dangling: ${dangling.join(", ")} — a dangling paint reference renders black`,
);
check(
  "it mints a card gradient per participant and a ramp per message",
  referenced.length > 0 &&
    layout.participants.every((p) => defined.has(`seq-card-${p.id}`)),
  `${defined.size} gradients defined for ${layout.participants.length} participants and ${layout.messages.length} messages`,
);

/* ----------------------------------------------------------------------- */
/* Chrome and motion are for the screen                                     */
/* ----------------------------------------------------------------------- */

console.log("\nno chrome, no motion");

for (const forbidden of [
  "af-seq-chrome",
  "af-seq-flow",
  "pointer-events",
  "tabindex",
  'role="button"',
  "pathLength",
]) {
  check(
    `no \`${forbidden}\` in a still image`,
    !svg.includes(forbidden),
    "hit regions and comet bands exist for a reader who can point at the screen",
  );
}

/* ----------------------------------------------------------------------- */
/* Whitespace in the message label — the regression that shipped            */
/* ----------------------------------------------------------------------- */

console.log("\nlabel whitespace");

const labelTexts = [
  ...svg.matchAll(/<text\b((?:[^>"]|"[^"]*")*)>((?:(?!<\/text>).)*)<\/text>/g),
].filter((m) => m[2].includes("<tspan"));
check(
  "every label carrying a tspan preserves its whitespace",
  labelTexts.length > 0 &&
    labelTexts.every((m) => m[1].includes('xml:space="preserve"')),
  `${labelTexts.filter((m) => !m[1].includes('xml:space="preserve"')).length} of ${labelTexts.length} without it — the gaps are leading/trailing whitespace in their own text node, and XML strips exactly that`,
);
check(
  "the gaps are real spaces, not a non-breaking space",
  !svg.includes("&#160;") && !svg.includes(" "),
  "librsvg drops U+00A0 in text layout too; xml:space is the fix that holds",
);

/* ----------------------------------------------------------------------- */
/* The icon gate                                                            */
/* ----------------------------------------------------------------------- */

console.log("\nparticipant icons");

const ICON_DOC = `archlab 1.0 sequence
title "Icons"

@sequence
  a "Known" @nextjs [Next.js]
  b "Unknown" @totallynotanicon [Go]
  c "None"
  a -> b : "x"
  b -> c : "y"
`;
const iconFile = parseSequenceText(ICON_DOC);
const embedded = [];
const stub = (node, x, y, size, color, style) => {
  embedded.push({ slug: node.icon, x, y, size, color, style });
  return `<rect class="stub" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
};
renderSequenceFileSvg(iconFile, theme, {
  embedIcon: stub,
  iconStyle: "mono",
});

check(
  "the registry has the known slug and not the invented one",
  ICON_MARKUP["mono:nextjs"] !== undefined &&
    ICON_MARKUP["mono:totallynotanicon"] === undefined,
  "the fixture is only meaningful if these two hold",
);
check(
  "a known slug draws its mark, once",
  embedded.length === 1 && embedded[0].slug === "nextjs",
  `embedder called for ${JSON.stringify(embedded.map((e) => e.slug))}`,
);
check(
  "an UNKNOWN slug draws nothing, never the registry's type fallback",
  !embedded.some((e) => e.slug === "totallynotanicon"),
  "a document naming an icon this build lacks is still a valid document — the canvas draws no icon for it",
);
check(
  "the mark is sized and inked from the layout's own constants",
  embedded[0]?.size === SEQ.iconSize && embedded[0]?.color === theme.nodeMeta,
  `size ${embedded[0]?.size}, colour ${embedded[0]?.color}`,
);
check(
  "no embedder means no icon, and no reserved gap either",
  !renderSequenceFileSvg(iconFile, theme).svg.includes("stub"),
  "a caller that passes no embedder gets cards without marks",
);

/* ----------------------------------------------------------------------- */
/* Every theme                                                              */
/* ----------------------------------------------------------------------- */

console.log("\nevery theme draws");

for (const name of THEMES) {
  const out = renderSequenceFileSvg(file, EXPORT_PALETTES[name]);
  const bad =
    out.svg.includes("undefined") ||
    out.svg.includes("NaN") ||
    /(?:fill|stroke|stop-color)=""/.test(out.svg);
  check(
    `${name}: draws with no unresolved paint`,
    !bad && out.svg.length > 2000,
    "an unresolved token reaches the reader as a black shape",
  );
}

const distinct = new Set(
  THEMES.map(
    (name) =>
      renderSequenceFileSvg(file, EXPORT_PALETTES[name]).svg.match(
        /fill="(#[0-9a-f]{6})"/,
      )?.[1],
  ),
);
check(
  "the themes are not all painting the same backdrop",
  distinct.size > 1,
  `${distinct.size} distinct backdrops across ${THEMES.length} themes — a palette that is ignored is a palette that is wrong`,
);

/* ----------------------------------------------------------------------- */
/* The route refuses nothing                                                */
/* ----------------------------------------------------------------------- */

console.log("\nthe render route");

const routeSource = readFileSync(
  path.join(ROOT, "src/features/render/lib/render-document.ts"),
  "utf8",
);
check(
  "no notation is refused by name any more",
  !/const SERVER_REFUSALS/.test(routeSource),
  "a refusal here is a diagram a reader cannot put in a README",
);
check(
  "the route draws sequence documents through this builder",
  routeSource.includes("renderSequenceFileSvg"),
  "the switch and the builder have to agree about who draws this kind",
);

const shareSource = readFileSync(
  path.join(ROOT, "src/features/viewer/share/share-button.tsx"),
  "utf8",
);
check(
  "the Share panel offers Copy markdown to every notation with a payload",
  !/^\s*markdownRefusal[?,:]/m.test(shareSource),
  "the per-notation refusal PROP outlived the notation it was written for (its name may still appear in prose explaining why it is gone)",
);

/* ----------------------------------------------------------------------- */

console.log();
if (failures > 0) {
  console.error(
    `sequence-render-check: ${failures} of ${assertions} assertions FAILED.`,
  );
  process.exit(1);
}
console.log(`sequence-render-check: all ${assertions} assertions passed.`);
