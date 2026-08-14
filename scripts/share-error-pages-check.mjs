#!/usr/bin/env node
/**
 * Share-link failure-page check: EVERY decode status the share codec can
 * return must map to a full-page outcome in the playground (the ONE merged
 * component every `/view*` route mounts) through the ONE shared failure page.
 *
 * The history this guards against: PR #19 gave the C4 playground a full-page
 * takeover for links that will not open, while the sequence playground kept
 * "reporting" the same failures into a screen-reader-only live region. A
 * sighted reader who opened a broken or expired sequence link saw the seed
 * example render normally and concluded it was the flow they were sent —
 * nothing failed loudly, so nobody noticed until a user did. The two
 * playgrounds have since merged into one, which removes the drift BETWEEN
 * routes; this script keeps the remaining copy honest, and keeps the list
 * below ready to grow should a second `#m=…` host ever appear.
 *
 * Two layers of defence, and this script asserts both stay in place:
 *   1. The playground handles `decodeShareFragment`'s result in a `switch`
 *      whose `default` assigns the value to `never` — so `pnpm typecheck`
 *      fails the moment the codec grows a status it does not map.
 *      (This script checks the guard EXISTS; the compiler checks it is
 *      exhaustive.)
 *   2. It mounts the shared failure page component, and that component
 *      renders a distinct full page per failure kind — a second copy is how
 *      the two routes drifted apart before.
 *
 * Static source assertions, in the same spirit as share-parity-check.mjs.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");

let assertions = 0;
let failures = 0;
const check = (label, ok) => {
  assertions += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
};

console.log("share-error-pages-check");

const CODEC = "src/features/viewer/share/codec.ts";
const SHARED_PAGE = "src/components/share/share-link-failure.tsx";
const SHARED_PAGE_IMPORT = "@/components/share/share-link-failure";
const PLAYGROUNDS = [
  ["merged", "src/features/playground/components/view-playground.tsx"],
];

const codec = read(CODEC);
const sharedPage = read(SHARED_PAGE);

/* --- 1. enumerate the codec's decode statuses (from the union itself) ----- */

// Capture to the blank line after the union: a `;`-terminated lazy match
// stops inside the members' doc comments (they contain semicolons).
const unionMatch = codec.match(/export type DecodedShare =[\s\S]*?\n\n/);
check("the DecodedShare union is where this script expects it", !!unionMatch);
const statuses = unionMatch
  ? [...unionMatch[0].matchAll(/status: "(\w+)"/g)].map((m) => m[1])
  : [];
check(
  `the union yields at least the four known statuses (found: ${statuses.join(", ")})`,
  ["ok", "none", "expired", "error"].every((s) => statuses.includes(s)),
);

/* --- 2. each playground maps every status, with the never-guard ----------- */

for (const [name, relative] of PLAYGROUNDS) {
  const source = read(relative);

  for (const status of statuses) {
    check(
      `${name} playground switches on decode status "${status}" explicitly`,
      source.includes(`case "${status}"`),
    );
  }
  check(
    // The compiler enforces exhaustiveness ONLY while this guard exists — a
    // "simplified" switch without it would let a new status fall through to a
    // page silently showing the seed example.
    `${name} playground keeps the \`never\` exhaustiveness guard on the switch`,
    /const _exhaustive: never = decoded/.test(source),
  );
  check(
    `${name} playground mounts the shared failure page (${SHARED_PAGE_IMPORT})`,
    source.includes(SHARED_PAGE_IMPORT) &&
      source.includes("<ShareLinkFailurePage"),
  );
  check(
    // The pre-#19 pattern: a failure "reported" only into the polite live
    // region, invisible to sighted readers. Failure branches must set the
    // takeover state, never merely announce.
    `${name} playground sets a takeover for the "error" and "expired" statuses`,
    /case "error":[\s\S]*?setShareFailure\(/.test(source) &&
      /case "expired":[\s\S]*?setShareFailure\(/.test(source),
  );
  check(
    `${name} playground does not resurrect a per-route failure page`,
    !source.includes("share/share-broken") &&
      !source.includes("share/share-expired"),
  );
}

/* --- 3. the shared page renders a distinct full page per failure kind ----- */

const kindsMatch = sharedPage.match(
  /export type ShareOpenFailure =[\s\S]*?\n\n/,
);
check(
  "the ShareOpenFailure union is where this script expects it",
  !!kindsMatch,
);
const kinds = kindsMatch
  ? [
      ...new Set(
        [...kindsMatch[0].matchAll(/kind: "([\w-]+)"/g)].map((m) => m[1]),
      ),
    ]
  : [];
check(
  // "wrong-document" used to be a third kind — an intact payload of the other
  // playground's kind. The merged playground reads every payload kind, so the
  // state became unreachable and was deleted with the merge.
  `the failure union carries the two known kinds (found: ${kinds.join(", ")})`,
  ["expired", "broken"].every((k) => kinds.includes(k)),
);
for (const kind of kinds) {
  check(
    `the shared page branches on failure kind "${kind}"`,
    sharedPage.includes(`failure.kind === "${kind}"`) ||
      sharedPage.includes(`case "${kind}"`),
  );
}

/* --- 4. the page is a page, not a toast ----------------------------------- */

check(
  "the shared page announces to assistive tech (role alert AND status)",
  sharedPage.includes('role="alert"') || sharedPage.includes('role: "alert"'),
);
check(
  "expiry is not styled as an error (a status role exists for it)",
  sharedPage.includes('role="status"') || sharedPage.includes('role: "status"'),
);
check(
  "the shared page carries a real heading (<h1>)",
  /<h1[\s>]/.test(sharedPage),
);
check(
  "truncation advice points at the .alab file as the fix",
  sharedPage.includes(".alab") && /cut short/i.test(sharedPage),
);
check(
  "the expired copy tells the reader to ask for a fresh link",
  /fresh link/i.test(sharedPage),
);

if (failures > 0) {
  console.error(
    `\nshare-error-pages-check: ${failures} of ${assertions} assertion(s) failed.`,
  );
  process.exit(1);
}
console.log(`\nshare-error-pages-check: all ${assertions} assertions passed.`);
