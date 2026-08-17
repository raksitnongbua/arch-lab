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
const FLOW_WRAPPER = "src/features/flowchart/share/share-button.tsx";
const UC_WRAPPER = "src/features/usecase/share/share-button.tsx";
const C4_SHELL = "src/features/viewer/components/viewer-shell.tsx";
// The ONE merged playground every /view* route mounts. It shares C4
// documents through the shell's panel and the other three kinds through
// their wrappers, so every mount point below is inside the same page now.
const PLAYGROUND = "src/features/playground/components/view-playground.tsx";

const shared = read(SHARED);
const wrapper = read(WRAPPER);
const flowWrapper = read(FLOW_WRAPPER);
const ucWrapper = read(UC_WRAPPER);
const c4Shell = read(C4_SHELL);
const playground = read(PLAYGROUND);

/* --- 1. one implementation, four mount points ------------------------------ */

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
  "the flowchart wrapper mounts the shared ShareButton (not a fork of it)",
  flowWrapper.includes("<ShareButton") &&
    flowWrapper.includes('from "@/features/viewer/share/share-button"'),
);
check(
  "the playground mounts the wrapper for sequence documents",
  playground.includes("<SequenceShareButton"),
);
check(
  "the playground mounts the wrapper for flowchart documents",
  playground.includes("<FlowchartShareButton"),
);
check(
  "the use-case wrapper mounts the shared ShareButton (not a fork of it)",
  ucWrapper.includes("<ShareButton") &&
    ucWrapper.includes('from "@/features/viewer/share/share-button"'),
);
check(
  "the playground mounts the wrapper for use-case documents",
  playground.includes("<UseCaseShareButton"),
);

/* The wrapper must stay a CONFIGURATION of the shared control, never an
   implementation. Any of these appearing in it means someone started a second
   copy — the exact failure mode this check exists to catch. */
/* Tested on CODE, with comments stripped first. The wrapper's header explains
   why its route is short and names the ceiling the URL competes with, which is
   exactly the comment this codebase wants — and matching the bare word would
   fail it for saying so. Only real use is a second implementation. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");
const wrapperCode = stripComments(wrapper);
const flowWrapperCode = stripComments(flowWrapper);
const ucWrapperCode = stripComments(ucWrapper);
for (const forbidden of [
  "encodeShareFragment",
  "mintExpiry",
  "navigator.clipboard",
  "MAX_SHARE_URL_LENGTH",
  "SHARE_URL_SAFE_LENGTH",
]) {
  check(
    `the sequence wrapper does not reimplement the panel (no ${forbidden})`,
    !wrapperCode.includes(forbidden),
  );
  check(
    `the flowchart wrapper does not reimplement the panel (no ${forbidden})`,
    !flowWrapperCode.includes(forbidden),
  );
  check(
    `the use-case wrapper does not reimplement the panel (no ${forbidden})`,
    !ucWrapperCode.includes(forbidden),
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
  ...filesUnder("src/features/flowchart"),
  ...filesUnder("src/features/usecase"),
  ...filesUnder("src/features/playground"),
];
const shareTriggerFiles = featureFiles.filter((file) => {
  const source = read(file);
  return (
    source.includes(">Share<") || source.includes("aria-label={`Share this")
  );
});
check(
  "exactly one file under viewer/, sequence/, flowchart/, usecase/ and playground/ renders the Share trigger",
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

/* Both mint onto the SAME route now, which is the point of the merge: the
   playground is one page, and a share link carries its own document so it
   needs no seed in the URL at all. Two minting sites that can drift, will —
   so they are asserted to agree rather than each asserted separately. */
