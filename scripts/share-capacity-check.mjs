#!/usr/bin/env node
/**
 * Share-link capacity check: the URL budget, the routes that spend it, and
 * what the user is told when a document blows it.
 *
 * Three promises this pins, each of which failed silently once or nearly did:
 *
 *   1. **Already-minted links keep opening.** The payload format and the
 *      routes are both compatibility surfaces: a link is a bookmark someone
 *      else is holding. Frozen fragments minted with the real codec (one
 *      legacy-style C4, one long-route sequence) must decode to their exact
 *      original text forever, and the long `/view/sequence` route must keep
 *      existing even though new links mint against `/view/seq`.
 *
 *   2. **The short route is real, agreed on, and round-trips.** `/view/seq`
 *      exists to spend 5 fewer characters on the route so the payload gets
 *      them (the whole URL competes against `MAX_SHARE_URL_LENGTH`). Both
 *      minting sites — the sequence Share button wrapper and the MCP
 *      `create_share_link` — must mint the SAME short route (two sites that
 *      can drift, will), the forward page must exist and carry the fragment,
 *      and a link minted there must decode back to the document verbatim.
 *
 *   3. **At the limit, the answer is the `.alab` file — offered, not just
 *      named.** Every refusal path (the shared Share panel's too-long and
 *      unsupported states, and the MCP tool's oversize refusals for both
 *      document kinds) must point at the `.alab` fallback and actually hand
 *      it over: a download button in the panel, the canonical text inline in
 *      the MCP response. "Too big, go away" is the failure mode this exists
 *      to prevent.
 *
 * Exits non-zero on any failure. Run with: pnpm check:share-capacity
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* (same harness as mcp-check.mjs — these scripts run the real app code)    */
/* ----------------------------------------------------------------------- */

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
      const isFile = existsSync(asPath) && statSync(asPath).isFile();
      if (!isFile) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return {
        format: "json",
        shortCircuit: true,
        source: readFileSync(fileURLToPath(url), "utf8"),
      };
    }
    return nextLoad(url, context);
  },
});

const loadModule = (relative) =>
  import(pathToFileURL(path.join(ROOT, relative)).href);

const { decodeShareFragment, MAX_SHARE_URL_LENGTH, SHARE_URL_SAFE_LENGTH } =
  await loadModule("src/features/viewer/share/codec.ts");
const { createShareLink } = await loadModule("src/features/mcp/tools/share.ts");

const readSource = (relative) =>
  readFileSync(path.join(ROOT, relative), "utf8");

let failures = 0;
let assertions = 0;
async function check(label, run) {
  assertions += 1;
  try {
    await run();
    console.log(`  ok  ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${label}\n       ${error.message}`);
  }
}

function textOf(result) {
  return result.content[0].text;
}

console.log("share-capacity-check");

/* ----------------------------------------------------------------------- */
/* 1. Already-minted links keep opening                                     */
/* ----------------------------------------------------------------------- */

/*
 * FROZEN fragments, minted once with the real codec and then hard-coded.
 * Deliberately literals, never re-encoded here: re-encoding would test only
 * that today's encoder agrees with today's decoder, while the promise is that
 * TODAY'S decoder still reads what YESTERDAY'S encoder shipped. If a codec
 * change breaks either of these, it breaks every link of that era in the
 * wild, and this check exists to make that a decision instead of an accident.
 */
const FROZEN_C4_TEXT = `archlab 1.0
title "Frozen"

@context ctx-root "System Context" {
  user:person "User"
  sys:system "System"
  user -> sys : "Uses"
}
`;
const FROZEN_C4_FRAGMENT =
  "m=AF1.LctBCsJADEbhfU7xk32l3c5CBMELSA_QDgGFcSJJCq3i3UWn6_e9yfKtTDOGQ09xjyLgi-lLKhOdstaQNZBj7Uw1wNfNQx44t8B4E7C4WHqKuVbw6GJMgG-evOF94p2iO_4q0h8704e-&d=ctx-root";

