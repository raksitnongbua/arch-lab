#!/usr/bin/env node
/**
 * The SEO invariants that are cheap to break and invisible when broken.
 *
 * None of this is style. Every rule here corresponds to a defect the site
 * actually shipped:
 *
 *   1. **Descriptions inside the budget.** A search result truncates around
 *      155–160 characters and a link preview around 200. Four routes were
 *      running 230–341, so the half that persuades a click was never shown.
 *      A long description is not a small mistake — it is copy written for
 *      nobody.
 *   2. **No two routes self-canonicalising to the same content.** `/view` and
 *      `/view/c4` rendered the identical playground with the identical seed
 *      and each named itself canonical, which is two URLs competing and a
 *      search engine picking the winner on signals nobody chose.
 *   3. **The sitemap does not list a URL that canonicals elsewhere** — two
 *      signals disagreeing about the same page.
 *   4. **Every indexable route names a canonical.** Without one, a URL picks
 *      up query strings and trailing variants as separate documents.
 *   5. **Structured data comes from the catalogue**, not from hand-typed
 *      lists that go stale the first time a tool is renamed.
 *   6. **GEO**: the assistants people ask are named in robots.txt rather than
 *      left to a `*` that one careless edit revokes; the pages carrying the
 *      answers are server-rendered, because AI crawlers do not run
 *      JavaScript; and `/llms-full.txt` embeds the SHARED syntax reference
 *      rather than a copy, since the only thing worse than no machine-readable
 *      grammar is a stale one.
 *
 * Source-level, deliberately: it runs in CI with no network and no browser,
 * and every one of these is decided in the source rather than at runtime.
 *
 * Exits non-zero on any failure. Run with: pnpm check:seo
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

/** What a search result shows before it truncates. */
const DESCRIPTION_LIMIT = 160;

let failures = 0;
let assertions = 0;

function check(label, ok, detail) {
  assertions += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error(`    ${detail}`);
}

/**
 * Route → the file whose `metadata` export describes it.
 *
 * THIS LIST MUST NAME EVERY ROUTE IN THE SITEMAP. It was incomplete, and the
 * gap was silent rather than loud: `/editor` and `/demo` were both missing,
 * so `/editor` shipped a 232-character description — 72 over the budget below
 * — through a green `pnpm check:seo`. A check that covers some routes reads
 * exactly like one that covers all of them, which is the worse failure.
 *
 * Adding a route to `src/app/sitemap.ts` means adding it here in the same
 * commit. The `?` assertion at the bottom of section 1 fails if it does not.
 */
const ROUTES = [
  ["/ (and the site default)", "src/lib/constants.ts", "APP_DESCRIPTION"],
  ["/demo", "src/app/demo/page.tsx", null],
  ["/editor", "src/app/editor/page.tsx", null],
  ["/mcp", "src/app/mcp/page.tsx", null],
  ["/view", "src/app/view/page.tsx", null],
  ["/view/c4", "src/app/view/c4/page.tsx", null],
  ["/view/seq", "src/app/view/seq/page.tsx", null],
  ["/view/sequence", "src/app/view/sequence/page.tsx", null],
  ["/validate", "src/app/validate/page.tsx", null],
  ["/syntax", "src/app/syntax/page.tsx", null],
];

/* ----------------------------------------------------------------------- */
/* 1. Descriptions fit what a result actually shows                         */
/* ----------------------------------------------------------------------- */

console.log("meta descriptions (the budget is what a SERP renders)");

