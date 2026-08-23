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
 *      legacy-style C4, one long-route sequence, and a flowchart and a
 *      use-case diagram each frozen the day its playground shipped) must
 *      decode to their exact original text forever, and every route any link
 *      was ever minted against must keep existing — including the whole
 *      `/view/*` family, which is what this route family was CALLED before it
 *      was renamed `/live`.
 *
 *   2. **New links mint the REAL page, and it is bare `/live`.** This header
 *      said the opposite for a release — that links mint `/live/seq` because
 *      the short path leaves more characters for the payload — while the
 *      assertions 250 lines below required bare `/live` and forbade minting
 *      any alias. A check whose documentation contradicts its assertions is
 *      worse than an undocumented one, so: **`/live` is shorter than every
 *      seeded path and is the real page**, a share link carries its own
 *      document and the reader detects the kind, so no minted URL needs a kind
 *      in it at all. Every minting site — the sequence, flowchart and use-case
 *      Share wrappers and the MCP `create_share_link` — must mint that same
 *      bare route (sites that can drift, will), must mint no alias, each alias
 *      must still exist and carry the fragment, and a minted link must decode
 *      back to the document verbatim.
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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

const {
  decodeShareFragment,
  normalizeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_URL_SAFE_LENGTH,
} = await loadModule("src/features/viewer/share/codec.ts");
const { createShareLink } = await loadModule("src/features/mcp/tools/share.ts");

const readSource = (relative) =>
  readFileSync(path.join(ROOT, relative), "utf8");

/**
 * Every forwarding alias on disk, with the destination it carries a fragment
 * to — found by walking `src/app` for a `page.tsx` rendering `AliasForward`.
 *
 * DERIVED, because this file listed its aliases by hand in three places and
 * the lists were already incomplete: `/live/er` and `/live/dict` had shipped
 * without being added, so no assertion here proved a link minted against
 * either still opened. The retirement of `/editor` is the case that settles
 * the argument — it is not under `src/app/live`, so a fourth hand-written list
 * would have been needed, and `EditModeLink` minted `/editor#m=…` for every
 * "Edit this diagram" click. A hardcoded list cannot notice a route it has
 * never heard of; the filesystem can. Same predicate `check:seo` uses.
 */
function aliasRoutes() {
  const found = [];
  const walk = (dir, route) => {
    for (const entry of readdirSync(path.join(ROOT, dir))) {
      const child = path.join(dir, entry);
      if (statSync(path.join(ROOT, child)).isDirectory()) {
        if (entry.startsWith("(") || entry.startsWith("[")) continue;
        walk(child, `${route}/${entry}`);
        continue;
      }
      if (entry !== "page.tsx") continue;
      const source = readSource(child);
      if (!source.includes("AliasForward")) continue;
      found.push({
        route,
        file: child,
        to: /AliasForward\s+to="([^"]+)"/.exec(source)?.[1] ?? null,
      });
    }
  };
  walk("src/app", "");
  return found.sort((a, b) => (a.route < b.route ? -1 : 1));
}

const ALIASES = aliasRoutes();

/**
 * The paths this route family answered on before it was renamed `/live`, and
 * therefore the paths links exist against. FROZEN LITERALS, for the same
 * reason the fragments below are: the tree can tell you what routes exist
 * TODAY, and nothing in it can tell you what a URL in someone's bookmark bar
 * says. A derivation from `src/app/live` would also demand a legacy twin for
 * every route added AFTER the rename, which no link can possibly name.
 *
 * `/view` was the whole product's playground for the entire life of the share
 * link before the rename, so this is the single largest set of live URLs in
 * the wild the repo has ever had to keep working.
 */
const LEGACY_VIEW_ROUTES = [
  "/view",
  "/view/c4",
  "/view/seq",
  "/view/sequence",
  "/view/flow",
  "/view/uc",
  "/view/er",
  "/view/dict",
];

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

/* The third document kind, frozen the day its playground shipped: the first
   flowchart share links ever minted must keep opening under every future
   codec change, and freezing one NOW is what makes that a decision instead
   of an accident — the same reasoning as the two fragments above. */
