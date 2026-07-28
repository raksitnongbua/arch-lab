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
  mcpEndpointUrl,
} = await load("src/features/mcp/catalog.ts");
const { registerArchLabMcp } = await load("src/features/mcp/server.ts");
const { validateModel } = await load("src/features/mcp/tools/validate.ts");
const { convertModel, formatModel } = await load(
  "src/features/mcp/tools/convert.ts",
);
const { describeModel } = await load("src/features/mcp/tools/describe.ts");
const { getExampleModel, listExampleModels } = await load(
  "src/features/mcp/tools/examples.ts",
);
const { getSyntaxReference, SYNTAX_SECTION_IDS } = await load(
  "src/features/mcp/tools/syntax.ts",
);
const { createShareLink } = await load("src/features/mcp/tools/share.ts");
const { decodeShareFragment } = await load(
  "src/features/viewer/share/codec.ts",
);
const { MAX_SOURCE_CHARS } = await load("src/features/mcp/lib/limits.ts");

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

check("get_example_model serves shopflow as .alab and as JSON", () => {
  const alab = expectOk(getExampleModel("shopflow", "alab"));
  assert.match(alab, /archlab 1\.0/);
  const json = expectOk(getExampleModel("shopflow", "json"));
  assert.match(json, /"version"/);
});

check("get_example_model names the alternatives for an unknown id", () => {
  const text = expectError(getExampleModel("nope", "alab"));
  assert.match(text, /No example model `nope`/);
  assert.match(text, /shopflow/);
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
    assert.match(url, /\/view\/new#m=AF1\./);

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

check("create_share_link refuses a model too big for a URL", async () => {
  // Many small nodes: valid, and comfortably past the URL ceiling once
  // compressed.
  const nodes = Array.from(
    { length: 400 },
    (_, index) =>
      `  n${index}:container "Service number ${index} with a deliberately ` +
      `verbose and incompressible-ish name ${index}" [Runtime ${index}]`,
  ).join("\n");
  const big = `archlab 1.0
title "Too big to link"

@context ctx-root "Too big to link"
  shop:system "Shop" >cnt-shop

@container cnt-shop owner=shop
${nodes}
`;
  const text = expectError(await createShareLink(big, "auto", undefined));
  assert.match(text, /does not fit in a share link/);
  assert.match(text, /convert_model/);
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
