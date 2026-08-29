#!/usr/bin/env node
/**
 * VS Code grammar drift check: the TextMate grammar in `editors/vscode` is a
 * SECOND, hand-written copy of the `.alab` token set, so it can silently fall
 * behind the parser the moment a keyword is added. This script imports the
 * one authoritative keyword module (`src/features/archtext/lib/keywords.ts`)
 * — the same tables parser and serializer share — and asserts:
 *
 *   1. every node-type keyword appears in the grammar's `node-line` rule;
 *   2. every arrow token appears in the grammar's `edge-line` rule, and the
 *      alternation is ordered longest-first exactly as `ARROWS` is (`<->`
 *      before `->`, `..>` before `..`). Oniguruma's backtracking would
 *      recover from a bad order here, so this is a defensive mirror of the
 *      parser's contract, not a correctness fix — the whole-token assertions
 *      below are what actually prove each arrow highlights as one unit;
 *   3. the declared file extension matches `ARCHTEXT_EXTENSION`;
 *   4. every header keyword the parser accepts appears in `header-line`;
 *   5. both JSON files parse, and every `include` names a real repository
 *      rule (a typo'd include silently highlights nothing).
 *
 * It then TOKENIZES three sample files with `vscode-textmate` — the same
 * engine VS Code runs — and asserts the scope at specific offsets, so "the
 * grammar looks right" is replaced by "the grammar highlights right". One
 * sample per document kind that has rules of its own (C4, sequence, gantt,
 * milestone timeline, lifecycle),
 * each first fed to ITS real parser, so none can drift into something that is
 * not valid `.alab`. Three files rather than one because the kinds never mix:
 * a fused sample would be text no parser accepts.
 *
 * Exits non-zero on any failure. Run with: pnpm check:vscode-grammar
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
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
});

const { NODE_TYPE_BY_KEYWORD, ARROWS, ARCHTEXT_EXTENSION } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/lib/keywords.ts")).href
);
const { SEQUENCE_ARROW_MATCH_ORDER } = await import(
  pathToFileURL(
    path.join(ROOT, "src/features/archtext/lib/sequence/keywords.ts"),
  ).href
);
const {
  parseArchText,
  parseSequenceText,
  parseGanttText,
  parseTimelineText,
  parseLifecycleText,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);

/**
 * Header keywords, mirrored from `parseHeaderLine`'s switch in
 * `src/features/archtext/lib/parse.ts`. Kept here rather than exported
 * because the parser reads them as a switch, not a table — this check is
 * what keeps the mirror honest.
 */
const HEADER_KEYWORDS = [
  "archlab",
  "schema",
  "title",
  "description",
  "owner",
  "tags",
  "created",
  "updated",
  "reviewed",
  "tagcolor",
  "customicon",
  "generator",
  "root",
  /* Gantt-only, but header lines are one shared rule in the grammar. It
     earns a row here for the same reason every other word does: `starts` is
     what turns a relative axis into a calendar one, and an unhighlit header is
     how a reader learns to distrust the colouring. */
  "starts",
];

const EXT_DIR = path.join(ROOT, "editors/vscode");
const GRAMMAR_PATH = path.join(EXT_DIR, "syntaxes/alab.tmLanguage.json");
const MANIFEST_PATH = path.join(EXT_DIR, "package.json");
const LANG_CONFIG_PATH = path.join(EXT_DIR, "language-configuration.json");

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let validated = 0;

