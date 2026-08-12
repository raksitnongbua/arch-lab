#!/usr/bin/env node
/**
 * Collapse check: hiding a participant's dependencies.
 *
 * The rule (see lib/collapse.ts) has to produce one specific answer on the
 * bundled Checkout example, because that answer is the request it exists to
 * serve: collapse Order API and Payments and Orders DB go, while Storefront and
 * Customer stay. Customer is the interesting one — Order API DOES email the
 * Customer, so a naive "hide everything it talks to" would delete the actor and
 * with it the reason the flow starts.
 *
 * What is asserted, and why each matters:
 *
 *   1. That exact set, on the real example, through the real parser.
 *   2. Callers are never hidden. Storefront calls Order API; a rule that
 *      confused direction would hide the caller and leave a flow with no
 *      beginning.
 *   3. Shared services are never hidden — a participant that talks to anyone
 *      outside the collapsing set survives, which is what makes this safe on
 *      real documents where a queue or a database is used by three services.
 *   4. Collapsing is transitive: a dependency's own private dependency goes
 *      with it, or hiding a service would strand its database on the canvas
 *      with no messages left to draw.
 *   5. The filtered FILE is coherent: no message references a hidden
 *      participant, no fragment is left as an empty labelled box, and the whole
 *      thing still LAYS OUT — a filtered model that crashes the layout would be
 *      a collapse that breaks the diagram.
 *   6. Collapsing nothing changes nothing, by identity.
 */

import assert from "node:assert/strict";
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

const load = (relative) =>
  import(pathToFileURL(path.join(ROOT, relative)).href);

const { parseSequenceText } = await load("src/features/archtext/index.ts");
const { dependenciesOf, hiddenParticipants, collapseSequence, eachMessage } =
  await load("src/features/sequence/lib/collapse.ts");
const { layoutSequence } = await load("src/features/sequence/lib/layout.ts");
const { SEQUENCE_EXAMPLE } = await load(
  "src/features/sequence/input/example.ts",
);

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

const file = parseSequenceText(SEQUENCE_EXAMPLE);
const ids = file.participants.map((p) => p.id);
const sorted = (set) => [...set].sort();

/* ---- 1. the requested outcome ------------------------------------------- */

check("the example has the five participants these assertions assume", () => {
  assert.deepEqual(ids, ["cust", "web", "api", "pay", "db"]);
});

check("collapsing Order API hides exactly Payments and Orders DB", () => {
  assert.deepEqual(sorted(dependenciesOf(file, "api")), ["db", "pay"]);
});

/* ---- 2. direction: callers are not dependencies -------------------------- */

check(
  "Storefront is not hidden — it CALLS Order API, it is not called by it",
  () => {
    assert.ok(!dependenciesOf(file, "api").has("web"));
  },
);

check("collapsing Payments hides nothing — it is a leaf", () => {
  assert.equal(dependenciesOf(file, "pay").size, 0);
});

/* ---- 3. shared participants survive -------------------------------------- */

check(
  "the Customer survives collapsing Order API, despite being emailed by it",
  () => {
    // api ~> cust exists, but cust also clicks in web — so it is shared, not
    // private, and a rule that hid it would delete the actor.
    assert.ok(
      eachMessage(file.items).some((m) => m.from === "api" && m.to === "cust"),
    );
    assert.ok(!dependenciesOf(file, "api").has("cust"));
  },
);

check(
  "collapsing Storefront keeps Order API, which the Customer also reaches",
  () => {
    // web -> api, but api ~> cust means api is not private to web.
    assert.ok(!dependenciesOf(file, "web").has("api"));
  },
);

/* ---- 4. transitivity ----------------------------------------------------- */

check("a dependency's own private dependency collapses with it", () => {
  const chain = parseSequenceText(
    `archlab 1.0 sequence
title "Chain"

@sequence
  a "A"
  b "B"
  c "C"

  a -> b : "call"
  b -> c : "inner call"
`,
  );
  // c is private to b, b is private to a, so collapsing a takes both.
  assert.deepEqual(sorted(dependenciesOf(chain, "a")), ["b", "c"]);
});

check("a dependency shared with an outsider stops the chain", () => {
  const shared = parseSequenceText(
    `archlab 1.0 sequence
title "Shared"

@sequence
  a "A"
  b "B"
  c "C"
  d "D"

  a -> b : "call"
  b -> c : "inner call"
  d -> c : "also uses C"
`,
  );
  // b is still private to a, but c is used by d as well, so c stays — and
  // therefore b stays too, since b's message to c would have nowhere to land.
  assert.deepEqual(sorted(dependenciesOf(shared, "a")), []);
});

/* ---- 5. the filtered file is coherent ------------------------------------ */

const hidden = hiddenParticipants(file, new Set(["api"]));
const collapsed = collapseSequence(file, hidden);

check("the collapsed file drops exactly the hidden participants", () => {
  assert.deepEqual(
    collapsed.participants.map((p) => p.id),
    ["cust", "web", "api"],
  );
});

check("no surviving message references a hidden participant", () => {
  for (const m of eachMessage(collapsed.items)) {
    assert.ok(!hidden.has(m.from), `message from hidden ${m.from}`);
    assert.ok(!hidden.has(m.to), `message to hidden ${m.to}`);
  }
});

check("no surviving note references a hidden participant", () => {
  const walk = (items) => {
    for (const item of items) {
      if (item.step === "note") {
        for (const id of item.participants) {
          assert.ok(!hidden.has(id), `note over hidden ${id}`);
        }
      } else if (item.step === "fragment") {
        for (const branch of item.branches) walk(branch.items);
      }
    }
  };
  walk(collapsed.items);
});

check("no fragment survives as an empty labelled box", () => {
  const walk = (items) => {
    for (const item of items) {
      if (item.step !== "fragment") continue;
      assert.ok(item.branches.length > 0, "fragment with no branches");
      for (const branch of item.branches) {
        assert.ok(branch.items.length > 0, "fragment branch with no items");
        walk(branch.items);
      }
    }
  };
  walk(collapsed.items);
});

check("the collapsed file still lays out, and smaller", () => {
  const full = layoutSequence(file);
  const small = layoutSequence(collapsed);
  assert.equal(small.participants.length, 3);
  assert.ok(
    small.width < full.width,
    `expected a narrower diagram, got ${small.width} vs ${full.width}`,
  );
  assert.ok(small.messages.length > 0, "collapsed to nothing");
  assert.ok(
    small.messages.length < full.messages.length,
    "no messages were actually removed",
  );
});

check("steps renumber contiguously in the collapsed view", () => {
  const small = layoutSequence(collapsed);
  assert.deepEqual(
    small.messages.map((m) => m.step),
    small.messages.map((_, index) => index + 1),
    "a collapsed view must number what it shows, with no holes",
  );
});

/* ---- 6. collapsing nothing changes nothing ------------------------------- */

check("an empty collapse set returns the same object, not a copy", () => {
  assert.equal(collapseSequence(file, new Set()), file);
});

check("collapsing a leaf changes neither participants nor messages", () => {
  const none = hiddenParticipants(file, new Set(["pay"]));
  assert.equal(none.size, 0);
  assert.equal(collapseSequence(file, none), file);
});

check(
  "a collapsed participant stays visible — it is the handle to expand by",
  () => {
    assert.ok(!hiddenParticipants(file, new Set(["api"])).has("api"));
  },
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-collapse assertions passed.`);