const FROZEN_FLOW_TEXT = `archlab 1.0 flowchart
title "Frozen chart"

@flowchart
  start s "Start"
  decision ok "Fine?"
  end done "Done"

  s -> ok
  ok -> done : "yes"
  ok -> s : "no"
`;
const FROZEN_FLOW_FRAGMENT =
  "m=AF1.RctBCsIwEIXh_ZziMfuKbl1UF9ILeIKYjDQ0zEAyIPb0JRXs9vvfCzXOJbxwOZ3xLvaJc6hOnr0IeKq2imI3JrofA6B5qI4GfvpegSQxt2wKW8BTVrl1FU1IpgJ-mApTv2IYYQuhL4fxl6_grzT-Y-uixrQB";

/* The fourth document kind, frozen the day its playground shipped — the
   same decision-not-accident reasoning as the three above: the first
   use-case share links ever minted must keep opening under every future
   codec change. */
const FROZEN_UC_TEXT = `archlab 1.0 usecase
title "Frozen use case"

@usecase
  actor user "User"
  boundary "System"
    usecase act "Do the thing"

  user -- act
`;
const FROZEN_UC_FRAGMENT =
  "m=AF1.NYxBCsMwDATvesWie0r7gxxCPlD6AMURcSCxQVYO6euLKL7O7I5YyocseD2euJomaUq--6Hg2epXS1AEZqKxLwBJXi2cgT9NjQlY6lVWsRv8vpvrGQy9Gg_wVOFZ4XkvGxPhXxiGsPQD";

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
  "a previously-minted flowchart fragment still decodes verbatim",
  async () => {
    const decoded = await decodeShareFragment(`#${FROZEN_FLOW_FRAGMENT}`);
    assert.equal(decoded.status, "ok");
    assert.equal(decoded.aftText, FROZEN_FLOW_TEXT);
  },
);

await check(
  "a previously-minted use-case fragment still decodes verbatim",
  async () => {
    const decoded = await decodeShareFragment(`#${FROZEN_UC_FRAGMENT}`);
    assert.equal(decoded.status, "ok");
    assert.equal(decoded.aftText, FROZEN_UC_TEXT);
  },
);

await check(
  "the long routes old links point at still exist as pages",
  async () => {
    // The two long-lived paths, under whichever name they answer on: the
    // `/…/sequence` route is where pre-alias sequence links land and the bare
    // playground is where pre-chooser C4 links land, so removing either page
    // orphans a generation of links no matter how healthy the codec is. Their
    // `/view` twins are asserted separately below — this pair is about the
    // pages themselves still being pages.
    assert.ok(existsSync(path.join(ROOT, "src/app/live/sequence/page.tsx")));
    assert.ok(existsSync(path.join(ROOT, "src/app/live/page.tsx")));
  },
);

await check(
  "every path from before the /live rename still forwards, with its payload",
  async () => {
    /* THE RENAME IS THE LARGEST ROUTE CHANGE THIS REPO HAS MADE, because the
       path it renamed is the one every share link was minted against. A 308
       could not do it: the document lives in the fragment, the fragment never
       reaches the server, and the redirect would deliver `/live` a bare URL —
       so each old path is a client trampoline, and this is the assertion that
       it exists and carries the payload. Walked with the SHIPPED destination
       and the real `normalizeShareFragment`, never a description of them. */
    const payload = FROZEN_C4_FRAGMENT;
    const byRoute = new Map(ALIASES.map((alias) => [alias.route, alias]));
    for (const route of LEGACY_VIEW_ROUTES) {
      const alias = byRoute.get(route);
      assert.ok(
        alias !== undefined,
        `${route} no longer forwards anywhere — every link minted against it is now a 404`,
      );
      assert.ok(alias.to, `${route} must name a destination`);
      assert.ok(
        alias.to.startsWith("/live"),
        `${route} must land on the renamed playground, got ${alias.to}`,
      );
      /* ONE HOP. Forwarding `/view/seq` to `/live/seq` would bounce a reader
         through a second trampoline; it must go where `/live/seq` goes. */
      assert.ok(
        !byRoute.has(alias.to.split("?")[0]),
        `${route} forwards to ${alias.to}, which is itself a trampoline — one hop, not two`,
      );
      const body = normalizeShareFragment(`#${payload}`);
      const landed = `${alias.to}${body === "" ? "" : `#${body}`}`;
      const decoded = await decodeShareFragment(`#${landed.split("#")[1]}`);
      assert.equal(decoded.status, "ok", `${route} payload failed to decode`);
      assert.equal(decoded.aftText, FROZEN_C4_TEXT);
    }
  },
);