function ok(label) {
  validated += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  validated += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${path.relative(ROOT, filePath)} parses as JSON`, error.message);
    return undefined;
  }
}

/* ----------------------------------------------------------------------- */

console.log("editors/vscode grammar vs. the parser's keyword tables\n");

const grammar = readJson(GRAMMAR_PATH);
const manifest = readJson(MANIFEST_PATH);
const langConfig = readJson(LANG_CONFIG_PATH);

if (!grammar || !manifest || !langConfig) {
  console.error("\nCannot continue: one or more files failed to parse.");
  process.exit(1);
}
ok("all three extension JSON files parse");

/* --- 1. node types ----------------------------------------------------- */

const nodeLine = grammar.repository?.["node-line"]?.begin ?? "";
for (const keyword of Object.keys(NODE_TYPE_BY_KEYWORD)) {
  if (nodeLine.includes(keyword)) {
    ok(`node type "${keyword}" is in node-line`);
  } else {
    fail(
      `node type "${keyword}" is in node-line`,
      "add it to the alternation in repository.node-line.begin",
    );
  }
}

/* --- 2. arrows, longest-first ------------------------------------------ */

const edgeLine = grammar.repository?.["edge-line"]?.begin ?? "";
/* THE UNION OF BOTH GRAMMARS' ARROWS. One `edge-line` rule highlights a C4
   edge and a sequence message alike — they are the same `id arrow id` shape —
   so the alternation must hold every token either grammar can spell. Derived
   from the two tables rather than listed: the four sequence-only tokens
   (`x>`, `~>`, `..x>`, `..~>`) were exactly the ones an editor left unhighlit
   before this, and `~>` had been unhighlit since the sequence grammar shipped
   because nobody thought to widen a rule named for C4 edges. */
const arrowTokens = [
  ...new Set([
    ...ARROWS.map(([token]) => token),
    ...SEQUENCE_ARROW_MATCH_ORDER.map(([token]) => token),
  ]),
].sort((left, right) => right.length - left.length);

/**
 * Pull the arrow alternation out as a GROUP rather than searching for each
 * token: `indexOf` on an escaped token finds it nested inside a longer one
 * (`\.\.>` lives inside `<\.\.>`), which makes any position-based ordering
 * check meaningless. Comparing the whole group's contents is both stricter
 * and immune to that.
 */
const arrowGroup = [...edgeLine.matchAll(/\(([^()]*)\)/g)]
  .map((match) => match[1].replace(/\\\./g, ".").split("|"))
  .find(
    (alternatives) =>
      alternatives.length === arrowTokens.length &&
      alternatives.every((alternative) => arrowTokens.includes(alternative)),
  );

if (arrowGroup === undefined) {
  fail(
    "edge-line has an arrow alternation holding exactly the parser's arrows",
    `expected a group of: ${arrowTokens.join(" ")}`,
  );
} else {
  ok(`edge-line holds all ${arrowTokens.length} arrows`);
  /* THE PROPERTY, NOT THE PERMUTATION. This compared the alternation against
     the table's own order, which failed the moment the alternation held the
     UNION of two tables: `->` and `--` are both two characters and neither is
     a prefix of the other, so their relative order cannot matter — and an
     assertion that fails on a difference that cannot matter is a rule that
     manufactures work (`codebase.md`, habit 5). What "longest-first" is
     actually FOR is that no alternative shadows a longer one it prefixes, so
     that is what is asserted; any ordering satisfying it highlights
     correctly. */
  const shadowed = arrowGroup.flatMap((earlier, at) =>
    arrowGroup
      .slice(at + 1)
      .filter((later) => later.startsWith(earlier))
      .map((later) => `${earlier} before ${later}`),
  );
  if (shadowed.length === 0) {
    ok("no arrow alternative shadows a longer one it is a prefix of");
  } else {
    fail(
      "no arrow alternative shadows a longer one it is a prefix of",
      `${shadowed.join(", ")} — in "${arrowGroup.join("|")}"`,
    );
  }
}

/* --- 3. file extension ------------------------------------------------- */

const declaredExtensions =
  manifest.contributes?.languages?.[0]?.extensions ?? [];
if (declaredExtensions.includes(ARCHTEXT_EXTENSION)) {
  ok(`manifest declares the "${ARCHTEXT_EXTENSION}" extension`);
} else {
  fail(
    `manifest declares the "${ARCHTEXT_EXTENSION}" extension`,
    `found: ${JSON.stringify(declaredExtensions)}`,
  );
}

/* --- 4. header keywords ------------------------------------------------ */

const headerLine = grammar.repository?.["header-line"]?.begin ?? "";
for (const keyword of HEADER_KEYWORDS) {
  if (new RegExp(`[(|]${keyword}[)|]`).test(headerLine)) {
    ok(`header keyword "${keyword}" is in header-line`);
  } else {
    fail(
      `header keyword "${keyword}" is in header-line`,
      "add it to the alternation in repository.header-line.begin",
    );
  }
}

/* --- 5. every include resolves ----------------------------------------- */

const ruleNames = new Set(Object.keys(grammar.repository ?? {}));
const dangling = [];

function walkIncludes(value) {
  if (Array.isArray(value)) {
    for (const item of value) walkIncludes(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "include" && typeof child === "string") {
      if (child.startsWith("#") && !ruleNames.has(child.slice(1))) {
        dangling.push(child);
      }
      continue;
    }
    walkIncludes(child);
  }
}

walkIncludes(grammar.patterns);
walkIncludes(grammar.repository);

if (dangling.length === 0) {
  ok(`every include resolves (${ruleNames.size} repository rules)`);
} else {
  fail(
    "every include resolves",
    `dangling: ${[...new Set(dangling)].join(", ")}`,
  );
}

/* --- indentation guardrails ------------------------------------------- */

const alabDefaults = manifest.contributes?.configurationDefaults?.["[alab]"];
if (alabDefaults?.["editor.insertSpaces"] === true) {
  ok("[alab] defaults force spaces (the parser rejects tab indentation)");
} else {
  fail(
    "[alab] defaults force spaces (the parser rejects tab indentation)",
    'set "editor.insertSpaces": true in contributes.configurationDefaults',
  );
}

/* ----------------------------------------------------------------------- */
/* Real tokenization, through the engine VS Code itself uses                 */
/* ----------------------------------------------------------------------- */

/**
 * Exercises every construct the grammar claims to know. Parsed by the real
 * `parseArchText` below before it is tokenized, so this sample is always
 * valid `.alab` — a highlighting expectation can never be written against
 * syntax the parser would reject.
 */
const SAMPLE = `archlab 1.0
title "ShopFlow Platform"
description "Customer-facing commerce platform."
tags #commerce #payments
created 2026-07-01T00:00:00Z
tagcolor payments "#e11d48"
! x-pipeline : {"stage":"prod","retries":3}

// A full-line comment — not model data.
@context d-ctx-root "ShopFlow — Context"
  desc "Top level."
  view 0.75 -120 64
  customer:person "Customer"
  shopflow:system "ShopFlow" @nextjs! [Next.js 15] #critical-path >d-cnt-shopflow pin (656,616 176x88)
  legacy:external "Legacy ERP" pin=false
  customer -> shopflow : "Places orders" [HTTPS/JSON] #public
  shopflow ..> legacy : "Nightly sync"

@container d-cnt-shopflow "ShopFlow — Containers" owner=shopflow in=d-ctx-root
  orders:container "Orders Service" @golang! [Go 1.22] >d-cmp-orders
  orders-db:database "Orders DB" @postgres~ [Postgres 16]
  events:queue "Event Bus" @kafka
  billing:container "Billing" >>"./billing.archlab.json"
  orders <-> orders-db : "Reads and writes" [SQL/TCP (pgx)] id=e-ord-db via (640,700)
  orders -> events : "Publishes settled orders" ~e-customer-shopflow
  orders -- billing : "Shares nothing" style=solid

@component d-cmp-orders "Orders Service — Components" owner=orders in=d-cnt-shopflow
  handler:component "HTTP Handler" >d-cod-handler
  session-cache:external "Session Cache" ^d-cnt-shopflow/orders-db

@code d-cod-handler "HTTP Handler — Code" owner=handler in=d-cmp-orders
  create-order:code "createOrder()"
`;

let tokenizeReady = true;
try {
  parseArchText(SAMPLE);
  ok("the highlighting sample is valid .alab (real parseArchText)");
} catch (error) {
  tokenizeReady = false;
  fail(
    "the highlighting sample is valid .alab (real parseArchText)",
    error.message,
  );
}

/**
 * `[lineSubstring, tokenSubstring, requiredScope, forbiddenScope?]` — the
 * scope list at the first character of `tokenSubstring`, on the line holding
 * `lineSubstring`, must contain `requiredScope` and must not contain
 * `forbiddenScope`.
 */
const EXPECTATIONS = [
  ["archlab 1.0", "archlab", "keyword.control.header.alab"],
  ["archlab 1.0", "1.0", "constant.numeric.alab"],
  ["title ", '"ShopFlow Platform"', "string.quoted.double.alab"],
  ["created ", "2026-07-01T00:00:00Z", "constant.other.timestamp.alab"],
  // The one thing the "associate .alab with YAML" workaround gets backwards:
  // `#tag` is model data, NOT a comment.
  ["tags #commerce", "commerce", "entity.name.tag.alab", "comment"],
  ["tags #commerce", "#", "punctuation.definition.tag.alab", "comment"],
  // ...and the mirror image: `//` IS a comment, which YAML would not colour.
  ["// A full-line comment", "//", "comment.line.double-slash.alab"],
  ["! x-pipeline", "!", "keyword.control.escape.alab"],
  ["! x-pipeline", '"stage"', "string.quoted.double.alab"],
  ["! x-pipeline", "3", "constant.numeric.alab"],
  ["@context d-ctx-root", "context", "keyword.control.level.alab"],
  ['desc "Top level."', "desc", "keyword.other.desc.alab"],
  ["view 0.75", "view", "keyword.other.view.alab"],
  ["view 0.75", "-120", "constant.numeric.alab"],
  ["@container d-cnt-shopflow", "owner", "entity.other.attribute-name.alab"],
  ["@container d-cnt-shopflow", "in=", "entity.other.attribute-name.alab"],
  ["customer:person", "person", "storage.type.node.alab"],
  ["customer:person", "customer", "entity.name.type.node.alab"],
  ["shopflow:system", "system", "storage.type.node.alab"],
  ["shopflow:system", "nextjs", "constant.language.icon.alab"],
  ["shopflow:system", "!", "keyword.operator.icon-source.alab"],
  ["shopflow:system", "Next.js 15", "constant.other.technology.alab"],
  ["shopflow:system", "critical-path", "entity.name.tag.alab"],
  ["shopflow:system", ">d-cnt-shopflow", "keyword.operator.drilldown.alab"],
  ["shopflow:system", "pin", "entity.other.attribute-name.alab"],
  ["shopflow:system", "656", "constant.numeric.alab"],
  ["legacy:external", "external", "storage.type.node.alab"],
  ["legacy:external", "false", "constant.language.boolean.alab"],
  ["orders:container", "container", "storage.type.node.alab"],
  ["orders-db:database", "database", "storage.type.node.alab"],
  ["orders-db:database", "postgres", "constant.language.icon.alab"],
  ["orders-db:database", "~", "keyword.operator.icon-source.alab"],
  ["events:queue", "queue", "storage.type.node.alab"],
  ["billing:container", ">>", "keyword.operator.child-ref.alab"],
  ["handler:component", "component", "storage.type.node.alab"],
  ["session-cache:external", "^", "keyword.operator.external-ref.alab"],
  ["create-order:code", "code", "storage.type.node.alab"],
  // Arrow tokens must be ONE token each, whatever the alternation order.
  ["customer -> shopflow", "->", "keyword.operator.arrow.alab"],
  ["orders <-> orders-db", "<->", "keyword.operator.arrow.alab"],
  ["shopflow ..> legacy", "..>", "keyword.operator.arrow.alab"],
  ["orders -- billing", "--", "keyword.operator.arrow.alab"],
  ["orders <-> orders-db", "id", "entity.other.attribute-name.alab"],
  ["orders <-> orders-db", "via", "keyword.other.via.alab"],
  [
    "orders -> events",
    "~e-customer-shopflow",
    "punctuation.definition.realizes.alab",
  ],
  ["orders -- billing", "style", "entity.other.attribute-name.alab"],
  ["customer -> shopflow", "HTTPS/JSON", "constant.other.technology.alab"],
];

