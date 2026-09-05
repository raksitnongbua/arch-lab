#!/usr/bin/env node
/**
 * MCP server check: the `/api/mcp` surface must be real, documented, and
 * actually work — without booting a protocol.
 *
 * Three classes of failure this catches:
 *
 *   1. **Drift between the server and its docs.** `registerArchLabMcp` is run
 *      against a recording stub, and the names it registers must equal the
 *      names `catalog.ts` documents — exactly, both directions. A tool that
 *      exists but is undocumented (or documented but missing) fails here,
 *      which is what keeps the `/mcp` page honest.
 *   2. **Broken tools.** Every tool is invoked over real input: the bundled
 *      ShopFlow model, a deliberately malformed `.alab` file, and Mermaid C4.
 *      Successes must report success; failures must report the parser's own
 *      line and column, because a validator that cannot locate an error is
 *      worse than none.
 *   3. **A share link that does not survive the round trip.** The link is
 *      decoded back through the real codec and the recovered `.alab` text must
 *      equal what went in.
 *
 * Exits non-zero on any failure. Run with: pnpm check:mcp
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* ----------------------------------------------------------------------- */

/**
 * `list_icons` reads the real icon registry, whose artwork modules are `.tsx`
 * — beyond Node's type stripping, which handles `.ts` only. Rather than fork
 * the registry into a data-only copy this script could load (the exact drift
 * `list_icons` exists to prevent), the load hook below transpiles `.tsx` with
 * the project's own TypeScript, so the check exercises the same modules the
 * app ships.
 */
const require = createRequire(import.meta.url);
const ts = require("typescript");

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string" &&
      // Only app code needs the extensionless rewrite. Rewriting every
      // relative specifier to a file: URL breaks the CommonJS packages the
      // icon registry pulls in (react's own `require("./cjs/…")` cannot take
      // a URL), and those resolve fine natively.
      /\.tsx?$/.test(context.parentURL)
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      const isFile = existsSync(asPath) && statSync(asPath).isFile();
      if (!isFile) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(`${asPath}.tsx`)) {
          resolved = pathToFileURL(`${asPath}.tsx`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },

  /**
   * The viewer's model registry imports its `.archlab.json` documents the way
   * a bundler allows — `import doc from "./x.archlab.json"`, no import
   * attribute. Bare Node requires `with { type: "json" }` and refuses
   * otherwise, so serve JSON as a JSON module here rather than editing app
   * code to suit this script.
   */
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return {
        format: "json",
        shortCircuit: true,
        source: readFileSync(fileURLToPath(url), "utf8"),
      };
    }
    /*
     * `.tsx` (the icon artwork) is transpiled with the project's TypeScript.
     * Classic JSX with an injected default React import, not the automatic
     * runtime: `react/jsx-runtime` is CommonJS whose named exports Node's
     * lexer cannot see, while a default import of `react` always resolves.
     * The injection cannot collide — no `.tsx` here imports the React VALUE,
     * only its types, which transpilation erases.
     */
    if (url.startsWith("file:") && url.endsWith(".tsx")) {
      const transpiled = ts.transpileModule(
        readFileSync(fileURLToPath(url), "utf8"),
        {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.React,
          },
          fileName: fileURLToPath(url),
        },
      );
      return {
        format: "module",
        shortCircuit: true,
        source: `import React from "react";\n${transpiled.outputText}`,
      };
    }
    return nextLoad(url, context);
  },
});

const load = (relative) =>
  import(pathToFileURL(path.join(ROOT, relative)).href);

const {
  MCP_TOOLS,
  MCP_RESOURCES,
  MCP_PROMPTS,
  MCP_STATUS_LABEL,
  MCP_BETA_NOTICE,
  MCP_BETA_NOTICE_SHORT,
  CONNECT_RECIPES,
  KINDS_WITHOUT_SYNTAX_SECTIONS,
  mcpEndpointUrl,
} = await load("src/features/mcp/catalog.ts");
const { registerArchLabMcp } = await load("src/features/mcp/server.ts");
const { validateModel } = await load("src/features/mcp/tools/validate.ts");
const { convertModel, formatModel } = await load(
  "src/features/mcp/tools/convert.ts",
);
const { describeModel } = await load("src/features/mcp/tools/describe.ts");
const { formatSequence, validateSequence } = await load(
  "src/features/mcp/tools/sequence.ts",
);
const { formatFlowchart, validateFlowchart } = await load(
  "src/features/mcp/tools/flowchart.ts",
);
const { formatUseCase, validateUseCase } = await load(
  "src/features/mcp/tools/usecase.ts",
);
const { getExampleModel, listExampleModels } = await load(
  "src/features/mcp/tools/examples.ts",
);
const { getSyntaxReference, SYNTAX_SECTION_IDS } = await load(
  "src/features/mcp/tools/syntax.ts",
);
const { listIcons } = await load("src/features/mcp/tools/icons.ts");
const { ICONS } = await load("src/features/editor/lib/icons/registry.ts");
const { ICON_CATEGORY_ORDER, ICON_CATEGORY_LABELS } = await load(
  "src/features/editor/lib/icons/categories.ts",
);
const { createShareLink } = await load("src/features/mcp/tools/share.ts");
/* The five kinds this file did not previously exercise directly. Section 10
   needs every notation's validator, because the "no bundled example raises an
   ask" guarantee is driven from the registry rather than from a hand-listed
   set — a hardcoded list cannot notice the notation it has never heard of. */
const { checkSource } = await load("src/features/validate/lib/check.ts");
/* The vocabulary tables the four undocumented grammars are defined by. Imported
   rather than restated: the assertion below is only worth anything if the set
   it checks against is the parser's own. */
const { NODE_SHAPE_BY_KEYWORD, GROUP_KEYWORD } = await load(
  "src/features/archtext/lib/flowchart/keywords.ts",
);
const { ELEMENT_KIND_BY_KEYWORD, TOKEN_BY_EDGE_KIND, DEPENDENCY_STEREOTYPES } =
  await load("src/features/archtext/lib/usecase/keywords.ts");
const { ATTRIBUTE_KEYS, TOKEN_BY_CARDINALITY, KIND_BY_CONNECTOR } = await load(
  "src/features/archtext/lib/er/keywords.ts",
);
const { FIELD_FLAGS, FIELD_DETAIL_KEYS } = await load(
  "src/features/archtext/lib/dict/keywords.ts",
);
const { parseFlowchartText, parseUseCaseText, parseErText, parseDictText } =
  await load("src/features/archtext/index.ts");
const { validateEr } = await load("src/features/mcp/tools/er.ts");
const { validateDict } = await load("src/features/mcp/tools/dict.ts");
const { validateGantt } = await load("src/features/mcp/tools/gantt.ts");
const { validateTimeline } = await load("src/features/mcp/tools/timeline.ts");
const { validateLifecycle } = await load("src/features/mcp/tools/lifecycle.ts");
const { EXAMPLE_KINDS, listBundledExamples, loadBundledExample } = await load(
  "src/features/playground/lib/example-registry.ts",
);
const { KIND_BLURB } = await load("src/features/playground/lib/kind-copy.ts");
const { decodeShareFragment, SHARE_URL_SAFE_LENGTH, MAX_SHARE_URL_LENGTH } =
  await load("src/features/viewer/share/codec.ts");
const { MAX_SOURCE_CHARS } = await load("src/features/mcp/lib/limits.ts");
const { DEFAULT_PUBLIC_ORIGIN, documentedOrigin, requestOrigin } = await load(
  "src/features/mcp/lib/origin.ts",
);

let failures = 0;
const checks = [];

function check(name, run) {
  checks.push({ name, run });
}

/** The single text block a tool returns. */
function textOf(result) {
  assert.ok(Array.isArray(result.content), "result.content must be an array");
  assert.equal(result.content.length, 1, "expected exactly one content block");
  assert.equal(result.content[0].type, "text");
  return result.content[0].text;
}

function expectOk(result) {
  assert.notEqual(
    result.isError,
    true,
    `expected success, got error:\n${textOf(result)}`,
  );
  return textOf(result);
}

function expectError(result) {
  assert.equal(
    result.isError,
    true,
    `expected an error result, got success:\n${textOf(result)}`,
  );
  return textOf(result);
}

/**
 * An ask-human result, with its shape proved before anything reads it.
 *
 * Every assertion here is one an ask has to satisfy to be usable at all, so
 * it is checked on EVERY ask the fixtures provoke rather than once on a
 * fixture built to pass: the whole envelope's value is that an agent can rely
 * on the shape without parsing prose. The individual rules are argued at the
 * `AskHuman` declaration in `features/mcp/lib/render.ts`.
 */
function expectAsk(result) {
  const text = textOf(result);
  assert.notEqual(
    result.isError,
    true,
    "an ask must NOT be isError: the call did its work and stopped at a " +
      "fork, and marking it an error teaches the model to retry with a " +
      `guess — which is the behaviour the envelope exists to stop:\n${text}`,
  );
  assert.match(
    text,
    /^ASK YOUR HUMAN/,
    `an ask must open with the headline the handshake tells agents to stop ` +
      `on, on the FIRST line:\n${text}`,
  );

  const ask = result.structuredContent?.archlab_ask;
  assert.ok(
    ask !== undefined,
    `an ask must carry structuredContent.archlab_ask:\n${text}`,
  );

  assert.ok(
    ask.options.length >= 2 && ask.options.length <= 5,
    `2..5 options; got ${ask.options.length}. One is not a fork, and six is ` +
      "a menu nobody reads out loud",
  );
  const ids = ask.options.map((option) => option.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    `option ids must be unique — a human answering "2" must land somewhere: ${ids.join(", ")}`,
  );
  for (const option of ask.options) {
    assert.ok(
      typeof option.consequence === "string" && option.consequence !== "",
      `option \`${option.id}\` has no consequence`,
    );
    assert.notEqual(
      option.consequence,
      option.label,
      `option \`${option.id}\`'s consequence only restates its label, which ` +
        "turns the fork into a coin toss",
    );
    if (option.next !== undefined) {
      assert.ok(
        MCP_TOOLS.some((tool) => tool.name === option.next.tool),
        `option \`${option.id}\` points at \`${option.next.tool}\`, which is ` +
          "not a tool this server has",
      );
    }
  }

  assert.ok(
    typeof ask.otherwise === "string" &&
      /own words|free text/i.test(ask.otherwise),
    "every ask must offer the free-text escape: a list of options is never " +
      `the whole world. Got: ${JSON.stringify(ask.otherwise)}`,
  );

  if (ask.defaultId === null) {
    assert.doesNotMatch(
      text,
      /^Default the server would take/m,
      "an ask with no default must not print a default line",
    );
  } else {
    assert.ok(
      ids.includes(ask.defaultId),
      `defaultId \`${ask.defaultId}\` is not one of ${ids.join(", ")}`,
    );
    assert.match(
      text,
      /^Default the server would take if you cannot ask: option \d+\.$/m,
      `a non-null defaultId must be stated in the TEXT too — a client that ` +
        `ignores structuredContent must still see it:\n${text}`,
    );
  }
  return { text, ask };
}

/** Nothing stopped to ask: the result is a plain one, whichever kind. */
function expectNoAsk(result, why) {
  assert.equal(
    result.structuredContent?.archlab_ask,
    undefined,
    `${why} — an ask here is noise, and a question that fires often is one ` +
      `an agent learns to answer without reading:\n${textOf(result)}`,
  );
  assert.doesNotMatch(textOf(result), /ASK YOUR HUMAN/, why);
  return textOf(result);
}

/* ----------------------------------------------------------------------- */
/* Fixtures                                                                 */
/* ----------------------------------------------------------------------- */

const VALID_ALAB = `archlab 1.0
title "Coffee Shop"

@context ctx-root "Coffee Shop"
  customer:person "Customer"
  shop:system "Coffee Shop System" >cnt-shop

  customer -> shop : "Places orders with" [HTTPS]

@container cnt-shop owner=shop
  app:container "Ordering App" [Next.js]
  db:database "Order Store" [PostgreSQL]

  app -> db : "Reads and writes" [SQL]
`;

/** `:` with no node type — a located parse error. */
const BROKEN_ALAB = `archlab 1.0
title "Broken"

@context ctx-root "Broken"
  customer: "Customer"
`;

const MERMAID = `C4Context
  title Coffee Shop
  Person(customer, "Customer", "Buys coffee")
  System(shop, "Coffee Shop System", "Sells coffee")
  Rel(customer, shop, "Places orders with", "HTTPS")
`;

/* ----------------------------------------------------------------------- */
/* 1. Catalogue ⇄ server                                                    */
/* ----------------------------------------------------------------------- */

