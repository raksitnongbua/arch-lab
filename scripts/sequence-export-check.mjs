#!/usr/bin/env node
/**
 * Sequence export check — the two string transforms that decide whether an
 * exported diagram is readable, plus the property list that decides whether it
 * has any colour at all.
 *
 * ALL THREE OF THESE SHIPPED BROKEN, which is why they are asserted rather than
 * reviewed. The export looked plausible in a diff and came out with black
 * message lines, black participant cards, and text in Times:
 *
 *   1. `stop-color` was not carried. A <stop> keeps its authored attribute —
 *      `color-mix(in oklch, var(--seq-lane-1) …)` — and a standalone file
 *      defines none of those custom properties, so every gradient stop fell
 *      back to black. Everything painted with a gradient vanished.
 *   2. Paint references come out of `getComputedStyle` ABSOLUTISED, as
 *      `url("http://host/page#id")`. Correct in the live document, useless in a
 *      file: the URL names a page rather than the SVG, so the paint silently
 *      fails.
 *   3. A font the file cannot load falls back to the UA default, which for SVG
 *      is serif.
 *
 * The transforms are exported and tested here rather than inlined because a
 * paint-reference regex that over-matches breaks every gradient at once, one
 * that under-matches breaks them silently, and neither is visible in a diff.
 *
 * Run with: pnpm check:sequence-export
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { normalisePaintUrl, withSansFallback } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/export/render-svg.ts"))
    .href
);

const source = readFileSync(
  path.join(ROOT, "src/features/sequence/export/render-svg.ts"),
  "utf8",
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

/* ---- 1. gradient stops carry a concrete colour --------------------------- */

check("stop-color is carried, or every gradient exports as black", () => {
  const carried = source.match(/const CARRIED = \[([\s\S]*?)\] as const;/);
  assert.ok(carried, "CARRIED is not declared");
  assert.match(carried[1], /"stop-color"/);
});

check("stop-opacity is carried too", () => {
  const carried = source.match(/const CARRIED = \[([\s\S]*?)\] as const;/);
  assert.match(carried[1], /"stop-opacity"/);
});

check("the properties that make a diagram visible are all carried", () => {
  const carried = source.match(/const CARRIED = \[([\s\S]*?)\] as const;/);
  for (const property of ["fill", "stroke", "stroke-width", "font-size"]) {
    assert.match(
      carried[1],
      new RegExp(`"${property}"`),
      `missing ${property}`,
    );
  }
});

/* ---- 2. paint references become fragment-only ---------------------------- */

check("an absolutised paint reference is rewritten to a fragment", () => {
  assert.equal(
    normalisePaintUrl('url("http://localhost:3000/view/sequence#g1")'),
    "url(#g1)",
  );
});

check("the quotes go with it — no remnant is left inside the reference", () => {
  // The earlier pattern kept the closing quote inside the captured id and
  // produced `url(#g1")`, which names nothing: every gradient in the exported
  // file stayed unpainted while the markup still looked plausible.
  const out = normalisePaintUrl('url("http://h/p#g1")');
  assert.equal(out, "url(#g1)");
  assert.ok(!out.includes('"'), `a quote survived: ${out}`);
});

check("single quotes and bare urls behave the same", () => {
  assert.equal(normalisePaintUrl("url('https://a.b/c#x')"), "url(#x)");
  assert.equal(normalisePaintUrl("url(https://a.b/c#x)"), "url(#x)");
});

check("an already-local reference is untouched", () => {
  assert.equal(normalisePaintUrl("url(#x)"), "url(#x)");
});

check("ids from React's useId survive intact", () => {
  assert.equal(
    normalisePaintUrl('url("http://h/p#_R_2qanpfiutb_line1")'),
    "url(#_R_2qanpfiutb_line1)",
  );
});

check("a value with no url() is returned unchanged", () => {
  assert.equal(normalisePaintUrl("oklch(0.6 0.02 265)"), "oklch(0.6 0.02 265)");
});

/* ---- 3. fonts fall back to a sans, never the UA serif -------------------- */