/**
 * A SECOND SAMPLE, and the reason there has to be one: `edge-line` is the rule
 * that highlights a C4 edge AND a sequence message, because both are
 * `id arrow id`. Every tokenizer expectation lived in a C4 document, so the
 * sequence-only arrows had no coverage at all — `~>` shipped unhighlit with the
 * sequence grammar and nothing noticed, because the check that would have
 * noticed only ever read a C4 file. This sample is validated by the SEQUENCE
 * parser, so it cannot drift into being invalid `.alab` either.
 */
const SEQUENCE_SAMPLE = `archlab 1.0 sequence
title "Arrow highlighting"

@sequence
  web:participant "Web"
  api:participant "API"
  queue:participant "Events"

  web -> api : "Call"
  api ~> queue : "publish"
  api x> queue : "dropped"
  api ..x> queue : "dropped reply"
  api ..~> web : "replay offer"
  api <..> web : "sync both ways"
`;

/** The sequence-only tokens. `..x>` is here specifically because it contains
 * both `..>` and `x>`: a wrong alternation order tokenizes it as two operators
 * and highlights neither correctly. */
const SEQUENCE_EXPECTATIONS = [
  ["api ~> queue", "~>", "keyword.operator.arrow.alab"],
  ["api x> queue", "x>", "keyword.operator.arrow.alab"],
  ["api ..x> queue", "..x>", "keyword.operator.arrow.alab"],
  ["api ..~> web", "..~>", "keyword.operator.arrow.alab"],
  ["api <..> web", "<..>", "keyword.operator.arrow.alab"],
];

