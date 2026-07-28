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
 * It then TOKENIZES a sample file with `vscode-textmate` — the same engine
 * VS Code runs — and asserts the scope at specific offsets, so "the grammar
 * looks right" is replaced by "the grammar highlights right". The sample is
 * first fed to the real `parseArchText`, so it cannot drift into something
 * that is not valid `.alab`.
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
const { parseArchText } = await import(
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
const arrowTokens = ARROWS.map(([token]) => token);

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
  if (arrowGroup.join(" ") === arrowTokens.join(" ")) {
    ok("arrow alternation is ordered longest-first, as the parser requires");
  } else {
    fail(
      "arrow alternation is ordered longest-first, as the parser requires",
      `parser order:  ${arrowTokens.join(" ")}\n    grammar order: ${arrowGroup.join(" ")}`,
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