check("a family with no generic gains a sans fallback", () => {
  assert.equal(
    withSansFallback("__Geist_abc123"),
    "__Geist_abc123, ui-sans-serif, system-ui, sans-serif",
  );
});

check("a family that already ends in a generic is left alone", () => {
  assert.equal(withSansFallback("Geist, sans-serif"), "Geist, sans-serif");
  assert.equal(withSansFallback("Menlo, monospace"), "Menlo, monospace");
  assert.equal(withSansFallback("ui-monospace"), "ui-monospace");
});

/* ---- 3b. THE BUG THAT SHIPPED: entities must never be touched ------------ */

/*
 * These transforms once ran over the SERIALIZED document, where XMLSerializer
 * has already turned the quotes inside an attribute into `&quot;`. The font
 * pattern excluded `;` to stop at a declaration boundary — and `;` also ends
 * `&quot;` — so it cut the entity in half and left a bare `&quot`, which is
 * exactly the "EntityRef: expecting ';'" a browser refuses to open the file
 * with.
 *
 * Working on VALUES makes the hazard structurally impossible: a computed value
 * has real quotes and no entities. These assert that the functions never emit
 * an ampersand that is not a complete entity, whatever they are handed.
 */
const bareAmpersand = /&(?!(#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/;

check("neither transform introduces a bare ampersand", () => {
  // A raw `&` in a computed value is fine — the serializer escapes it when the
  // attribute is set. What must never happen is the transform CREATING one, or
  // splitting an entity that was handed in. So the test is relative: if the
  // input is entity-safe, the output must be too.
  const cases = [
    ['"__Geist_e8ce0c", "__Geist_Fallback"', withSansFallback],
    ["&quot;Geist&quot;, sans-serif", withSansFallback],
    ["__Geist_x", withSansFallback],
    ["", withSansFallback],
    ['url("http://h/p#id")', normalisePaintUrl],
    ['url("http://h/p?a=1&amp;b=2#id")', normalisePaintUrl],
    ["oklch(0.6 0.02 265)", normalisePaintUrl],
  ];
  for (const [value, transform] of cases) {
    if (bareAmpersand.test(value)) continue; // the input was already unsafe
    const out = transform(value);
    assert.ok(
      !bareAmpersand.test(out),
      `bare & produced from ${JSON.stringify(value)}: ${out}`,
    );
  }
});

check("an entity handed in survives whole — the exact shipped bug", () => {
  // `&quot;` ends in `;`. The retired font pattern excluded `;` to stop at a
  // declaration boundary, cut the entity in half, and left `&quot` — which is
  // the "EntityRef: expecting ';'" a browser refuses to open the file with.
  const out = withSansFallback("&quot;Geist&quot;");
  assert.ok(out.startsWith("&quot;Geist&quot;"), out);
  assert.ok(!bareAmpersand.test(out), out);
});

check("the exporter no longer post-processes serialized markup", () => {
  // The rule the bug leaves behind: transform values, then let the serializer
  // escape. A regex over the finished XML is what broke the file.
  assert.doesNotMatch(
    source,
    /serializeToString\(clone\)\s*\)/,
    "serialized output is being passed through a transform again",
  );
  assert.match(
    source,
    /svg: new XMLSerializer\(\)\.serializeToString\(clone\)/,
  );
});

/* ---- 4. the still drops what does not belong in a file ------------------- */

/*
 * THIS SECTION USED TO BE THE BUG IT NOW GUARDS. The exporter stripped three
 * hand-written selectors and this check asserted that the list contained two
 * of the names it already knew — so it could confirm nothing was LOST from the
 * list and could never notice a class the list had not heard of. The next
 * interactive element (a drag handle, a selection outline, an insertion
 * indicator) would have serialised into every SVG, every PNG and all twenty
 * GIF frames, green the whole way. That is `codebase.md` habit 4 exactly.
 *
 * So the guarantee is derived instead: chrome is a NAMING CONVENTION
 * (`sequence/lib/chrome.ts`), the exporter strips by its prefix, and the
 * assertions below read the feature's own source off disk rather than naming
 * classes. The load-bearing one is the last: every interactive element in the
 * drawing must be spelled as chrome, which is what makes "name it right and it
 * is handled" true rather than hopeful.
 */

const { SEQUENCE_CHROME_CLASS_PREFIX, SEQUENCE_CHROME_SELECTOR } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/chrome.ts")).href
);
const { ARMING_PROMPT_CLASS } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/arming-prompt.ts"))
    .href
);