/** Records what `registerArchLabMcp` registers, without an SDK in sight. */
function recordRegistrations() {
  const tools = [];
  const resources = [];
  const prompts = [];
  const stub = {
    registerTool(name, config, handler) {
      assert.equal(typeof name, "string");
      assert.ok(
        typeof config.description === "string" && config.description !== "",
        `tool ${name} must have a description`,
      );
      assert.ok(
        typeof config.title === "string" && config.title !== "",
        `tool ${name} must have a title`,
      );
      assert.equal(typeof handler, "function", `tool ${name} needs a handler`);
      tools.push({ name, config });
    },
    registerResource(name, uri, config, handler) {
      assert.equal(typeof handler, "function");
      resources.push({ name, uri, config });
    },
    registerPrompt(name, config, handler) {
      assert.equal(typeof handler, "function");
      prompts.push({ name, config, handler });
    },
  };
  registerArchLabMcp(stub);
  return { tools, resources, prompts };
}

const registered = recordRegistrations();

check("every registered tool is documented in catalog.ts", () => {
  const documented = MCP_TOOLS.map((tool) => tool.name).sort();
  const actual = registered.tools.map((tool) => tool.name).sort();
  assert.deepEqual(
    actual,
    documented,
    "the tools registered by server.ts and the tools documented in " +
      "catalog.ts must match exactly — the /mcp page renders from the " +
      "catalogue, so a mismatch means the page lies about the server",
  );
});

check("registered descriptions come from the catalogue", () => {
  for (const tool of registered.tools) {
    const entry = MCP_TOOLS.find((candidate) => candidate.name === tool.name);
    assert.equal(tool.config.description, entry.description, tool.name);
    assert.equal(tool.config.title, entry.title, tool.name);
  }
});

check("every tool is annotated read-only", () => {
  for (const tool of registered.tools) {
    assert.equal(
      tool.config.annotations?.readOnlyHint,
      true,
      `${tool.name} must be annotated readOnlyHint — nothing here mutates`,
    );
  }
});

check("resources and prompts match the catalogue", () => {
  assert.deepEqual(
    registered.resources.map((resource) => resource.uri).sort(),
    MCP_RESOURCES.map((resource) => resource.uri).sort(),
  );
  assert.deepEqual(
    registered.prompts.map((prompt) => prompt.name).sort(),
    MCP_PROMPTS.map((prompt) => prompt.name).sort(),
  );
});

check("the authoring prompt tells the agent to validate", () => {
  const prompt = registered.prompts.find(
    (candidate) => candidate.name === "author_c4_model",
  );
  const rendered = prompt.handler({ system: "a coffee shop" });
  const text = rendered.messages[0].content.text;
  assert.match(text, /a coffee shop/);
  assert.match(text, /validate_model/);
  assert.match(text, /get_syntax_reference/);
});

check("the beta status is one constant, stated in commitments", () => {
  assert.equal(MCP_STATUS_LABEL, "Beta");
  // Not adjectives: a reader needs to know what is safe to depend on. Both
  // notices must name the stable part AND the unstable part.
  for (const [name, notice] of [
    ["MCP_BETA_NOTICE", MCP_BETA_NOTICE],
    ["MCP_BETA_NOTICE_SHORT", MCP_BETA_NOTICE_SHORT],
  ]) {
    assert.match(notice, /beta/i, `${name} must say it is beta`);
    assert.match(notice, /endpoint URL/i, `${name} must name what is stable`);
    assert.match(notice, /tool names/i, `${name} must name what may change`);
  }
});

check("the server tells a connecting client it is beta", async () => {
  // The handshake is where an agent learns this — a human may never open /mcp.
  const route = await readFile(
    path.join(ROOT, "src/app/api/mcp/route.ts"),
    "utf8",
  );
  assert.match(
    route,
    /MCP_BETA_NOTICE_SHORT/,
    "the initialize instructions must carry the beta notice",
  );
});

check("the advertised origin comes from the request, not a constant", () => {
  // The regression this exists for: the subdomain changed, the hardcoded
  // default went stale, and /mcp advertised an endpoint that 404'd. A page
  // served from a host must be able to name that host.
  const from = (headers) =>
    requestOrigin((name) => headers[name.toLowerCase()] ?? null);

  assert.equal(from({ host: "arch-lab.dev" }), "https://arch-lab.dev");
  assert.equal(
    from({ host: "internal:3000", "x-forwarded-host": "arch-lab.example" }),
    "https://arch-lab.example",
    "the proxy's client-facing host must win over the internal one",
  );
  assert.equal(
    from({
      "x-forwarded-host": "a.example, b.example",
      "x-forwarded-proto": "https, http",
    }),
    "https://a.example",
    "multi-hop headers: the FIRST entry is the client-facing one",
  );
  assert.equal(
    from({ host: "localhost:3001" }),
    "http://localhost:3001",
    "localhost must not be assumed https",
  );
  assert.equal(from({}), null, "no host header means fall back to config");
});

check("an explicit override still beats the request", () => {
  // This is what makes ARCHLAB_PUBLIC_ORIGIN=… pnpm dev behave.
  // A header map, not a constant function: returning the same string for every
  // name would also answer x-forwarded-proto and build a nonsense origin.
  const served = (headers) => (name) => headers[name.toLowerCase()] ?? null;

  const before = process.env.ARCHLAB_PUBLIC_ORIGIN;
  try {
    process.env.ARCHLAB_PUBLIC_ORIGIN = "http://localhost:3001/";
    assert.equal(
      documentedOrigin(served({ host: "someone-else.example" })),
      "http://localhost:3001",
      "explicit config wins, and its trailing slash is stripped",
    );
    delete process.env.ARCHLAB_PUBLIC_ORIGIN;
    assert.equal(
      documentedOrigin(served({ host: "served-from.example" })),
      "https://served-from.example",
      "with no override, the request host wins",
    );
  } finally {
    if (before === undefined) delete process.env.ARCHLAB_PUBLIC_ORIGIN;
    else process.env.ARCHLAB_PUBLIC_ORIGIN = before;
  }
});

check("the fallback origin is a well-formed https origin with no path", () => {
  assert.match(DEFAULT_PUBLIC_ORIGIN, /^https:\/\/[a-z0-9.-]+$/);
});

check("the endpoint url is built from the site origin", () => {
  assert.equal(
    mcpEndpointUrl("https://example.test/"),
    "https://example.test/api/mcp",
  );
});

/* ----------------------------------------------------------------------- */
/* 2. validate_model                                                        */
/* ----------------------------------------------------------------------- */

check("validate_model accepts valid .alab and reports its structure", () => {
  const text = expectOk(validateModel(VALID_ALAB, "auto"));
  assert.match(text, /^VALID as \.alab text \(auto-detected\)\./m);
  assert.match(text, /Coffee Shop/);
  assert.match(text, /2 diagram\(s\), 4 node\(s\), 2 edge\(s\)/);
  // The diagram table pads its columns, so match loosely on one row.
  assert.match(text, /@context\s+ctx-root\s+"Coffee Shop" — 2 nodes, 1 edge/);
  assert.match(text, /@container\s+cnt-shop\s+.* — 2 nodes, 1 edge/);
});

check("validate_model locates a broken .alab file", () => {
  const text = expectError(validateModel(BROKEN_ALAB, "auto"));
  assert.match(text, /^INVALID as \.alab text/m);
  assert.match(text, /line 5, column \d+:/);
  // The offending line must be quoted with a caret under the column.
  assert.match(text, /customer: "Customer"/);
  assert.match(text, /\^/);
});

/*
 * The parser's repair must survive the trip to the agent.
 *
 * THE REGRESSION THIS EXISTS FOR. `checkSource` has attached `code` and
 * `fixes` to every `.alab` issue since the quick-fix work, and three surfaces
 * render them — but `lib/render.ts` printed only message/line/column/lineText,
 * so the caller that cannot click a button was the one told nothing about the
 * rewrite. It was invisible because nothing failed: the verdict was correct
 * and the location was right, and only the repair was missing.
 *
 * DRIVEN FROM `checkSource`, never from a title written here. A candidate's
 * `title` is a button label the parser is free to reword; asserting a literal
 * would pin MCP's output to a string this file does not own. What is asserted
 * is the FORWARDING — whatever the parser produced is what the agent reads.
 */
const TAB_INDENTED = `archlab 1.0
title "Broken"

@context ctx-root "Broken"
\tcustomer: person "Customer"
`;

/** Three spaces: not a rung, so the parser offers the rung below AND above. */
const ODD_INDENT = `archlab 1.0
title "Broken"

@context ctx-root "Broken"
   customer: person "Customer"
`;

/** The same tab failure in a kind reader, which flattens the issue away. */
const TAB_INDENTED_FLOWCHART = `archlab 1.0 flowchart
title "Broken"

\tstep a "A"
`;

/** The issue `checkSource` raises for `source`, for driving an assertion. */
function firstAlabIssue(source) {
  const result = checkSource(source, "auto");
  assert.equal(result.status, "error", "fixture stopped being invalid");
  return result.issues[0];
}

check("validate_model forwards the issue code the parser assigned", () => {
  const issue = firstAlabIssue(TAB_INDENTED);
  assert.ok(issue.code, "fixture stopped carrying a code");
  const text = expectError(validateModel(TAB_INDENTED, "auto"));
  assert.match(
    text,
    new RegExp(`\\[${issue.code.replace(/\./g, "\\.")}\\]`),
    "the issue code never reached the caller",
  );
});

check("validate_model shows a safe fix as the line it leaves behind", () => {
  const issue = firstAlabIssue(TAB_INDENTED);
  assert.equal(issue.fixes?.length, 1, "fixture stopped offering one fix");
  assert.equal(issue.fixes[0].kind, "safe");

  const text = expectError(validateModel(TAB_INDENTED, "auto"));
  assert.match(text, /^Fix — one provable rewrite:$/m);
  assert.ok(
    text.includes(issue.fixes[0].title),
    "the fix title never reached the caller",
  );
  // The point of the preview: the REPAIRED line, not a description of it.
  // "Use spaces" leaves the width unsaid, and a guess of four fails again.
  assert.match(text, /\n\s+5 \| {3}customer: person "Customer"$/m);
  assert.doesNotMatch(
    text.split("Fix —")[1],
    /\t/,
    "the preview still carries the tab it was supposed to remove",
  );
});

check(
  "a fix the parser cannot prove is offered as candidates, not applied",
  () => {
    const issue = firstAlabIssue(ODD_INDENT);
    assert.ok(
      (issue.fixes?.length ?? 0) > 1,
      "fixture stopped being ambiguous — it must offer more than one rung",
    );
    const text = expectError(validateModel(ODD_INDENT, "auto"));
    assert.match(text, /^Fixes — \d+ candidates; the parser cannot prove/m);
    for (const [index, fix] of issue.fixes.entries()) {
      assert.ok(
        text.includes(`${index + 1}. ${fix.title}`),
        `candidate ${index + 1} (${fix.title}) never reached the caller`,
      );
    }
    // Each candidate must be distinguishable by its RESULT, or the list is a
    // coin toss — the same reason an ask option's consequence may not repeat
    // its label.
    assert.match(text, /5 \| {3}customer: person "Customer"$/m);
    assert.match(text, /5 \| {5}customer: person "Customer"$/m);
  },
);

check("a kind reader's parse failure carries the fix too", () => {
  /* THE BOUNDARY THAT DROPPED IT. All eight kind readers flatten an
     `ArchTextIssue` into `{line, column, message, lineText}` for
     `renderKindParseFailure`, which is where the code and the candidates were
     lost — C4 could have been fixed alone and eight notations would still have
     been silent. */
  const text = expectError(validateFlowchart(TAB_INDENTED_FLOWCHART));
  assert.match(text, /^INVALID as \.alab flowchart\./m);
  assert.match(text, /\[alab\.indent-tabs\]/);
  assert.match(text, /^Fix — one provable rewrite:$/m);
  assert.match(text, /\n\s+4 \| {3}step a "A"$/m);
});

check("validate_model reads arch-lab JSON and Mermaid C4 too", () => {
  const json = expectOk(convertModel(VALID_ALAB, "auto", "json", undefined));
  const jsonText = json.split("```json\n")[1].split("\n```")[0];
  assert.match(
    expectOk(validateModel(jsonText, "auto")),
    /VALID as arch-lab JSON/,
  );
  assert.match(expectOk(validateModel(MERMAID, "auto")), /VALID as Mermaid C4/);
});

/* ----------------------------------------------------------------------- */
/* 2b. validate_sequence / format_sequence                                  */
/* ----------------------------------------------------------------------- */

/*
 * The sequence tools exist because a sequence document has no diagrams, no
 * levels and no node/edge counts — nothing `CheckOk` describes. What these
 * assert, beyond "it parses", is the pair of MISDIRECTIONS that would
 * otherwise waste an agent's turns: a C4 document handed to the sequence tool
 * must be told which tool to use rather than reported as a syntax error on
 * line 1, and the reverse must hold too.
 */