const FROZEN_SEQ_TEXT = `archlab 1.0 sequence
title "Frozen flow"

@sequence
  a:actor "Caller"
  b:participant "Service"

  a -> b : "Ping"
  b ..> a : "Pong"
`;
const FROZEN_SEQ_FRAGMENT =
  "m=AF1.PcoxCgJBDEbhfk7xk95B2ykWQbAWPEEmRA2EmTWOLnh62S1sv_c45OFccch7vPT51iaahg1X0Dn6Vxtu3hdK6fjPABeW0QN0YncNSkAtM8cwsZnbAF01PiZKab2xm1BRQBdr921GzhN4o77SDw";

await check(
  "a previously-minted C4 fragment still decodes verbatim",
  async () => {
    const decoded = await decodeShareFragment(`#${FROZEN_C4_FRAGMENT}`);
    assert.equal(decoded.status, "ok");
    assert.equal(decoded.aftText, FROZEN_C4_TEXT);
    assert.equal(decoded.diagramId, "ctx-root");
  },
);

await check(
  "a sequence fragment minted against the LONG route still decodes verbatim",
  async () => {
    const decoded = await decodeShareFragment(`#${FROZEN_SEQ_FRAGMENT}`);
    assert.equal(decoded.status, "ok");
    assert.equal(decoded.aftText, FROZEN_SEQ_TEXT);
  },
);

await check(
  "the long routes old links point at still exist as pages",
  async () => {
    // `/view/sequence` is where pre-alias sequence links land, and `/view`
    // is where pre-chooser C4 links land — removing either page orphans a
    // generation of links no matter how healthy the codec is.
    assert.ok(existsSync(path.join(ROOT, "src/app/view/sequence/page.tsx")));
    assert.ok(existsSync(path.join(ROOT, "src/app/view/page.tsx")));
  },
);

/* ----------------------------------------------------------------------- */
/* 2. The short route is real, agreed on, and round-trips                   */
/* ----------------------------------------------------------------------- */

await check(
  "both minting sites mint the same short route (/view/seq)",
  async () => {
    const wrapper = readSource("src/features/sequence/share/share-button.tsx");
    const mcp = readSource("src/features/mcp/tools/share.ts");
    assert.ok(
      wrapper.includes('"/view/seq"'),
      "the Share button wrapper must mint /view/seq",
    );
    assert.ok(
      mcp.includes("/view/seq#"),
      "create_share_link must mint /view/seq",
    );
    assert.ok(
      !mcp.includes("/view/sequence#"),
      "create_share_link must not still mint the long route",
    );
  },
);

await check(
  "the /view/seq forward page exists and carries the fragment",
  async () => {
    assert.ok(existsSync(path.join(ROOT, "src/app/view/seq/page.tsx")));
    const forward = readSource("src/app/view/seq/seq-forward.tsx");
    // The forward must be a replace (Back must skip the trampoline) and must
    // append location.hash — dropping the fragment drops the whole document.
    assert.match(
      forward,
      /router\.replace\(`\/view\/sequence\$\{window\.location\.hash\}`\)/,
    );
  },
);

