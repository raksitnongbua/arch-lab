#!/usr/bin/env node
/**
 * SVG ACCESSIBILITY check — an exported diagram must say what it is.
 *
 * An exported SVG is the one artefact that leaves this app. It gets pasted into
 * a README, a wiki, a deck — surfaces where nothing else supplies alt text and
 * where the diagram is often the only thing on the page carrying the argument.
 * EIGHT OF THE NINE EXPORTERS EMITTED NO ACCESSIBLE NAME AT ALL: not a diagram
 * with a poor description, an object with none. The ninth had a name and no
 * description, under a FIXED id that a second diagram on the same page would
 * also claim.
 *
 * WHAT IS ASSERTED, and why it is built rather than grepped: the strings come
 * from `lib/svg-a11y.ts` by running it, so the shape of what ships is checked
 * rather than the presence of a call. The per-exporter assertions then confirm
 * each renderer actually uses it — a module nobody calls is a promise, not a
 * feature.
 *
 * THE SEQUENCE EXPORTER IS DELIBERATELY DIFFERENT and is checked differently.
 * It CLONES the live canvas rather than building markup (`sequence/export/
 * render-svg.ts` says why), so its accessible name comes from the component's
 * own `role="img"` + `aria-label`, which the clone inherits. That is a real
 * accessible name; it is simply not a `<title>` element, so demanding one here
 * would fail a file that is correct.
 *
 * Run with: pnpm check:svg-a11y
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const { MAX_SVG_TITLE_LENGTH, countOf, svgAccessibility } = await load(
  "src/lib/svg-a11y.ts",
);

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

console.log("\n1. The name and the description");

check("both are emitted, and the svg points at both", () => {
  const a11y = svgAccessibility({
    title: "Orders",
    description: null,
    summary: "A context view of 3 elements and 2 relationships.",
    idSeed: "d-ctx-root",
  });
  assert.match(a11y.attributes, /role="img"/);
  assert.match(
    a11y.attributes,
    new RegExp(`aria-labelledby="${a11y.titleId} ${a11y.descId}"`),
    "the description is not part of the accessible name, so it is never read",
  );
  assert.match(a11y.elements, /<title id="[^"]+">Orders<\/title>/);
  assert.match(a11y.elements, /<desc id="[^"]+">A context view of/);
});

check("the author's own description wins over the composed one", () => {
  /* The one sentence in the document written to say what the diagram MEANS.
     Anything composed from counts describes what it contains, which is the
     second-best answer and only worth giving when there is no first. */
  const a11y = svgAccessibility({
    title: "Orders",
    description: "How a refund reaches the ledger.",
    summary: "A context view of 3 elements and 2 relationships.",
    idSeed: "d",
  });
  assert.match(a11y.elements, /<desc[^>]*>How a refund reaches the ledger\.</);
  assert.doesNotMatch(a11y.elements, /3 elements/);
});

check("a blank description falls back rather than shipping empty", () => {
  for (const description of [null, undefined, "", "   "]) {
    const a11y = svgAccessibility({
      title: "T",
      description,
      summary: "A summary sentence.",
      idSeed: "d",
    });
    assert.match(
      a11y.elements,
      /<desc[^>]*>A summary sentence\.</,
      `a ${JSON.stringify(description)} description produced an empty <desc>`,
    );
  }
});

check("the name is capped, on a word boundary", () => {
  const long =
    "The platform context view showing every system that participates in fulfilment";
  const a11y = svgAccessibility({
    title: long,
    description: null,
    summary: "s",
    idSeed: "d",
  });
  const name = /<title[^>]*>([^<]*)</.exec(a11y.elements)[1];
  assert.ok(
    [...name].length <= MAX_SVG_TITLE_LENGTH,
    `the name is ${[...name].length} characters — a name is announced in full ` +
      "before a listener can act on it",
  );
  assert.doesNotMatch(name, /\s…$/, "the trim left a dangling space");
  assert.match(name, /…$/, "a trimmed name does not say it was trimmed");
});

check("a document with no title still gets a name", () => {
  const a11y = svgAccessibility({
    title: "   ",
    description: null,
    summary: "s",
    idSeed: "",
  });
  assert.match(a11y.elements, /<title[^>]*>Diagram<\/title>/);
  assert.match(a11y.titleId, /^diagram-title$/, "the id fell back to nothing");
});

