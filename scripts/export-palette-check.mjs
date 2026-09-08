/**
 * Proves `features/viewer/export/palette.generated.ts` still says what
 * `globals.css` says.
 *
 * WHAT THIS CATCHES, and it is the sixth of the edits the `THEMES` note in
 * `lib/constants.ts` counts. A theme's palette lives in the CSS, and the
 * render route cannot read CSS — it reads the generated table. So retuning a
 * token, or adding a theme, silently leaves every server-drawn diagram on the
 * OLD colour while the screen shows the new one, and nothing else in the suite
 * would notice: `check:themes` measures the CSS, the type checker sees a
 * complete `Record<Theme, ExportTheme>` either way, and the drawing is correct
 * — just not the palette the author is looking at.
 *
 * It is a REGENERATE-AND-COMPARE rather than a set of assertions about
 * colours, deliberately. An assertion naming an expected hex would be a third
 * copy of the palette and would need editing on every retune, which is the
 * failure it exists to prevent. Comparing bytes cannot go stale.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = path.join(ROOT, "src/features/viewer/export/palette.generated.ts");

const before = readFileSync(OUT, "utf8");

execFileSync(
  process.execPath,
  [path.join(ROOT, "scripts/gen-export-palette.mjs")],
  {
    stdio: ["ignore", "ignore", "inherit"],
  },
);

const after = readFileSync(OUT, "utf8");

if (before === after) {
  console.log("export palette matches globals.css");
  process.exit(0);
}

/* Written back before failing, so the fix is `git diff` rather than a second
   command — and so a reader can SEE which colour moved. */
console.error(
  "FAIL: the generated export palette disagreed with globals.css.\n" +
    "      It has been regenerated in place — review `git diff` on\n" +
    "      src/features/viewer/export/palette.generated.ts and commit it.\n" +
    "      Every server-drawn diagram was using the stale colours.",
);
process.exit(1);