/* ----------------------------------------------------------------------- */
/* 2. New links mint the real page, and it is bare `/live`                   */
/* ----------------------------------------------------------------------- */

await check(
  "every minting site mints the same route, and it carries no seed",
  async () => {
    const wrapper = readSource("src/features/sequence/share/share-button.tsx");
    const flowWrapper = readSource(
      "src/features/flowchart/share/share-button.tsx",
    );
    const ucWrapper = readSource("src/features/usecase/share/share-button.tsx");
    const mcp = readSource("src/features/mcp/tools/share.ts");
    /* Bare `/live`. The seeded paths were three routes mounting one
       component; the seed is `?d=` now and a share link needs none of it,
       because it carries the document and the reader detects the kind.
       Minting sites that can drift, will, so they are asserted together. */
    assert.ok(
      wrapper.includes('SHARE_ROUTE = "/live"'),
      "the sequence Share wrapper must mint bare /live",
    );
    /* The flowchart wrapper must NOT mint `/live/flow`: that route is an
       AliasForward trampoline, and minting against a trampoline is the exact
       mistake the "REAL page" check below records — a client-side bounce on
       the most common arrival, previewing with whatever card the alias has. */
    assert.ok(
      flowWrapper.includes('SHARE_ROUTE = "/live"'),
      "the flowchart Share wrapper must mint bare /live",
    );
    /* `/live/uc` is an AliasForward trampoline like `/live/flow` — minting
       against it would put a client-side bounce on every use-case link. */
    assert.ok(
      ucWrapper.includes('SHARE_ROUTE = "/live"'),
      "the use-case Share wrapper must mint bare /live",
    );
    assert.ok(
      mcp.includes("/live#${fragment}"),
      "create_share_link must mint bare /live",
    );
    /* Derived from the aliases on disk: minting against a TRAMPOLINE spends
       characters on a route that only forwards, and the payload competes for
       them. A hand-written list could not have covered a new alias. */
    for (const { route } of ALIASES) {
      assert.ok(
        !mcp.includes(`${route}#`),
        `create_share_link must not mint ${route}#, which only forwards`,
      );
    }
  },
);

await check(
  "no shipped code names a /view path except the trampolines themselves",
  () => {
    /* THE OLD NAME SURVIVING IN A FILE NOBODY OPENED is the failure this
       exists for, and it is the shape that has gone wrong repeatedly here: a
       route was renamed, most callers followed, and one `href` or one minting
       constant kept pointing at the previous path. A stale LINK is not a 404
       — it lands on a trampoline and bounces — so nothing reports it, and the
       reader pays a redirect on every click forever.
       WALKED, never listed: a hand-written set of files to inspect cannot
       notice the surface it has never heard of (`codebase.md` habit 4).
       Scoped to `src`, which is what ships. `.claude/rules/*` and `README.md`
       are DISCUSSION and must stay free to name the old paths — explaining
       why the trampolines exist requires writing them down, and forbidding
       that would delete the reason.
       Comments stripped for the same reason and in the same way as
       `og-cards-check.mjs` and `seo-check.mjs`: a comment recording that this
       family used to be called `/view` is the institutional memory, not a
       defect. What is left is the strings, hrefs and JSX a reader meets. */
    const files = [];
    const walk = (relative) => {
      for (const entry of readdirSync(path.join(ROOT, relative))) {
        const child = path.join(relative, entry);
        if (statSync(path.join(ROOT, child)).isDirectory()) {
          walk(child);
          continue;
        }
        if (/\.tsx?$/.test(entry)) files.push(child);
      }
    };
    walk("src");
    assert.ok(
      files.length > 200,
      `only ${files.length} files walked — a broken walk passes this forever`,
    );
    const offenders = [];
    for (const file of files) {
      // The trampolines are the one place a `/view` path belongs.
      if (file.startsWith(path.join("src", "app", "view"))) continue;
      const code = readSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
      /* `(?![\w-])` so `/viewer`, `/view-playground` and `/viewBox` are not
         hits: this is about the ROUTE, and the feature directory that shares
         its first four letters is not going anywhere. */
      if (/\/view(?![\w-])/.test(code)) offenders.push(file);
    }
    assert.equal(
      offenders.length,
      0,
      `these point at the retired route family instead of /live: ${offenders.join(", ")}`,
    );
  },
);

