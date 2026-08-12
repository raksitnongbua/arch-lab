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

check("hit regions and the fold control never reach a file", () => {
  const dropped = source.match(/const DROPPED_ALWAYS = \[([^\]]*)\]/);
  assert.ok(dropped, "DROPPED_ALWAYS is not declared");
  assert.match(dropped[1], /af-seq-hit/);
  assert.match(dropped[1], /af-seq-fold/);
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
