/**
 * Keeps the shortcut sheet honest.
 *
 *   node scripts/shortcut-catalog-check.mjs
 *
 * `lib/shortcut-catalog.ts` is hand-authored, because the live registry is
 * populated by whichever hooks are mounted and would produce a list that changes
 * as you click around. Hand-authoring buys a readable, learnable reference and
 * costs the risk of drift: someone adds a binding, nobody documents it, and the
 * sheet quietly becomes a lie.
 *
 * So this scans the editor source for every `combo:` literal actually
 * registered, and asserts each one appears in the catalog. A shortcut that
 * exists but is undocumented fails here.
 *
 * It cannot catch combos built at runtime — the arrow nudges (`combo: key` /
 * `` combo: `shift+${key}` ``) and the quick-add digits
 * (`` combo: `${index + 1}` ``). Those are listed in DYNAMIC_FAMILIES below with
 * the catalog text that must cover them, so they are asserted by intent rather
 * than by literal match.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const EDITOR_DIR = "src/features/editor";
const CATALOG = join(EDITOR_DIR, "lib/shortcut-catalog.ts");

/**
 * Runtime-built combos, and a string the catalog must contain to prove each is
 * documented. Keep the reason with the entry: a future reader needs to know why
 * these are exempt from the literal scan.
 */
const DYNAMIC_FAMILIES = [
  {
    why: "arrow-key nudge, canvas.tsx: `combo: key` over ArrowUp/Down/Left/Right",
    catalogMustContain: "Nudge by 8px",
  },
  {
    why: "fine nudge, canvas.tsx: `combo: `shift+${key}``",
    catalogMustContain: "Nudge by 1px",
  },
  {
    why: "quick-add type picker, use-connect-shortcuts.ts: `combo: `${index + 1}``",
    catalogMustContain: "Pick a type",
  },
];

/**
 * Combos the catalog need not list, with the reason. The sheet's own opener is
 * self-evident from the button that mentions it.
 */
const EXEMPT = new Map([
  ["shift+/", "opens this very sheet; the canvas hint shows the key"],
]);

/**
 * Glyphs the catalog shows for readability, mapped to the key names bindings
 * actually use. The sheet says `↓`; the registry listens for `ArrowDown`. Both
 * are right for their audience, so the comparison normalises rather than forcing
 * the sheet to display `ArrowDown` at a reader.
 */
const KEY_ALIASES = new Map([
  ["↑", "arrowup"],
  ["↓", "arrowdown"],
  ["←", "arrowleft"],
  ["→", "arrowright"],
]);

/** How a catalog `keys` array renders as a comparable combo string. */
function keysToCombo(keys) {
  return keys
    .map((k) => {
      const key = String(k).toLowerCase();
      return KEY_ALIASES.get(k) ?? key;
    })
    .join("+")
    .replace(/\s+/g, "");
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  FAIL ${msg}`);
};
const ok = (msg) => {
  console.log(`  ok  ${msg}`);
};

console.log("shortcut-catalog-check");

const catalogSource = readFileSync(CATALOG, "utf8");

/* --- every registered literal combo must be documented --- */

const found = new Map();
for (const file of walk(EDITOR_DIR)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/combo:\s*"([^"]+)"/g)) {
    if (!found.has(match[1])) found.set(match[1], file);
  }
}

if (found.size === 0) {
  fail("found no `combo:` literals at all — this check has stopped working");
}

// Catalog combos, derived from the same `keys` arrays the sheet renders.
// Both `keys:` and `also:` count as documented. Missing `also:` here would have
// silently un-documented Enter and Backspace the moment their rows were merged
// into their aliases — the check would have gone green while the sheet lost
// nothing, which is the wrong kind of quiet.
const documented = new Set();
for (const match of catalogSource.matchAll(/(?:keys|also):\s*\[([^\]]+)\]/g)) {
  const keys = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  documented.add(keysToCombo(keys));
  // `mod+shift+Z` matches a registered `mod+shift+z`; casing and arrow glyphs
  // are normalised by keysToCombo.
}

for (const [combo, file] of [...found].sort()) {
  const reason = EXEMPT.get(combo);
  if (reason !== undefined) {
    ok(`${combo} — exempt (${reason})`);
    continue;
  }
  if (documented.has(combo.toLowerCase().replace(/\s+/g, ""))) {
    ok(`${combo} — documented`);
  } else {
    fail(
      `${combo} is registered in ${file} but is not in the shortcut catalog — ` +
        `add it to SHORTCUT_GROUPS so the sheet does not omit it`,
    );
  }
}

/* --- runtime-built families must be documented by intent --- */

for (const family of DYNAMIC_FAMILIES) {
  if (catalogSource.includes(family.catalogMustContain)) {
    ok(`dynamic: ${family.catalogMustContain} — documented`);
  } else {
    fail(
      `the catalog no longer mentions "${family.catalogMustContain}", which ` +
        `documented a runtime-built combo (${family.why})`,
    );
  }
}

if (failures > 0) {
  console.error(`\nshortcut-catalog-check: ${failures} problem(s).`);
  process.exit(1);
}
console.log("\nshortcut-catalog-check: catalog covers every registered combo.");
