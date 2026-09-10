/**
 * Generates `features/viewer/export/icon-markup.generated.ts` — every stack
 * icon's artwork as an SVG string, keyed by style and slug.
 *
 * WHY THIS EXISTS. The registry's icons are React components, and turning one
 * into markup needs a React renderer: `react-dom/client` wants a document, and
 * Next rejects a `react-dom/server` import inside its route graph outright
 * ("You're importing a component that imports react-dom/server"). So
 * `/api/render` drew C4 models with no logos — a container labelled "MongoDB"
 * and no mark on it, which is exactly the flattening the render route exists
 * to avoid.
 *
 * Rendering at BUILD TIME answers it without either renderer at request time:
 * the server ships strings. It is also the faster answer — no React, no
 * per-process warm-up cache — and the only one that keeps `/api/render` a pure
 * string pipeline from payload to response.
 *
 * THE ARTWORK IS NOT COPIED, IT IS RENDERED. This bundles the real registry
 * with esbuild (which is here for the JSX transform Node's type stripping does
 * not do) and renders each component through `react-dom/server`, so the table
 * holds what the canvas draws rather than a second drawing of it — the same
 * "parity by construction" argument `icon-markup.ts` makes about the browser
 * path. `check:icon-markup` regenerates and compares, so a changed icon that
 * nobody regenerated fails rather than shipping stale artwork.
 *
 * Usage: `pnpm gen:icon-markup` writes the file;
 * `pnpm check:icon-markup` proves the checked-in copy is current.
 */

import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT_PATH = path.join(
  ROOT,
  "src/features/viewer/export/icon-markup.generated.ts",
);

/**
 * The entry point, written to a temp file rather than kept in `scripts/`.
 *
 * It has to be TSX for esbuild to resolve the registry through the tsconfig
 * `paths` map, and a `.tsx` file living in `scripts/` would be picked up by
 * lint and by every check that globs the directory — for a module that exists
 * for one second during a build.
 */
const ENTRY = `
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ICONS } from "@/features/editor/lib/icons/registry";

const table: Record<string, string> = {};
for (const def of Object.values(ICONS)) {
  for (const style of ["mono", "colour"] as const) {
    table[style + ":" + def.slug] = renderToStaticMarkup(
      createElement(def.byStyle[style]),
    );
  }
}
process.stdout.write(JSON.stringify(table));
`;

/* UNDER `node_modules/.cache`, not the system temp directory, and that is not
   a preference: the bundle keeps react, lucide and thesvg external, so Node
   resolves them by walking up from the bundle's own path. From `/tmp` that
   walk finds nothing and every import fails. */
const cache = path.join(ROOT, "node_modules/.cache");
mkdirSync(cache, { recursive: true });
const work = mkdtempSync(path.join(cache, "archlab-icon-markup-"));

try {
  const entryPath = path.join(work, "entry.tsx");
  const bundlePath = path.join(work, "bundle.mjs");
  writeFileSync(entryPath, ENTRY, "utf8");

  esbuild.buildSync({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    /* An EXPLICIT list, not `packages: "external"`. That setting externalises
       every non-relative specifier, which includes the `@/…` alias — so the
       registry itself was left as an import and the bundle asked Node for a
       package called `@/features`. Only the real npm packages belong here, and
       they belong here so the bundle imports the SAME react, lucide and thesvg
       the app resolves: inlining them would make this table a snapshot of
       whatever esbuild happened to bundle. */
    external: [
      "react",
      "react-dom",
      "react-dom/*",
      "lucide-react",
      "thesvg",
      "thesvg/*",
    ],
    /* The `@/…` prefix, mapped explicitly rather than through the tsconfig's
       `paths`. esbuild resolves `paths` relative to the config's `baseUrl` and
       the entry point lives outside it, so the alias was never applied and the
       registry came out as an unresolved bare import. */
    alias: { "@": path.join(ROOT, "src") },
    absWorkingDir: ROOT,
    logLevel: "warning",
  });

  const raw = execFileSync(process.execPath, [bundlePath], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  const table = JSON.parse(raw);
  const slugs = new Set(Object.keys(table).map((key) => key.split(":")[1]));

  const empty = Object.entries(table)
    .filter(([, markup]) => !markup.trim().startsWith("<svg"))
    .map(([key]) => key);
  if (empty.length > 0) {
    /* An icon that rendered to something other than an `<svg>` root would be
       embedded as-is and break the whole document, so it fails HERE rather
       than in a reader's diagram. */
    console.error(
      `gen:icon-markup — these entries did not render an <svg> root:\n  ${empty.join("\n  ")}`,
    );
    process.exit(1);
  }

  const header = `/**
 * GENERATED by \`scripts/gen-icon-markup.mjs\` from the icon registry.
 * Do not edit: run \`pnpm gen:icon-markup\`. \`pnpm check:icon-markup\` fails
 * when this file and the registry's components disagree.
 *
 * Every stack icon's artwork as SVG markup, keyed \`<style>:<slug>\`. It exists
 * for the callers that have no React renderer — \`/api/render\` draws a diagram
 * in a route handler, where \`react-dom/client\` has no document and Next
 * refuses a \`react-dom/server\` import. On screen the components are still the
 * only source; this is what the server has instead, rendered from those same
 * components at build time.
 */

/** ${slugs.size} icons, in both reader styles. */
export const ICON_MARKUP: Readonly<Record<string, string>> = `;

  writeFileSync(
    OUT_PATH,
    `${header}${JSON.stringify(table, null, 2)};\n`,
    "utf8",
  );

  console.log(
    `gen:icon-markup — wrote ${Object.keys(table).length} artworks (${slugs.size} icons × 2 styles)`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

/* Read back so a truncated write fails the generator rather than the build. */
readFileSync(OUT_PATH, "utf8");
