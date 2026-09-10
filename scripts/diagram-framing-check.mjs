#!/usr/bin/env node
/**
 * FRAMING check — proves `src/lib/diagram-framing.ts` gives every notation
 * the frame it was asked for, and that the default frame is the one every
 * export had before framing existed.
 *
 * WHY THE DEFAULT MATTERS MOST. Framing is an option added under nine
 * renderers whose output people already have in READMEs and decks. The
 * expensive failure is not a wrong 16:9 — it is a `fit` export that quietly
 * stopped being byte-identical, which nothing else in the suite would catch
 * because every drawing would still be correct. So the first section here
 * asserts the untouched path, and the rest asserts the new ones.
 *
 * What it proves:
 *   1. `fit` changes nothing — byte-identical output for all nine notations,
 *      at the default and at an unknown value from a URL.
 *   2. A ratio GROWS the frame and never crops: the new box contains the old
 *      one, centred, on the short axis only.
 *   3. The letterbox is painted. Every theme's `--canvas` is OPAQUE, which is
 *      what makes the second backdrop rect sound — it overlaps the builder's
 *      own at the same colour. A translucent canvas would show a darker
 *      middle, so that is asserted rather than assumed.
 *   4. `trim` shrinks C4's margin and keeps its TITLE on the sheet. The title
 *      block hangs inside the top margin at `PADDING - 22`, which is negative
 *      the moment the margin shrinks — the heading fell off the top edge
 *      before the floors went in.
 *   5. `trim` is honest about the eight notations it cannot help.
 *   6. The route reads `?f=` and the export menu offers every value.
 *
 * Exits non-zero on any failure. Run with: pnpm check:diagram-framing
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const {
  DIAGRAM_FRAMINGS,
  DEFAULT_DIAGRAM_FRAMING,
  DIAGRAM_FRAMING_LABEL,
  TRIM_PADDING,
  framingPadding,
  parseDiagramFraming,
  reframeSvg,
} = await load("src/lib/diagram-framing.ts");
/* THE BUILDERS DIRECTLY, not `render-document.ts`, and not by preference:
   that module imports the server icon embedder, which reaches the registry's
   `.tsx` components, and Node's type stripping cannot read those. So this
   drives the same two calls the route makes — builder, then `reframeSvg` —
   and asserts against the route's SOURCE that it still makes them in that
   order. A stub embedder stands in for the artwork, which framing does not
   touch. */
const { renderDiagramSvg } = await load(
  "src/features/viewer/export/render-svg.ts",
);
const { renderSequenceFileSvg } = await load(
  "src/features/sequence/export/render-file-svg.ts",
);
const { parseViewSource } = await load(
  "src/features/playground/input/parse.ts",
);
const { EXPORT_PALETTES } = await load(
  "src/features/viewer/export/palette.generated.ts",
);
const { THEMES } = await load("src/lib/constants.ts");

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

/** One small, valid document per notation — enough to draw, small to compare. */
const DOCUMENTS = {
  c4: `archlab 1.0
title "Framed"
description "Two systems and a person."

@context ctx-root "Framed"
  p:person "Shopper"
  s:system "Storefront" [Next.js]
  x:external "Stripe"
  p -> s : "Buys"
  s -> x : "Charges" [REST]
`,
  sequence: `archlab 1.0 sequence
title "Framed"

@sequence
  a "A"
  b "B"
  a -> b : "x"
  b ..> a : "ok"
`,
  /* A WIDE ONE, and it is not decoration. Both fixtures above are taller
     than 16:9, so they only ever exercise the "grow the width" branch — a
     mutation that grew the width unconditionally passed every assertion
     here. Eight lifelines and one message is short and very wide, so the
     other branch runs too. */
  "sequence (wide)": `archlab 1.0 sequence
title "Wide"

@sequence
  a "Alpha"
  b "Bravo"
  c "Charlie"
  d "Delta"
  e "Echo"
  f "Foxtrot"
  g "Golf"
  h "Hotel"
  a -> h : "one long hop across every lifeline"
`,
};

const box = (svg) => {
  const m = /^<svg\b[^>]*\bviewBox="([^"]+)"/.exec(svg);
  if (m === null) return null;
  const [x, y, w, h] = m[1].split(/\s+/).map(Number);
  return { x, y, w, h };
};