check("the text is escaped", () => {
  const a11y = svgAccessibility({
    title: 'Orders & "returns" <live>',
    description: null,
    summary: "s",
    idSeed: "d",
  });
  assert.doesNotMatch(
    a11y.elements.replace(/<\/?title[^>]*>|<\/?desc[^>]*>/g, ""),
    /[<>&](?!(amp|lt|gt|quot|#39);)/,
    "an unescaped character would break the file it is pasted into",
  );
});

console.log("\n2. Two diagrams on one page do not collide");

check("the ids carry a slug from the diagram itself", () => {
  /* `id` is document-wide in SVG. Two diagrams inlined into one HTML page —
     two figures in a rendered README — would both have claimed `af-title`, and
     `aria-labelledby` resolves to whichever came first: the second diagram is
     then announced with the first one's name. */
  const first = svgAccessibility({
    title: "Orders",
    description: null,
    summary: "s",
    idSeed: "d-ctx-root",
  });
  const second = svgAccessibility({
    title: "Payments",
    description: null,
    summary: "s",
    idSeed: "d-cnt-pay",
  });
  assert.notEqual(first.titleId, second.titleId);
  assert.notEqual(first.descId, second.descId);
  assert.doesNotMatch(
    first.titleId,
    /^af-title$/,
    "the fixed id is back — every diagram on a page would claim it",
  );
});

console.log("\n3. Every exporter actually uses it");

/* FOUND ON DISK, not listed here. `codebase.md` §4: a check written from a
   hand-typed set cannot notice the thing it has never heard of, and three
   checks in this repo passed for exactly that reason while the feature under
   them was broken — an exporter added for a tenth notation would have been
   silently exempt.

   Sequence is the one exclusion and it is named, not omitted: it CLONES the
   live canvas instead of building markup, so its accessible name comes from
   the component and is asserted separately below. */
const SEQUENCE_EXPORTER = "src/features/sequence/export/render-svg.ts";
const ALL_EXPORTERS = readdirSync(path.join(ROOT, "src/features"))
  .map((feature) => `src/features/${feature}/export/render-svg.ts`)
  .filter((rel) => existsSync(path.join(ROOT, rel)))
  .sort();
const STRING_EXPORTERS = ALL_EXPORTERS.filter(
  (rel) => rel !== SEQUENCE_EXPORTER,
);

check(
  "every exporter on disk is either checked or named as the exception",
  () => {
    assert.ok(
      ALL_EXPORTERS.includes(SEQUENCE_EXPORTER),
      "the sequence exporter moved, so the exclusion below now exempts nothing " +
        "and its own assertion is checking a file that is not there",
    );
    assert.ok(
      STRING_EXPORTERS.length >= 8,
      `only ${STRING_EXPORTERS.length} exporters found — a notation's renderer ` +
        "moved out of features/<kind>/export/ and is no longer covered",
    );
  },
);

for (const rel of STRING_EXPORTERS) {
  check(`${rel.split("/")[2]} names and describes what it exports`, () => {
    const source = read(rel);
    assert.match(
      source,
      /svgAccessibility\(\{/,
      "this exporter builds an <svg> with no accessible name — for a screen " +
        "reader the file it produces is an unlabelled graphic",
    );
    assert.match(
      source,
      /\$\{a11y\.attributes\}>/,
      "the role and aria-labelledby never reached the <svg> tag",
    );
    assert.match(
      source,
      /a11y\.elements/,
      "the <title> and <desc> were built and then not emitted",
    );
    assert.doesNotMatch(
      source,
      /aria-labelledby="af-title"/,
      "the fixed id survived",
    );
  });
}

check("the sequence export carries a name by its own route", () => {
  /* It clones the live canvas, so the name comes from the component and the
     clone inherits it. Asserted at BOTH ends: a `role="img"` with no label is
     an unlabelled graphic, and a label on a node the exporter strips is no
     label at all. */
  const component = read(
    "src/features/sequence/components/sequence-diagram.tsx",
  );
  assert.match(component, /role="img"/);
  assert.match(
    component,
    /aria-label=\{`Sequence diagram: /,
    "the sequence canvas lost the accessible name its export depends on",
  );
  const exporter = read("src/features/sequence/export/render-svg.ts");
  assert.doesNotMatch(
    exporter,
    /removeAttribute\(["']aria-label["']\)/,
    "the exporter strips the only accessible name the clone has",
  );
});

console.log("\n4. The helper stays checkable");

check("countOf does not produce a plural bug", () => {
  assert.equal(countOf(1, "element"), "1 element");
  assert.equal(countOf(0, "element"), "0 elements");
  assert.equal(countOf(2, "use case"), "2 use cases");
  assert.equal(countOf(1, "entity", "entities"), "1 entity");
  assert.equal(countOf(3, "entity", "entities"), "3 entities");
});

check("the module stays loadable by a check script", () => {
  const source = read("src/lib/svg-a11y.ts");
  assert.doesNotMatch(
    source,
    /from ["']@?xyflow|from ["']react/,
    "the module reached React and this check would stop running",
  );
});

console.log(
  failures === 0
    ? `\nAll ${assertions} svg-a11y assertions passed.`
    : `\n${failures} of ${assertions} assertion(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