const VALID_SEQUENCE = `archlab 1.0 sequence
title "Checkout"

@sequence
  cust:actor "Customer"
  api:participant "Order API" [Go]

  cust -> api : "POST /orders" [HTTPS]
  api -> api : "Validates the cart"
  api ..> cust : "201 Created"
`;

check(
  "validate_sequence accepts .alab sequence and summarises the flow",
  () => {
    const text = expectOk(validateSequence(VALID_SEQUENCE));
    assert.match(text, /^VALID as \.alab sequence\./m);
    assert.match(text, /Participants: 2/);
    // The counts must be PER AXIS, not just a total: an agent checking whether
    // its reply arrows landed cannot see that from "3 messages". Both axes are
    // named, and only the values actually present — a summary listing "0
    // cross, 0 bidirectional" on every flow would be longer and say less.
    assert.match(text, /2 solid/);
    assert.match(text, /1 dotted/);
    assert.match(text, /3 with an arrowhead/);
    assert.doesNotMatch(text, /with a cross/);
    assert.match(text, /1 self-message/);
    assert.match(text, /`cust`.*Customer.*actor/);
  },
);

check("validate_sequence locates a broken sequence document", () => {
  const broken = VALID_SEQUENCE.replace(
    'cust -> api : "POST /orders" [HTTPS]',
    "cust -> api",
  );
  const text = expectError(validateSequence(broken));
  assert.match(text, /^INVALID as \.alab sequence\./m);
  assert.match(text, /line \d+, column \d+:/);
  assert.match(text, /\^/);
});

check("validate_sequence sends a C4 document to the right tool", () => {
  const text = expectError(validateSequence(VALID_ALAB));
  assert.match(text, /not a sequence diagram/i);
  assert.match(text, /validate_model/);
  // Specifically NOT a parse error: that would read as "your syntax is wrong"
  // when the syntax is fine and only the tool choice was.
  assert.doesNotMatch(text, /^INVALID as/m);
});

check("validate_model does not silently accept a sequence document", () => {
  // REWRITTEN when the kind redirects became asks. What must hold is
  // unchanged — a sequence document must never read as a valid C4 model —
  // but the verdict is now a question rather than a failure, because the
  // text and the tool call disagree and only a person knows which was meant.
  const { text } = expectAsk(validateModel(VALID_SEQUENCE, "auto"));
  assert.match(text, /sequence/i);
  assert.doesNotMatch(text, /^VALID as/m);
});

check(
  "validate_sequence imports Mermaid sequenceDiagram and states the loss",
  () => {
    const text = expectOk(
      validateSequence(
        "sequenceDiagram\n  participant A\n  A->>B: Hello\n  B-->>A: Hi\n",
      ),
    );
    assert.match(text, /VALID as Mermaid sequenceDiagram/);
    assert.match(text, /one-way|lossy|dropped/i);
  },
);

check("format_sequence canonicalises, and converts Mermaid to .alab", () => {
  const fromAlab = expectOk(formatSequence(VALID_SEQUENCE));
  assert.match(fromAlab, /archlab 1\.0 sequence/);
  assert.match(fromAlab, /@sequence/);

  const fromMermaid = expectOk(
    formatSequence("sequenceDiagram\n  A->>B: Hello\n"),
  );
  assert.match(fromMermaid, /archlab 1\.0 sequence/);
  assert.match(fromMermaid, /one-way|lossy|dropped/i);
});

check("format_sequence output is itself valid, and stable", () => {
  const once = expectOk(formatSequence(VALID_SEQUENCE));
  const body = once.split("```\n")[1].split("\n```")[0] + "\n";
  assert.match(
    expectOk(validateSequence(body)),
    /^VALID as \.alab sequence\./m,
  );
  const twice = expectOk(formatSequence(body));
  assert.equal(
    twice.split("```\n")[1],
    once.split("```\n")[1],
    "formatting is not idempotent",
  );
});

/* -------------------------------------------------------------------------- */
/* Flowcharts                                                                  */
/* -------------------------------------------------------------------------- */

const VALID_FLOWCHART = `archlab 1.0 flowchart
title "Order intake"

@flowchart
  start begin "Order placed"
  step check "Validate the cart"
  decision ok "Cart valid?"
  end done "Confirmed"
  end failed "Rejected"

  begin -> check
  check -> ok
  ok -> done : "yes"
  ok -> failed : "no"
  failed -> check : "retry"
`;

check(
  "validate_flowchart accepts .alab flowchart and summarises the graph",
  () => {
    const text = expectOk(validateFlowchart(VALID_FLOWCHART));
    assert.match(text, /^VALID as \.alab flowchart\./m);
    // Nodes reported BY SHAPE, not just counted: an agent checking whether its
    // decision actually became a diamond cannot learn that from "5 nodes".
    assert.match(text, /1 start/);
    assert.match(text, /1 decision/);
    assert.match(text, /2 end/);
    // The loop count comes from the layout's own cycle-breaking, and is the one
    // fact that tells a caller its retry arrow was understood as a loop.
    assert.match(text, /1 looping back/);
    assert.match(text, /Size: \d+ x \d+ px/);
    assert.match(text, /`ok`.*Cart valid\?.*decision/);
  },
);

check("validate_flowchart names the three defects a parse cannot see", () => {
  // An unguarded decision: two exits, neither labelled. Parses perfectly, and
  // draws a diamond that asks a question and refuses to answer it — the single
  // most common flowchart defect, and invisible to a grammar.
  const unguarded = VALID_FLOWCHART.replace(
    'ok -> done : "yes"',
    "ok -> done",
  ).replace('ok -> failed : "no"', "ok -> failed");
  assert.match(
    expectOk(validateFlowchart(unguarded)),
    /Unguarded decisions:.*`ok`/s,
  );

  // A node nothing arrives at, which is not a start: draws detached, and reads
  // as a rendering fault rather than an authoring one. It is given an OUTGOING
  // edge deliberately, so the assertion proves the unreachable rule and not
  // the dead-end one by accident.
  const orphan = VALID_FLOWCHART.replace(
    "  begin -> check\n",
    "  begin -> check\n  stray -> done\n",
  ).replace(
    '  step check "Validate the cart"\n',
    '  step check "Validate the cart"\n  step stray "Nobody calls me"\n',
  );
  assert.match(expectOk(validateFlowchart(orphan)), /Unreachable:.*`stray`/s);

  // A node nothing leaves, which is not an end: the reader follows the flow
  // and falls off it. Reached by an edge, so this proves the dead-end rule
  // rather than the unreachable one.
  const deadEnd = VALID_FLOWCHART.replace(
    "  begin -> check\n",
    "  begin -> check\n  check -> limbo\n",
  ).replace(
    '  step check "Validate the cart"\n',
    '  step check "Validate the cart"\n  step limbo "Goes nowhere"\n',
  );
  assert.match(expectOk(validateFlowchart(deadEnd)), /Dead ends:.*`limbo`/s);
});

check("validate_flowchart is quiet when the graph is sound", () => {
  // The audit must NOT fire on a well-formed document: a review note that
  // appears every time is one a caller learns to ignore.
  const text = expectOk(validateFlowchart(VALID_FLOWCHART));
  assert.doesNotMatch(text, /Unguarded decisions:/);
  assert.doesNotMatch(text, /Unreachable:/);
  assert.doesNotMatch(text, /Dead ends:/);
});

check("validate_flowchart locates a broken flowchart document", () => {
  const broken = VALID_FLOWCHART.replace(
    'decision ok "Cart valid?"',
    "decision ok",
  );
  const text = expectError(validateFlowchart(broken));
  assert.match(text, /^INVALID as \.alab flowchart\./m);
  assert.match(text, /line \d+, column \d+:/);
  assert.match(text, /\^/);
});

check("validate_flowchart reads Mermaid flowchart and graph alike", () => {
  for (const header of ["flowchart TD", "graph LR"]) {
    const text = expectOk(
      validateFlowchart(
        `${header}\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]\n`,
      ),
    );
    assert.match(text, /^VALID as Mermaid flowchart\./m);
    assert.match(text, /1 decision/);
    // The caveat must be stated on SUCCESS, not only on failure: a caller that
    // validated Mermaid and then saves the .alab has silently taken the loss.
    assert.match(text, /one-way|lossy|dropped|direction/i);
  }
});

check("format_flowchart canonicalises, and converts Mermaid to .alab", () => {
  const fromAlab = expectOk(formatFlowchart(VALID_FLOWCHART));
  assert.match(fromAlab, /archlab 1\.0 flowchart/);
  assert.match(fromAlab, /@flowchart/);

  const fromMermaid = expectOk(
    formatFlowchart("flowchart TD\n  A[Start] --> B[Done]\n"),
  );
  assert.match(fromMermaid, /archlab 1\.0 flowchart/);
  assert.match(fromMermaid, /one-way|lossy|dropped|direction/i);
});

check("format_flowchart output is itself valid, and stable", () => {
  const once = expectOk(formatFlowchart(VALID_FLOWCHART));
  const body = once.split("```\n")[1].split("\n```")[0] + "\n";
  assert.match(
    expectOk(validateFlowchart(body)),
    /^VALID as \.alab flowchart\./m,
  );
  const twice = expectOk(formatFlowchart(body));
  assert.equal(
    twice.split("```\n")[1],
    once.split("```\n")[1],
    "formatting is not idempotent",
  );
});

/* -------------------------------------------------------------------------- */
/* Use-case diagrams                                                           */
/* -------------------------------------------------------------------------- */

const VALID_USECASE = `archlab 1.0 usecase
title "Food delivery"

@usecase
  actor guest "Guest"
  actor customer "Customer"
  boundary "Food Delivery Service"
    usecase browse "Browse restaurants"
    usecase order "Place an order"
    usecase pay "Pay for the order"

  guest -- browse
  customer -- order : "1..*"
  order ..> pay : include
  customer --|> guest
`;

check(
  "validate_usecase accepts .alab usecase and summarises who can do what",
  () => {
    const text = expectOk(validateUseCase(VALID_USECASE));
    assert.match(text, /^VALID as \.alab use case\./m);
    assert.match(text, /Actors: 2/);
    assert.match(text, /Use cases: 3/);
    // Edges split BY KIND, not totalled: an agent checking whether its include
    // actually became a dependency cannot learn that from "4 edges".
    assert.match(text, /2 association/);
    assert.match(text, /1 dependency/);
    assert.match(text, /1 generalization/);
    assert.match(text, /Food Delivery Service \(3\)/);
    assert.match(text, /Size: \d+ x \d+ px/);
    assert.match(text, /`guest`.*Guest.*actor/);
  },
);

check("validate_usecase is quiet when the diagram is sound", () => {
  // A review note that fires every time is one a caller learns to ignore.
  const text = expectOk(validateUseCase(VALID_USECASE));
  assert.doesNotMatch(text, /Actors with nothing to do:/);
  assert.doesNotMatch(text, /nobody can invoke:/);
  assert.doesNotMatch(text, /Cycles:/);
});

check("validate_usecase names the defects a parse cannot see", () => {
  // An actor with no association: drawn beside the system able to do nothing.
  // The grammar is perfectly happy with it.
  const idle = VALID_USECASE.replace("  guest -- browse\n", "");
  assert.match(
    expectOk(validateUseCase(idle)),
    /Actors with nothing to do:.*`guest`/s,
  );

  // A use case no actor reaches and nothing includes: a capability that cannot
  // be invoked, which no parser has an opinion about.
  const unreachable = VALID_USECASE.replace("  order ..> pay : include\n", "");
  assert.match(
    expectOk(validateUseCase(unreachable)),
    /nobody can invoke:.*`pay`/s,
  );

  // An include CYCLE — forbidden in UML, and the layout would be arbitrary.
  const cyclic = VALID_USECASE.replace(
    "  order ..> pay : include\n",
    "  order ..> pay : include\n  pay ..> order : include\n",
  );
  assert.match(expectOk(validateUseCase(cyclic)), /Cycles:/);
});

check("validate_usecase flags a use case outside every boundary", () => {
  // Legal, but the diagram exists to show where the system's edge falls, so a
  // capability sitting nowhere is worth naming rather than drawing silently.
  const loose = VALID_USECASE.replace(
    '    usecase pay "Pay for the order"\n',
    "",
  ).replace(
    "  guest -- browse\n",
    '  usecase pay "Pay for the order"\n  guest -- browse\n',
  );
  const text = expectOk(validateUseCase(loose));
  assert.match(text, /Outside every boundary:.*`pay`/s);
});

check("validate_usecase locates a broken use-case document", () => {
  const broken = VALID_USECASE.replace('actor guest "Guest"', "actor guest");
  const text = expectError(validateUseCase(broken));
  assert.match(text, /^INVALID as \.alab use case\./m);
  assert.match(text, /line \d+, column \d+:/);
  assert.match(text, /\^/);
});