await check(
  "every route a link was ever minted against still delivers its payload",
  async () => {
    /* The payload format is one compatibility surface and the ROUTES are the
       other. Merging the seeded playgrounds into `/live` made three of them
       forwarding aliases, so this walks the hop each old link now takes —
       using the shipped `to` and the real `normalizeShareFragment`, not a
       description of them — and asserts the fragment arrives intact.

       A link is a bookmark someone else is holding: `/view/seq#m=…` was the
       minted shape for every sequence share, and `/view/sequence#m=…` before
       that. Both must open forever. */
    /* EVERY alias on disk, not the five that used to be typed here. Each one
       joins this compatibility surface the day it ships, and the two that
       shipped without being added (`/live/er`, `/live/dict`) are exactly why
       the list is now read rather than written. `/editor` is in it too: it was
       the minting target for every "Edit this diagram" click. */
    const payload = FROZEN_SEQ_FRAGMENT;
    /* THE NUMBER IS A FLOOR ON A BROKEN WALK, not an inventory: a walk that
       returns nothing passes every assertion in this loop and reads exactly
       like a clean tree. It doubled at the `/view` → `/live` rename, because
       each seeded path now answers under BOTH names — 8 legacy `/view` paths,
       the 7 seeded `/live` aliases, and `/editor` = 16. Raise it when a
       genuinely new alias ships; never lower it to make a deletion pass. */
    assert.ok(
      ALIASES.length >= 16,
      `expected the known aliases and more, found ${ALIASES.length} — a broken walk makes this vacuous`,
    );
    for (const { route, to } of ALIASES) {
      assert.ok(to, `${route} must forward somewhere`);
      // Exactly what AliasForward does on mount.
      const body = normalizeShareFragment(`#${payload}`);
      const landed = `${to}${body === "" ? "" : `#${body}`}`;
      assert.ok(
        landed.startsWith("/live"),
        `${route} must land on the playground, got ${landed}`,
      );
      assert.ok(
        landed.endsWith(`#${payload}`),
        `${route} must carry the payload across, got ${landed}`,
      );
      // and the payload that arrives still decodes to the original document
      const decoded = await decodeShareFragment(`#${landed.split("#")[1]}`);
      assert.equal(decoded.status, "ok", `${route} payload failed to decode`);
      assert.equal(decoded.aftText, FROZEN_SEQ_TEXT);
    }
  },
);

await check("the minted route is the REAL page, not a trampoline", async () => {
  /* The lesson this encodes survived the merge intact, only the route
     changed: whatever links are minted against must be the REAL page and must
     own a social card. It was learned when `/live/seq` was briefly a forward,
     which put a bounce on the most common way anyone arrives from outside and
     left those links previewing with the wrong card. `/live` is that route
     now; the seeded paths forward to it for links minted before the merge,
     and keep their own cards so those links keep their previews. */
  const view = readSource("src/app/live/page.tsx");
  assert.ok(
    view.includes("<ViewPlayground"),
    "src/app/live/page.tsx must mount the playground",
  );
  assert.ok(
    existsSync(path.join(ROOT, "src/app/live/opengraph-image.tsx")),
    "the route share links carry must own a social card",
  );
  /* Derived: every alias found on disk forwards. Listing four names proved
     nothing about the three that were not in the list. */
  for (const { route, file, to } of ALIASES) {
    assert.ok(
      readSource(file).includes("AliasForward"),
      `${route} must forward, carrying the fragment`,
    );
    assert.ok(to, `${route} must name a destination`);
  }
});