/** Every file the sequence feature draws or styles itself with. */
function sequenceSourceFiles() {
  const root = path.join(ROOT, "src/features/sequence");
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

/** Distinct chrome class names the feature actually spells, from disk. */
function chromeClassesOnDisk() {
  const pattern = new RegExp(`${SEQUENCE_CHROME_CLASS_PREFIX}[a-z0-9-]+`, "g");
  const names = new Set();
  for (const file of sequenceSourceFiles()) {
    for (const name of readFileSync(file, "utf8").match(pattern) ?? []) {
      names.add(name);
    }
  }
  return names;
}

check("the stripper removes chrome by prefix, never by a list of names", () => {
  // A list is the failure this whole section exists for: it cannot notice the
  // class it has never heard of.
  assert.match(
    source,
    /const DROPPED_ALWAYS = SEQUENCE_CHROME_SELECTOR;/,
    "DROPPED_ALWAYS is not the shared prefix selector",
  );
  assert.equal(
    SEQUENCE_CHROME_SELECTOR,
    `[class*="${SEQUENCE_CHROME_CLASS_PREFIX}"]`,
  );
  const dropped = source.match(/const DROPPED_ALWAYS =([^;]*);/);
  assert.doesNotMatch(
    dropped[1],
    /af-seq-/,
    `a class name is hand-written into the stripper again: ${dropped[1].trim()}`,
  );
});

check("the convention is populated, not an empty promise", () => {
  // A prefix nothing uses would make every assertion below vacuous — the
  // "reports coverage it does not have" failure `new-diagram-type.md` names.
  const names = chromeClassesOnDisk();
  assert.ok(
    names.size >= 4,
    `only ${names.size} chrome classes found: ${[...names].join(", ")}`,
  );
  for (const name of names) {
    assert.ok(
      name.includes(SEQUENCE_CHROME_CLASS_PREFIX),
      `${name} would not be matched by ${SEQUENCE_CHROME_SELECTOR}`,
    );
  }
});

check("every interactive element in the drawing is spelled as chrome", () => {
  /*
   * THE ASSERTION THAT CATCHES THE NEXT CLASS. Scoped to the SVG renderer
   * because only what is inside the SVG can reach a file — the viewer's own
   * pane is interactive too and must never be stripped, since it is not in the
   * drawing at all.
   *
   * "Interactive" is read off the markup rather than off the name: a tag that
   * carries a pointer handler, a tab stop or a button role is a control, and a
   * control that survives into a still image is an invisible promise of a
   * click the file cannot take.
   */
  const diagram = readFileSync(
    path.join(ROOT, "src/features/sequence/components/sequence-diagram.tsx"),
    "utf8",
  )
    // Prose in this file discusses markup at length; comments are not markup.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const tags = diagram.match(/<[a-z][a-zA-Z0-9]*\s[^<>]*?\/?>/gs) ?? [];
  assert.ok(tags.length > 20, `only ${tags.length} DOM tags found — bad scan`);

  let interactive = 0;
  for (const tag of tags) {
    if (!/\brole="button"|\btabIndex=|\bonClick=|\bonPointerDown=/.test(tag)) {
      continue;
    }
    const className = tag.match(/className="([^"]*)"/);
    // A control with no literal class list cannot be stripped at all.
    assert.ok(
      className,
      `an interactive element has no literal className: ${tag.slice(0, 80)}`,
    );
    assert.ok(
      className[1].includes(SEQUENCE_CHROME_CLASS_PREFIX),
      `this control would export into every SVG, PNG and GIF frame — name it ` +
        `${SEQUENCE_CHROME_CLASS_PREFIX}…: ${className[1]}`,
    );
    interactive += 1;
  }
  assert.ok(interactive >= 5, `only ${interactive} controls found — bad scan`);
});