const THEME = EXPORT_PALETTES.light;
const noIcon = () => "";

/** The route's own two steps, in the route's own order. */
const draw = (source, framing) => {
  const parsed = parseViewSource(source);
  if (parsed.status === "error") {
    return { status: "error", message: parsed.error.message };
  }
  const document_ = parsed.value;
  let rendered;
  if (document_.kind === "c4") {
    const file = document_.synced.file;
    const diagram = file.diagrams.find((d) => d.id === file.rootDiagramId);
    rendered = renderDiagramSvg(diagram, file.metadata.title, THEME, {
      embedIcon: noIcon,
      iconStyle: "mono",
      padding: framingPadding(framing),
    });
  } else if (document_.kind === "sequence") {
    rendered = renderSequenceFileSvg(document_.file, THEME);
  } else {
    return {
      status: "error",
      message: `unhandled fixture kind ${document_.kind}`,
    };
  }
  return {
    status: "ok",
    rendered: reframeSvg(rendered, framing, THEME.canvas),
  };
};

/* --------------------------------------------------------------------- */

console.log("the default frame is untouched");

for (const [kind, source] of Object.entries(DOCUMENTS)) {
  const fit = draw(source, "fit");
  check(
    `${kind}: draws at the default framing`,
    fit.status === "ok",
    fit.status === "error" ? fit.message : "",
  );
  const unknown = draw(source, parseDiagramFraming("not-a-framing"));
  check(
    `${kind}: an unknown framing is byte-identical to fit`,
    fit.status === "ok" &&
      unknown.status === "ok" &&
      fit.rendered.svg === unknown.rendered.svg,
    "an unrecognised ?f= must draw the ordinary frame, not a rectangle",
  );
}

check(
  "the default IS fit",
  DEFAULT_DIAGRAM_FRAMING === "fit",
  `default is "${DEFAULT_DIAGRAM_FRAMING}"`,
);
check(
  "fit and trim ask for no ratio; the three rectangles do",
  ["fit", "trim", "16x9", "4x3", "1x1"].every((f) =>
    DIAGRAM_FRAMINGS.includes(f),
  ) && DIAGRAM_FRAMINGS.length === 5,
  `framings: ${DIAGRAM_FRAMINGS.join(", ")}`,
);
check(
  "every framing has a name and a sentence for the menu",
  DIAGRAM_FRAMINGS.every(
    (f) =>
      typeof DIAGRAM_FRAMING_LABEL[f]?.name === "string" &&
      DIAGRAM_FRAMING_LABEL[f].name !== "" &&
      typeof DIAGRAM_FRAMING_LABEL[f]?.detail === "string" &&
      DIAGRAM_FRAMING_LABEL[f].detail !== "",
  ),
  "a framing with no sentence is an option a reader has to try to understand",
);

/* --------------------------------------------------------------------- */

console.log("\na ratio grows the frame, and never crops");

const RATIOS = { "16x9": 16 / 9, "4x3": 4 / 3, "1x1": 1 };

/* THE FIXTURES HAVE TO STRADDLE THE RATIO or half the code is never run.
   Asserted rather than assumed: a fixture edited to be a little taller would
   silently take this suite back to testing one branch. */
const shapes = Object.entries(DOCUMENTS).map(([kind, source]) => {
  const out = draw(source, "fit");
  const b = out.status === "ok" ? box(out.rendered.svg) : null;
  return { kind, ratio: b === null ? NaN : b.w / b.h };
});
check(
  "the fixtures include one WIDER than 16:9 and one taller",
  shapes.some((s) => s.ratio > 16 / 9) && shapes.some((s) => s.ratio < 1),
  shapes.map((s) => `${s.kind} ${s.ratio.toFixed(2)}`).join(", ") +
    " — without both, the branch that grows the HEIGHT is never taken",
);

