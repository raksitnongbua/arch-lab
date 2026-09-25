/**
 * `check:client-boundary` — no Server Component reads a VALUE out of a
 * `"use client"` module.
 *
 * THE BUG THAT BOUGHT THIS CHECK, in full, because the shape repeats:
 *
 * `NAV_LINKS` was exported from `components/layout/header.tsx`, which carries
 * `"use client"`, and imported by `features/mcp/components/mcp-guide.tsx`,
 * which is a Server Component. The RSC bundler replaces every export of a
 * client module with a client-reference stub, so on the server `NAV_LINKS` was
 * a THROWING FUNCTION rather than an array. `/mcp` died on its first request
 * in production with "NAV_LINKS.map is not a function".
 *
 * NOT ONE EXISTING GATE COULD SEE IT:
 *
 *   - `pnpm typecheck` types the import as the real array. The substitution is
 *     a bundler step that runs after the type checker.
 *   - `pnpm build` compiled the page and never ran it: `/mcp` calls `headers()`
 *     so it is dynamic, and a dynamic route is not prerendered. A static page
 *     would have failed the build.
 *   - `pnpm test` is vitest over pure functions and imports no component.
 *   - The four check scripts that touch `mcp-guide.tsx` read it as TEXT and
 *     match regexes. None renders it.
 *
 * So this is a source-level check, and it has to be: the only other way to
 * catch it is to render every route of a built server, which nothing here does.
 *
 * WHAT IS ALLOWED. A Server Component may import a COMPONENT from a client
 * module — that is the entire point of the boundary, and React hands back a
 * reference the renderer knows how to serialise. What it may not do is read a
 * value: an array, an object, a string, a plain function. This check tells them
 * apart by the ONLY signal available in source, the export's name: a component
 * is PascalCase by the convention React itself requires for JSX. A lowercase or
 * SCREAMING_CASE export read across the boundary is the bug.
 *
 * TYPE-ONLY IMPORTS ARE FINE and are skipped: `import type` is erased before
 * the bundler ever sees it.
 *
 * Exits non-zero on any failure. Run with: pnpm check:client-boundary
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

let failures = 0;
let assertions = 0;
const ok = (label) => {
  assertions += 1;
  console.log(`  ✓ ${label}`);
};
const fail = (label, detail) => {
  assertions += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};

/** Every `.ts`/`.tsx` file under `src`. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const rel = (file) => path.relative(ROOT, file);
const read = (file) => fs.readFileSync(file, "utf8");

/**
 * A module is client-side if a `"use client"` directive appears before any
 * import.
 *
 * SCANNED LINE BY LINE rather than matched with one regex. The first attempt
 * was `/^\s*(?:comment|comment)*["']use client["']/`, which nests a lazy
 * quantifier inside a greedy group — catastrophic backtracking, and it hung on
 * the first file that did not match. A loop cannot backtrack.
 */
function isClient(source) {
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) {
      continue;
    }
    return /^["']use client["']/.test(line);
  }
  return false;
}

const clientModules = new Set();
for (const file of files) {
  if (isClient(read(file))) clientModules.add(file);
}

/** Resolve an `@/…` or relative specifier to a file on disk. */
function resolve(fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/* A component is PascalCase; everything else is a value. */
const isComponentName = (name) => /^[A-Z][A-Za-z0-9]*$/.test(name);

const offences = [];
for (const file of files) {
  const source = read(file);
  if (isClient(source)) continue;

  const importRe = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(importRe)) {
    const [, typeOnly, clause, specifier] = match;
    if (typeOnly) continue;
    const target = resolve(file, specifier);
    if (target === null || !clientModules.has(target)) continue;

    for (const raw of clause.split(",")) {
      const piece = raw.trim();
      if (piece === "" || piece.startsWith("type ")) continue;
      const imported = piece.split(/\s+as\s+/)[0].trim();
      if (imported === "" || isComponentName(imported)) continue;
      offences.push(
        `${rel(file)} imports the value \`${imported}\` from the "use client" ` +
          `module ${rel(target)} — on the server that is a client-reference ` +
          "stub, not the value",
      );
    }
  }
}

console.log("\nValues crossing the client boundary");
if (offences.length === 0) {
  ok("no server module reads a value out of a `use client` module");
} else {
  for (const offence of offences) fail("a value crosses the boundary", offence);
}

/* A vacuity guard. If the walk stops finding client modules — a refactor, a
   moved directory, a broken regex — this check would pass by finding nothing,
   which is the failure mode `codebase.md` names for hand-listed checks. */
console.log("\nThe scan actually ran");
if (clientModules.size >= 20 && files.length >= 200) {
  ok(`scanned ${files.length} modules, ${clientModules.size} of them client`);
} else {
  fail(
    "the scan found implausibly little",
    `${files.length} modules and ${clientModules.size} client ones — a check ` +
      "that finds nothing proves nothing",
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