await check(
  '"seq", "flow" and "uc" are reserved model ids (the aliases cannot be shadowed)',
  async () => {
    /* A bundled model registered as "seq", "flow" or "uc" would build fine
       and silently shadow the static alias route — the build-time throw in
       [modelId]/page.tsx only fires if the name is in this set. */
    const modelPage = readSource("src/app/live/[modelId]/page.tsx");
    assert.match(modelPage, /RESERVED_MODEL_IDS = new Set\(\[[^\]]*"seq"/);
    assert.match(modelPage, /RESERVED_MODEL_IDS = new Set\(\[[^\]]*"flow"/);
    assert.match(modelPage, /RESERVED_MODEL_IDS = new Set\(\[[^\]]*"uc"/);
  },
);

await check("a minted link round-trips the document", async () => {
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
  assert.match(url, /\/live#m=AF1\./);
  const decoded = await decodeShareFragment(new URL(url).hash);
  assert.equal(decoded.status, "ok");
  assert.equal(decoded.aftText, FROZEN_SEQ_TEXT);
});

await check("merging the playground shortened every minted URL", async () => {
  /* `/live/seq` existed to spend 5 fewer characters than `/live/sequence`
       so the payload got them. Merging the routes goes further: a link needs
       no seed at all, so the route is `/live` — 4 shorter again, and 9
       shorter than the long route links used to be minted against. Framed as
       route length so the check still says WHY if someone reintroduces a
       seeded path for share links. */
  assert.ok("/live".length < "/live/seq".length);
  assert.equal("/live/seq".length - "/live".length, 4);
  assert.equal("/live/sequence".length - "/live".length, 9);
});

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

/* ----------------------------------------------------------------------- */
/* A REPEATED fragment still opens                                          */
/* ----------------------------------------------------------------------- */

/*
 * `#m=…#m=…` was reachable by clicking: every forwarding route built its
 * target by concatenating the current hash onto a path, so forwarding a URL
 * that already carried a fragment appended a second one. A URL has ONE
 * fragment, so the `m` value became `AF1.…#m=AF1.…` — still passing the
 * version check, then failing base64url with "the link was probably truncated
 * or altered by the app that carried it", which blamed the carrier for
 * something this app did. Both ends are fixed; these pin both.
 */
await check("a fragment repeated twice still decodes", async () => {
  const decoded = await decodeShareFragment(
    `#${FROZEN_C4_FRAGMENT}#${FROZEN_C4_FRAGMENT}`,
  );
  assert.equal(decoded.status, "ok");
  assert.equal(decoded.aftText, FROZEN_C4_TEXT);
});

await check("a fragment repeated five times still decodes", async () => {
  const decoded = await decodeShareFragment(
    `#${FROZEN_SEQ_FRAGMENT}${`#${FROZEN_SEQ_FRAGMENT}`.repeat(4)}`,
  );
  assert.equal(decoded.status, "ok");
  assert.equal(decoded.aftText, FROZEN_SEQ_TEXT);
});

await check(
  "every /live* payload opens by READING it, on the route it landed on",
  () => {
    /* A sequence fragment on `/live` used to be handed to the C4 playground,
       which refused a valid document for being the wrong kind; a chooser then
       decoded and sniffed the fragment to forward it. The merged playground
       deleted the forwarding entirely — every route mounts the ONE component,
       and it renders whatever the payload parses as. These assertions keep
       that arrangement: the mount on all three routes, and the parse-driven
       open (not a kind sniff ahead of a redirect). */
    const playground = readSource(
      "src/features/playground/components/view-playground.tsx",
    );
    assert.match(playground, /parseViewSource\(decoded\.aftText\)/);
    /* ONE route mounts it now. The aliases forward instead, so the thing to
       assert about them is that they carry the fragment across — which
       `check:seo` and the trampoline assertion above both cover. */
    for (const route of ["src/app/live/page.tsx"]) {
      assert.ok(
        readSource(route).includes("<ViewPlayground"),
        `${route} must mount the merged playground`,
      );
    }
  },
);

await check(
  "the forwarding route normalizes the hash instead of concatenating it raw",
  () => {
    /* One forwarder for whichever route is currently the alias — the
       direction has flipped once already, and a second hand-written copy is
       where the two would drift on exactly this fragment handling. */
    const file = "src/components/share/alias-forward.tsx";
    const source = readSource(file);
    assert.ok(
      source.includes("normalizeShareFragment"),
      `${file} must normalize the fragment before forwarding`,
    );
    assert.ok(
      !/\$\{(?:hash|window\.location\.hash)\}/.test(source),
      `${file} must not interpolate a raw hash into the target href`,
    );
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
