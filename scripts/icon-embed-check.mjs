#!/usr/bin/env node
/**
 * The exported diagram must be WELL-FORMED XML, because that is the only thing
 * standing between an export and "the rendered SVG could not be decoded as an
 * image" — the browser rasterises a PNG by decoding the SVG through an
 * `<img>`, and an XML parse error there fails the entire board, not the icon
 * that caused it.
 *
 * This exists because that failure shipped. `embeddedIconSvg` prepended
 * `width`/`height` to each icon's own `<svg>` root and relied on the icon
 * components to have stripped theirs; when the generic icons became
 * `lucide-react` components they emitted `width="24" height="24"`, and every
 * C4 export of a diagram using one produced a duplicate attribute and died.
 * A comment asserted the coupling and nothing enforced it.
 *
 * Nothing else can catch it: `tsc` sees two valid strings, the build never
 * rasterises, and the icon-contrast check renders each mark STANDALONE — where
 * the duplicate does not exist yet, because it is created at embed time.
 *
 * What it asserts, over `positionIconSvg` (kept pure and React-free so this
 * harness can reach it at all):
 *
 *   1. an icon that brings its own geometry (lucide) is positioned WITHOUT
 *      duplicating an attribute;
 *   2. an icon that brings none (a stripped brand mark) still gets it;
 *   3. the artwork's own `viewBox` and colours survive — the export must be
 *      the same drawing the canvas shows;
 *   4. the result parses as XML, checked by parsing it, not by regex.
 *
 * Exits non-zero on any failure. Run with: pnpm check:icon-embed
 */

import { existsSync, statSync } from "node:fs";
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

const { positionIconSvg } = await import(
  pathToFileURL(path.join(ROOT, "src/features/viewer/export/icon-position.ts"))
    .href
);

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
  if (detail !== undefined) console.error(`    ${detail}`);
}

/**
 * Well-formedness the way the browser judges it. No XML parser is available
 * here, so this asserts the one rule that was broken and is cheap to state
 * exactly: no attribute name appears twice on the root element.
 */
function duplicateRootAttr(markup) {
  const root = /^<svg\b([^>]*)>/.exec(markup);
  if (root === null) return "not an <svg> root";
  const names = [...root[1].matchAll(/\s([a-zA-Z_:][-\w:.]*)=/g)].map((m) =>
    m[1].toLowerCase(),
  );
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) return `duplicate attribute "${name}"`;
    seen.add(name);
  }
  return null;
}

/* The two shapes the registry actually produces, verbatim in spirit: a lucide
   component (its own width/height/viewBox, `currentColor` stroke) and a
   thesvg brand mark with the upstream size already stripped. */
const LUCIDE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="lucide lucide-database"><ellipse cx="12" cy="5" rx="9" ry="3"/></svg>`;
const BRAND = `<svg viewBox="0 0 128 128" fill="currentColor"><path d="M64 8 8 120h112Z"/></svg>`;
/* Single quotes and an already-present x/y: the sanitiser lesson from Oracle,
   applied to geometry rather than ink. */
const QUOTED = `<svg viewBox='0 0 32 32' x='3' y='4' WIDTH='32' height='32'><path d="M0 0h32v32H0z"/></svg>`;

console.log("an icon's own geometry never survives into the export");

for (const [label, source] of [
  ["a lucide generic", LUCIDE],
  ["a brand mark", BRAND],
  ["single-quoted, already positioned", QUOTED],
]) {
  const out = positionIconSvg(source, 12, 34, 20);
  const duplicate = duplicateRootAttr(out);
  check(`${label} embeds without a duplicate attribute`, duplicate === null, [
    duplicate,
    out.slice(0, 160),
  ]);
  check(
    `${label} takes the diagram's position and size`,
    /^<svg x="12" y="34" width="20" height="20"[\s>]/.test(out),
    out.slice(0, 120),
  );
}

console.log("\nthe artwork itself is untouched");

{
  const out = positionIconSvg(LUCIDE, 0, 0, 16);
  check(
    "viewBox survives — it is the artwork's coordinate system, not its size",
    out.includes('viewBox="0 0 24 24"'),
    out.slice(0, 160),
  );
  check(
    "colours and classes survive, so the export is the canvas drawing",
    out.includes('stroke="currentColor"') && out.includes("lucide-database"),
  );
  check(
    "the children are carried over verbatim",
    out.includes('<ellipse cx="12" cy="5" rx="9" ry="3"/>'),
  );
}

console.log("\nnothing else is mistaken for geometry");

{
  const strokeWidth = positionIconSvg(LUCIDE, 0, 0, 16);
  check(
    'stroke-width is not eaten by the "width" rule',
    strokeWidth.includes('stroke-width="2"'),
    strokeWidth.slice(0, 200),
  );
  const notSvg = positionIconSvg("<g><path d='M0 0'/></g>", 1, 2, 3);
  check(
    "markup that is not an <svg> root is returned unchanged",
    notSvg === "<g><path d='M0 0'/></g>",
  );
}

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} icon-embed assertions passed.`);
