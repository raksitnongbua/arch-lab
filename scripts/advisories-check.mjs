#!/usr/bin/env node
/**
 * Advisories check: the review notes `/validate`, `validate_model` and
 * `validate_sequence` show must fire on the things they claim to, and — just
 * as important — must stay silent on a well-authored document.
 *
 * Loads the REAL `advise` from `src/features/validate/lib/advisories.ts` and
 * the REAL `checkSource` through the same `registerHooks` resolver pattern as
 * `scripts/validate-samples-check.mjs`, so this script and the page exercise
 * one implementation. What it proves:
 *
 *   1. Each rule fires on a document that violates it, once per violation,
 *      pointing at the right element — driven by a table of `.alab` cases so
 *      a new rule cannot be added without a case that trips it.
 *   2. No rule fires on a model that satisfies all of them. This is the
 *      expensive half: an advisory that cries wolf on good input is worse
 *      than no advisory, because the whole panel then gets ignored.
 *   3. Advisories never change the verdict. Every case above must still come
 *      back `status: "ok"` — these are notes, not errors, and a rule that
 *      quietly failed a valid document would break every caller.
 *   4. Every rule in `ADVISORY_RULES` is covered by case (1), and every rule
 *      cites its SOURCE — c4model.com for the C4 conformance family, the
 *      constant that defines the limit for the `.alab` format family. The notes
 *      argue from something written down, not from taste. The format family is
 *      listed explicitly in that check, so a new rule cannot slip past it by
 *      simply not mentioning C4.
 *   5. The title cap, which is the format family's first rule, holds on BOTH
 *      document kinds (`advise` and `adviseSequence`), is inclusive at the
 *      boundary, and counts code points rather than UTF-16 units.
 *
 * Exits non-zero on any failure. Run with: pnpm check:advisories
 */

import { existsSync, statSync } from "node:fs";
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

const { checkSource } = await import(
  pathToFileURL(path.join(ROOT, "src/features/validate/lib/check.ts")).href
);
const { ADVISORY_RULES, advise, adviseSequence, groupAdvisories } =
  await import(
    pathToFileURL(path.join(ROOT, "src/features/validate/lib/advisories.ts"))
      .href
  );
const { MAX_TITLE_LENGTH } = await import(
  pathToFileURL(path.join(ROOT, "src/lib/constants.ts")).href
);

/* ----------------------------------------------------------------------- */
/* Cases                                                                    */
/* ----------------------------------------------------------------------- */

/**
 * Shared preamble. Every case is a two-diagram model — a root Context view (a
 * model needs one) plus the Container view under test — so the only advisories
 * that can fire are the ones the case is about: the context node states its
 * description, and the context diagram has no relationships at all.
 */
const PREFIX = `archlab 1.0
title "T"

@context ctx-root "T — System Context"
  shop:system "Shop" [Next.js / Go] >cnt-root
    desc "The system under test."

@container cnt-root "T — Containers"
`;

const CLEAN_BODY = `  db:database "Orders DB" [PostgreSQL 16]
    desc "Stores order state."
  web:container "Web App" [Next.js 15]
    desc "The storefront users browse."

  web -> db : "Reads and writes orders" [SQL/TCP]
`;

/**
 * The clean baseline: technology on both containers, a description on each, a
 * labelled one-way relationship naming its protocol. Nothing may fire on this.
 */
const CLEAN = PREFIX + CLEAN_BODY;

/**
 * One case per rule. `source` violates exactly the rule named (plus whatever
 * the baseline already guarantees), `expect` is how many times.
 */
const CASES = [
  {
    rule: "missing-technology",
    why: "a container with no technology",
    expect: 1,
    source:
      PREFIX +
      `  db:database "Orders DB" [PostgreSQL 16]
    desc "Stores order state."
  web:container "Web App"
    desc "The storefront users browse."

  web -> db : "Reads and writes orders" [SQL/TCP]
`,
  },
  {
    rule: "missing-description",
    why: "an element with no description",
    expect: 1,
    source:
      PREFIX +
      `  db:database "Orders DB" [PostgreSQL 16]
    desc "Stores order state."
  web:container "Web App" [Next.js 15]

  web -> db : "Reads and writes orders" [SQL/TCP]
`,
  },
  {
    rule: "unlabelled-relationship",
    why: "a relationship with no label",
    expect: 1,
    source:
      PREFIX +
      `  db:database "Orders DB" [PostgreSQL 16]
    desc "Stores order state."
  web:container "Web App" [Next.js 15]
    desc "The storefront users browse."

  web -> db [SQL/TCP]
`,
  },
  {
    rule: "vague-relationship",
    why: 'a relationship labelled "Uses"',
    expect: 1,
    source:
      PREFIX +
      `  db:database "Orders DB" [PostgreSQL 16]
    desc "Stores order state."
  web:container "Web App" [Next.js 15]
    desc "The storefront users browse."

  web -> db : "Uses" [SQL/TCP]
`,
  },
  {
    rule: "bidirectional-relationship",
    why: "a two-way line",
    expect: 1,
    source:
      PREFIX +
      `  db:database "Orders DB" [PostgreSQL 16]
    desc "Stores order state."
  web:container "Web App" [Next.js 15]
    desc "The storefront users browse."

  web <-> db : "Reads and writes orders" [SQL/TCP]
`,
  },
  {
    rule: "missing-protocol",
    why: "a container relationship with no technology",
    expect: 1,
    source:
      PREFIX +
      `  db:database "Orders DB" [PostgreSQL 16]
    desc "Stores order state."
  web:container "Web App" [Next.js 15]
    desc "The storefront users browse."

  web -> db : "Reads and writes orders"
`,
  },
];

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let checks = 0;