for (const [route, file, constantName] of ROUTES) {
  if (!existsSync(path.join(ROOT, file))) continue;
  const source = read(file);
  const pattern =
    constantName === null
      ? /description:\s*\n?\s*"((?:[^"\\]|\\.)*)"/
      : new RegExp(`${constantName}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = pattern.exec(source);
  if (match === null) continue;
  const length = match[1].length;
  check(
    `${route}: ${length} chars`,
    length <= DESCRIPTION_LIMIT,
    `over the ${DESCRIPTION_LIMIT}-character budget — the tail is written for nobody`,
  );
}

/* The list above is only as good as its coverage, and coverage is exactly what
   went wrong: a route can be in the sitemap, be crawled, and never have its
   description measured. Derive the expectation from the sitemap rather than
   trusting two hand-written lists to agree. */
{
  const staticBlock = /const staticRoutes = \[([\s\S]*?)\n {2}\];/.exec(
    read("src/app/sitemap.ts"),
  );
  const sitemapPaths = [...(staticBlock?.[1] ?? "").matchAll(/"([^"]*)"/g)].map(
    (m) => (m[1] === "" ? "/" : m[1]),
  );
  const measured = new Set(ROUTES.map(([label]) => label.split(" ")[0]));
  const missing = sitemapPaths.filter((route) => !measured.has(route));
  check(
    "every static sitemap route has its description measured",
    staticBlock !== null && missing.length === 0,
    staticBlock === null
      ? "could not find `staticRoutes` in src/app/sitemap.ts — this check went blind"
      : `in the sitemap, absent from ROUTES: ${missing.join(", ")}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 2–4. Canonicals: present, and never two claiming the same content        */
/* ----------------------------------------------------------------------- */

console.log("\ncanonicals");

const canonicalOf = (file) =>
  /canonical:\s*"([^"]+)"/.exec(read(file))?.[1] ?? null;

for (const [route, file] of ROUTES) {
  if (!existsSync(path.join(ROOT, file)) || file.endsWith("constants.ts")) {
    continue;
  }
  check(`${route}: names a canonical`, canonicalOf(file) !== null);
}

/* The arrow reversed when the three playground routes became one. `/view` is
   the page; `/view/c4` and `/view/seq` are forwarding aliases that must point
   AT it, which is the same rule as before — one URL claims the content — with
   the roles the other way round. */
check(
  "/view claims the playground rather than canonicalising away",
  canonicalOf("src/app/view/page.tsx") === "/view",
  `expected "/view", got ${JSON.stringify(canonicalOf("src/app/view/page.tsx"))}`,
);
for (const alias of ["c4", "seq", "sequence"]) {
  check(
    `/view/${alias} canonicals to the playground it forwards to`,
    canonicalOf(`src/app/view/${alias}/page.tsx`) === "/view",
    `got ${JSON.stringify(canonicalOf(`src/app/view/${alias}/page.tsx`))}`,
  );
}

