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
 *   7. **The site description describes the site that shipped.** It named four
 *      notations while six shipped, at 157 of its 160 characters — so it was
 *      not fixable without cutting something. The count is now pinned to
 *      `CANVAS_EDIT_OFFERS`, so a seventh notation fails here.
 *   8. **No copy claims the canvas is C4-only.** "A C4 diagram is editable both
 *      ways" was in the hero for a release after the sequence canvas learned to
 *      reorder. Swept from the filesystem, judged against the capability grid.
 *   9. **The passage an assistant would quote exists, and is served from one
 *      constant.** Neither `llms.txt` nor `llms-full.txt` contained the word
 *      "canvas", so "can I edit an arch-lab diagram by dragging" had nothing on
 *      this site to cite and a model would answer from the grammar — which
 *      describes a text format and implies no.
 *
 * Source-level, deliberately: it runs in CI with no network and no browser,
 * and every one of these is decided in the source rather than at runtime.
 *
 * Exits non-zero on any failure. Run with: pnpm check:seo
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

/* THE CAPABILITY GRID, loaded rather than described. Sections 8-10 below are
   about the site's claims regarding canvas editing, and every one of them has
   to be measured against the table that decides it — `codebase.md` habit 4: a
   check written from a hand-listed set of names cannot notice the thing it has
   never heard of, and three checks in this repo passed for exactly that reason
   while the feature under them was broken. */
const load = registerTsResolution(ROOT);
const { CANVAS_EDITING_PASSAGE, CANVAS_EDITABLE_SUMMARY, CANVAS_EDIT_OFFERS } =
  await load("src/features/playground/input/canvas-edit.ts");

/* ----------------------------------------------------------------------- */
/* Forwarding aliases, DERIVED FROM THE FILESYSTEM                          */
/* ----------------------------------------------------------------------- */

/**
 * Every route that forwards somewhere else, found by walking `src/app` for a
 * `page.tsx` rendering `AliasForward` and reading its destination out of the
 * source.
 *
 * THIS USED TO BE THREE HAND-WRITTEN LISTS in this file, and they were already
 * wrong: `/view/er` and `/view/dict` had been aliases for a release and were
 * named in none of them, so their canonicals and their descriptions went
 * unchecked. That is the exact failure `codebase.md` describes — "a hardcoded
 * list cannot notice the thing it has never heard of" — and three checks in
 * this repo have passed for that reason while the feature under them was
 * broken. Reading the directory means the next alias is covered the day it
 * exists, wherever in the tree it lands (`/editor` is not under `src/app/view`
 * and would have needed a fourth list).
 *
 * The predicate is the same one `check:share-capacity` uses to prove a route
 * still carries a share fragment across: the page renders `AliasForward`.
 */
function aliasRoutes() {
  const found = [];
  const walk = (dir, route) => {
    for (const entry of readdirSync(path.join(ROOT, dir))) {
      const child = path.join(dir, entry);
      if (statSync(path.join(ROOT, child)).isDirectory()) {
        // Route groups and dynamic segments cannot be forwarding aliases, and
        // guessing their URL from the directory name would be wrong.
        if (entry.startsWith("(") || entry.startsWith("[")) continue;
        walk(child, `${route}/${entry}`);
        continue;
      }
      if (entry !== "page.tsx") continue;
      const source = read(child);
      if (!source.includes("AliasForward")) continue;
      const to = /AliasForward\s+to="([^"]+)"/.exec(source)?.[1] ?? null;
      found.push({
        route,
        file: child,
        /** The destination's PATH, without the seed query — that is what a
         *  canonical must name, since `?d=` chooses starting text, not a
         *  different page. */
        target: to === null ? null : to.split("?")[0],
      });
    }
  };
  walk("src/app", "");
  return found.sort((a, b) => (a.route < b.route ? -1 : 1));
}

const ALIASES = aliasRoutes();

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
 *
 * THE ALIASES ARE NOT LISTED HERE — they are appended from `ALIASES`, which
 * reads the filesystem. Five of them used to be typed out and two more had
 * been shipped without being added, so their descriptions were never measured.
 */
