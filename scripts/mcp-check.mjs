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
  const text = expectError(validateModel(VALID_SEQUENCE, "auto"));
  assert.ok(
    /sequence/i.test(text) || /INVALID/.test(text),
    "a sequence document must not read as a valid C4 model",
  );
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
  // promise from being prose.
  const text = expectError(validateModel(VALID_USECASE, "auto"));
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
  const big = sizedModel(900, "Too big to link");
  const text = expectError(await createShareLink(big, "auto", undefined));
  assert.match(text, /does not fit in a share link/);

  // The canonical model text is inline — no convert_model round trip.
  assert.match(text, /```\narchlab 1\.0/);
  assert.match(text, /title "Too big to link"/);

  // The scoped offer names the diagram and carries a real, measured URL.
  assert.match(text, /diagram-scoped link fits/);
  assert.match(text, /`ctx-root`/);
  const scopedUrl = text.split("\n").find((line) => line.startsWith("http"));
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
  for (const [name, run] of attempts) {
    const text = expectError(run());
    assert.match(text, /sequence diagram/i, name);
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