/**
 * A THIRD SAMPLE, for the third grammar, and it exists for the reason the
 * second one does: the gantt's body lines are a rule no C4 or sequence
 * document can reach, so nothing already here would ever tokenize them. Every
 * construct that carries meaning on an item line is asserted — the two item
 * keywords, the duration, a state word, both start keywords and the `starts`
 * date — because each is a place the shared `#number` and `#bare-word` rules
 * would happily swallow the token if the gantt rule stopped matching.
 * Validated by the GANTT parser, so it cannot drift into invalid `.alab`.
 */
const GANTT_SAMPLE = `archlab 1.0 gantt
title "Gantt highlighting"
starts 2026-09-07

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
    task shadow "Shadow writes" 13d active after audit
    milestone parity "Parity signed off" after shadow #gate
`;

const GANTT_EXPECTATIONS = [
  ["starts 2026-09-07", "starts", "keyword.control.header.alab"],
  // The date must be ONE token, not a year minus a month minus a day: that is
  // what `#date` is ahead of `#number` for.
  ["starts 2026-09-07", "2026-09-07", "constant.other.date.alab"],
  ['section "Prepare"', "section", "keyword.control.gantt.alab"],
  ["task audit", "task", "keyword.control.gantt.alab"],
  ["task audit", "5d", "constant.numeric.duration.alab"],
  ["task audit", "done", "constant.language.item-state.alab"],
  ["task audit", "at", "keyword.other.start.alab"],
  ["task shadow", "active", "constant.language.item-state.alab"],
  ["task shadow", "after", "keyword.other.start.alab"],
  ["milestone parity", "milestone", "keyword.control.gantt.alab"],
  // A `#tag` on an item line is model data here too — the same claim the C4
  // sample makes, made again where a different rule is doing the including.
  ["milestone parity", "gate", "entity.name.tag.alab", "comment"],
];