const PAGES = [
  ["/ (and the site default)", "src/lib/constants.ts", "APP_DESCRIPTION"],
  ["/demo", "src/app/demo/page.tsx", null],
  ["/mcp", "src/app/mcp/page.tsx", null],
  ["/view", "src/app/view/page.tsx", null],
  ["/validate", "src/app/validate/page.tsx", null],
  ["/syntax", "src/app/syntax/page.tsx", null],
  ["/faq", "src/app/faq/page.tsx", null],
];

const ROUTES = [
  ...PAGES,
  ...ALIASES.map(({ route, file }) => [route, file, null]),
];

/* ----------------------------------------------------------------------- */
/* 1. Descriptions fit what a result actually shows                         */
/* ----------------------------------------------------------------------- */

console.log("meta descriptions (the budget is what a SERP renders)");

/**
 * The interpolations a route description is allowed to contain, resolved to
 * what they actually render.
 *
 * A DESCRIPTION MAY BE A TEMPLATE LITERAL, and until it was, this loop only
 * knew how to read a quoted string — so the first route to interpolate a
 * derived clause (`/view`, whose tail is `CANVAS_EDITABLE_SUMMARY` from the
 * capability grid) stopped matching, `continue`d, and its budget went
 * UNMEASURED while the check still reported a pass. That is the same silent
 * coverage hole the sitemap assertion below was written for, arriving through
 * the regex instead of through the list, so both are now guarded: unmatched
 * routes are collected rather than skipped, and an interpolation this table
 * does not know is a failure rather than a blank.
 */
const INTERPOLATIONS = { CANVAS_EDITABLE_SUMMARY };

