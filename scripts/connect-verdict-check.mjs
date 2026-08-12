#!/usr/bin/env node
/**
 * Connect-verdict check: the one table that decides what a connection drag
 * will do must be total, and every consumer must be able to read a style for
 * whatever it returns.
 *
 * The bug this guards against is the original one. The preview line, the drop
 * halo, the caption and the commit path each used to decide for themselves
 * what a drop meant, and they disagreed — the line said nothing while the drop
 * silently created a new node on top of the target. Now they all read
 * `verdictFor`, so the risk moves to that function returning something a
 * consumer has no entry for. A missing row is a blank caption or an unstyled
 * line at exactly the moment the user needs to know what is about to happen.
 *
 * What it proves:
 *   1. Every input shape maps to the intended verdict, in both edge
 *      directions — A→B existing must make a fresh B→A read as a duplicate,
 *      because the two draw as parallel curves on the same pair.
 *   2. `CONNECT_VERDICT` has a row for every verdict the type admits, and
 *      every row paints from a semantic token — no colour literals.
 *   3. `captionFor` returns non-empty, element-naming text for every verdict.
 *   4. The four verdicts use four DISTINCT tokens. Two verdicts sharing a
 *      colour is the failure the redesign existed to remove.
 *
 * Exits non-zero on any failure. Run with: pnpm check:connect-verdict
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

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

const { CONNECT_VERDICT, captionFor, verdictFor } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/lib/connect-verdict.ts"))
    .href
);

let failures = 0;
let checks = 0;
const ok = (m) => {
  checks += 1;
  console.log(`  ok  ${m}`);
};
const fail = (m, d) => {
  checks += 1;
  failures += 1;
  console.error(`  FAIL  ${m}\n        ${d}`);
};

/* 1. Every input shape maps to the intended verdict. */

const diagram = {
  edges: [{ id: "e1", source: "a", target: "b", direction: "forward" }],
};

const CASES = [
  {
    name: "a fresh pair relates",
    input: { sourceNodeId: "a", targetNodeId: "c", diagram },
    expect: "relate",
  },
  {
    name: "empty canvas creates",
    input: { sourceNodeId: "a", targetNodeId: null, diagram },
    expect: "create",
  },
  {
    name: "back on the source cancels",
    input: { sourceNodeId: "a", targetNodeId: "a", diagram },
    expect: "cancel",
  },
  {
    name: "an existing A->B is a duplicate",
    input: { sourceNodeId: "a", targetNodeId: "b", diagram },
    expect: "duplicate",
  },
  // Unordered on purpose: the reverse draws as a parallel curve on the same
  // pair, which is exactly what the reader needs warning about.
  {
    name: "the REVERSE of an existing edge is a duplicate too",
    input: { sourceNodeId: "b", targetNodeId: "a", diagram },
    expect: "duplicate",
  },
  {
    name: "an unrelated pair on a diagram with edges still relates",
    input: { sourceNodeId: "c", targetNodeId: "d", diagram },
    expect: "relate",
  },
];

for (const testCase of CASES) {
  const got = verdictFor(testCase.input);
  if (got === testCase.expect) ok(`${testCase.name} → ${got}`);
  else fail(testCase.name, `expected "${testCase.expect}", got "${got}"`);
}

/* 2 + 3 + 4. The table is total, tokenised, captioned and unambiguous. */

const verdicts = [...new Set(CASES.map((c) => c.expect))].sort();
const rows = Object.keys(CONNECT_VERDICT).sort();

if (rows.join(",") === verdicts.join(",")) {
  ok(
    `CONNECT_VERDICT covers exactly the reachable verdicts (${rows.join(", ")})`,
  );
} else {
  fail(
    "CONNECT_VERDICT covers exactly the reachable verdicts",
    `table has [${rows.join(", ")}], cases reach [${verdicts.join(", ")}]`,
  );
}

{
  const literal = rows.filter(
    (rowKey) => !/^var\(--[a-z-]+\)$/.test(CONNECT_VERDICT[rowKey].token),
  );
  if (literal.length === 0) ok("every verdict paints from a semantic token");
  else
    fail(
      "every verdict paints from a semantic token",
      `not a var(): ${literal.map((k) => `${k}=${CONNECT_VERDICT[k].token}`).join(", ")}`,
    );
}

{
  const tokens = rows.map((rowKey) => CONNECT_VERDICT[rowKey].token);
  if (new Set(tokens).size === tokens.length) {
    ok("the four verdicts use four distinct colours");
  } else {
    fail("the four verdicts use four distinct colours", tokens.join(", "));
  }
}

{
  const bad = [];
  for (const rowKey of rows) {
    const caption = captionFor(rowKey, "Web App", "Orders DB");
    if (typeof caption !== "string" || caption.trim() === "") {
      bad.push(`${rowKey}: empty`);
      continue;
    }
    // A caption that names neither element is the generic hint this replaced.
    const namesSomething =
      rowKey === "cancel" || /Web App|Orders DB/.test(caption);
    if (!namesSomething) bad.push(`${rowKey}: names no element ("${caption}")`);
  }
  if (bad.length === 0)
    ok("every verdict has a caption that names what it acts on");
  else
    fail(
      "every verdict has a caption that names what it acts on",
      bad.join("; "),
    );
}

{
  // Over empty canvas there is no target name; the caption must still read.
  const caption = captionFor("create", "Web App", null);
  if (/Web App/.test(caption) && !/null|undefined/.test(caption)) {
    ok("the empty-canvas caption survives a missing target name");
  } else {
    fail("the empty-canvas caption survives a missing target name", caption);
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} connect-verdict check(s) FAILED`);
  process.exit(1);
}
console.log(`\nconnect-verdict-check: all ${checks} checks passed.`);