/**
 * A FOURTH SAMPLE, for the fourth grammar with rules of its own. It asserts
 * less than the gantt one above because there IS less: this grammar has no
 * bare tokens at all, so the only things on an event line are the keyword, a
 * quoted string and any number of `#tag`s. What it is really guarding is that
 * `period` and `event` reach `#timeline-line` rather than falling through to
 * `#node-line`, which would read `event "…"` as a C4 node declaration and
 * scope the keyword as an id.
 *
 * Validated by the TIMELINE parser, so it cannot drift into invalid `.alab`.
 */
const TIMELINE_SAMPLE = `archlab 1.0 timeline
title "Timeline highlighting"

@timeline
  period "2024"
    event "Founded the company"
    event "First ten customers" #milestone
`;

const TIMELINE_EXPECTATIONS = [
  ['period "2024"', "period", "keyword.control.timeline.alab"],
  ['event "Founded', "event", "keyword.control.timeline.alab"],
  // A `#tag` on an event line is model data here too — the same claim the C4
  // and gantt samples make, made again where a third rule does the including.
  ["First ten customers", "milestone", "entity.name.tag.alab", "comment"],
  /* THE ONE THAT MATTERS, and it is a NEGATIVE: `milestone` is the gantt's
     item keyword, and this line carries it as a tag. If `#timeline-line`
     stopped matching, the tag would still be a tag but the LINE would fall
     through to `#node-line` and `event` would scope as an id — so asserting
     the keyword above and the tag here together pins both halves. */
  ['event "First', "event", "keyword.control.timeline.alab"],
];

