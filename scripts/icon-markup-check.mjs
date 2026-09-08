/**
 * Proves `features/viewer/export/icon-markup.generated.ts` still holds what
 * the icon registry's components actually draw.
 *
 * WHAT THIS CATCHES. The server has no React renderer, so `/api/render` embeds
 * icons from a table rendered at build time. Retouching an icon, swapping a
 * brand mark's variant, or adding one to the registry therefore changes the
 * canvas and leaves the table behind — and a stale table is the quiet kind of
 * wrong: the diagram still draws, the logo is just the previous one, or absent.
 * Nothing else in the suite would notice. `check:icon-embed` measures the
 * positioning, `check:icon-contrast` measures whether a mark can be seen
 * against its card, and both work from the components rather than the table.
 *
 * It REGENERATES AND COMPARES BYTES rather than asserting anything about the
 * artwork. An assertion naming expected markup would be a third copy of every
 * icon and would need editing whenever a mark was legitimately retouched,
 * which is the failure it exists to prevent.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = path.join(
  ROOT,
  "src/features/viewer/export/icon-markup.generated.ts",
);

const before = readFileSync(OUT, "utf8");

execFileSync(
  process.execPath,
  [path.join(ROOT, "scripts/gen-icon-markup.mjs")],
  { stdio: ["ignore", "ignore", "inherit"] },
);

const after = readFileSync(OUT, "utf8");

if (before === after) {
  const count = (after.match(/":\s*"<svg/g) ?? []).length;
  console.log(`icon markup matches the registry (${count} artworks)`);
  process.exit(0);
}

/* Written back before failing, so the fix is `git diff` rather than a second
   command — and so a reader can SEE which mark moved. */
console.error(
  "FAIL: the generated icon markup disagreed with the registry.\n" +
    "      It has been regenerated in place — review `git diff` on\n" +
    "      src/features/viewer/export/icon-markup.generated.ts and commit it.\n" +
    "      Every server-drawn diagram was embedding the stale artwork.",
);
process.exit(1);