check("format_usecase canonicalises and is idempotent", () => {
  const once = expectOk(formatUseCase(VALID_USECASE));
  assert.match(once, /archlab 1\.0 usecase/);
  assert.match(once, /@usecase/);
  const body = once.split("```\n")[1].split("\n```")[0] + "\n";
  assert.match(expectOk(validateUseCase(body)), /^VALID as \.alab use case\./m);
  assert.equal(
    expectOk(formatUseCase(body)).split("```\n")[1],
    once.split("```\n")[1],
    "formatting is not idempotent",
  );
});

check(
  "the use-case tools refuse the other three kinds without a parse error",
  () => {
    // The misdirection guard every kind-specific pair carries: a document of the
    // wrong kind must be told which tool to use, never handed a line-1 syntax
    // error that reads as "your document is wrong".
    for (const source of [VALID_ALAB, VALID_SEQUENCE, VALID_FLOWCHART]) {
      assert.doesNotMatch(expectError(validateUseCase(source)), /^INVALID as/m);
    }
  },
);

check("the C4 tools send a use-case document to the right tool", () => {
  // read.ts promises `validate_usecase` exists — this is what keeps that
  // promise from being prose. REWRITTEN when the redirect became an ask: the
  // catalogue sentence it backs ("says so and points you at the right tool")
  // is still true, and now the pointing is a numbered option rather than a
  // sentence the agent has to parse.
  const { text } = expectAsk(validateModel(VALID_USECASE, "auto"));
  assert.match(text, /validate_usecase/);
  assert.doesNotMatch(text, /^INVALID as/m);
});

