#!/usr/bin/env node
/**
 * Share-control parity check: the C4 viewer and the sequence viewer must offer
 * the SAME share feature, because they once did not.
 *
 * The history this guards against: the sequence pane grew its own copy-a-link
 * button while the C4 viewer's share panel gained expiry/TTL choices, honest
 * length tiers, a Web Share sheet and a download fallback — and nothing failed,
 * so nobody noticed the drift until a user did. The fix was ONE component
 * (`src/features/viewer/share/share-button.tsx`) mounted by both viewers; this
 * script fails the moment that arrangement is undone, so the next divergence is
 * a red check instead of a bug report.
 *
 * These are static source assertions, in the same spirit as
 * sequence-motion-check.mjs's "matches the C4 stylesheet" checks: a
 * requirement met by sharing once is a requirement that rots the first time
 * someone "simplifies" a copy back into existence.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

console.log("share-parity-check");

const SHARED = "src/features/viewer/share/share-button.tsx";
const WRAPPER = "src/features/sequence/share/share-button.tsx";
const C4_SHELL = "src/features/viewer/components/viewer-shell.tsx";
const C4_PLAYGROUND = "src/features/viewer/components/viewer-playground.tsx";
const SEQ_PLAYGROUND =
  "src/features/sequence/components/sequence-playground.tsx";

const shared = read(SHARED);
const wrapper = read(WRAPPER);
const c4Shell = read(C4_SHELL);
const c4Playground = read(C4_PLAYGROUND);
const seqPlayground = read(SEQ_PLAYGROUND);

/* --- 1. one implementation, two mount points ------------------------------ */

check(
  "the C4 shell mounts the shared ShareButton",
  c4Shell.includes("<ShareButton") &&
    c4Shell.includes('from "../share/share-button"'),
);
check(
  "the sequence wrapper mounts the shared ShareButton (not a fork of it)",
  wrapper.includes("<ShareButton") &&
    wrapper.includes('from "@/features/viewer/share/share-button"'),
);
check(
  "the sequence playground mounts the wrapper",
  seqPlayground.includes("<SequenceShareButton"),
);

/* The wrapper must stay a CONFIGURATION of the shared control, never an
   implementation. Any of these appearing in it means someone started a second
   copy — the exact failure mode this check exists to catch. */
for (const forbidden of [
  "encodeShareFragment",
  "mintExpiry",
  "navigator.clipboard",
  "MAX_SHARE_URL_LENGTH",
  "SHARE_URL_SAFE_LENGTH",
]) {
  check(
    `the sequence wrapper does not reimplement the panel (no ${forbidden})`,
    !wrapper.includes(forbidden),
  );
}

/* No OTHER share button may grow anywhere under either feature. The trigger's
   `aria-haspopup="dialog"` + Share2 face is the shared control's signature;
   the only file allowed to carry it is the shared component. */
function filesUnder(relative) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(join(root, relative));
  return out.map((f) => f.slice(root.length + 1));
}
const featureFiles = [
  ...filesUnder("src/features/viewer"),
  ...filesUnder("src/features/sequence"),
];
const shareTriggerFiles = featureFiles.filter((file) => {
  const source = read(file);
  return (
    source.includes(">Share<") || source.includes("aria-label={`Share this")
  );
});
check(
  "exactly one file under viewer/ and sequence/ renders the Share trigger",
  shareTriggerFiles.length === 1 && shareTriggerFiles[0] === SHARED,
);

/* --- 2. the option set both viewers therefore get ------------------------- */

check(
  "the shared control offers TTL choices (expiry is part of the panel)",
  shared.includes("TTL_CHOICES") && shared.includes("mintExpiry"),
);
check(
  "expiry is gated on verifiability, not on which viewer mounts it",
  shared.includes("canVerifyExpiry()"),
);
check(
  "the length tiers come from the codec's constants, not a re-hardcoded folklore threshold",
  shared.includes("MAX_SHARE_URL_LENGTH") &&
    shared.includes("SHARE_URL_SAFE_LENGTH") &&
    // `> 2000` / `2000)` as a literal comparison would be the folklore refusal
    // sneaking back in (PR #18 removed it); the codec owns the numbers.
    !/[^\w]2000[^\w]/.test(shared),
);
check(
  "the shared control announces outcomes through the host's live region",
  shared.includes("onAnnounce"),
);
check(
  "the download fallback exists for over-long documents",
  shared.includes('"too-long"') && shared.includes("handleDownload"),
);

/* --- 3. each viewer states only its genuine differences ------------------- */

check(
  "the C4 shell shares onto /view/c4",
  c4Shell.includes('route="/view/c4"'),
);
check(
  "the sequence wrapper shares onto /view/sequence",
  wrapper.includes('"/view/sequence"'),
);
check(
  "the sequence wrapper omits the diagram pointer (no sub-diagrams to point at)",
  !wrapper.includes("diagram="),
);

/* --- 4. both routes honour the same expiry semantics on OPEN -------------- */

/* Minting an expiring sequence link is only honest if the sequence route
   refuses an expired one. Both playgrounds must branch on the codec's
   "expired" status — if either stops, links expire on one route and quietly
   keep working on the other. */
check(
  'the C4 playground handles the "expired" decode status',
  c4Playground.includes('"expired"'),
);
check(
  'the sequence playground handles the "expired" decode status',
  seqPlayground.includes('"expired"'),
);

/* --- 5. the old duplicate must not resurrect elsewhere -------------------- */

check(
  "no file under src/features/sequence calls encodeShareFragment (encoding lives in the shared control)",
  filesUnder("src/features/sequence").every(
    (file) => !read(file).includes("encodeShareFragment("),
  ),
);
check(
  "the shared component still exists where both viewers import it from",
  existsSync(join(root, SHARED)),
);

if (failures > 0) {
  console.error(
    `\nshare-parity-check: ${failures} of ${assertions} assertion(s) failed.`,
  );
  process.exit(1);
}
console.log(`\nshare-parity-check: all ${assertions} assertions passed.`);