const ok = (message) => {
  checks += 1;
  console.log(`  ok  ${message}`);
};
const fail = (message, detail) => {
  checks += 1;
  failures += 1;
  console.error(`  FAIL  ${message}\n        ${detail}`);
};

/** Parses `source` through the real reader; null (and a failure) if invalid. */
function read(label, source) {
  const result = checkSource(source, "auto");
  if (result.status !== "ok") {
    fail(
      label,
      `expected valid .alab, got "${result.status}": ${result.message ?? ""}`,
    );
    return null;
  }
  return result;
}

/* 1 + 3. Each rule fires where it should, and never fails the document. */

const covered = new Set();

for (const testCase of CASES) {
  const label = `${testCase.rule} fires on ${testCase.why}`;
  const result = read(label, testCase.source);
  if (result === null) continue;

  covered.add(testCase.rule);
  const mine = result.advisories.filter((a) => a.rule === testCase.rule);

  if (mine.length !== testCase.expect) {
    fail(
      label,
      `expected ${testCase.expect} advisory(ies), got ${mine.length}` +
        ` (all rules seen: ${[...new Set(result.advisories.map((a) => a.rule))].join(", ") || "none"})`,
    );
    continue;
  }
  if (mine.some((a) => typeof a.where !== "string" || a.where === "")) {
    fail(
      label,
      "an advisory carries no `where` — nothing to point the reader at",
    );
    continue;
  }
  if (mine.some((a) => typeof a.message !== "string" || a.message === "")) {
    fail(label, "an advisory carries no message");
    continue;
  }
  ok(`${label} — ${mine.map((a) => a.where).join(", ")}`);
}

/* 2. Silence on a clean model. */

{
  const label = "no rule fires on a model that satisfies all of them";
  const result = read(label, CLEAN);
  if (result !== null) {
    if (result.advisories.length === 0) {
      ok(label);
    } else {
      fail(
        label,
        `${result.advisories.length} false positive(s): ` +
          result.advisories.map((a) => `${a.rule} @ ${a.where}`).join("; "),
      );
    }
  }
}

/* 2b. Silence on both committed example models, for the rules that are pure
   omission — a bundled example the app ships must not read as unfinished. */

for (const name of ["shopflow", "order-shop"]) {
  const label = `${name} states every technology, protocol and description`;
  const file = (
    await import(
      pathToFileURL(
        path.join(
          ROOT,
          `src/features/viewer/service/data/${name}.archlab.json`,
        ),
      ).href,
      { with: { type: "json" } }
    )
  ).default;
  const omissions = advise(file).filter((a) =>
    [
      "missing-technology",
      "missing-description",
      "missing-protocol",
      "unlabelled-relationship",
      "missing-diagram-title",
    ].includes(a.rule),
  );
  if (omissions.length === 0) ok(label);
  else
    fail(
      label,
      `${omissions.length} omission(s): ` +
        omissions.map((a) => `${a.rule} @ ${a.where}`).join("; "),
    );
}

/* 4. Every rule is covered, and every rule cites C4. */