await check(
  '"seq" is a reserved model id (the alias cannot be shadowed)',
  async () => {
    const modelPage = readSource("src/app/view/[modelId]/page.tsx");
    assert.match(modelPage, /RESERVED_MODEL_IDS = new Set\(\[[^\]]*"seq"/);
  },
);

await check(
  "a link minted on the short route round-trips the document",
  async () => {
    const result = await createShareLink(
      FROZEN_SEQ_TEXT,
      "auto",
      undefined,
      undefined,
    );
    assert.notEqual(result.isError, true, textOf(result));
    const url = textOf(result)
      .split("\n")
      .find((line) => line.startsWith("http"));
    assert.ok(url !== undefined, "no URL in the tool's answer");
    assert.match(url, /\/view\/seq#m=AF1\./);
    const decoded = await decodeShareFragment(new URL(url).hash);
    assert.equal(decoded.status, "ok");
    assert.equal(decoded.aftText, FROZEN_SEQ_TEXT);
  },
);

await check(
  "the alias genuinely shortens every minted sequence URL",
  async () => {
    // The whole point of /view/seq. Framed as route-length so the check still
    // says WHY the alias exists if someone "tidies" it back to the long route.
    assert.ok("/view/seq".length < "/view/sequence".length);
    assert.equal("/view/sequence".length - "/view/seq".length, 5);
  },
);

/* ----------------------------------------------------------------------- */
/* 3. At the limit, the answer is the .alab file — offered, not just named  */
/* ----------------------------------------------------------------------- */

/**
 * A document guaranteed to overflow the ceiling: distinct pseudo-random hex
 * descriptions defeat deflate, and the target payload is a comfortable
 * multiple of `MAX_SHARE_URL_LENGTH` so zlib-version wiggle can never bring
 * it back under.
 */
function oversizedSequenceText() {
  let seed = 0x2f6e2b1;
  const rand = () => {
    // xorshift — deterministic across runs and platforms, unlike Math.random.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0).toString(16).padStart(8, "0");
  };
  let text = `archlab 1.0 sequence\ntitle "Oversized"\n\n@sequence\n  a:participant "Service A"\n  b:participant "Service B"\n`;
  for (let index = 0; index < 400; index += 1) {
    text += `  a -> b : "op-${index} ${rand()}${rand()}${rand()}${rand()}"\n`;
  }
  return text;
}

await check(
  "an over-limit sequence document is refused with the .alab text inline",
  async () => {
    const result = await createShareLink(
      oversizedSequenceText(),
      "auto",
      undefined,
      undefined,
    );
    assert.equal(result.isError, true, "an oversized document must refuse");
    const text = textOf(result);
    assert.match(
      text,
      /`\.alab`/,
      "the refusal must tell the caller to use the .alab file instead",
    );
    assert.match(
      text,
      /archlab 1\.0 sequence/,
      "the refusal must include the canonical .alab text, not just describe it",
    );
    assert.match(
      text,
      new RegExp(String(MAX_SHARE_URL_LENGTH).replace(/\B(?=(\d{3})+$)/g, ",")),
      "the refusal must name the real ceiling from the codec's constant",
    );
  },
);

await check(
  "the Share panel's refusal states offer the download, naming the file",
  async () => {
    const panel = readSource("src/features/viewer/share/share-button.tsx");
    // Static source assertions in the spirit of share-parity-check: the
    // too-long AND unsupported branches must each carry the download button,
    // and the copy must name the file extension it hands over — the honest
    // tiers are only honest if the fallback is one click away, not prose.
    const tooLong = panel.split('link.status === "too-long"')[1];
    assert.ok(tooLong !== undefined, "the too-long branch must exist");
    assert.ok(
      tooLong.includes("handleDownload") &&
        tooLong.includes("Download the {downloadExtension}"),
      "too-long must offer the download and name the file",
    );
    const unsupported = panel.split('link.status === "unsupported"')[1];
    assert.ok(unsupported !== undefined, "the unsupported branch must exist");
    assert.ok(
      unsupported.includes("handleDownload"),
      "unsupported must offer the download too",
    );
    // The middle tier (over safe, under ceiling) must steer email senders to
    // the file as well — that is the tier where truncation is plausible.
    assert.ok(
      panel.includes("overSafeLength"),
      "the middle tier must still exist",
    );
  },
);

await check(
  "the sequence viewer's at-limit fallback downloads a file named for its content",
  async () => {
    // `.alab` for .alab text, `.mmd` for a Mermaid pane — the wrapper decides,
    // so the guidance ("use the file instead") always hands over a file the
    // playground genuinely re-accepts by paste.
    const wrapper = readSource("src/features/sequence/share/share-button.tsx");
    assert.ok(wrapper.includes("downloadExtension="));
    assert.ok(wrapper.includes("ARCHTEXT_EXTENSION"));
  },
);

await check(
  "tiers still come from the codec's constants (no folklore threshold)",
  async () => {
    // PR #18's ground: 2000 was folklore, and the cure is that the NUMBERS
    // live in codec.ts alone. This also sanity-pins their ordering — a safe
    // tier above the ceiling would make every message about them nonsense.
    assert.ok(SHARE_URL_SAFE_LENGTH < MAX_SHARE_URL_LENGTH);
    const mcp = readSource("src/features/mcp/tools/share.ts");
    assert.ok(
      !/[^\w.]2000[^\w]/.test(mcp) && !/[^\w.]8000[^\w]/.test(mcp),
      "share.ts must reference the constants, not re-hardcode the numbers",
    );
  },
);

if (failures > 0) {
  console.error(
    `\nshare-capacity-check: ${failures} of ${assertions} check(s) failed.`,
  );
  process.exit(1);
}
console.log(`\nshare-capacity-check: all ${assertions} checks passed.`);