check(
  "all four viewers share onto the one playground route",
  c4Shell.includes('route="/view"') &&
    wrapper.includes('"/view"') &&
    flowWrapper.includes('"/view"') &&
    ucWrapper.includes('"/view"'),
);
check(
  // Bare `/view`, not a seeded path: the seed moved to `?d=` and a share link
  // does not carry one — it supplies the document and the reader detects the
  // kind. share-capacity-check.mjs owns the deeper assertions about the
  // budget this route shares with the payload.
  "the sequence wrapper mints no seed into the link",
  !wrapperCode.includes("/view/seq") && !wrapperCode.includes("?d="),
);
check(
  "the flowchart wrapper mints no seed into the link",
  !flowWrapperCode.includes("/view/flow") && !flowWrapperCode.includes("?d="),
);
check(
  "the use-case wrapper mints no seed into the link",
  !ucWrapperCode.includes("/view/uc") && !ucWrapperCode.includes("?d="),
);
check(
  "the sequence wrapper omits the diagram pointer (no sub-diagrams to point at)",
  !wrapper.includes("diagram="),
);
check(
  "the flowchart wrapper omits the diagram pointer (no sub-diagrams to point at)",
  !flowWrapper.includes("diagram="),
);
check(
  "the use-case wrapper omits the diagram pointer (no sub-diagrams to point at)",
  !ucWrapper.includes("diagram="),
);

/* --- 4. every route honours the same expiry semantics on OPEN ------------- */

/* Minting an expiring link is only honest if the opening route refuses an
   expired one. One merged playground opens links on every /view* route, so
   ONE component branching on the codec's "expired" status covers them all —
   this check keeps that branch from being "simplified" away. */
check(
  'the playground handles the "expired" decode status',
  playground.includes('"expired"'),
);

/* --- 5. the old duplicate must not resurrect elsewhere -------------------- */

check(
  "no file under src/features/sequence, src/features/flowchart or src/features/usecase calls encodeShareFragment (encoding lives in the shared control)",
  [
    ...filesUnder("src/features/sequence"),
    ...filesUnder("src/features/flowchart"),
    ...filesUnder("src/features/usecase"),
  ].every((file) => !read(file).includes("encodeShareFragment(")),
);
check(
  "the shared component still exists where both viewers import it from",
  existsSync(join(root, SHARED)),
);

/* --- 6. the pre-paint forward flag has a post-hydration owner --------------
 * `data-share-forward` hides the playground's seeded example while a `#m=…`
 * payload decodes. The script that stamps it runs ONCE per document load and a
 * client-side navigation never reloads — so opening any url with `#m=…` and
 * then navigating to a /view* route would leave the attribute set and the page
 * display:none: blank, for the rest of the session (this bit the retired
 * `/view` chooser first). Whoever knows the payload is resolved must clear it.
 * These three assertions keep the stamp, the clear and the stylesheet on ONE
 * spelling, and keep the clear from being "simplified" away as dead code. */
{
  const codec = read("src/features/viewer/share/codec.ts");
  const layout = read("src/app/layout.tsx");
  const css = read("src/app/globals.css");
  const attribute = /SHARE_FORWARD_ATTRIBUTE = "([^"]+)"/.exec(codec)?.[1];
  check(
    "the forward attribute is named once, in the share codec",
    attribute !== undefined,
  );
  check(
    "the root layout stamps it from that constant, not a literal",
    layout.includes("SHARE_FORWARD_ATTRIBUTE") &&
      !layout.includes('"data-share-forward"'),
  );
  check(
    "the playground CLEARS it (a pre-paint hide needs a post-hydration owner)",
    /removeAttribute\(SHARE_FORWARD_ATTRIBUTE\)/.test(playground),
  );
  check(
    "the stylesheet hides the pending block on the SAME attribute name",
    attribute !== undefined && css.includes(`[${attribute}] .af-share-pending`),
  );
}

if (failures > 0) {
  console.error(
    `\nshare-parity-check: ${failures} of ${assertions} assertion(s) failed.`,
  );
  process.exit(1);
}
console.log(`\nshare-parity-check: all ${assertions} assertions passed.`);