{
  const sitemap = read("src/app/sitemap.ts");
  const listed = [...sitemap.matchAll(/^\s*"(\/[^"]*)",/gm)].map((m) => m[1]);
  check(
    "the sitemap lists no route that canonicals elsewhere",
    !listed.includes("/view/c4") &&
      !listed.includes("/view/seq") &&
      !listed.includes("/view/sequence"),
    `listed: ${listed.join(", ")}`,
  );
  check(
    "the sitemap lists the one playground",
    listed.includes("/view"),
    `listed: ${listed.join(", ")}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Structured data is derived, and avoids the deprecated types           */
/* ----------------------------------------------------------------------- */

console.log("\nstructured data");

{
  const mcp = read("src/app/mcp/page.tsx");
  check(
    "/mcp carries JSON-LD for the server it documents",
    mcp.includes("application/ld+json") &&
      mcp.includes('"@type": "SoftwareApplication"'),
  );
  check(
    "/mcp's featureList is read from the tool catalogue, not typed out",
    /featureList:\s*MCP_TOOLS\.map/.test(mcp),
    "a hand-written list is a second place to forget when a tool is renamed",
  );
  const home = read("src/app/page.tsx");
  check(
    "/ carries the WebSite + SoftwareApplication graph",
    home.includes('"@type": "WebSite"') &&
      home.includes('"@type": "SoftwareApplication"'),
  );
  for (const [file, route] of [
    ["src/app/page.tsx", "/"],
    ["src/app/mcp/page.tsx", "/mcp"],
  ]) {
    const source = read(file);
    check(
      `${route}: no deprecated or misapplied schema type`,
      !source.includes('"HowTo"') && !source.includes('"FAQPage"'),
      "HowTo was deprecated in 2023; FAQPage is for government and health sites",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 6. The agent-facing index exists and is derived                          */
/* ----------------------------------------------------------------------- */

console.log("\nagent-readable index");

{
  const file = "src/app/llms.txt/route.ts";
  check("/llms.txt is served", existsSync(path.join(ROOT, file)));
  if (existsSync(path.join(ROOT, file))) {
    const source = read(file);
    check(
      "/llms.txt derives the endpoint and tools from the catalogue",
      source.includes("MCP_ENDPOINT_PATH") && source.includes("MCP_TOOLS"),
      "a hand-typed endpoint is how a moved URL survives in print",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 7. GEO: reachable by assistants, and quotable when reached               */
/* ----------------------------------------------------------------------- */

console.log("\nGEO (what an assistant can reach and quote)");

{
  const robots = read("src/app/robots.ts");
  /* Named rather than left to `*`, so removing one is a decision somebody
     makes on purpose. The failure mode of losing them is silent: nothing
     breaks, the site just stops being citable. */
  for (const crawler of [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "PerplexityBot",
    "Google-Extended",
  ]) {
    check(`robots.txt names ${crawler}`, robots.includes(`"${crawler}"`));
  }
  check(
    "every crawler rule still refuses /api/",
    (robots.match(/disallow: "\/api\/"/g) ?? []).length >= 2,
    "an agent belongs at the MCP endpoint through a client, not a crawl",
  );

  const full = "src/app/llms-full.txt/route.ts";
  check("/llms-full.txt is served", existsSync(path.join(ROOT, full)));
  if (existsSync(path.join(ROOT, full))) {
    const source = read(full);
    check(
      "/llms-full.txt embeds the SHARED syntax reference, not a copy",
      source.includes("syntaxReferenceMarkdown"),
      "the one document `check:syntax-docs` verifies against the real parser",
    );
    check(
      "/llms-full.txt nests the embedded reference under its own headings",
      /replace\(\/\^## \/gm/.test(source),
      "a flat outline tells an extractor every section is a peer topic",
    );
    check(
      "/llms-full.txt lists the tools from the catalogue",
      source.includes("MCP_TOOLS.map"),
    );
  }
  check(
    "/llms.txt points at the full document",
    read("src/app/llms.txt/route.ts").includes("/llms-full.txt"),
  );

  /* AI crawlers do not execute JavaScript, so the pages that carry the
     answers must not be client components. The playground may be — what it
     renders is a document the reader pastes, not content to be cited. */
  for (const [route, file] of [
    ["/", "src/app/page.tsx"],
    ["/mcp", "src/app/mcp/page.tsx"],
    ["/syntax", "src/app/syntax/page.tsx"],
  ]) {
    check(
      `${route} is server-rendered (AI crawlers do not run JS)`,
      !read(file).startsWith('"use client"'),
    );
  }

  check(
    "the landing page opens with a definition, not an action",
    /is a browser-based editor/.test(read("src/app/page.tsx")),
    'an assistant asked "what is X" extracts "X is a Y that Z" and paraphrases the rest',
  );

  /* The same rule one level down. /mcp's heading was "Use arch-lab from your
     AI agent", which identifies the page only to a reader who already knows
     what arch-lab is — and neither a search result nor an agent's answer has
     that reader. The heading has to name the CATEGORY. Pinned because it is a
     targeting decision, and targeting decisions are exactly what gets tidied
     away later by someone reading it as mere phrasing. */
  check(
    "/mcp's heading names the category, not the product",
    /An MCP server for architecture diagrams/.test(
      read("src/features/mcp/components/mcp-guide.tsx"),
    ),
    "the heading is the first thing both a search result and a cited answer show",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} SEO assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} SEO assertions passed.`);