for (const [kind, source] of Object.entries(DOCUMENTS)) {
  const fit = draw(source, "fit");
  if (fit.status !== "ok") continue;
  const base = box(fit.rendered.svg);

  for (const [framing, ratio] of Object.entries(RATIOS)) {
    const out = draw(source, framing);
    if (out.status !== "ok") {
      check(`${kind} ${framing}: draws`, false, out.message);
      continue;
    }
    const grown = box(out.rendered.svg);

    check(
      `${kind} ${framing}: the frame is that ratio`,
      Math.abs(grown.w / grown.h - ratio) < 0.001,
      `${grown.w}x${grown.h} = ${(grown.w / grown.h).toFixed(4)}, wanted ${ratio.toFixed(4)}`,
    );
    check(
      `${kind} ${framing}: the old frame is inside the new one`,
      grown.x <= base.x + 0.01 &&
        grown.y <= base.y + 0.01 &&
        grown.x + grown.w >= base.x + base.w - 0.01 &&
        grown.y + grown.h >= base.y + base.h - 0.01,
      `[${grown.x} ${grown.y} ${grown.w} ${grown.h}] does not contain [${base.x} ${base.y} ${base.w} ${base.h}] — a ratio must never crop`,
    );
    /* Growth on each side, compared. Written as two named quantities after
       the first attempt folded the signs together and reported every
       correctly-centred frame as off-centre. */
    const leftGrowth = base.x - grown.x;
    const rightGrowth = grown.x + grown.w - (base.x + base.w);
    const topGrowth = base.y - grown.y;
    const bottomGrowth = grown.y + grown.h - (base.y + base.h);
    check(
      `${kind} ${framing}: the drawing is centred in it`,
      Math.abs(leftGrowth - rightGrowth) < 0.02 &&
        Math.abs(topGrowth - bottomGrowth) < 0.02,
      `grew left ${leftGrowth}, right ${rightGrowth}, top ${topGrowth}, bottom ${bottomGrowth} — uneven growth sits the drawing off-centre in a deck`,
    );
    check(
      `${kind} ${framing}: only the short axis grew`,
      Math.abs(grown.w - base.w) < 0.01 !== Math.abs(grown.h - base.h) < 0.01 ||
        Math.abs(grown.w / grown.h - base.w / base.h) < 0.001,
      `w ${base.w}→${grown.w}, h ${base.h}→${grown.h}`,
    );
    check(
      `${kind} ${framing}: the reported size matches the frame`,
      out.rendered.width === Math.round(grown.w) &&
        out.rendered.height === Math.round(grown.h),
      `reported ${out.rendered.width}x${out.rendered.height} vs frame ${grown.w}x${grown.h} — the PNG rasterises at the reported size`,
    );
    /* The FILL is the point of the assertion, not the rect's presence: a
       band drawn with `fill="none"` is exactly as transparent as no band at
       all, and passed an earlier version of this check that only looked for
       the coordinates. */
    const round2 = (n) => String(Math.round(n * 100) / 100);
    check(
      `${kind} ${framing}: the letterbox is painted in the theme's canvas`,
      out.rendered.svg.includes(
        `<rect x="${round2(grown.x)}" y="${round2(grown.y)}" width="${round2(grown.w)}" height="${round2(grown.h)}" fill="${THEME.canvas}"/>`,
      ),
      `no full-frame rect filled ${THEME.canvas} — an unpainted band composites over whatever the viewer paints behind it, which is black in most image viewers`,
    );
  }
}