/**
 * A FIFTH SAMPLE, for the fifth grammar with rules of its own, and it guards
 * the one hazard the other four do not have: this grammar has BOTH a bare
 * token (a state's id) and two bare MARKERS (`ends`, `rejoins`). Get the rule
 * order wrong and `ends` colours as an id — which is exactly the confusion the
 * parser refuses a document for, so the editor would be teaching the mistake.
 *
 * The second thing it guards is the fall-through: `state placed "Placed"` must
 * reach `#lifecycle-line` rather than `#node-line`, which would read it as a
 * C4 node declaration and scope `state` as an id.
 *
 * Validated by the LIFECYCLE parser, so it cannot drift into invalid `.alab`.
 */
const LIFECYCLE_SAMPLE = `archlab 1.0 lifecycle
title "Lifecycle highlighting"

@lifecycle
  subject "Order"
  state placed "Placed" #retail
    exit "Cancelled" ends
      when "the customer changes their mind"
  state shipped "Shipped"
    exit "Returned" rejoins placed
  state delivered "Delivered" ends
`;

const LIFECYCLE_EXPECTATIONS = [
  ['subject "Order"', "subject", "keyword.control.lifecycle.alab"],
  ['state placed "Placed"', "state", "keyword.control.lifecycle.alab"],
  ['exit "Cancelled"', "exit", "keyword.control.lifecycle.alab"],
  ['when "the customer', "when", "keyword.control.lifecycle.alab"],
  /* THE TWO THAT MATTER, and both are about the marker rule beating
     `#bare-word`: `ends` and `rejoins` say where the subject LANDS, and a
     document whose editor coloured either as an id would be teaching the
     spelling the parser refuses. */
  ['exit "Cancelled" ends', "ends", "keyword.other.lifecycle.alab"],
  ['exit "Returned" rejoins placed', "rejoins", "keyword.other.lifecycle.alab"],
  // A `#tag` on a state line is model data here too — the same claim the C4,
  // gantt and timeline samples make, made again under a fourth rule.
  [
    'state placed "Placed" #retail',
    "retail",
    "entity.name.tag.alab",
    "comment",
  ],
];

try {
  parseLifecycleText(LIFECYCLE_SAMPLE);
  ok(
    "the lifecycle highlighting sample is valid .alab (real parseLifecycleText)",
  );
} catch (error) {
  tokenizeReady = false;
  fail(
    "the lifecycle highlighting sample is valid .alab (real parseLifecycleText)",
    error instanceof Error ? error.message : String(error),
  );
}

try {
  parseTimelineText(TIMELINE_SAMPLE);
  ok(
    "the timeline highlighting sample is valid .alab (real parseTimelineText)",
  );
} catch (error) {
  tokenizeReady = false;
  fail(
    "the timeline highlighting sample is valid .alab (real parseTimelineText)",
    error.message,
  );
}

try {
  parseGanttText(GANTT_SAMPLE);
  ok("the gantt highlighting sample is valid .alab (real parseGanttText)");
} catch (error) {
  tokenizeReady = false;
  fail(
    "the gantt highlighting sample is valid .alab (real parseGanttText)",
    error.message,
  );
}

try {
  parseSequenceText(SEQUENCE_SAMPLE);
  ok(
    "the sequence highlighting sample is valid .alab (real parseSequenceText)",
  );
} catch (error) {
  tokenizeReady = false;
  fail(
    "the sequence highlighting sample is valid .alab (real parseSequenceText)",
    error.message,
  );
}