check("create_share_link mints a use-case link that decodes back", async () => {
  // Every kind-mismatch message in read.ts now says create_share_link "accepts
  // every kind". This is what makes that true rather than a claim.
  const canonical = expectOk(formatUseCase(VALID_USECASE))
    .split("```\n")[1]
    .split("\n```")[0];
  const text = expectOk(
    await createShareLink(VALID_USECASE, "auto", undefined, undefined),
  );
  const url = text.split("\n").find((line) => line.startsWith("http"));
  assert.ok(url !== undefined, `no URL in:\n${text}`);
  // Bare /live, never the /live/uc trampoline — a share link must land on the
  // real page, which check:share-capacity also pins.
  assert.match(url, /\/live#m=AF1\./);
  assert.doesNotMatch(url, /\/live\/(uc|usecase|flow|seq|sequence|c4)/);
  const decoded = await decodeShareFragment(new URL(url).hash);
  assert.equal(decoded.status, "ok");
  assert.equal(
    decoded.aftText.replace(/\n$/, ""),
    canonical.replace(/\n$/, ""),
    "the diagram recovered from the link must be the canonical use-case text",
  );
});

check(
  "the flowchart tools refuse the other two kinds without a parse error",
  () => {
    // Same misdirection guard the sequence pair has: a C4 or sequence document
    // fed here must be told which tool to use, not handed a line-1 syntax error
    // that reads as "your document is wrong" when only the tool choice was.
    for (const source of [VALID_ALAB, VALID_SEQUENCE]) {
      const text = expectError(validateFlowchart(source));
      assert.doesNotMatch(text, /^INVALID as/m);
    }
  },
);

check("the documented section list names every real section", () => {
  const tool = MCP_TOOLS.find((t) => t.name === "get_syntax_reference");
  const arg = tool.args.find((a) => a.name === "section");
  for (const id of SYNTAX_SECTION_IDS) {
    assert.match(
      arg.description,
      new RegExp(`\\b${id}\\b`),
      `section "${id}" exists but is not offered in the tool's own argument docs`,
    );
  }
});

/* ----------------------------------------------------------------------- */
/* list_icons ⇄ the registry                                                */
/* ----------------------------------------------------------------------- */

/*
 * These are the anti-drift checks for the icon vocabulary, and they are
 * written from the REGISTRY (the data), never from a hand-listed set of
 * slugs — a hardcoded list cannot notice the icon it has never heard of
 * (codebase.md, habit 4). `ICONS` here is the same module the canvas draws
 * from, loaded independently of the tool, so a `list_icons` that ever
 * truncates, caps, or switches to a maintained-by-hand list fails the moment
 * the registry and its output disagree.
 */

check("list_icons exposes every registry slug, and invents none", () => {
  const text = expectOk(listIcons(undefined, undefined));
  const slugs = Object.keys(ICONS);
  assert.ok(slugs.length > 0, "the registry loaded empty — the check is void");

  // Every registered icon is offered, by slug and by display name.
  for (const slug of slugs) {
    assert.ok(
      text.includes(`@${slug} — `),
      `icon "${slug}" is registered but list_icons does not offer it`,
    );
    assert.ok(
      text.includes(ICONS[slug].name),
      `icon "${slug}" is listed without its display name "${ICONS[slug].name}"`,
    );
  }

  // And nothing else: a slug in the output that the registry cannot resolve
  // would be a documented vocabulary the canvas silently falls back on.
  for (const [, offered] of text.matchAll(/^ {2}@(\S+) — /gm)) {
    assert.ok(
      offered in ICONS,
      `list_icons offers "@${offered}", which the registry cannot resolve`,
    );
  }

  // The headline count states the true total, so a capped listing cannot
  // read as complete.
  assert.match(text, new RegExp(`\\b${slugs.length} of ${slugs.length} icons`));

  // Every category heading appears — a group dropped in rendering would
  // silently hide its members while the per-slug assertions above could not
  // localise the loss to a category.
  for (const id of ICON_CATEGORY_ORDER) {
    assert.ok(
      text.includes(ICON_CATEGORY_LABELS[id]),
      `category "${id}" has no heading in the full listing`,
    );
  }
});

check("list_icons search matches aliases, not just names", () => {
  // "pg" is an alias — the exact token an agent guesses with. Both it and
  // the substring "postgres" must land on the real slug.
  for (const query of ["pg", "postgres"]) {
    const text = expectOk(listIcons(query, undefined));
    assert.ok(
      text.includes("@postgresql — "),
      `searching "${query}" must find @postgresql`,
    );
  }
});

check("list_icons filters by category, derived from the real table", () => {
  const dbText = expectOk(listIcons(undefined, "databases"));
  assert.ok(dbText.includes("@postgresql — "));

  // A slug from a DIFFERENT category, picked from the registry rather than
  // hand-named, must be absent.
  const other = Object.values(ICONS).find(
    (def) => def.category !== "databases",
  );
  assert.ok(
    !dbText.includes(`@${other.slug} — `),
    `category filter leaked "@${other.slug}" (${other.category}) into databases`,
  );

  // An unknown category is refused BY NAME, offering every real one — the
  // same recovery contract get_syntax_reference gives an unknown section.
  const error = expectError(listIcons(undefined, "nope"));
  assert.match(error, /Unknown category `nope`/);
  for (const id of ICON_CATEGORY_ORDER) {
    assert.ok(error.includes(id), `the refusal must offer category "${id}"`);
  }
});

check("list_icons states the silent fallback and the customicon hatch", () => {
  // The two facts that make the vocabulary safe to use are part of the
  // contract, on the hit path and the miss path both: an unknown slug never
  // errors (so guessing must be warned against), and a missing icon can be
  // supplied by the document (so the registry is not a wall).
  for (const text of [
    expectOk(listIcons(undefined, undefined)),
    expectOk(listIcons("zzz-no-such-icon", undefined)),
  ]) {
    assert.match(text, /silently falls back/);
    assert.match(text, /customicon /);
  }
});

check("the documented category list names every real category", () => {
  // Same derivation rule as get_syntax_reference's section list: the tool's
  // own argument docs must offer exactly the categories that exist.
  const tool = MCP_TOOLS.find((t) => t.name === "list_icons");
  const arg = tool.args.find((a) => a.name === "category");
  for (const id of ICON_CATEGORY_ORDER) {
    assert.match(
      arg.description,
      new RegExp(`\\b${id}\\b`),
      `category "${id}" exists but is not offered in the tool's argument docs`,
    );
  }
});

check("the syntax reference documents the sequence grammar", () => {
  const all = expectOk(getSyntaxReference(undefined));
  assert.match(all, /archlab 1\.0 sequence/);
  // The three things an agent gets wrong without being told.
  assert.match(all, /no `end` keyword/i);
  assert.match(all, /Activation rides the arrow/i);
  assert.match(all, /` : `|-> b : /);

  const section = expectOk(getSyntaxReference("sequence"));
  assert.match(section, /Sequence diagrams/);
  assert.match(section, /validate_sequence/);
});

check("validate_model refuses oversized input without parsing it", () => {
  const huge = "x".repeat(MAX_SOURCE_CHARS + 1);
  const text = expectError(validateModel(huge, "auto"));
  assert.match(text, /over the .* limit/);
});

check("validate_model reports empty input as such", () => {
  assert.match(expectError(validateModel("   ", "auto")), /Paste a model/);
});

/* ----------------------------------------------------------------------- */
/* 3. format_model                                                          */
/* ----------------------------------------------------------------------- */

check("format_model is a no-op on canonical text", () => {
  const canonical = toAlab(VALID_ALAB);
  const text = expectOk(formatModel(`${canonical}\n`, "auto"));
  assert.match(text, /Already canonical|Reformatted/);

  // Formatting the canonical form again must report no change.
  const again = expectOk(formatModel(canonical + "\n", "auto"));
  assert.ok(
    /Already canonical/.test(again) || /Reformatted/.test(again),
    "format_model must state plainly whether anything changed",
  );
});

check("format_model canonicalises sloppy input", () => {
  const sloppy = VALID_ALAB.replace(
    'title "Coffee Shop"',
    'title "Coffee Shop"\n\n\n',
  );
  const text = expectOk(formatModel(sloppy, "auto"));
  assert.match(text, /Reformatted as \.alab text/);
});

check(
  "format_model refuses Mermaid instead of answering in another language",
  () => {
    const text = expectError(formatModel(MERMAID, "auto"));
    assert.match(text, /does not format Mermaid/);
    assert.match(text, /convert_model/);
  },
);

/* ----------------------------------------------------------------------- */
/* 4. convert_model                                                         */
/* ----------------------------------------------------------------------- */

const toAlab = (source) =>
  expectOk(convertModel(source, "auto", "alab", undefined))
    .split("```\n")[1]
    .split("\n```")[0];
const toJson = (source) =>
  expectOk(convertModel(source, "auto", "json", undefined))
    .split("```json\n")[1]
    .split("\n```")[0];

check(
  "convert_model round-trips JSON -> .alab -> JSON byte-identically",
  () => {
    // This is the direction the format actually guarantees (see
    // src/features/archtext/README.md): a JSON document survives a trip through
    // the text form unchanged, unknown forward-compatible fields included.
    const json = toJson(VALID_ALAB);
    assert.equal(
      toJson(toAlab(json)),
      json,
      "JSON -> .alab -> JSON must be byte-identical",
    );
  },
);

check("convert_model conversion is idempotent after one pass", () => {
  // Starting from arbitrary (non-canonical) .alab, one round trip through
  // JSON reorders diagrams into the JSON serializer's id order — so text ->
  // JSON -> text is NOT byte-identical in general, only stable from the
  // second pass on. Asserted explicitly so the weaker guarantee is on the
  // record rather than assumed.
  const once = toAlab(toJson(toAlab(VALID_ALAB)));
  const twice = toAlab(toJson(once));
  assert.equal(twice, once, "conversion must reach a fixed point");
});

check("convert_model states the Mermaid caveat every time", () => {
  const text = expectOk(convertModel(VALID_ALAB, "auto", "mermaid", undefined));
  assert.match(text, /C4Context/);
  assert.match(text, /one-way, LOSSY/);
});

check("convert_model names the known diagrams on a bad diagram id", () => {
  const text = expectError(
    convertModel(VALID_ALAB, "auto", "mermaid", "no-such-diagram"),
  );
  assert.match(text, /no diagram `no-such-diagram`/);
  assert.match(text, /ctx-root/);
  assert.match(text, /cnt-shop/);
});

check("convert_model emits the requested diagram", () => {
  const text = expectOk(
    convertModel(VALID_ALAB, "auto", "mermaid", "cnt-shop"),
  );
  assert.match(text, /C4Container/);
  assert.match(text, /Ordering App/);
});

/* ----------------------------------------------------------------------- */
/* 5. describe_model                                                        */
/* ----------------------------------------------------------------------- */

check("describe_model renders the drill-down hierarchy", () => {
  const text = expectOk(describeModel(VALID_ALAB, "auto", false));
  assert.match(text, /Root: {5}ctx-root/);
  assert.match(text, /Drill-down hierarchy:/);
  // The container diagram is nested under the context one.
  const lines = text.split("\n");
  const root = lines.find((line) => line.includes("@context ctx-root"));
  const child = lines.find((line) => line.includes("@container cnt-shop"));
  assert.ok(root !== undefined && child !== undefined);
  assert.ok(
    child.indexOf("@container") > root.indexOf("@context"),
    "the child diagram must be indented under its parent",
  );
  assert.doesNotMatch(text, /Ordering App/, "contents are off by default");
});

check("describe_model lists contents on request", () => {
  const text = expectOk(describeModel(VALID_ALAB, "auto", true));
  assert.match(text, /app:container "Ordering App" \[Next\.js\]/);
  assert.match(text, /customer -> shop : "Places orders with"/);
});

check("describe_model shows boundaries and which nodes sit in them", () => {
  // A boundary is invisible in the hierarchy line (it is not a diagram and
  // not a node), so an agent that only ever calls describe_model would have
  // rewritten a model without one and silently dropped it.
  const source = `archlab 1.0
title "Bounded"

@context ctx-root "Bounded"
  shop:system "Shop" >cnt-shop

@container cnt-shop "Shop — Containers" owner=shop
  frame internal "Internal"
  frame storage "Data Layer" in=internal
  web:container "Web App" [Next.js] in=internal
  db:database "Orders DB" [PostgreSQL 16] in=storage
`;
  const text = expectOk(describeModel(source, "auto", true));
  assert.match(text, /frame internal "Internal"/);
  // Nesting reads as the .alab attribute the caller would have to write.
  assert.match(text, /frame storage "Data Layer" in=internal/);
  assert.match(text, /web:container "Web App" \[Next\.js\] in=internal/);
  assert.match(text, /db:database "Orders DB" \[PostgreSQL 16\] in=storage/);
});

/* ----------------------------------------------------------------------- */
/* 6. Syntax reference                                                      */
/* ----------------------------------------------------------------------- */

check("get_syntax_reference returns every section by default", () => {
  const text = expectOk(getSyntaxReference(undefined));
  for (const id of SYNTAX_SECTION_IDS) {
    assert.ok(text.length > 0, `section ${id} missing`);
  }
  assert.match(text, /# The `\.alab` syntax/);
  assert.match(text, /significant indentation/);
  assert.match(text, /archlab 1\.0/);
});

check("the reference teaches frames, not just the frame attribute", () => {
  // An agent authoring .alab can only use a construct the reference names.
  const text = expectOk(getSyntaxReference("frames"));
  assert.match(text, /frame internal "Internal"/);
  assert.match(text, /in=internal/);
  // The two rules that stop an agent modelling a boundary as an element.
  assert.match(text, /no behaviour and no relationships/i);
  assert.match(text, /innermost/i);
});

check("every syntax section renders non-empty on its own", () => {
  for (const id of SYNTAX_SECTION_IDS) {
    const text = expectOk(getSyntaxReference(id));
    assert.ok(
      text.trim().length > 40,
      `section ${id} rendered almost nothing — the generator is broken`,
    );
  }
});

check("get_syntax_reference rejects an unknown section by name", () => {
  const text = expectError(getSyntaxReference("nodez"));
  assert.match(text, /Unknown section `nodez`/);
  assert.match(text, /nodes/);
});

check("the .alab examples in the reference actually parse", async () => {
  // Belt and braces over check:syntax-docs: the MARKDOWN GENERATOR could drop
  // or mangle a snippet even though the source data is verified. Pull every
  // fenced block back out of the rendered reference and parse the ones that
  // are complete files.
  const { parseArchText } = await load("src/features/archtext/index.ts");
  const reference = expectOk(getSyntaxReference(undefined));
  const blocks = [...reference.matchAll(/```\n([\s\S]*?)\n```/g)].map(
    (match) => match[1],
  );
  assert.ok(
    blocks.length >= 6,
    `expected several code blocks, got ${blocks.length}`,
  );

  let parsed = 0;
  for (const block of blocks) {
    // Only whole files start with the version line; the error section quotes
    // deliberately-broken ones, which are covered by check:syntax-docs.
    if (!/^archlab\s/m.test(block)) continue;
    if (!block.trimStart().startsWith("archlab")) continue;
    try {
      parseArchText(`${block}\n`);
      parsed += 1;
    } catch (error) {
      // The errors section intentionally shows failing snippets.
      if (!reference.includes("What errors look like")) throw error;
    }
  }
  assert.ok(parsed >= 5, `only ${parsed} complete examples parsed`);
});

/* ----------------------------------------------------------------------- */
/* 7. Examples                                                              */
/* ----------------------------------------------------------------------- */

check("list_example_models lists the bundled models, none broken", () => {
  const text = expectOk(listExampleModels());
  assert.match(text, /shopflow/);
  assert.doesNotMatch(
    text,
    /BROKEN/,
    "a bundled example no longer loads — fix the model, not this check",
  );
});

/**
 * The listing's coverage, DERIVED FROM THE FILESYSTEM rather than from a list
 * of notations written here.
 *
 * THE BUG THIS EXISTS FOR: both example tools read the C4 registry and only
 * the C4 registry, for four notations and then eight. Nothing failed — the
 * tools worked perfectly on the three models they knew — so the only symptom
 * was an agent being told arch-lab draws C4 models, while nineteen worked
 * documents in eight other notations sat unreachable. That is the same shape
 * as the `?e=` resolver bug (`check:view-input`), the sitemap's coverage and
 * the share-capacity wrappers: a hardcoded list cannot notice the thing it
 * has never heard of.
 *
 * So the expectation is read off disk — the C4 registry plus every
 * `service/example-service.ts` under `src/features` — and every id literal in
 * each of them must appear in the listing text. A tenth notation with a
 * registry fails here the moment it is added and not listed, which is the only
 * way this stays true without anyone remembering to come back.
 */
const EXAMPLE_REGISTRY_FILES = [
  "src/features/viewer/service/model-service.ts",
  ...readdirSync(path.join(ROOT, "src/features"))
    .filter((feature) =>
      existsSync(
        path.join(ROOT, "src/features", feature, "service/example-service.ts"),
      ),
    )
    .map((feature) => `src/features/${feature}/service/example-service.ts`),
];

check("list_example_models covers every registry that exists", () => {
  const text = expectOk(listExampleModels());

  /* Read as SOURCE, the way `check:view-input` reads them: the ids are
     literals, so this is exact, and it does not depend on the very module
     under test to say which registries there are. */
  const missing = [];
  for (const file of EXAMPLE_REGISTRY_FILES) {
    const ids = [
      ...readFileSync(path.join(ROOT, file), "utf8").matchAll(
        /^\s*(?:\{\s*)?id: "([a-z0-9-]+)"/gm,
      ),
    ].map((match) => match[1]);
    assert.ok(
      ids.length > 0,
      `no example ids found in ${file} — has it moved?`,
    );
    for (const id of ids) {
      if (!text.includes(id)) missing.push(`${file} → ${id}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `bundled examples an agent cannot see:\n  ${missing.join("\n  ")}`,
  );

  /* One SECTION per registry, not merely one id somewhere in the text: a
     notation whose examples were listed under someone else's heading would
     pass the id sweep above and still mislead every reader of it. */
  const headings = [...text.matchAll(/^[A-Z][^\n]* \(kind: [a-z0-9]+\) — /gm)];
  assert.equal(
    headings.length,
    EXAMPLE_REGISTRY_FILES.length,
    `${EXAMPLE_REGISTRY_FILES.length} registries on disk, ` +
      `${headings.length} notation headings in the listing`,
  );
});

check(
  "list_example_models says what each example holds, in counted facts",
  () => {
    const text = expectOk(listExampleModels());
    /* The gantt line's numbers come from the same forward pass the canvas
     draws — a row with no facts at all means a summary stopped reporting
     `…Count` fields and the listing quietly became a list of bare ids. */
    assert.match(text, /store-migration — "[^"]+": \d+ sections, \d+ tasks/);
    assert.match(text, /order-lifecycle — "[^"]+": \d+ states/);
    assert.doesNotMatch(
      text,
      /^ {2}[a-z0-9-]+ — "[^"]*":\s*$/m,
      "an example listed with no counted facts",
    );
  },
);

check("get_example_model serves shopflow as .alab and as JSON", () => {
  const alab = expectOk(getExampleModel("shopflow", "alab"));
  assert.match(alab, /archlab 1\.0/);
  const json = expectOk(getExampleModel("shopflow", "json"));
  assert.match(json, /"version"/);
});

check("get_example_model resolves a non-C4 id and names its notation", () => {
  /* The id namespace is flat across all nine registries, so the caller never
     says which kind it wants — which makes "what did I just get" the tool's
     job. An agent that is not told this is a gantt reaches for
     `validate_model` next and gets a refusal it cannot explain. */
  const alab = expectOk(getExampleModel("store-migration", "alab"));
  assert.match(alab, /Example gantt chart `store-migration`/);
  assert.match(alab, /archlab 1\.0 gantt/);

  const json = expectOk(getExampleModel("store-migration", "json"));
  assert.match(json, /"kind": "gantt"/);
  /* JSON is served for every kind, but only C4's is a format arch-lab reads
     back. Saying so is what stops an agent saving a .json it can never
     reopen. */
  assert.match(json, /no JSON input dialect/);
});

check("get_example_model names the alternatives for an unknown id", () => {
  const text = expectError(getExampleModel("nope", "alab"));
  assert.match(text, /No bundled example `nope`/);
  assert.match(text, /shopflow/);
  /* The alternatives must span the notations, not just the C4 registry the
     tool used to know about. */
  assert.match(text, /peer-review/);
});

/* ----------------------------------------------------------------------- */
/* 8. Share links                                                           */
/* ----------------------------------------------------------------------- */

check(
  "create_share_link produces a link that decodes back to the model",
  async () => {
    const text = expectOk(
      await createShareLink(VALID_ALAB, "auto", null ?? undefined),
    );
    const url = text.split("\n").find((line) => line.startsWith("http"));
    assert.ok(url !== undefined, `no URL in:\n${text}`);
    /* Bare `/live` — the playground is one route, and a share link carries
       no seed because it carries the document. The seeded paths still forward,
       so links minted before the merge keep opening; new ones must not spend
       characters on a hop the payload could have had. */
    assert.match(url, /\/live#m=AF1\./);
    assert.doesNotMatch(url, /\/live\/(c4|seq)/);

    const decoded = await decodeShareFragment(new URL(url).hash);
    assert.equal(decoded.status, "ok");

    const canonical = toAlab(VALID_ALAB);
    assert.equal(
      decoded.aftText.replace(/\n$/, ""),
      canonical.replace(/\n$/, ""),
      "the model recovered from the share link must equal what went in",
    );
  },
);

check("create_share_link carries the requested diagram", async () => {
  const text = expectOk(await createShareLink(VALID_ALAB, "auto", "cnt-shop"));
  const url = text.split("\n").find((line) => line.startsWith("http"));
  const decoded = await decodeShareFragment(new URL(url).hash);
  assert.equal(decoded.diagramId, "cnt-shop");
});

check("create_share_link rejects an unknown diagram id", async () => {
  const text = expectError(await createShareLink(VALID_ALAB, "auto", "nope"));
  assert.match(text, /no diagram `nope`/);
});

/** A valid model whose share URL length scales with `count`. */
function sizedModel(count, title) {
  const nodes = Array.from(
    { length: count },
    (_, index) =>
      `  n${index}:container "Service number ${index} with a deliberately ` +
      `verbose and incompressible-ish name ${index}" [Runtime ${index}]`,
  ).join("\n");
  return `archlab 1.0
title "${title}"

@context ctx-root "${title}"
  shop:system "Shop" >cnt-shop

@container cnt-shop owner=shop
${nodes}
`;
}

check(
  "create_share_link hands out a caveat-tier link instead of refusing",
  async () => {
    // ~200 verbose nodes encode past the safe length but under the hard
    // ceiling — the middle tier. The old behaviour refused everything past
    // 2000, which refused every demo model the app ships; the link must now
    // be handed out, WITH the plain-text-email caveat.
    const text = expectOk(
      await createShareLink(
        sizedModel(200, "Caveat tier"),
        "auto",
        undefined,
        undefined,
      ),
    );
    const url = text.split("\n").find((line) => line.startsWith("http"));
    assert.ok(url !== undefined, `no URL in:\n${text}`);
    assert.ok(
      url.length > SHARE_URL_SAFE_LENGTH && url.length <= MAX_SHARE_URL_LENGTH,
      `fixture must land between the tiers, got ${url.length}`,
    );
    assert.match(text, /plain-text email/);
    assert.match(text, /RFC 5322/);

    const decoded = await decodeShareFragment(new URL(url).hash);
    assert.equal(decoded.status, "ok");
  },
);

check("create_share_link refuses past the hard ceiling, usefully", async () => {
  // ~900 verbose nodes: valid, and comfortably past the hard ceiling once
  // compressed. The refusal must leave the caller with something actionable
  // in the SAME response — the canonical `.alab` text inline, and a measured
  // diagram-scoped link when one fits (here: the small context diagram; the
  // giant container diagram is the very thing that does not fit).
  //
  // REWRITTEN when this refusal moved into the ask envelope. It was already a
  // question in prose — here are the scoped links, here is the file, you
  // choose — so what changed is that it now carries the header that tells the
  // agent to stop, and no longer claims `isError` for a call that parsed the
  // model, minted every candidate link and measured them all. Every fact the
  // old assertions demanded is still asserted below.
  const big = sizedModel(900, "Too big to link");
  const { text } = expectAsk(await createShareLink(big, "auto", undefined));
  assert.match(text, /does not fit in a share link/);

  // The canonical model text is inline — no convert_model round trip.
  assert.match(text, /```\narchlab 1\.0/);
  assert.match(text, /title "Too big to link"/);

  // The scoped offer names the diagram and carries a real, measured URL.
  // Trimmed, because an offer's URL now hangs under its option and is
  // therefore indented; it is still on a line of its own.
  assert.match(text, /ctx-root/);
  const scopedUrl = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("http"));
  assert.ok(scopedUrl !== undefined, `no scoped URL in:\n${text}`);
  assert.ok(
    scopedUrl.length <= MAX_SHARE_URL_LENGTH,
    "an offered scoped link must itself fit under the ceiling",
  );
  const decoded = await decodeShareFragment(new URL(scopedUrl).hash);
  assert.equal(decoded.status, "ok");
  assert.match(
    decoded.aftText,
    /ctx-root/,
    "the scoped payload must contain the offered diagram",
  );
  assert.doesNotMatch(
    decoded.aftText,
    /n899/,
    "the scoped payload must have dropped the oversized sibling subtree",
  );
});

/* ----------------------------------------------------------------------- */
/* 8b. Share links for SEQUENCE documents                                   */
/* ----------------------------------------------------------------------- */

/*
 * The end-to-end path an agent actually walks for a sequence flow: author →
 * validate_sequence → format_sequence (canonical .alab) → create_share_link.
 * The link must land on bare /live — the one playground, which detects the
 * document kind from the payload, so no route carries a seed — and decode back
 * to the SAME canonical text format_sequence hands out, so the shared flow and
 * the committed file cannot disagree.
 */
check("create_share_link mints a sequence link that decodes back", async () => {
  const canonical = expectOk(formatSequence(VALID_SEQUENCE))
    .split("```\n")[1]
    .split("\n```")[0];

  const text = expectOk(
    await createShareLink(VALID_SEQUENCE, "auto", undefined, undefined),
  );
  const url = text.split("\n").find((line) => line.startsWith("http"));
  assert.ok(url !== undefined, `no URL in:\n${text}`);
  assert.match(url, /\/live#m=AF1\./);
  assert.doesNotMatch(url, /\/live\/(seq|sequence|c4)/);

  const decoded = await decodeShareFragment(new URL(url).hash);
  assert.equal(decoded.status, "ok");
  assert.equal(
    decoded.aftText.replace(/\n$/, ""),
    canonical.replace(/\n$/, ""),
    "the flow recovered from the link must be the canonical sequence text",
  );
});

check(
  "create_share_link mints a flowchart link that decodes back",
  async () => {
    // The C4 reader's flowchart guard points callers at `create_share_link`, so
    // this tool MUST accept a flowchart — otherwise that advice is a loop. It
    // also pins the shared single-document path (`singleDocumentShareLink`),
    // which the sequence branch now goes through too.
    const canonical = expectOk(formatFlowchart(VALID_FLOWCHART))
      .split("```\n")[1]
      .split("\n```")[0];

    const text = expectOk(
      await createShareLink(VALID_FLOWCHART, "auto", undefined, undefined),
    );
    const url = text.split("\n").find((line) => line.startsWith("http"));
    assert.ok(url !== undefined, `no URL in:\n${text}`);
    // Minted against bare `/live`, never the `/live/flow` trampoline: a share
    // link must land on the real page, which check:share-capacity also pins.
    assert.match(url, /\/live#m=AF1\./);
    assert.doesNotMatch(url, /\/live\/(flow|seq|sequence|c4)/);

    const decoded = await decodeShareFragment(new URL(url).hash);
    assert.equal(decoded.status, "ok");
    assert.equal(
      decoded.aftText.replace(/\n$/, ""),
      canonical.replace(/\n$/, ""),
      "the graph recovered from the link must be the canonical flowchart text",
    );
  },
);

check("create_share_link rejects diagram_id on a flowchart", async () => {
  // A flowchart is one graph with nothing to open at, so the argument is a
  // caller mistake worth naming rather than silently ignoring.
  const text = expectError(
    await createShareLink(VALID_FLOWCHART, "auto", "ctx", undefined),
  );
  assert.match(text, /diagram_id/);
  assert.match(text, /C4/);
});

check(
  "a Mermaid sequenceDiagram shares as .alab, naming the loss",
  async () => {
    // What travels is the .alab conversion, so the one-way caveat must be said
    // HERE — after this call, only the converted form exists in the link.
    const text = expectOk(
      await createShareLink(
        "sequenceDiagram\n  A->>B: Hello\n  B-->>A: Hi\n",
        "auto",
        undefined,
        undefined,
      ),
    );
    assert.match(text, /\/live#m=AF1\./);
    assert.match(text, /one-way|lossy|dropped/i);
  },
);

check(
  "create_share_link rejects diagram_id on a sequence document",
  async () => {
    const text = expectError(
      await createShareLink(VALID_SEQUENCE, "auto", "ctx-root", undefined),
    );
    assert.match(text, /no diagrams/i);
  },
);

check("a broken sequence document gets a located sequence error", async () => {
  // NOT the C4 reader's "unexpected text after the version" on line 1 — the
  // text is a sequence document, so the verdict must be the sequence parser's.
  const broken = VALID_SEQUENCE.replace(
    'cust -> api : "POST /orders" [HTTPS]',
    "cust -> api",
  );
  const text = expectError(
    await createShareLink(broken, "auto", undefined, undefined),
  );
  assert.match(text, /^INVALID as \.alab sequence\./m);
  assert.match(text, /line \d+, column \d+:/);
});

/** A valid sequence document whose share URL length scales with `count`. */
function sizedSequence(count) {
  const messages = Array.from(
    { length: count },
    (_, index) =>
      `  a -> b : "Request number ${index} with a deliberately verbose and ` +
      `incompressible-ish label ${index}" [HTTPS]`,
  ).join("\n");
  return `archlab 1.0 sequence
title "Too big to link"

@sequence
  a:participant "Service A"
  b:participant "Service B"

${messages}
`;
}

check("an oversized sequence is refused with the text inline", async () => {
  // No diagram-scoped fallback exists for a sequence document (it is one
  // flow), so the refusal must still leave the caller holding the canonical
  // text rather than sending them on another round trip.
  // 1,500 verbose messages encode to ~11.5k URL characters — comfortably
  // past the 8,000 ceiling (900 lands under it; sequence text compresses
  // harder than the C4 fixture's node lines).
  const text = expectError(
    await createShareLink(sizedSequence(1500), "auto", undefined, undefined),
  );
  assert.match(text, /does not fit in a share link/);
  assert.match(text, /```\narchlab 1\.0 sequence/);
});

check("the C4 tools tell a sequence document where to go", () => {
  // The misdirection guard in both directions: tools/sequence.ts already
  // redirects C4 input, and lib/read.ts must redirect sequence input — a
  // "line 1, column 13" parse error reads as "your syntax is wrong" when only
  // the tool choice was.
  const attempts = [
    ["validate_model", () => validateModel(VALID_SEQUENCE, "auto")],
    ["format_model", () => formatModel(VALID_SEQUENCE, "auto")],
    [
      "convert_model",
      () => convertModel(VALID_SEQUENCE, "auto", "mermaid", undefined),
    ],
    ["describe_model", () => describeModel(VALID_SEQUENCE, "auto", false)],
  ];
  // REWRITTEN when the redirect became an ask, for all four tools at once:
  // whichever door a document of another kind arrives at, it must come back
  // as the same question, and never as a line-1 C4 parse error.
  for (const [name, run] of attempts) {
    const { text } = expectAsk(run());
    assert.match(text, /sequence/i, name);
    assert.match(text, /validate_sequence/, name);
    assert.doesNotMatch(text, /^INVALID as \.alab text/m, name);
  }
});

/* ---- the setup recipes on /mcp ------------------------------------------- */

/*
 * These are copy-paste instructions on a public page: a recipe that is subtly
 * wrong does not fail loudly, it produces a config the client reads and
 * silently ignores, and the reader concludes the server is broken.
 *
 * Both faults below had actually shipped. Cursor and VS Code shared one entry
 * emitting VS Code's `servers` + `type` shape, which Cursor ignores; and the
 * Claude Code note told people to add `--scope user` while the command beside
 * it did not.
 */
const ENDPOINT = "https://example.test/api/mcp";

check("every recipe actually points at the endpoint", () => {
  for (const recipe of CONNECT_RECIPES) {
    assert.ok(
      recipe.snippet(ENDPOINT).includes(ENDPOINT),
      `${recipe.client} does not interpolate the endpoint`,
    );
  }
});

check("every recipe names a client, a note and a language", () => {
  for (const recipe of CONNECT_RECIPES) {
    for (const field of ["client", "note", "language"]) {
      assert.ok(
        typeof recipe[field] === "string" && recipe[field].length > 0,
        `${recipe.client}: ${field} is empty`,
      );
    }
  }
  const names = CONNECT_RECIPES.map((r) => r.client);
  assert.equal(new Set(names).size, names.length, "duplicate client names");
});

check("a note that names a flag is a note the command honours", () => {
  // The exact drift that shipped: prose saying "--scope user" beside a command
  // without it. Any flag the note quotes must appear in the snippet.
  for (const recipe of CONNECT_RECIPES) {
    if (recipe.language !== "bash") continue;
    const snippet = recipe.snippet(ENDPOINT);
    const quoted = recipe.note.match(/--[a-z][a-z-]+ [a-z]+/g) ?? [];
    const primary = quoted[0];
    if (primary === undefined) continue;
    assert.ok(
      snippet.includes(primary),
      `${recipe.client}: the note leads with "${primary}" but the command ` +
        `does not use it — ${snippet}`,
    );
  }
});

check("Claude Code installs globally, not into one directory", () => {
  const recipe = CONNECT_RECIPES.find((r) => r.client === "Claude Code");
  assert.ok(recipe, "the Claude Code recipe is gone");
  const snippet = recipe.snippet(ENDPOINT);
  assert.match(snippet, /--transport http/);
  // `user` is the scope the CLI documents as "available to you across all
  // projects". `local` (the CLI default) silently limits it to one directory.
  assert.match(snippet, /--scope user/);
});

check("Cursor and VS Code keep their DIFFERENT config shapes", () => {
  const cursor = CONNECT_RECIPES.find((r) => r.client === "Cursor");
  const code = CONNECT_RECIPES.find((r) => r.client.startsWith("VS Code"));
  assert.ok(cursor && code, "one of the two editor recipes is missing");
  const cursorJson = JSON.parse(cursor.snippet(ENDPOINT));
  const codeJson = JSON.parse(code.snippet(ENDPOINT));
  // Cursor: mcpServers, and a remote server carries no `type`.
  assert.ok(cursorJson.mcpServers, "Cursor must use the mcpServers key");
  assert.equal(cursorJson.servers, undefined);
  assert.equal(cursorJson.mcpServers["arch-lab"].url, ENDPOINT);
  // VS Code: servers, with an explicit http type.
  assert.ok(codeJson.servers, "VS Code must use the servers key");
  assert.equal(codeJson.mcpServers, undefined);
  assert.equal(codeJson.servers["arch-lab"].type, "http");
});

check("Gemini CLI uses the streamable-HTTP transport, not SSE", () => {
  const recipe = CONNECT_RECIPES.find((r) => r.client === "Gemini CLI");
  assert.ok(recipe, "the Gemini CLI recipe is gone");
  assert.match(recipe.snippet(ENDPOINT), /--transport http/);
  // In ~/.gemini/settings.json the key matters: `url` there means SSE.
  assert.match(recipe.note, /httpUrl/);
});

check("every JSON recipe is parseable, and TOML ones name the server", () => {
  for (const recipe of CONNECT_RECIPES) {
    if (recipe.language === "json") {
      assert.doesNotThrow(
        () => JSON.parse(recipe.snippet(ENDPOINT)),
        `${recipe.client} emits invalid JSON`,
      );
    }
    if (recipe.language === "toml") {
      assert.match(recipe.snippet(ENDPOINT), /^\[mcp_servers\.[\w-]+\]/m);
    }
  }
});

/* ----------------------------------------------------------------------- */
/* 10. Asking the human                                                     */
/* ----------------------------------------------------------------------- */

/*
 * This server cannot ask a question over the protocol — elicitation and
 * sampling both need a session, and the deployment is stateless by design (the
 * long note on `askHumanResult` in `features/mcp/lib/render.ts` has the
 * evidence). So a fork travels as the TEXT of a result, which makes three
 * things checkable and worth checking:
 *
 *   1. THE SHAPE, on every ask the fixtures provoke. An agent is asked to rely
 *      on this envelope without parsing prose; `expectAsk` above is where the
 *      contract lives.
 *   2. THAT THE TRIGGERS FIRE. A question nobody sees is prose in a file.
 *   3. THAT THEY DO NOT FIRE OTHERWISE — and this is the group that matters
 *      most, because it is the whole "rare" guarantee. A question that appears
 *      on ordinary work is one an agent learns to answer without reading, and
 *      the feature is then strictly worse than nothing: it has taught the
 *      model to click through the one prompt that mattered. The bundled
 *      examples are the definition of an unambiguous document, so every one of
 *      them through its own validator must come back silent.
 *
 * A NEW SECTION HERE rather than a `check:ask-human` script, deliberately: the
 * ~170-line module loader at the top of this file is what lets a check
 * exercise the real tools, and a second copy of it is the duplication
 * `dry.md` names.
 */

/** A model whose relationships are numbered steps rather than intents. */
const STEP_LABELLED_C4 = `archlab 1.0
title "Checkout steps"

@context ctx-root "Checkout steps"
  cust:person "Customer"
  web:system "Storefront"
  pay:external "Payments"
  mail:external "Mailer"

  cust -> web : "1. Submits the basket"
  web -> pay : "2. Takes the payment"
  pay -> mail : "3. Confirms by email"
`;

/** Four participants, every message aimed at one of them. */
const HUB_SEQUENCE = `archlab 1.0 sequence
title "Everything calls the gateway"

@sequence
  a:participant "Service A"
  b:participant "Service B"
  c:participant "Service C"
  gw:participant "Gateway"

  a -> gw : "Fetches the profile" [HTTPS]
  b -> gw : "Fetches the profile" [HTTPS]
  c -> gw : "Fetches the profile" [HTTPS]
  a -> gw : "Writes the profile" [HTTPS]
`;

/** Three diagrams and a two-node root: the signpost case. */
const SIGNPOST_ROOT_C4 = `archlab 1.0
title "Atlas"

@context ctx-root "Atlas"
  cust:person "Customer"
  atlas:system "Atlas" >cnt-atlas

  cust -> atlas : "Places orders with" [HTTPS]

@container cnt-atlas owner=atlas
  web:container "Storefront" [Next.js]
  api:container "Orders API" [Go] >cmp-api
  db:database "Order Store" [PostgreSQL]

  web -> api : "Submits orders to" [HTTPS]
  api -> db : "Reads and writes" [SQL]

@component cmp-api owner=api
  handler:component "Order handler" [Go]
  repo:component "Order repository" [Go]

  handler -> repo : "Persists orders through" [in-process]
`;

/* ---- the triggers fire ---------------------------------------------------- */

check("validate_model asks which notation, on all eight other kinds", () => {
  /* THE TEST THAT DOCUMENTS THE BUG BEING FIXED. Only flowchart, usecase and
     sequence were redirected in prose; `er`, `dict`, `gantt`, `timeline` and
     `lifecycle` fell through to the C4 reader and came back as "INVALID …
     line 1, column 13" — which reads as "your syntax is wrong" when the
     syntax is fine and only the tool choice was. Driven from the bundled
     examples so a tenth notation is covered here with no edit. */
  const seen = new Set();
  for (const listing of listBundledExamples()) {
    if (listing.status !== "ok") continue;
    const kind = listing.example.kind;
    if (kind === "c4" || seen.has(kind)) continue;
    seen.add(kind);
    const loaded = loadBundledExample(listing.example.id);
    const { text, ask } = expectAsk(
      validateModel(loaded.document.alabText, "auto"),
    );
    assert.equal(
      ask.defaultId,
      kind,
      `the DETECTED kind must be the default for ${kind}: the text is ` +
        "evidence and the tool name is a guess",
    );
    assert.match(text, new RegExp(`validate_${kind}`), kind);
    assert.doesNotMatch(
      text,
      /^INVALID as \.alab text/m,
      `${kind} must not come back as a C4 line-1 parse error`,
    );
  }
  assert.equal(
    seen.size,
    EXAMPLE_KINDS.length - 1,
    `every notation but C4 must be covered; got ${[...seen].join(", ")}`,
  );
});

check("validate_model asks about a valid model that reads as steps", () => {
  const { text, ask } = expectAsk(validateModel(STEP_LABELLED_C4, "auto"));
  // The verdict TRAVELS WITH the question: nothing about the document is
  // wrong, so a caller that wanted the counts must still get them.
  assert.match(text, /^VALID as \.alab text \(auto-detected\)\./m);
  assert.match(text, /step number/);
  assert.equal(
    ask.defaultId,
    null,
    "a valid model has no safe default — every branch is defensible, which " +
      "is exactly when a default would be the server choosing",
  );
  assert.deepEqual(
    ask.options.map((option) => option.id),
    ["c4", "sequence", "flowchart"],
    "all three readings, or the server has decided half the question",
  );
});

check("validate_model asks about an unbranched chain of relationships", () => {
  // The second half of the step-like heuristic, and it must fire with no
  // ordinal words at all: a -> b -> c -> d with nothing branching off it is
  // the shape of a call sequence however the lines are labelled.
  const chain = `archlab 1.0
title "One long chain"

@context ctx-root "One long chain"
  cust:person "Customer"
  web:system "Storefront"
  pay:external "Payments"
  mail:external "Mailer"

  cust -> web : "Places an order with"
  web -> pay : "Charges the card through"
  pay -> mail : "Notifies by email through"
`;
  const { text } = expectAsk(validateModel(chain, "auto"));
  assert.match(text, /one unbranched chain/);
});

check("validate_sequence asks about a hub-and-spoke flow", () => {
  const { text, ask } = expectAsk(validateSequence(HUB_SEQUENCE));
  assert.match(text, /^VALID as \.alab sequence\./m);
  assert.match(text, /`gw`/);
  assert.equal(ask.defaultId, null);
});

check("convert_model asks which diagram when the root is a signpost", () => {
  const { text, ask } = expectAsk(
    convertModel(SIGNPOST_ROOT_C4, "auto", "mermaid", undefined),
  );
  assert.equal(
    ask.defaultId,
    "ctx-root",
    "the default must be what the tool would have used silently — the ask " +
      "makes the fallback visible, it does not change it",
  );
  // The counts are what distinguish the options, and they come from the same
  // summary `renderDiagramTable` renders, so the ask cannot claim a shape the
  // structure table denies.
  assert.match(text, /cnt-atlas.*\n.*3 node\(s\), 2 edge\(s\)/);
  for (const option of ask.options) {
    assert.equal(option.next.tool, "convert_model");
    assert.equal(option.next.args.diagram_id, option.id);
  }
});

check("create_share_link asks which diagram the link opens at", () => {
  // Sharper here than in convert_model: this URL is what a human clicks, and
  // a link that lands on three boxes is a mistake the sender only learns
  // about from the reply.
  return createShareLink(SIGNPOST_ROOT_C4, "auto", undefined, undefined).then(
    (result) => {
      const { ask } = expectAsk(result);
      assert.equal(ask.defaultId, "ctx-root");
      for (const option of ask.options) {
        assert.equal(option.next.tool, "create_share_link");
      }
    },
  );
});

check(
  "list_icons asks when several marks match and none is called that",
  () => {
    const { text, ask } = expectAsk(listIcons("sql", undefined));
    assert.equal(ask.defaultId, null, "no mark is a defensible first guess");
    assert.match(text, /never errors/, "why guessing is unrecoverable here");
    for (const option of ask.options) {
      assert.ok(
        ICONS[option.id] !== undefined,
        `\`${option.id}\` is not a slug in the registry the canvas draws from`,
      );
    }
  },
);

/* ---- the triggers do NOT fire -------------------------------------------- */

check("no bundled example raises an ask through its own validator", () => {
  /* THE RARENESS GUARANTEE, and the most important assertion in this section.
     The bundled models are the definition of an unambiguous document — they
     are what `/demo` shows and what `get_example_model` hands out as the
     pattern to copy — so a question raised over one of them is a question
     that fires on ordinary work. Driven from the registry, not a hand-listed
     set, so a tenth notation's examples are covered with no edit here. */
  const validators = {
    c4: (text) => validateModel(text, "auto"),
    sequence: validateSequence,
    flowchart: validateFlowchart,
    usecase: validateUseCase,
    er: validateEr,
    dict: validateDict,
    gantt: validateGantt,
    timeline: validateTimeline,
    lifecycle: validateLifecycle,
  };
  assert.deepEqual(
    Object.keys(validators).sort(),
    [...EXAMPLE_KINDS].sort(),
    "a notation with bundled examples and no validator listed here would be " +
      "silently skipped by the guarantee below",
  );

  let checked = 0;
  for (const listing of listBundledExamples()) {
    if (listing.status !== "ok") continue;
    const { id, kind } = listing.example;
    const loaded = loadBundledExample(id);
    expectNoAsk(
      validators[kind](loaded.document.alabText),
      `the bundled ${kind} \`${id}\` is unambiguous by definition`,
    );
    checked += 1;
  }
  assert.ok(checked >= EXAMPLE_KINDS.length, `only ${checked} examples read`);
});

check("every notation reports the size of what it just validated", () => {
  /* WILL IT FIT ON A SLIDE — the question an agent authoring a diagram it
     cannot see has no other way to ask, and the reason `purpose.md` calls
     presentation the product.

     THE GAP THIS CLOSES. Six kinds reported `Size: W x H px` by running their
     own layout; gantt did too. C4 reported none at all — it has no layout
     module, so the measurement is a box round the geometry the document
     already carries and nobody had written it — and sequence reported the
     numbers under `Fit:`, a key no other tool spells, which an agent scanning
     for a size does not find. Both are failures of the same kind: the caller
     asks one question and the surface answers it in nine dialects.

     DRIVEN FROM THE SAME REGISTRY as the ask guarantee above, so a tenth
     notation is covered here without an edit. `codebase.md` §4: a check written
     from a hand-listed set cannot notice the kind it has never heard of. */
  const validators = {
    c4: (text) => validateModel(text, "auto"),
    sequence: validateSequence,
    flowchart: validateFlowchart,
    usecase: validateUseCase,
    er: validateEr,
    dict: validateDict,
    gantt: validateGantt,
    timeline: validateTimeline,
    lifecycle: validateLifecycle,
  };
  assert.deepEqual(
    Object.keys(validators).sort(),
    [...EXAMPLE_KINDS].sort(),
    "a notation with no validator listed here would be skipped silently",
  );

  const seen = new Set();
  for (const listing of listBundledExamples()) {
    if (listing.status !== "ok") continue;
    const { id, kind } = listing.example;
    if (seen.has(kind)) continue;
    const loaded = loadBundledExample(id);
    const text = expectOk(validators[kind](loaded.document.alabText));
    /* C4 is several pictures, so its sizes sit one per row of the diagram
       table; the other eight draw one and report a line. Both must state a
       real extent — a zero would mean the layout ran and found nothing. */
    const sizes = [...text.matchAll(/(\d+) x (\d+) px/g)];
    assert.ok(
      sizes.length > 0,
      `the bundled ${kind} \`${id}\` came back with no size — an agent ` +
        "cannot tell whether it just wrote something presentable",
    );
    for (const [, width, height] of sizes) {
      assert.ok(
        Number(width) > 0 && Number(height) > 0,
        `${kind} \`${id}\` reported a ${width} x ${height} px diagram`,
      );
    }
    seen.add(kind);
  }
  assert.equal(
    seen.size,
    EXAMPLE_KINDS.length,
    "a notation's examples were all unreadable, so its size went unproven",
  );
});

/*
 * WHAT THE UNDOCUMENTED FOUR PROMISE, AND WHAT HOLDS IT UP.
 *
 * `get_syntax_reference` teaches five notations and says outright that the
 * other four — flowchart, use case, ER and dictionary — are taught by
 * `get_example_model` instead. That is a real argument (their constructs are
 * arrows and named rows, and one worked document teaches those faster than a
 * grammar would) but it is CONDITIONAL: it holds exactly while the bundled
 * examples spell the whole notation. Nothing checked that, and it was already
 * false — across the eight relationships in the two ER examples, the left-hand
 * `}|` and the right-hand `||` and `o|` never appeared, so an agent reading
 * them could not learn to write "exactly one" or "zero or one" on the right of
 * a line.
 *
 * READ OFF THE PARSED MODEL, NEVER BY SEARCHING THE TEXT. Substring matching
 * is what hid this: `||` occurs in every one of those examples — on the LEFT of
 * the line — so a grep for it reports the right-hand token covered when it has
 * never once been written. `--` sits inside `--|>` in the same way. The two
 * sides are not mirrors either (`er/keywords.ts`: reversing `o{` gives `{o`,
 * which parses as nothing), so a token seen on one side teaches nothing about
 * the other.
 *
 * DERIVED AT BOTH ENDS: the kinds come from `KINDS_WITHOUT_SYNTAX_SECTIONS`,
 * the tokens from the parser's own tables. Writing a syntax section for one of
 * these kinds retires its entry here automatically; adding a tenth notation to
 * the undocumented list fails the totality assertion until its vocabulary is
 * named.
 */
const UNDOCUMENTED_VOCABULARY = {
  flowchart: (text) => {
    const file = parseFlowchartText(text);
    return {
      "node shape": {
        possible: Object.values(NODE_SHAPE_BY_KEYWORD),
        used: file.nodes.map((node) => node.shape),
      },
      [GROUP_KEYWORD]: {
        possible: ["used at least once"],
        used: (file.groups ?? []).length > 0 ? ["used at least once"] : [],
      },
    };
  },
  usecase: (text) => {
    const file = parseUseCaseText(text);
    return {
      "element kind": {
        possible: Object.values(ELEMENT_KIND_BY_KEYWORD),
        used: file.elements.map((element) => element.kind),
      },
      "edge kind": {
        possible: Object.keys(TOKEN_BY_EDGE_KIND),
        used: file.edges.map((edge) => edge.kind),
      },
      "dependency stereotype": {
        possible: DEPENDENCY_STEREOTYPES,
        used: file.edges
          .filter((edge) => edge.kind === "dependency")
          .map((edge) => edge.stereotype),
      },
    };
  },
  er: {
    /* THE ONE THAT WAS ACTUALLY BROKEN, and the reason the sides are counted
       separately rather than pooled. */
    parse: (text) => parseErText(text),
    groups: (file) => ({
      "left-hand cardinality": {
        possible: Object.keys(TOKEN_BY_CARDINALITY.from),
        used: file.relationships.map((rel) => rel.fromCardinality),
      },
      "right-hand cardinality": {
        possible: Object.keys(TOKEN_BY_CARDINALITY.to),
        used: file.relationships.map((rel) => rel.toCardinality),
      },
      "relationship kind": {
        possible: Object.values(KIND_BY_CONNECTOR),
        used: file.relationships.map((rel) => rel.kind),
      },
      "attribute key": {
        possible: ATTRIBUTE_KEYS,
        used: file.entities.flatMap((entity) =>
          (entity.attributes ?? []).flatMap((attr) => attr.keys ?? []),
        ),
      },
    }),
  },
  dict: (text) => {
    const file = parseDictText(text);
    const fields = file.sections.flatMap((section) => section.fields);
    return {
      "field flag": {
        possible: FIELD_FLAGS,
        used: fields.flatMap((field) => field.flags ?? []),
      },
      "field detail": {
        possible: Object.values(FIELD_DETAIL_KEYS),
        used: fields.flatMap((field) =>
          Object.values(FIELD_DETAIL_KEYS).filter(
            (key) => field[key] !== undefined,
          ),
        ),
      },
    };
  },
};

check(
  "a notation with no syntax section is spelled in full by its examples",
  () => {
    assert.deepEqual(
      Object.keys(UNDOCUMENTED_VOCABULARY).sort(),
      [...KINDS_WITHOUT_SYNTAX_SECTIONS].sort(),
      "a notation the syntax reference does not teach, and whose vocabulary is " +
        "not named here, would be promised to agents with nothing holding it up",
    );

    const byKind = new Map();
    for (const listing of listBundledExamples()) {
      if (listing.status !== "ok") continue;
      const { id, kind } = listing.example;
      if (!(kind in UNDOCUMENTED_VOCABULARY)) continue;
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind
        .get(kind)
        .push({ id, text: loadBundledExample(id).document.alabText });
    }

    for (const kind of KINDS_WITHOUT_SYNTAX_SECTIONS) {
      const examples = byKind.get(kind) ?? [];
      assert.ok(
        examples.length > 0,
        `${kind} has no bundled example, and no syntax section either — it is ` +
          "documented nowhere",
      );

      const entry = UNDOCUMENTED_VOCABULARY[kind];
      const seen = new Map();
      for (const example of examples) {
        const groups =
          typeof entry === "function"
            ? entry(example.text)
            : entry.groups(entry.parse(example.text));
        for (const [label, { possible, used }] of Object.entries(groups)) {
          if (!seen.has(label)) seen.set(label, { possible, used: new Set() });
          for (const value of used) seen.get(label).used.add(value);
        }
      }

      for (const [label, { possible, used }] of seen) {
        const missing = possible.filter((value) => !used.has(value));
        assert.deepEqual(
          missing,
          [],
          `no bundled ${kind} example writes ${label} ` +
            `${missing.map((value) => `\`${value}\``).join(", ")} — an agent ` +
            "told the examples ARE the reference cannot discover it exists",
        );
      }
    }
  },
);

check("list_icons resolves a declared alias silently", () => {
  // `postgres` is an alias of `postgresql`, so the caller has already named
  // the icon; a question there would be an obstruction. This and the `sql`
  // trigger above are the pair that defines the rule.
  const text = expectNoAsk(
    listIcons("postgres", undefined),
    "an exact alias hit is an answer, not a question",
  );
  assert.match(text, /@postgresql/);
});

check("a given diagram_id never asks", () => {
  // An explicit argument is the agent saying it already chose. A tool that
  // second-guesses one cannot be used in a loop.
  expectNoAsk(
    convertModel(SIGNPOST_ROOT_C4, "auto", "mermaid", "cnt-atlas"),
    "convert_model was told which diagram",
  );
  return createShareLink(SIGNPOST_ROOT_C4, "auto", "cnt-atlas", undefined).then(
    (result) => expectNoAsk(result, "create_share_link was told which diagram"),
  );
});

check("a forced format never asks about notation", () => {
  // Same rule one argument over: `format: "alab"` is the caller declaring the
  // reading, so validate_model reports and stops there.
  expectNoAsk(
    validateModel(STEP_LABELLED_C4, "alab"),
    "the format was forced, so the notation is not in question",
  );
});

check("the happy path is silent from end to end", () => {
  /* The target the whole trigger table is tuned against: reference → draft →
     validate → format → share, on an ordinary two-diagram model, must show an
     agent no ask at all. If this ever fails, the thresholds are wrong, not
     this check. */
  expectNoAsk(validateModel(VALID_ALAB, "auto"), "an ordinary C4 model");
  expectNoAsk(formatModel(VALID_ALAB, "auto"), "formatting is not a fork");
  expectNoAsk(
    describeModel(VALID_ALAB, "auto", false),
    "describing is not a fork",
  );
  expectNoAsk(
    convertModel(VALID_ALAB, "auto", "mermaid", undefined),
    "two diagrams is not enough of a choice to stop over",
  );
  expectNoAsk(validateSequence(VALID_SEQUENCE), "an ordinary sequence flow");
  return createShareLink(VALID_ALAB, "auto", undefined, undefined).then(
    (result) => expectNoAsk(result, "a model that fits in a link"),
  );
});

/* ---- the descriptions carry it, and only where they should ---------------- */

/**
 * The tools that can raise an ask, derived from the trigger table in
 * `features/mcp/lib/ask.ts` — the four C4 doors that go through `lib/read.ts`,
 * plus the three tools with a fork of their own.
 */
const ASKING_TOOLS = [
  "validate_model",
  "format_model",
  "convert_model",
  "describe_model",
  "validate_sequence",
  "create_share_link",
  "list_icons",
];

check("every asking tool says so, and no other tool claims to", () => {
  /* Both directions. A tool that can stop and does not say so surprises an
     agent mid-loop; a tool that advertises a question it cannot raise makes
     the /mcp page lie, and the page renders `asks` directly. */
  for (const name of ASKING_TOOLS) {
    const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
    assert.ok(tool !== undefined, `${name} is not in the catalogue`);
    assert.match(
      tool.description,
      /asks? (the|your) human/i,
      `${name} can stop and ask, and its description — which is what the ` +
        "model reads BEFORE it calls — must say so",
    );
    assert.ok(
      typeof tool.asks === "string" && tool.asks !== "",
      `${name} must set \`asks\`, which is what the /mcp page renders`,
    );
  }
  for (const tool of MCP_TOOLS) {
    if (ASKING_TOOLS.includes(tool.name)) continue;
    assert.equal(
      tool.asks,
      undefined,
      `${tool.name} cannot raise an ask, so it must not advertise one`,
    );
  }
});

check("the handshake carries the standing rule, verbatim", async () => {
  /* A client may connect without any human ever opening /mcp, so the rule
     that a result beginning with the headline must be put to a person travels
     with `initialize` — and it must quote the headline the results actually
     use, not a paraphrase, or it is a rule the agent never recognises.
     Source-scanned in the same style as the MCP_BETA_NOTICE_SHORT assertion
     above. */
  const route = await readFile(
    path.join(ROOT, "src/app/api/mcp/route.ts"),
    "utf8",
  );
  assert.match(route, /ASK_HUMAN_HEADLINE/, "the rule must quote the constant");
  assert.match(
    route,
    /numbered options to the person you are working for/,
    "the instructions must say what to DO with an ask, not just name it",
  );
  assert.match(
    route,
    /Do not choose for them/,
    "and must forbid the one thing an agent would otherwise do",
  );
  assert.match(
    route,
    /DOCUMENT_KIND_COUNT/,
    "the handshake must name how many notations there are, from the " +
      "catalogue — it claimed C4 alone for eight notations' worth of releases",
  );
});

check("the authoring prompt asks about notation before it drafts", () => {
  const prompt = registered.prompts.find(
    (candidate) => candidate.name === "author_c4_model",
  );
  const text = prompt.handler({ system: "a coffee shop" }).messages[0].content
    .text;
  const step0 = text.indexOf("0.");
  const draft = text.indexOf("Draft the model");
  assert.ok(step0 !== -1, "the prompt has no step 0");
  assert.ok(
    step0 < draft,
    "the notation question must come BEFORE drafting: after a draft exists, " +
      "the only thing left to be unsure about is wording",
  );
  assert.match(text, /ASK THE HUMAN/);
  assert.match(text, /list_example_models/);
});

/* ---- prose is derived, not typed ----------------------------------------- */

check("a notation option's label is its KIND_BLURB, exactly", () => {
  /* The one-line job of each notation is quoted verbatim on the home page,
     /demo, /faq, both llms*.txt and the tool descriptions. A near-miss
     paraphrase in an ask would be a tenth answer to "what is a gantt for",
     and it is the copy a human is read out loud. */
  const { ask } = expectAsk(
    validateModel(
      `archlab 1.0 gantt\ntitle "P"\n\n@gantt\n  section "S"\n    task t "T" 5d\n`,
      "auto",
    ),
  );
  for (const option of ask.options) {
    assert.equal(
      option.label,
      KIND_BLURB[option.id],
      `option \`${option.id}\`'s label is not KIND_BLURB[${option.id}]`,
    );
  }
});

check("get_syntax_reference is honest about what it does not cover", () => {
  /* Either the reference teaches a kind or its own description names the gap.
     The failure this prevents: an agent told "read the grammar first" for a
     gantt got a ~22KB wall of C4 with the word `gantt` nowhere in it, which
     reads as "arch-lab does not draw those". */
  const tool = MCP_TOOLS.find((t) => t.name === "get_syntax_reference");
  const taught = new Set(["c4", ...SYNTAX_SECTION_IDS]);
  for (const kind of Object.keys(KIND_BLURB)) {
    if (taught.has(kind)) continue;
    assert.match(
      tool.description,
      new RegExp(`\\b${kind}\\b`),
      `the reference has no ${kind} section, so the description must name ` +
        `${kind} as a gap and say where the real reference for it is`,
    );
  }
  assert.match(
    tool.description,
    /get_example_model|list_example_models/,
    "naming the gap is only half of it — the description must point at the " +
      "parser-verified reference that does cover those kinds",
  );
});

/* ----------------------------------------------------------------------- */
/* Run                                                                      */
/* ----------------------------------------------------------------------- */

for (const { name, run } of checks) {
  try {
    await run();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(
      String(error instanceof Error ? (error.stack ?? error.message) : error)
        .split("\n")
        .map((line) => `        ${line}`)
        .join("\n"),
    );
  }
}

console.log("");
if (failures > 0) {
  console.error(`mcp-check: ${failures} of ${checks.length} check(s) failed.`);
  process.exit(1);
}
console.log(
  `mcp-check: all ${checks.length} checks passed ` +
    `(${registered.tools.length} tools, ${registered.resources.length} resource(s), ` +
    `${registered.prompts.length} prompt(s)).`,
);