check("the prefix divides the drawing, it does not swallow it", () => {
  /*
   * THE OPPOSITE FAILURE, and the cheaper one to make: over-applying the
   * prefix. Everything it touches is deleted from every SVG, PNG and GIF
   * frame, so a chrome-named guard chip or message line exports as a blank
   * where the sense was. Measured as a proportion rather than by naming the
   * survivors, so it holds for classes that do not exist yet: chrome is a
   * handful of controls over a whole notation's vocabulary, and if it ever
   * becomes most of it, someone has renamed the diagram into the bin.
   */
  const chrome = chromeClassesOnDisk();
  const all = new Set();
  for (const file of sequenceSourceFiles()) {
    for (const name of readFileSync(file, "utf8").match(/af-seq-[a-z0-9-]+/g) ??
      []) {
      all.add(name);
    }
  }
  assert.ok(all.size >= 20, `only ${all.size} af-seq classes found — bad scan`);
  assert.ok(
    chrome.size * 3 < all.size,
    `${chrome.size} of ${all.size} sequence classes are chrome — the export ` +
      `would come out blank where the meaning was: ${[...chrome].join(", ")}`,
  );

  // And the four that carry the diagram's own sense are named explicitly,
  // because each is one careless rename away from being stripped: the guard
  // chip and its label are the fragment's condition, and the line and the
  // arrow label are the message itself.
  for (const stem of ["chip", "guard", "line", "label"]) {
    const swept = `${SEQUENCE_CHROME_CLASS_PREFIX}${stem}`;
    assert.ok(
      !chrome.has(swept),
      `${swept} would strip the part of the drawing that carries the meaning`,
    );
  }
});

check("the armed gesture's prompt cannot reach a file", () => {
  /*
   * A PROMPT IS THE PUREST CASE OF CHROME by `chrome.ts`'s own test — a reader
   * holding a still image loses nothing by the absence of "click the sending
   * lifeline", and gains a sentence of instructions printed across their
   * diagram if it survives. It is rendered by `sequence-viewer.tsx` as HTML
   * beside the drawing, so today it is not in the clone root at all (this file
   * pins that root as `svg.af-seq-svg` above), and the interactive scan is
   * scoped to the renderer for exactly that reason.
   *
   * Which is why the assertion is about the BOUNDARY rather than the class:
   * moving the prompt into the SVG — to sit over the lifeline it names, say —
   * is a reasonable-looking change that would put it in every SVG, PNG and all
   * twenty GIF frames. This fails first, and the prefix behind it means the
   * fix is already in place.
   */
  const drawing = readFileSync(
    path.join(ROOT, "src/features/sequence/components/sequence-diagram.tsx"),
    "utf8",
  );
  for (const name of ["armingPrompt", "ARMING_PROMPT_CLASS"]) {
    assert.ok(
      !drawing.includes(name),
      `${name} reached the SVG renderer — the prompt would export into every still and GIF frame`,
    );
  }
  /* AND IT IS STILL STRIPPED IF IT EVER DOES. Read out of the exporter's own
     selector rather than compared against the literal prefix, so this measures
     the thing that does the removing. */
  const matched = /\[class\*="([^"]+)"\]/.exec(SEQUENCE_CHROME_SELECTOR);
  assert.ok(
    matched,
    `cannot read a substring out of ${SEQUENCE_CHROME_SELECTOR}`,
  );
  assert.ok(
    ARMING_PROMPT_CLASS.includes(matched[1]),
    `${ARMING_PROMPT_CLASS} is not matched by the exporter's ${SEQUENCE_CHROME_SELECTOR}`,
  );
});

check("the comet is dropped from a still and kept for the animation", () => {
  // Frozen bands are three bright stripes across every message; the animated
  // export is the one place they belong.
  assert.match(source, /options\.keepMotion === true/);
  assert.match(
    source,
    /for \(const node of clone\.querySelectorAll\(MOTION\)\) node\.remove\(\)/,
  );
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-export assertions passed.`);