if (tokenizeReady) {
  // Both ship as CommonJS, so the namespace object carries them on `default`.
  const vsctmModule = await import("vscode-textmate");
  const onigurumaModule = await import("vscode-oniguruma");
  const vsctm = vsctmModule.default ?? vsctmModule;
  const oniguruma = onigurumaModule.default ?? onigurumaModule;

  await oniguruma.loadWASM(
    await readFile(
      path.join(ROOT, "node_modules/vscode-oniguruma/release/onig.wasm"),
    ),
  );

  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (source) => new oniguruma.OnigString(source),
    }),
    loadGrammar: async (scopeName) =>
      scopeName === "source.alab"
        ? vsctm.parseRawGrammar(
            readFileSync(GRAMMAR_PATH, "utf8"),
            GRAMMAR_PATH,
          )
        : null,
  });

  const tmGrammar = await registry.loadGrammar("source.alab");
  if (tmGrammar === null) {
    fail("vscode-textmate loads the grammar", "loadGrammar returned null");
  } else {
    ok("vscode-textmate loads the grammar");

    // Tokenize the whole file once, carrying the rule stack line to line
    // exactly as the editor does.
    const lines = SAMPLE.split("\n");
    const tokensByLine = [];
    let ruleStack = vsctm.INITIAL;
    for (const line of lines) {
      const result = tmGrammar.tokenizeLine(line, ruleStack);
      tokensByLine.push(result.tokens);
      ruleStack = result.ruleStack;
    }

    const scopesAt = (lineIndex, column) => {
      const token = tokensByLine[lineIndex].find(
        (candidate) =>
          column >= candidate.startIndex && column < candidate.endIndex,
      );
      return token?.scopes ?? [];
    };

    for (const [
      lineSubstring,
      tokenSubstring,
      requiredScope,
      forbiddenScope,
    ] of EXPECTATIONS) {
      const label = `${requiredScope} on "${tokenSubstring}"`;
      const lineIndex = lines.findIndex((line) => line.includes(lineSubstring));
      if (lineIndex === -1) {
        fail(label, `sample has no line containing "${lineSubstring}"`);
        continue;
      }
      const column = lines[lineIndex].indexOf(tokenSubstring);
      if (column === -1) {
        fail(label, `line ${lineIndex + 1} has no "${tokenSubstring}"`);
        continue;
      }

      const scopes = scopesAt(lineIndex, column);
      const has = scopes.some((scope) => scope === requiredScope);
      const forbidden =
        forbiddenScope !== undefined &&
        scopes.some((scope) => scope.includes(forbiddenScope));

      if (has && !forbidden) {
        ok(label);
      } else if (!has) {
        fail(
          label,
          `line ${lineIndex + 1} col ${column}: got ${
            scopes.length > 0 ? scopes.join(" ") : "<no token>"
          }`,
        );
      } else {
        fail(
          label,
          `line ${lineIndex + 1} col ${column}: must NOT be scoped "${forbiddenScope}", got ${scopes.join(" ")}`,
        );
      }
    }

    /* THE SEQUENCE SAMPLE, through the same grammar and the same scope test.
       Tokenized separately rather than concatenated: the two document kinds
       never mix in one file, and a fused sample would be text no parser
       accepts. */
    {
      const seqLines = SEQUENCE_SAMPLE.split("\n");
      const seqTokens = [];
      let seqStack = vsctm.INITIAL;
      for (const line of seqLines) {
        const result = tmGrammar.tokenizeLine(line, seqStack);
        seqTokens.push(result.tokens);
        seqStack = result.ruleStack;
      }
      for (const [
        lineSubstring,
        tokenSubstring,
        requiredScope,
      ] of SEQUENCE_EXPECTATIONS) {
        const label = `${requiredScope} on "${tokenSubstring}" (sequence)`;
        const lineIndex = seqLines.findIndex((line) =>
          line.includes(lineSubstring),
        );
        if (lineIndex === -1) {
          fail(label, `sequence sample has no "${lineSubstring}"`);
          continue;
        }
        const column = seqLines[lineIndex].indexOf(tokenSubstring);
        const token = seqTokens[lineIndex].find(
          (candidate) =>
            column >= candidate.startIndex && column < candidate.endIndex,
        );
        /* BOTH the scope AND the token BOUNDS, in one assertion: a `..x>`
           highlighted as `..>` + `x>` would carry the right scope on the first
           half and still be wrong. */
        if (
          token !== undefined &&
          token.scopes.includes(requiredScope) &&
          token.startIndex === column &&
          token.endIndex === column + tokenSubstring.length
        ) {
          ok(label);
        } else {
          fail(
            label,
            token === undefined
              ? "no token at the arrow"
              : `scopes ${token.scopes.join(" ")} span [${token.startIndex},${token.endIndex}), expected [${column},${column + tokenSubstring.length})`,
          );
        }
      }
    }

    /* THE GANTT AND TIMELINE SAMPLES, each tokenized on its own for the same
       reason the sequence one is: document kinds never share a file.

       ONE FUNCTION FOR BOTH rather than a third copy of the block. The gantt
       block was copied from the sequence one, and copying it a second time is
       the shape `dry.md` names — identical bodies with a renamed sample. The
       sequence block above stays separate on purpose: its failure wording is
       about arrows and its bounds assertion is making a different point. */
    const checkSample = (sampleName, sampleText, expectations) => {
      const sampleLines = sampleText.split("\n");
      const sampleTokens = [];
      let sampleStack = vsctm.INITIAL;
      for (const line of sampleLines) {
        const result = tmGrammar.tokenizeLine(line, sampleStack);
        sampleTokens.push(result.tokens);
        sampleStack = result.ruleStack;
      }
      for (const [
        lineSubstring,
        tokenSubstring,
        requiredScope,
        forbiddenScope,
      ] of expectations) {
        const label = `${requiredScope} on "${tokenSubstring}" (${sampleName})`;
        const lineIndex = sampleLines.findIndex((line) =>
          line.includes(lineSubstring),
        );
        if (lineIndex === -1) {
          fail(label, `${sampleName} sample has no "${lineSubstring}"`);
          continue;
        }
        const column = sampleLines[lineIndex].indexOf(tokenSubstring);
        const token = sampleTokens[lineIndex].find(
          (candidate) =>
            column >= candidate.startIndex && column < candidate.endIndex,
        );
        const scopes = token?.scopes ?? [];
        /* BOUNDS AS WELL AS SCOPE, exactly as the sequence arrows are checked:
           `2026-09-07` scoped correctly on its first three characters and then
           broken into three numbers would pass a scope-only assertion. */
        if (
          token !== undefined &&
          scopes.includes(requiredScope) &&
          token.startIndex === column &&
          token.endIndex === column + tokenSubstring.length &&
          !(
            forbiddenScope !== undefined &&
            scopes.some((scope) => scope.includes(forbiddenScope))
          )
        ) {
          ok(label);
        } else {
          fail(
            label,
            token === undefined
              ? "no token there"
              : `scopes ${scopes.join(" ")} span [${token.startIndex},${token.endIndex}), expected [${column},${column + tokenSubstring.length})`,
          );
        }
      }
    };

    checkSample("gantt", GANTT_SAMPLE, GANTT_EXPECTATIONS);
    checkSample("timeline", TIMELINE_SAMPLE, TIMELINE_EXPECTATIONS);
    checkSample("lifecycle", LIFECYCLE_SAMPLE, LIFECYCLE_EXPECTATIONS);

    // Whole-token check: each arrow must be a single token, not a split pair.
    for (const [lineSubstring, arrow] of [
      ["customer -> shopflow", "->"],
      ["orders <-> orders-db", "<->"],
      ["shopflow ..> legacy", "..>"],
      ["orders -- billing", "--"],
    ]) {
      const lineIndex = lines.findIndex((line) => line.includes(lineSubstring));
      const column = lines[lineIndex].indexOf(arrow);
      const token = tokensByLine[lineIndex].find(
        (candidate) =>
          column >= candidate.startIndex && column < candidate.endIndex,
      );
      const label = `"${arrow}" is one whole token`;
      if (
        token !== undefined &&
        token.startIndex === column &&
        token.endIndex === column + arrow.length
      ) {
        ok(label);
      } else {
        fail(
          label,
          token === undefined
            ? "no token at the arrow"
            : `token spans [${token.startIndex},${token.endIndex}), expected [${column},${column + arrow.length})`,
        );
      }
    }
  }
}

/* ----------------------------------------------------------------------- */

console.log(
  `\n${validated - failures}/${validated} checks passed${
    failures === 0 ? "." : `, ${failures} FAILED.`
  }`,
);
process.exit(failures === 0 ? 0 : 1);
