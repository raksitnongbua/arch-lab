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

const { normalisePaintUrls, ensureSansFallback } = await import(
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
    normalisePaintUrls('stroke:url("http://localhost:3000/view/sequence#g1")'),
    "stroke:url(#g1)",
  );
});

check("it handles single quotes and no quotes alike", () => {
  assert.equal(
    normalisePaintUrls("fill:url('https://a.b/c#x')"),
    "fill:url(#x)",
  );
  assert.equal(normalisePaintUrls("fill:url(https://a.b/c#x)"), "fill:url(#x)");
});

check("an already-local reference is left exactly as it is", () => {
  assert.equal(normalisePaintUrls("fill:url(#x)"), "fill:url(#x)");
  assert.equal(normalisePaintUrls('fill:url("#x")'), "fill:url(#x)");
});

check("every reference in a document is rewritten, not just the first", () => {
  const input =
    'a url("http://h/p#one") b url("http://h/p#two") c url("http://h/p#three")';
  assert.equal(
    normalisePaintUrls(input),
    "a url(#one) b url(#two) c url(#three)",
  );
});

check("ids containing dashes and underscores survive", () => {
  // React's useId produces ids like `_R_2qanpfiutb_line1`, which is exactly
  // what these references point at.
  assert.equal(
    normalisePaintUrls('url("http://h/p#_R_2qanpfiutb_line1")'),
    "url(#_R_2qanpfiutb_line1)",
  );
});

check("it does not eat text that merely contains a hash", () => {
  const input = "<text>see #3 for details</text>";
  assert.equal(normalisePaintUrls(input), input);
});

/* ---- 3. fonts fall back to a sans, never the UA serif -------------------- */

check("a family with no generic gains a sans fallback", () => {
  assert.equal(
    ensureSansFallback('style="font-family:__Geist_abc123"'),
    'style="font-family:__Geist_abc123, ui-sans-serif, system-ui, sans-serif"',
  );
});

check("a family that already ends in a generic is left alone", () => {
  const already = 'style="font-family:Geist, sans-serif"';
  assert.equal(ensureSansFallback(already), already);
  const mono = 'style="font-family:Menlo, monospace"';
  assert.equal(ensureSansFallback(mono), mono);
});

check("a monospace stack is not turned into a sans one", () => {
  // The diagram's labels are mono on purpose; appending a sans fallback after
  // `monospace` would be harmless, but replacing its generic would not be.
  const input = 'style="font-family:ui-monospace"';
  assert.equal(ensureSansFallback(input), input);
});

check("several declarations in one document are each handled", () => {
  const input = 'style="font-family:A"><text style="font-family:B, serif"';
  assert.equal(
    ensureSansFallback(input),
    'style="font-family:A, ui-sans-serif, system-ui, sans-serif"><text style="font-family:B, serif"',
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