{
  const declared = Object.keys(ADVISORY_RULES);
  // `missing-diagram-title` cannot be reached from `.alab` — the grammar
  // requires a title — so it is proven against a hand-built model instead.
  const titleCase = {
    version: "1.0",
    metadata: {
      title: "T",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    rootDiagramId: "d",
    diagrams: [
      {
        id: "d",
        level: "context",
        title: "",
        ownerNodeId: null,
        parentDiagramId: null,
        nodes: [],
        edges: [],
      },
    ],
  };
  const titleAdvisories = advise(titleCase).filter(
    (a) => a.rule === "missing-diagram-title",
  );
  if (titleAdvisories.length === 1) {
    covered.add("missing-diagram-title");
    ok("missing-diagram-title fires on a diagram with an empty title");
  } else {
    fail(
      "missing-diagram-title fires on a diagram with an empty title",
      `expected 1 advisory, got ${titleAdvisories.length}`,
    );
  }

  /* `long-title` belongs to the FORMAT family, so it is proven on both document
     kinds — a sequence document has no C4 notation but does have a `title`, and
     the whole point of the rule living in one place is that both are told off in
     the same words. */
  const longTitle = "T".repeat(MAX_TITLE_LENGTH + 1);

  const modelLongTitle = advise({
    ...titleCase,
    metadata: { ...titleCase.metadata, title: longTitle },
  }).filter((a) => a.rule === "long-title");
  if (modelLongTitle.length === 1) {
    covered.add("long-title");
    ok(`long-title fires on a model title over ${MAX_TITLE_LENGTH} characters`);
  } else {
    fail(
      "long-title fires on a model title over the cap",
      `expected 1 advisory, got ${modelLongTitle.length}`,
    );
  }

  const atCap = advise({
    ...titleCase,
    metadata: { ...titleCase.metadata, title: "T".repeat(MAX_TITLE_LENGTH) },
  }).filter((a) => a.rule === "long-title");
  if (atCap.length === 0) {
    ok(
      `a title of exactly ${MAX_TITLE_LENGTH} characters is fine (the cap is inclusive)`,
    );
  } else {
    fail(
      "a title of exactly the cap is fine",
      `fired on a title of exactly ${MAX_TITLE_LENGTH}`,
    );
  }

  const sequenceLongTitle = adviseSequence({
    metadata: { title: longTitle },
    participants: [],
    items: [],
  }).filter((a) => a.rule === "long-title");
  if (sequenceLongTitle.length === 1) {
    ok("long-title fires on a SEQUENCE document's title too");
  } else {
    fail(
      "long-title fires on a sequence document's title",
      `expected 1 advisory, got ${sequenceLongTitle.length}`,
    );
  }

  const sequenceShortTitle = adviseSequence({
    metadata: { title: "Checkout — Place Order" },
    participants: [],
    items: [],
  });
  if (sequenceShortTitle.length === 0) {
    ok(
      "a normal sequence document raises nothing — no C4 rule is applied to it",
    );
  } else {
    fail(
      "a normal sequence document raises nothing",
      `got ${sequenceShortTitle.map((a) => a.rule).join(", ")}`,
    );
  }

  /* Counted in CODE POINTS, not UTF-16 units: an emoji costs 2 of
     `String.length` and 1 of what a reader counts, so a title that looks the
     same length must not pass or fail depending on its alphabet. */
  const emojiTitle = "🙂".repeat(MAX_TITLE_LENGTH);
  const emojiAdvisories = advise({
    ...titleCase,
    metadata: { ...titleCase.metadata, title: emojiTitle },
  }).filter((a) => a.rule === "long-title");
  if (emojiAdvisories.length === 0) {
    ok("the cap counts code points — an emoji title at the cap is not over it");
  } else {
    fail(
      "the cap counts code points",
      `${MAX_TITLE_LENGTH} emoji (String.length ${emojiTitle.length}) read as over the cap`,
    );
  }

  const uncovered = declared.filter((rule) => !covered.has(rule));
  if (uncovered.length === 0) {
    ok(`every declared rule has a case (${declared.length} rules)`);
  } else {
    fail(
      "every declared rule has a case",
      `no case trips: ${uncovered.join(", ")}`,
    );
  }

  /* EVERY RULE CITES ITS SOURCE, but there are now two families and they cite
     different things — see the header of `advisories.ts`. The format family is
     listed EXPLICITLY rather than inferred, so a new rule cannot slip past this
     check simply by not containing the word "C4": it either states a C4 reason
     or it is declared here as a format rule and states the limit it enforces. */
  const FORMAT_RULES = new Set(["long-title"]);

  const uncited = declared.filter((rule) => {
    const because = ADVISORY_RULES[rule].because;
    return FORMAT_RULES.has(rule)
      ? !/MAX_TITLE_LENGTH|\.alab/.test(because)
      : !/\bC4\b/.test(because);
  });
  if (uncited.length === 0) {
    ok(
      `every rule cites its source (${declared.length - FORMAT_RULES.size} C4, ${FORMAT_RULES.size} format)`,
    );
  } else {
    fail("every rule cites its source", `uncited: ${uncited.join(", ")}`);
  }
}

/* 5. Grouping is stable and lossless. */

{
  const label = "grouping preserves every advisory, in rule order";
  const all = CASES.flatMap((testCase) => {
    const result = checkSource(testCase.source, "auto");
    return result.status === "ok" ? [...result.advisories] : [];
  });
  const groups = groupAdvisories(all);
  const regrouped = groups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const order = Object.keys(ADVISORY_RULES);
  const monotonic = groups.every(
    (group, index) =>
      index === 0 ||
      order.indexOf(group.rule) > order.indexOf(groups[index - 1].rule),
  );
  if (regrouped !== all.length) {
    fail(label, `grouped ${regrouped} of ${all.length}`);
  } else if (!monotonic) {
    fail(
      label,
      `groups out of declaration order: ${groups.map((g) => g.rule).join(", ")}`,
    );
  } else if (groups.some((group) => group.items.length === 0)) {
    fail(label, "an empty group survived — a silent rule should not appear");
  } else {
    ok(`${label} (${groups.length} group(s), ${all.length} advisory(ies))`);
  }
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} advisory check(s) FAILED`);
  process.exit(1);
}
console.log(`\nadvisories-check: all ${checks} checks passed.`);