const unmeasured = [];
for (const [route, file, constantName] of ROUTES) {
  if (!existsSync(path.join(ROOT, file))) continue;
  const source = read(file);
  const pattern =
    constantName === null
      ? /description:\s*\n?\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/
      : new RegExp(`${constantName}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = pattern.exec(source);
  if (match === null) {
    /* A forwarding alias sets no description of its own and is `noindex`
       besides, so there is nothing for a result to truncate. Only a real page
       going unmeasured is a coverage hole. */
    if (PAGES.some(([label]) => label === route)) unmeasured.push(route);
    continue;
  }
  const raw = match[1] ?? match[2];
  const unknown = [];
  const rendered = raw.replace(/\$\{(\w+)\}/g, (whole, name) => {
    if (typeof INTERPOLATIONS[name] !== "string") {
      unknown.push(name);
      return whole;
    }
    return INTERPOLATIONS[name];
  });
  check(
    `${route}: every interpolation in the description is resolved`,
    unknown.length === 0,
    `not in INTERPOLATIONS, so its real length is unknown: ${unknown.join(", ")}`,
  );
  const length = rendered.length;
  check(
    `${route}: ${length} chars`,
    length <= DESCRIPTION_LIMIT,
    `over the ${DESCRIPTION_LIMIT}-character budget — the tail is written for nobody`,
  );
}

/* A route whose description this loop could not FIND reads exactly like a route
   that passed. `/view` spent a run in that state. */
check(
  "every indexable route's description was actually located and measured",
  unmeasured.length === 0,
  `matched no description pattern (an oddly quoted or formatted one?): ${unmeasured.join(", ")}`,
);

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
/* One assertion per alias found on disk, and each one compares the canonical
   against THAT alias's own destination rather than a constant `/view` — so an
   alias pointing somewhere new is checked against where it actually points. */
check(
  "there are forwarding aliases to check",
  ALIASES.length > 0,
  "no page renders AliasForward — either they are gone or the walk is broken, " +
    "and a broken walk would make every assertion below vacuous",
);
for (const { route, file, target } of ALIASES) {
  check(
    `${route} canonicals to ${target ?? "(no destination found)"}, the page it forwards to`,
    target !== null && canonicalOf(file) === target,
    `canonical is ${JSON.stringify(canonicalOf(file))}, destination is ${JSON.stringify(target)}`,
  );
  /* An alias must not compete in search with the page it forwards to. The
     trampoline has no content of its own; indexing it spends crawl budget on
     a redirect and can rank it above the real page. */
  check(
    `${route} is noindex`,
    /robots:\s*\{[^}]*index:\s*false/.test(read(file)),
    "a forwarding alias that is indexable competes with its own destination",
  );
}

{
  const sitemap = read("src/app/sitemap.ts");
  const listed = [...sitemap.matchAll(/^\s*"(\/[^"]*)",/gm)].map((m) => m[1]);
  const wrongly = ALIASES.filter(({ route }) => listed.includes(route));
  check(
    "the sitemap lists no route that canonicals elsewhere",
    wrongly.length === 0,
    `aliases in the sitemap: ${wrongly.map((a) => a.route).join(", ")}`,
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
  /* THE RULE IS MISAPPLICATION, not the type. `/faq` below is an actual FAQ
     and marks itself up as one; these two are a landing page and a connect
     guide, and calling either an FAQPage was a claim the content did not
     support. HowTo is a flat no — it was deprecated in 2023. */
  for (const [file, route] of [
    ["src/app/page.tsx", "/"],
    ["src/app/mcp/page.tsx", "/mcp"],
  ]) {
    const source = read(file);
    check(
      `${route}: no deprecated or misapplied schema type`,
      !source.includes('"HowTo"') && !source.includes('"FAQPage"'),
      "HowTo was deprecated in 2023; FAQPage belongs on a page that IS an FAQ",
    );
  }

  const faq = read("src/app/faq/page.tsx");
  check(
    "/faq carries FAQPage markup for the questions it answers",
    faq.includes("application/ld+json") && faq.includes('"@type": "FAQPage"'),
  );
  /* The one that matters. The visible answers and the serialised ones are the
     same strings or they are two answers to one question, and the stale half is
     always the half that gets quoted back at you. */
  check(
    "/faq's questions are serialised from the entries it renders",
    /mainEntity:\s*FAQ_ENTRIES\.map/.test(faq),
    "a second copy of thirteen answers is thirteen chances to disagree with itself",
  );
  check(
    "/faq's answers carry no markup",
    !/answer:\s*\n?\s*"[^"]*</.test(read("src/features/marketing/faq.ts")),
    "the same string is rendered AND serialised into JSON-LD — tags poison the second",
  );
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
    /* The most quotable page on the site: short, self-contained answers with
       the question restated in each one. Rendering it on the client would hide
       exactly the passages an assistant would otherwise cite. */
    ["/faq", "src/app/faq/page.tsx"],
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
/* 8. The site description names what actually ships                        */
/* ----------------------------------------------------------------------- */

/**
 * `APP_DESCRIPTION` spent a release naming FOUR notations while six shipped,
 * and it was not a slip: the string was 157 characters of a 160-character
 * budget, so there was no room to add the two that were missing even once
 * somebody noticed. The enumeration has gone and the COUNT has stayed, which
 * makes the claim checkable — and this is the check.
 *
 * DERIVED FROM `CANVAS_EDIT_OFFERS`, which is a total `Record` over the
 * document kinds, so it is the one place in the app that cannot be out of date
 * about how many notations there are: a seventh is a compile error there before
 * it is a failure here. A hardcoded `6` in this file would have been the same
 * mistake one level up.
 */
console.log("\nthe site description describes the site that shipped");

{
  const notations = Object.keys(CANVAS_EDIT_OFFERS.move);
  const NUMBER_WORD = [
    "no",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ];
  const expected = NUMBER_WORD[notations.length] ?? String(notations.length);
  const description = /APP_DESCRIPTION\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(
    read("src/lib/constants.ts"),
  )?.[1];
  check(
    "APP_DESCRIPTION was found to measure",
    typeof description === "string",
    "the pattern stopped matching, which would make every assertion here vacuous",
  );
  check(
    `APP_DESCRIPTION says "${expected} notations", the number the grid holds`,
    description?.includes(`${expected} notations`) === true,
    `it names a different count from the ${notations.length} in CANVAS_EDIT_OFFERS ` +
      `(${notations.join(", ")}) — the failure that let it advertise four of six`,
  );
  /* THE REPO'S OWN FRONT DOOR, pinned to the same number. `README.md` cannot
     import the grid, so this is the `check:*` half of the rule in
     `codebase.md` habit 4 — where two halves cannot share, a script pins the
     pair. Its opening paragraph described a C4-and-sequence tool for two
     notations longer than the site did, because nothing measured it. */
  {
    const readme = read("README.md");
    /* EVERY "N notations" IN THE FILE, not the first one. Testing only for the
       right phrase passed on a DIFFERENT paragraph that happened to carry it
       while the opening said "Four notations" — so the wrong counts are what is
       hunted, and the right one is required in addition. */
    const wrong = [...readme.matchAll(/\b(\w+) notations\b/gi)]
      .map((match) => match[1].toLowerCase())
      .filter((word) => word !== expected && NUMBER_WORD.includes(word));
    check(
      `README.md says "${expected} notations" and no other count`,
      readme.includes(`${expected} notations`) && wrong.length === 0,
      wrong.length > 0
        ? `it also says: ${[...new Set(wrong)].join(", ")} notations`
        : `the repo front door never states the ${notations.length} the grid holds`,
    );
  }

  /* THE OTHER HALF OF THE SAME BUDGET. Naming the count is what bought the room
     for the capability, so losing the capability again would make the trade
     pointless. Kept as its own assertion because the two are edited
     independently: somebody trimming for length will cut the clause, not the
     number. */
  check(
    "APP_DESCRIPTION still says the canvas can be edited",
    /edited on the canvas/.test(description ?? ""),
    "the clause the notation list was cut to make room for",
  );
}

/* ----------------------------------------------------------------------- */
/* 9. No surface claims the canvas is C4-only                               */
/* ----------------------------------------------------------------------- */

/**
 * THE SIXTH STALE CLAIM ON THIS BRANCH would have been this one. The hero read
 * "a C4 diagram is editable both ways" with a comment explaining that the other
 * five kinds have nothing to drag — correct when written, and still on the page
 * after the sequence canvas learned to reorder messages and lifelines.
 * `check:canvas-edit` section 19 already sweeps for the NEGATIVE version of the
 * claim ("the sequence canvas cannot be dragged"); this sweeps for the
 * EXCLUSIVE one, which is the shape a marketing sentence takes.
 *
 * DERIVED TWICE OVER, because a hand-written version of either half is how this
 * check would pass while the page was wrong:
 *
 *   - WHICH FILES: walked from the filesystem, not listed. A list cannot notice
 *     the surface it has never heard of, and the whole failure mode is a
 *     sentence surviving in a file nobody thought to open.
 *   - WHAT MAKES IT FALSE: the notations other than C4 that the grid says
 *     answer a canvas gesture. If the grid ever went back to C4-only the
 *     assertion disables itself rather than demanding a lie — which is why the
 *     guard below is an assertion of its own instead of an `if`.
 *
 * STRINGS, NOT COMMENTS, and that boundary is the difference between a useful
 * rule and one that generates work forever. Written against the raw source this
 * failed seventeen times on its first run, and every hit but one was a comment
 * doing its job: the note in `view-playground.tsx` recording that the heading
 * USED to name C4 as the only editable canvas, the guideline in
 * `.claude/rules/canvas-editing.md` quoting the bad sentence as the shape to
 * avoid, `canvas-edit.ts`'s own doc comment showing what the derived refusal
 * reads like. Forbidding a comment from discussing the claim would delete the
 * institutional memory of why the rule exists (`codebase.md` habit 5: when a
 * rule keeps producing work nobody asked for, suspect the rule). So comments
 * are stripped first — the same treatment and the same reason as
 * `og-cards-check.mjs` — and what is left is the strings and JSX a reader
 * actually meets. Markdown is out of the walk for the same reason: `README.md`
 * is copy and is included, the rules files are the discussion and are not.
 *
 * A sentence is an offender when it is about editing on a canvas, claims
 * exclusivity FOR C4 specifically, and names none of the other notations the
 * grid says can be edited. The last condition is what keeps `/faq`'s true
 * answer legal.
 */
console.log("\nno surface claims the canvas is C4-only");

{
  const otherEditable = [
    ...new Set(
      Object.values(CANVAS_EDIT_OFFERS).flatMap((cells) =>
        Object.entries(cells)
          .filter(([kind, offer]) => offer.offers && kind !== "c4")
          .map(([, offer]) => offer.noun),
      ),
    ),
  ];
  check(
    "the grid says a notation other than C4 answers a canvas gesture",
    otherEditable.length > 0,
    "if this is ever false the sweep below is vacuous and must be retired, " +
      "not left passing",
  );

  const files = [];
  const walk = (relative) => {
    const absolute = path.join(ROOT, relative);
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isFile()) {
      files.push(relative);
      return;
    }
    for (const entry of readdirSync(absolute)) {
      if (entry === "node_modules") continue;
      const child = path.join(relative, entry);
      if (statSync(path.join(ROOT, child)).isFile() && !/\.tsx?$/.test(entry)) {
        continue;
      }
      walk(child);
    }
  };
  walk("src");
  walk("README.md");
  /* A BROKEN WALK IS THE FAILURE MODE OF A CHECK LIKE THIS: an empty file list
     passes the assertion below forever, and reads identically to a clean tree. */
  check(
    "the sweep found the source tree it is meant to walk",
    files.length > 200,
    `only ${files.length} files walked`,
  );

  /** Claims of exclusivity FOR C4, in the shapes a page actually writes. */
  const C4_ONLY = [
    /\bonly C4\b/i,
    /\bC4 is the only\b/i,
    /\bthe only (?:editable |draggable )?canvas\b/i,
    /\bC4\b[^.]{0,80}\bboth ways\b/i,
    /\bboth ways\b[^.]{0,80}\bC4\b/i,
    /\bC4\b[^.]{0,80}\beither way\b/i,
  ];
  const ABOUT_CANVAS_EDITING = /\bcanvas\b|\bdrag/i;
  const offenders = [];
  for (const relative of files) {
    /* Comments out, in the same way and for the same reason as
       `og-cards-check.mjs`: the prose explaining a rule must be allowed to
       quote the sentence the rule forbids. */
    const copy = /\.tsx?$/.test(relative)
      ? read(relative)
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/^\s*\/\/.*$/gm, " ")
      : read(relative);
    for (const sentence of copy.split(/(?<=[.!?])\s+/)) {
      if (!ABOUT_CANVAS_EDITING.test(sentence)) continue;
      if (!C4_ONLY.some((pattern) => pattern.test(sentence))) continue;
      if (otherEditable.some((noun) => sentence.includes(noun))) continue;
      offenders.push(`${relative} — ${sentence.trim().slice(0, 200)}`);
    }
  }
  check(
    `no copy says C4 is the only canvas that can be edited (${otherEditable.join(", ")} can too)`,
    offenders.length === 0,
    offenders.join("\n    "),
  );
}

/* ----------------------------------------------------------------------- */
/* 10. The passage an assistant would quote is actually reachable           */
/* ----------------------------------------------------------------------- */

/**
 * GEO is passage-level: an assistant quotes one self-contained passage, not a
 * page. `CANVAS_EDITING_PASSAGE` is that passage for "can I edit an arch-lab
 * diagram on the canvas, and which kinds" — and before it existed the answer
 * was reachable NOWHERE. Neither `llms.txt` nor `llms-full.txt` contained the
 * word "canvas", so a model answering from this site's own documents would
 * answer from the grammar, which describes a text format and implies no.
 *
 * Three things have to hold, and each fails on its own:
 *
 *   1. the passage says what the question asks — which notations, and what a
 *      gesture writes — measured against the grid rather than read;
 *   2. it is on a SERVER-RENDERED page, because AI crawlers do not run JS (the
 *      assertion in section 7 keeps `/` a server component; this one keeps the
 *      passage on it);
 *   3. the plain-text documents an assistant reaches FIRST carry it too.
 */
console.log("\nthe canvas-editing passage is reachable and quotable");

{
  const editable = Object.values(CANVAS_EDIT_OFFERS).flatMap((cells) =>
    Object.values(cells).filter((offer) => offer.offers),
  );
  for (const offer of editable) {
    /* NAMED, not merely included. `CANVAS_EDITING_PASSAGE.includes(onCanvas)`
       was the first version of this and it was VACUOUS — the passage is built
       by joining those very clauses, so it passed for any clause at all,
       including "you can move things around". What has to hold is that a reader
       can tell WHICH notation the gesture belongs to, so the assertion measures
       the notation's own name (the first word of the grid's mid-sentence
       `noun`, which is where the identity lives: "C4 diagrams", "sequence
       diagrams"). */
    const named = offer.noun.split(" ")[0];
    check(
      `the passage names ${named} as a notation you can edit on the canvas`,
      CANVAS_EDITING_PASSAGE.includes(named),
      `the ${offer.noun} clause is in the passage but does not say it is about ` +
        `${named} — a capability an assistant cannot attribute is one it will ` +
        "not quote",
    );
  }
  /* THE DISTINCTION IS THE POINT OF THE PASSAGE. A reader arriving from a
     drawing tool assumes a drag lands where they drop it; for five of the six
     notations that is wrong, and for the sequence canvas it is a REORDER. A
     passage that said "draggable" without saying which would be quoted into
     exactly that misunderstanding. */
  check(
    "the passage separates a position from an order",
    /\bposition\b/.test(CANVAS_EDITING_PASSAGE) &&
      /\border\b/.test(CANVAS_EDITING_PASSAGE),
    "both words are load-bearing — see the REORDER-versus-POSITION note in " +
      ".claude/rules/canvas-editing.md and the /faq answer",
  );
  /* BOTH PRESENT, THEN ORDERED, and the second half without the first was the
     bug in the first draft of this assertion: `indexOf` returns -1 for a phrase
     that is absent, and -1 is less than everything, so deleting "source text"
     from the passage entirely PASSED a check whose whole subject is that the
     passage mentions it first. */
  const leads = CANVAS_EDITING_PASSAGE.indexOf("source text");
  const canvas = CANVAS_EDITING_PASSAGE.indexOf("canvas");
  check(
    "the passage leads with text editing, not with the canvas",
    leads >= 0 && canvas > leads,
    "text editing is the universal answer and the canvas is the exception two " +
      "notations offer; the other order sells a drawing tool and takes it back",
  );

  /* SERVED FROM THE SERVER, and by the constant rather than a copy of its
     words. A page that pasted the sentence would pass a `includes(passage)`
     test on the day it was pasted and drift on the next wording change, which
     is the whole failure this constant exists to end. */
  for (const [route, file] of [
    ["/", "src/app/page.tsx"],
    ["/faq", "src/features/marketing/faq.ts"],
    ["/llms.txt", "src/app/llms.txt/route.ts"],
    ["/llms-full.txt", "src/app/llms-full.txt/route.ts"],
  ]) {
    const source = read(file);
    /* THE CLOSING BRACE IS THE ASSERTION. Testing for the bare identifier
       passed on the IMPORT line: deleting the passage from the body of all
       three files and pasting a paraphrase in its place left the import behind
       and every one of these green. `${CANVAS_EDITING_PASSAGE}` in a template
       literal and `{CANVAS_EDITING_PASSAGE}` in JSX both end with the brace,
       and an import never does. */
    check(
      `${route} serves the passage from the constant, not a copy of its words`,
      source.includes("CANVAS_EDITING_PASSAGE}"),
      "a surface that pastes the sentence passes on the day it is pasted and " +
        "drifts on the next wording change — the whole failure the constant ends",
    );
  }
  /* THE PASSAGE DOWNGRADES WITH THE FLAG. `CANVAS_EDIT_ENABLED` gates whether
     a canvas in this app can be edited at all, and `codebase.md` is explicit
     that a capability claim reads from the flag rather than being written in a
     hopeful present tense. This is the assertion that the site's most quotable
     sentence about editing is not the one exception — a page advertising a
     gesture the deploy does not ship is worse than a page that says nothing. */
  check(
    "/ renders the passage only while the canvas is actually editable",
    /CANVAS_EDIT_ENABLED \?[\s\S]{0,600}?CANVAS_EDITING_PASSAGE\}/.test(
      read("src/app/page.tsx"),
    ),
    "the passage renders outside the flag branch, so it would keep promising a " +
      "canvas gesture after the flag turned it off",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} SEO assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} SEO assertions passed.`);