check(
  "every theme's canvas is OPAQUE",
  THEMES.every((name) => /^#[0-9a-f]{6}$/i.test(EXPORT_PALETTES[name].canvas)),
  `translucent: ${THEMES.filter((n) => !/^#[0-9a-f]{6}$/i.test(EXPORT_PALETTES[n].canvas)).join(", ")} — the letterbox rect overlaps the builder's own backdrop, so a translucent canvas would paint the middle darker than the band`,
);

check(
  "a framing with no ratio is returned untouched, object and all",
  (() => {
    const input = {
      svg: '<svg viewBox="0 0 10 10"></svg>',
      width: 10,
      height: 10,
    };
    return reframeSvg(input, "fit", "#fff") === input;
  })(),
  "the no-op path must not rebuild the string — that is what keeps `fit` byte-identical",
);
check(
  "markup this cannot parse is returned untouched rather than mangled",
  (() => {
    const input = { svg: "<not-an-svg/>", width: 1, height: 1 };
    return reframeSvg(input, "16x9", "#fff") === input;
  })(),
  "a builder that stops emitting a viewBox must degrade to the ordinary frame",
);

/* --------------------------------------------------------------------- */

console.log("\nthe sheet reaches the letterbox band");

/* A STAND-IN FOR A THEME'S GROUND. The real one reads live computed styles
   and returns its empty pair in Node, so a check script can never see a
   ruled sheet — but it CAN see whether the frame growth relays whatever the
   ground painted. This mimics `ground.ts` exactly where it matters: one rect
   per layer, each painted through an `af-ground-…` id, which is the anchor
   `reframeSvg` removes on. */
const stubGround = {
  layers: (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#af-ground-lines-0)" opacity="0.5"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#af-ground-sheen)"/>`,
};

/** The route's two steps again, with a ground under them. */
const drawGrounded = (source, framing) => {
  const parsed = parseViewSource(source);
  if (parsed.status === "error") return null;
  const document_ = parsed.value;
  const base =
    document_.kind === "c4"
      ? renderDiagramSvg(
          document_.synced.file.diagrams.find(
            (d) => d.id === document_.synced.file.rootDiagramId,
          ),
          document_.synced.file.metadata.title,
          THEME,
          {
            embedIcon: noIcon,
            iconStyle: "mono",
            padding: framingPadding(framing),
          },
        )
      : renderSequenceFileSvg(document_.file, THEME);
  /* The sheet the builder would have painted, spliced in where every builder
     puts it: right after its own backdrop. */
  const withSheet = {
    ...base,
    svg: base.svg.replace(
      /(<rect\b[^>]*fill="[^"]*"\/>)/,
      (m) => m + stubGround.layers(0, 0, base.width, base.height),
    ),
  };
  return reframeSvg(withSheet, framing, THEME.canvas, stubGround);
};

/** Each fixture's unframed size, so the old backdrop can be looked for. */
const base0 = Object.fromEntries(
  Object.entries(DOCUMENTS).map(([kind, source]) => {
    const fit = draw(source, "fit");
    return [kind, fit.status === "ok" ? fit.rendered : { width: 0, height: 0 }];
  }),
);

for (const [kind, source] of Object.entries(DOCUMENTS)) {
  const out = drawGrounded(source, "16x9");
  if (out === null) continue;
  const frame = box(out.svg);
  const groundRects = [
    ...out.svg.matchAll(/<rect\b[^>]*url\(#af-ground-[^>]*\/>/g),
  ].map((m) => m[0]);

  check(
    `${kind}: the letterboxed frame is still grounded`,
    groundRects.length > 0,
    "the band came out in flat canvas — a blueprint whose ruling stops where the drawing stops is not a blueprint (ground.ts)",
  );
  check(
    `${kind}: the sheet is painted ONCE, not once per frame`,
    groundRects.length === 2,
    `${groundRects.length} ground rects, wanted 2 — the sheen is an objectBoundingBox gradient, so a second one is a second band of light rather than the same band made longer, and the ruling doubles its opacity in the overlap`,
  );
  check(
    `${kind}: and it spans the WHOLE frame, band included`,
    groundRects.every(
      (rect) =>
        rect.includes(`x="${String(Math.round(frame.x * 100) / 100)}"`) &&
        rect.includes(`width="${String(Math.round(frame.w * 100) / 100)}"`),
    ),
    `frame is [${frame.x} ${frame.y} ${frame.w} ${frame.h}]; ground rects: ${groundRects.join(" ")}`,
  );
  /* NOT A COUNT OF CANVAS-FILLED RECTS: C4 plates its edge labels in the
     canvas colour, so two is correct there and one would be wrong. What
     must hold is that the FIRST one — the backdrop, which every builder
     emits before any content — is the relaid full-frame rect, and that the
     builder's own is gone rather than sitting on top of the new sheet. */
  const firstCanvasRect = new RegExp(
    `<rect\\b[^>]*fill="${THEME.canvas}"[^>]*/>`,
  ).exec(out.svg)?.[0];
  check(
    `${kind}: the backdrop under the sheet is the relaid one`,
    firstCanvasRect !== undefined &&
      firstCanvasRect.includes(`x="${frame.x}"`) &&
      firstCanvasRect.includes(`width="${frame.w}"`),
    `first canvas rect is ${firstCanvasRect} — the builder's own must be lifted out, or it paints over the relaid sheet in the middle`,
  );
  check(
    `${kind}: the builder's own backdrop is gone, not merely covered`,
    !out.svg.includes(
      `<rect x="0" y="0" width="${base0[kind].width}" height="${base0[kind].height}" fill="${THEME.canvas}"/>`,
    ) &&
      !out.svg.includes(
        `<rect width="${base0[kind].width}" height="${base0[kind].height}" fill="${THEME.canvas}"/>`,
      ),
    "an opaque rect over the old frame would hide the relaid ruling everywhere except the band",
  );
}

const ungrounded = (() => {
  const parsed = parseViewSource(DOCUMENTS.sequence);
  const base = renderSequenceFileSvg(parsed.value.file, THEME);
  return reframeSvg(base, "16x9", THEME.canvas);
})();
check(
  "a caller with no ground still gets a painted band",
  (ungrounded.svg.match(new RegExp(`fill="${THEME.canvas}"`, "g")) ?? [])
    .length === 1 && !ungrounded.svg.includes("af-ground-"),
  "the server has no sheet to relay — it must degrade to a plain backdrop, not to a transparent band",
);

console.log("\ntrim");

check(
  "trim is the only framing that overrides a renderer's margin",
  DIAGRAM_FRAMINGS.every(
    (f) => (framingPadding(f) === undefined) === (f !== "trim"),
  ) && framingPadding("trim") === TRIM_PADDING,
  `trim → ${framingPadding("trim")}, others → ${DIAGRAM_FRAMINGS.filter(
    (f) => f !== "trim",
  )
    .map((f) => String(framingPadding(f)))
    .join(", ")}`,
);
check(
  "trim leaves a hairline rather than nothing",
  TRIM_PADDING > 0 && TRIM_PADDING < 24,
  `TRIM_PADDING is ${TRIM_PADDING} — at zero the heading's first character sits on the boundary and reads as a crop`,
);

const c4Fit = draw(DOCUMENTS.c4, "fit");
const c4Trim = draw(DOCUMENTS.c4, "trim");
check(
  "trim shrinks the C4 frame by the margin it removed, on both axes",
  c4Fit.status === "ok" &&
    c4Trim.status === "ok" &&
    c4Fit.rendered.width - c4Trim.rendered.width === (56 - TRIM_PADDING) * 2 &&
    c4Fit.rendered.height - c4Trim.rendered.height === (56 - TRIM_PADDING) * 2,
  c4Fit.status === "ok" && c4Trim.status === "ok"
    ? `${c4Fit.rendered.width}x${c4Fit.rendered.height} → ${c4Trim.rendered.width}x${c4Trim.rendered.height}`
    : "one of them did not draw",
);

/* THE HEADING, which is what actually broke. Its two baselines were written
   as `PADDING - 22` and `PADDING - 2`, so a smaller margin put them at
   negative y and the title left the sheet entirely. */
/* PAGE FURNITURE ONLY. The title block is emitted before the model's own
   transform group, so everything after `<g transform="translate(` is the
   drawing and must not be scanned — matching on font size alone picked up a
   node label 637px down and reported the heading as clear of nothing. */
const trimmedSvg = c4Trim.status === "ok" ? c4Trim.rendered.svg : "";
const furniture = trimmedSvg.slice(
  0,
  trimmedSvg.indexOf('<g transform="translate('),
);
const headingYs = [
  ...furniture.matchAll(/<text x="[\d.]+" y="(-?[\d.]+)" font-family=/g),
].map((m) => Number(m[1]));
check(
  "the trimmed C4 title block is still ON the sheet",
  headingYs.length >= 2 && headingYs.every((y) => y > 0),
  `title baselines at ${headingYs.join(", ")} — anything ≤ 0 is a heading drawn off the top edge`,
);
check(
  "and the trimmed title still clears the drawing below it",
  c4Trim.status === "ok" &&
    headingYs.length >= 2 &&
    Math.max(...headingYs) < TRIM_PADDING + 64,
  `lowest baseline ${Math.max(...headingYs)} vs drawing top ${TRIM_PADDING + 64}`,
);

const seqFit = draw(DOCUMENTS.sequence, "fit");
const seqTrim = draw(DOCUMENTS.sequence, "trim");
check(
  "trim is a no-op for a notation whose margin is layout, not a margin",
  seqFit.status === "ok" &&
    seqTrim.status === "ok" &&
    seqFit.rendered.svg === seqTrim.rendered.svg,
  "the eight non-C4 builders bake their margins into layout — removing one would move every coordinate rather than crop the sheet, so trim draws the ordinary frame and the route says so",
);

/* --------------------------------------------------------------------- */

console.log("\nthe two call sites");

const routeSource = readFileSync(
  path.join(ROOT, "src/app/api/render/route.ts"),
  "utf8",
);
check(
  "the render route reads ?f= through the vocabulary's own parser",
  /parseDiagramFraming\(url\.searchParams\.get\("f"\)\)/.test(routeSource),
  "a second spelling of the framing names is a second place they can drift",
);
check(
  "the route says out loud that trim reaches C4 only",
  /trim/.test(routeSource) && /only C4/.test(routeSource),
  "a parameter that quietly does nothing is worse than one that is absent — the route's own iconStyle note makes this argument",
);

const documentSource = readFileSync(
  path.join(ROOT, "src/features/render/lib/render-document.ts"),
  "utf8",
);
check(
  "the route applies the ratio to whatever the builder returned",
  /reframeSvg\(\s*draw\(document_, theme, request\),/.test(documentSource),
  "the aspect pass has to wrap the dispatch, or eight notations quietly ignore ?f=",
);
check(
  "and threads the margin into the one builder that has one",
  /padding: framingPadding\(request\.framing\)/.test(documentSource),
  "without it `f=trim` is a no-op for C4 too, which is the only kind it works for",
);

const menuSource = readFileSync(
  path.join(ROOT, "src/features/viewer/export/export-button.tsx"),
  "utf8",
);
check(
  "the export menu offers every framing, from the one list",
  /DIAGRAM_FRAMINGS\.map\(/.test(menuSource),
  "a hand-written <option> per framing is how the menu comes to be missing the newest one",
);
check(
  "the export menu applies BOTH halves — the margin and the ratio",
  /padding: framingPadding\(framing\)/.test(menuSource) &&
    /reframeSvg\(/.test(menuSource),
  "applying only one half exports a trimmed drawing in an untrimmed frame, or the reverse",
);
const shareSource = readFileSync(
  path.join(ROOT, "src/features/viewer/share/share-button.tsx"),
  "utf8",
);
check(
  "the Share panel lets a sharer choose the frame at all",
  /DIAGRAM_FRAMINGS\.map\(/.test(shareSource) &&
    /framing,\n\s*title: documentTitle/.test(shareSource),
  "Copy markdown mints a render URL, so the frame has to be choosable where the button is — otherwise the parameter exists and nothing in the product can set it",
);

/* ADJACENCY IS THE EXPLANATION, so it is pinned like any other contract. The
   frame sat in the link-settings group for a release, two rows above the only
   button it affects — every assertion green, and a reader adjusting it had no
   way to tell what it changed. Source order is the cheapest true proxy for
   "in the same row as": the markdown button, then the frame, then the
   download, with the link's own settings group already closed above them. */
const markdownAt = shareSource.indexOf('"Copy markdown"');
const framingAt = shareSource.indexOf("-framing`}");
const downloadAt = shareSource.indexOf("onClick={handleDownload}");
const settingsGroupAt = shareSource.indexOf(
  "divide-y divide-border/60 rounded-md",
);
check(
  "the frame sits between Copy markdown and the download, not in the link settings",
  markdownAt !== -1 &&
    framingAt !== -1 &&
    downloadAt !== -1 &&
    settingsGroupAt < markdownAt &&
    markdownAt < framingAt &&
    framingAt < downloadAt,
  `settings group at ${settingsGroupAt}, markdown at ${markdownAt}, frame at ${framingAt}, download at ${downloadAt} — a setting for one button belongs against that button`,
);
check(
  "and stops telling the reader to hand-edit the URL",
  !/&amp;f=16x9/.test(shareSource),
  "the disclosure's instructions to append ?f= by hand outlived the control that replaced them",
);
check(
  "the framing reaches the GIF and the archive too, not just Copy PNG",
  /const render = \(target: C4Diagram\) =>\s*reframeSvg\(/.test(menuSource),
  "every format in this menu renders through one `render()` — framing has to sit there, or two items in one menu disagree about the frame",
);

/* --------------------------------------------------------------------- */

console.log();
if (failures > 0) {
  console.error(
    `diagram-framing-check: ${failures} of ${assertions} assertions FAILED.`,
  );
  process.exit(1);
}
console.log(`diagram-framing-check: all ${assertions} assertions passed.`);
