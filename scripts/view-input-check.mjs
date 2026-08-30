#!/usr/bin/env node
/**
 * The merged `/live` playground's READER: one pane, nine accepted shapes,
 * one rendered document.
 *
 * This exists because the merge collapsed two pages into one and detection is
 * now the thing standing between a paste and a blank canvas. Nothing else can
 * catch a regression in it: `pnpm build` type-checks the routing but cannot
 * say that Mermaid C4 still lands on the C4 canvas, and the page's own errors
 * are rendered, not asserted. A reader who pastes a `sequenceDiagram` and gets
 * "could not detect the format" has no way to know it is a bug.
 *
 * What it asserts:
 *
 *   1. every shape the pane advertises is detected as the right KIND — C4
 *      `.alab`, sequence `.alab`, flowchart `.alab`, use-case `.alab`,
 *      arch-lab JSON, Mermaid C4, Mermaid `sequenceDiagram`, Mermaid
 *      `flowchart`/`graph`, and a Mermaid flowchart that reads as a USE-CASE
 *      diagram — including that the use-case reading never steals a genuine
 *      flowchart, because both readings share one Mermaid header and only
 *      `detectMermaidUseCase` may pick between them;
 *   2. the bundled seeds parse (a broken seed would ship a playground that
 *      opens on an error);
 *   3. a failure keeps its parser's own precision — a located line/column for
 *      the text grammars, a JSON-path for the JSON validator — because the UI
 *      renders a caret quote from exactly those fields;
 *   4. nothing recognisable is answered with "unknown format", which is the
 *      one verdict a reader cannot act on.
 *
 * It also pins the module's PURITY: this script loads it through Node's type
 * stripping, so an import that reaches a `.tsx` (a feature barrel exporting a
 * component) fails here rather than silently removing the reader from test.
 * That regression already happened once during the merge.
 *
 * Exits non-zero on any failure. Run with: pnpm check:view-input
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

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

const {
  parseViewSource,
  convertedSourceText,
  VIEW_SEED_TEXT,
  VIEW_STARTER_TEXT,
  describeDocument,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/playground/input/parse.ts")).href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function check(label, condition, detail) {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error(`    ${detail}`);
}

/* ----------------------------------------------------------------------- */
/* 1. Every accepted shape lands on the right canvas                        */
/* ----------------------------------------------------------------------- */

console.log("one pane, nine shapes");

const MERMAID_C4 = `C4Context
    title Coffee Shop
    Person(customer, "Customer")
    System(shop, "Coffee Shop System")
    Rel(customer, shop, "Places orders with", "HTTPS")
`;

/* The bug report that started the Mermaid work, kept as an input here too:
   it is the shortest paste that exercises detection AND a block the importer
   once refused outright. */
const MERMAID_SEQUENCE = `sequenceDiagram
    participant Alice
    participant Bob
    rect rgb(191, 223, 255)
        Alice->>Bob: Hello Bob
        Bob-->>Alice: Hi Alice
    end
`;

/* BOTH Mermaid flowchart spellings, because they detect on different first
   words: `flowchart` (current) and `graph` with the old `;` line endings.
   The pane advertises "paste Mermaid" without qualifying the era, so a
   regression that keeps `flowchart` working while `graph` falls back to
   "unknown format" would pass every other assertion here. */
const MERMAID_FLOWCHART = `flowchart TD
    a([Start]) --> b{Valid?}
    b -->|yes| c[Process]
    b -->|no| d([Reject])
    c --> e([Done])
`;
const MERMAID_GRAPH = `graph LR;
    a-->b;
    b-->c;
`;

/* The use-case CONVENTION riding the flowchart header: ((circle)) actors,
   ([stadium]) use cases, a subgraph boundary. This must land on the use-case
   canvas, and it exercises the fork detection cannot see from any first line
   — `detectMermaidUseCase` is the only thing separating it from
   MERMAID_FLOWCHART above, so this fixture failing means every pasted
   use-case document silently renders as a flowchart again. Declared with the
   subgraph before any edge because membership is first-mention. */
const MERMAID_USECASE = `flowchart TD
    customer((Customer))
    subgraph shop [Web Shop]
      order([Place an order])
      pay([Pay for it])
    end
    customer --> order
    order -.->|include| pay
`;

/* Mermaid's own timeline, exact header word and one period row per line. The
   continuation spelling (a row beginning `:`) is exercised by
   `check:mermaid`; here the question is only which canvas claims it. */
const MERMAID_TIMELINE = `timeline
  title How the platform grew
  2016 : Two people and a prototype
  2018 : First paying customer : Split the monolith
`;

/* Derived, never hand-written: the JSON case has to be the JSON this app
   actually emits, or the test proves something about a document nobody
   produces. */
const seededC4 = parseViewSource(VIEW_SEED_TEXT.c4);
const C4_JSON =
  seededC4.status === "ok" && seededC4.value.kind === "c4"
    ? seededC4.value.synced.jsonText
    : "";

for (const [label, text, kind] of [
  ["C4 .alab", VIEW_SEED_TEXT.c4, "c4"],
  ["sequence .alab", VIEW_SEED_TEXT.sequence, "sequence"],
  ["flowchart .alab", VIEW_SEED_TEXT.flowchart, "flowchart"],
  ["use-case .alab", VIEW_SEED_TEXT.usecase, "usecase"],
  ["arch-lab JSON", C4_JSON, "c4"],
  ["Mermaid C4", MERMAID_C4, "c4"],
  ["Mermaid sequenceDiagram", MERMAID_SEQUENCE, "sequence"],
  /* These two rows are one assertion wearing two labels: the SAME header
     word must land on two different canvases, decided only by what the
     strict use-case parser accepts. The flowchart row failing as "usecase"
     is the theft `usecase-mapping.ts` argues cannot happen — a step bracket
     and a labelled arrow must keep it a flowchart. */
  ["Mermaid flowchart", MERMAID_FLOWCHART, "flowchart"],
  ["Mermaid graph (the old spelling)", MERMAID_GRAPH, "flowchart"],
  ["Mermaid flowchart in the use-case convention", MERMAID_USECASE, "usecase"],
  /* The eighth kind's two dialects. The `.alab` row is the one that matters
     most on this branch: `timeline` was the GANTT's header word until the
     rename, so "which canvas does `archlab 1.0 timeline` open" is a question
     with two plausible answers in this repo's own history, and only one right
     one. */
  ["timeline .alab", VIEW_SEED_TEXT.timeline, "timeline"],
  ["Mermaid timeline", MERMAID_TIMELINE, "timeline"],
  /* The ninth kind, and the only one with a single dialect. There is no
     Mermaid row to pair with it because Mermaid has no lifecycle notation —
     `stateDiagram-v2` is a state machine, not one subject's history — and
     inventing a row here would be asserting a conversion the product
     deliberately does not offer. */
  ["lifecycle .alab", VIEW_SEED_TEXT.lifecycle, "lifecycle"],
]) {
  const result = parseViewSource(text);
  check(
    `${label} renders as a ${kind} document`,
    result.status === "ok" && result.value.kind === kind,
    result.status === "ok"
      ? `got kind "${result.value.kind}"`
      : JSON.stringify(result.error),
  );
  if (result.status === "ok") {
    check(
      `${label} describes itself for the UI`,
      typeof describeDocument(result.value) === "string" &&
        describeDocument(result.value).length > 0,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 2. Both route seeds parse                                                */
/* ----------------------------------------------------------------------- */

console.log("\nthe seeds the ?d= values open with");

/* DERIVED FROM THE SEED TABLE, not a hand-listed four. `VIEW_SEED_TEXT` is a
   total `Record<SeedKind, string>`, so reading its keys covers every `?d=`
   value that exists — the same move the registry sweep below had to make
   after two registries were added and its hand-written list was not
   (`codebase.md`, habit 4: a hardcoded list cannot notice the thing it has
   never heard of). Four of the eight seeds went unchecked here until this. */
for (const seed of Object.keys(VIEW_SEED_TEXT)) {
  const result = parseViewSource(VIEW_SEED_TEXT[seed]);
  check(
    `the "${seed}" seed parses — the page never opens on an error`,
    result.status === "ok" && result.value.kind === seed,
    result.status === "ok" ? undefined : JSON.stringify(result.error),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. Failures keep their parser's precision                                */
/* ----------------------------------------------------------------------- */

console.log("\nfailures stay located");

const BROKEN_C4 = `archlab 1.0
title "Broken"

@context d-ctx "Context"
  a:sistem "A"
`;
const BROKEN_SEQUENCE = `archlab 1.0 sequence
title "Broken"

@sequence
  a -> ghost : "x"
`;
const BROKEN_MERMAID_SEQUENCE = "sequenceDiagram\n  A->>B hello\n";
/* The edge names a node nobody declared — a failure located by the RESOLVE
   pass, not the line scanner, so it proves resolve errors carry a location
   too (the caret quote renders from exactly these fields). */
const BROKEN_FLOWCHART = `archlab 1.0 flowchart
title "Broken"

@flowchart
  start s "Start"

  s -> ghost
`;
/* A hexagon node — a shape the importer REFUSES by name rather than guesses;
   the refusal must still be a located parse error, not a crash or a generic
   "unknown format". (This fixture WAS the circle `((...))`, which is now
   imported as a terminator — the refusal blocked a real user document whose
   actors were circles, so it was deliberately dropped; the hexagon keeps the
   refusal path itself under test.) */
const BROKEN_MERMAID_FLOWCHART = "flowchart TD\n  a{{Prep}} --> b[Step]\n";
/* The edge names an element nobody declared — located by the use-case
   grammar's resolve pass, so this proves the fourth kind's failures carry a
   line/column too (a use-case typo answered with an unlocated message would
   leave the caret quote with nothing to point at). */
const BROKEN_USECASE = `archlab 1.0 usecase
title "Broken"

@usecase
  actor a "A"

  a -- ghost
`;

for (const [label, text] of [
  ["a C4 .alab typo", BROKEN_C4],
  ["a sequence .alab typo", BROKEN_SEQUENCE],
  ["a flowchart .alab typo", BROKEN_FLOWCHART],
  ["a use-case .alab typo", BROKEN_USECASE],
  ["a Mermaid sequence typo", BROKEN_MERMAID_SEQUENCE],
  ["a refused Mermaid flowchart shape", BROKEN_MERMAID_FLOWCHART],
]) {
  const result = parseViewSource(text);
  const located =
    result.status === "error" &&
    Number.isInteger(result.error.line) &&
    result.error.line >= 1 &&
    typeof result.error.message === "string" &&
    /line \d+, column \d+/.test(result.error.message);
  check(
    `${label} fails with a line and a column the caret quote can use`,
    located,
    JSON.stringify(result.status === "error" ? result.error : result).slice(
      0,
      160,
    ),
  );
}

{
  /* JSON is the one reader that locates by PATH rather than line/column, and
     the UI renders that instead of a caret — so "located" means something
     different here and is asserted separately rather than loosened above. */
  const broken = C4_JSON.replace('"version"', '"verzion"');
  const result = parseViewSource(broken);
  check(
    "a JSON typo fails with the validator's own issues",
    result.status === "error" &&
      result.error.kind === "json" &&
      Array.isArray(result.error.issues) &&
      result.error.issues.length > 0,
    JSON.stringify(result.status === "error" ? result.error : result).slice(
      0,
      160,
    ),
  );
}

/* ----------------------------------------------------------------------- */
/* 4. "Unknown format" is reserved for text nobody could route              */
/* ----------------------------------------------------------------------- */

console.log("\nunknown-format is the last resort, not the first");

for (const [label, text] of [
  ["prose", "hello there, this is not a diagram"],
  ["an empty pane", "   \n  "],
]) {
  const result = parseViewSource(text);
  check(
    `${label} is reported as unrecognised, with something to do about it`,
    result.status === "error" &&
      result.error.kind === "unknown-format" &&
      result.error.message.length > 0,
    JSON.stringify(result.status === "error" ? result.error : result).slice(
      0,
      160,
    ),
  );
}

for (const [label, text] of [
  ["a recognisable C4 header", BROKEN_C4],
  ["a recognisable sequence header", BROKEN_SEQUENCE],
  ["a recognisable flowchart header", BROKEN_FLOWCHART],
  ["a recognisable use-case header", BROKEN_USECASE],
  ["a recognisable Mermaid header", BROKEN_MERMAID_SEQUENCE],
  ["a recognisable Mermaid flowchart header", BROKEN_MERMAID_FLOWCHART],
]) {
  const result = parseViewSource(text);
  check(
    `${label} is never answered with "unknown format"`,
    result.status === "error" && result.error.kind !== "unknown-format",
    JSON.stringify(result.status === "error" ? result.error.kind : result),
  );
}

/* ----------------------------------------------------------------------- */

/* ----------------------------------------------------------------------- */
/* `?e=` is one flat namespace over all four example registries             */
/* ----------------------------------------------------------------------- */

{
  /* Read from SOURCE, not by importing the services: they pull in
     `.archlab.json` through import attributes this harness deliberately does
     not support — the same purity constraint that makes this script catch a
     barrel import dragging in a `.tsx`. The ids are literals, so reading them
     is exact. */
  const idsIn = (file) =>
    [...read(file).matchAll(/^\s*(?:\{\s*)?id: "([a-z0-9-]+)"/gm)].map(
      (m) => m[1],
    );

  /* DERIVED, not four hand-listed files. Two registries were added and this
     list was not, so ER and dictionary ids went unchecked for collisions —
     the same silent gap the resolver had. Reading the directory means a
     seventh registry is covered the day it exists. */
  const REGISTRY_FILES = [
    ["C4", "src/features/viewer/service/model-service.ts"],
    ...readdirSync(path.join(ROOT, "src/features"))
      .filter((feature) =>
        existsSync(
          path.join(
            ROOT,
            "src/features",
            feature,
            "service/example-service.ts",
          ),
        ),
      )
      .map((feature) => [
        feature,
        `src/features/${feature}/service/example-service.ts`,
      ]),
  ];
  const registryIds = REGISTRY_FILES.map(([name, file]) => [name, idsIn(file)]);

  /* `?e=` spans EVERY registry so a reader never has to know which kind an id
     belongs to. The day two collide it resolves whichever is looked up first —
     a bundled example quietly opening as the wrong document. Counted pairwise
     rather than as a set, so the message can name which two disagree. */
  const clashes = [];
  for (let i = 0; i < registryIds.length; i += 1) {
    for (let j = i + 1; j < registryIds.length; j += 1) {
      const [aName, aIds] = registryIds[i];
      const [bName, bIds] = registryIds[j];
      const shared = aIds.filter((id) => bIds.includes(id));
      if (shared.length > 0) clashes.push([aName, bName, shared]);
    }
  }

  check(
    `example ids are unique across all ${registryIds.length} registries (` +
      registryIds.map(([name, ids]) => `${ids.length} ${name}`).join(" + ") +
      ")",
    clashes.length === 0 && registryIds.every(([, ids]) => ids.length > 0),
    clashes.length > 0
      ? clashes
          .map(
            ([a, b, shared]) =>
              `${a} and ${b} both define: ${shared.join(", ")}`,
          )
          .join("; ")
      : "a registry parsed zero ids — has one moved?",
  );

  /* THE UNION, not the `?e=` resolver that used to hold it. `exampleTextFor`
     asked all nine registries by hand until they were collected into
     `example-registry.ts`, which the MCP example tools read too — so this is
     now the ONE file where forgetting a registry hides a whole notation from
     both the playground and every agent. The assertion is unchanged in
     substance: every registry on disk must be named by the file that claims
     to ask all of them. */
  const resolver = read("src/features/playground/lib/example-registry.ts");

  /* DERIVED FROM THE FILESYSTEM, not a list of four names. THE BUG THIS
     REPLACES A WEAKER ASSERTION FOR: the ER and dictionary registries were
     added and the resolver was not, so every "Open in the playground" link
     from a /demo card of either kind returned `null`. And `null` is the same
     answer an UNKNOWN id gives — the deliberate fall-back-to-the-seed path —
     so the playground opened on the C4 seed with no error, no 404 and nothing
     anywhere reporting a problem. The previous version of this check listed
     the four loaders it knew by name and passed happily while two registries
     went unasked. A hardcoded list cannot notice a registry it has never
     heard of; the filesystem can. */
  const registries = readdirSync(path.join(ROOT, "src/features"))
    .filter((feature) =>
      existsSync(
        path.join(ROOT, "src/features", feature, "service/example-service.ts"),
      ),
    )
    .map((feature) => ({
      feature,
      loader: /export function (load\w+Example)\(/.exec(
        read(`src/features/${feature}/service/example-service.ts`),
      )?.[1],
    }));
  const unasked = registries.filter(
    ({ loader }) => loader === undefined || !resolver.includes(loader),
  );
  check(
    `the registry union asks every example registry that exists (${registries.length} found)`,
    registries.length >= 4 && unasked.length === 0,
    unasked.length === 0
      ? `only ${registries.length} registries found — has a service moved?`
      : `never asked: ${unasked.map((r) => r.feature).join(", ")} — a registry the union never asks is a set of demo cards whose ?e= links all open the default seed, and a notation no agent can see through list_example_models`,
  );
  /* The C4 registry has no `load*Example` export (its service predates that
     convention), so it is named directly — but named HERE, beside the derived
     check, rather than being one of four names that hid the gap. */
  check(
    "the registry union asks the C4 model registry too",
    resolver.includes("loadViewerModel"),
    "C4 models are the one registry without a load*Example export",
  );
  check(
    "an unknown ?e= falls back rather than throwing",
    /return null;/.test(read("src/features/playground/lib/example-param.ts")),
    "a stale link should still open a working playground",
  );
  check(
    "the route feeds ?e= to the playground server-side",
    read("src/app/live/page.tsx").includes("exampleTextFor"),
    "resolving after hydration would show the seed, then replace it",
  );
}

/* ----------------------------------------------------------------------- */
/* The bundled use-case examples parse                                      */
/* ----------------------------------------------------------------------- */

{
  /* The use-case registry can be LOADED here, unlike the C4 one (whose
     service pulls `.archlab.json` through import attributes this harness
     does not support) — its whole import graph is pure `.ts`. So its
     documents are asserted to parse directly: a registered example that
     stops parsing still SHIPS — as a visible `invalid` card on /demo and a
     parse-error page on /live/usecase/<id>, by design — but a green suite
     must not claim every bundled document opens while one renders an error.
     `pnpm build` cannot catch this; the routes render the failure rather
     than throwing. */
  const { listUseCaseExamples } = await import(
    pathToFileURL(
      path.join(ROOT, "src/features/usecase/service/example-service.ts"),
    ).href
  );
  console.log("\nthe bundled use-case examples parse");
  for (const listing of listUseCaseExamples()) {
    check(
      `use-case example "${listing.status === "ok" ? listing.summary.id : listing.id}" parses`,
      listing.status === "ok",
      listing.status === "ok" ? undefined : listing.message,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* The starters the source pane offers must parse                           */
/* ----------------------------------------------------------------------- */

{
  /* A starter is what replaces the pane when someone presses "Start from",
     so one that does not parse greets a new document with a parse error —
     the exact moment a first document is most likely to be abandoned. Each is
     also asserted to detect as the kind its button claims, because the button
     is a promise about which grammar you are now writing. */
  for (const [kind, text] of Object.entries(VIEW_STARTER_TEXT)) {
    const parsed = parseViewSource(text);
    check(
      `the ${kind} starter parses`,
      parsed.status === "ok",
      parsed.status === "ok" ? undefined : JSON.stringify(parsed.error),
    );
    check(
      `the ${kind} starter detects as ${kind}`,
      parsed.status === "ok" && parsed.value.kind === kind,
    );
    check(
      `the ${kind} starter is smaller than the ${kind} seed example`,
      text.length < VIEW_SEED_TEXT[kind].length,
      "a starter is a shape to type into; the seed is a finished document",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* The format toggle converts EVERY kind, in BOTH directions                */
/* ----------------------------------------------------------------------- */

/*
 * The pane's `.alab / Mermaid` control switches by rewriting the text, and
 * the rewrite is only honest if the rewritten text still PARSES — the
 * playground re-parses it immediately, and a conversion the reader cannot
 * re-parse shows an error box and leaves the radio stuck on `.alab`. That is
 * exactly how the flowchart toggle shipped broken: `serializeMermaidFlowchart`
 * writes the title as YAML frontmatter, the Mermaid parser reads frontmatter,
 * but the first-line DETECTORS did not skip it — so the toggle's own output
 * came back "unknown format" and Mermaid was unclickable on a flowchart
 * document. This section would have failed on that day for the flowchart row,
 * and now guards all four kinds symmetrically. The use-case row carries an
 * extra way to fail that the others cannot: its Mermaid emitter shares the
 * flowchart header, so its output must ALSO re-pass `detectMermaidUseCase` —
 * an emitted document the detector declines would come back as a flowchart,
 * silently changing the document's kind under the toggle.
 */

/**
 * THE OTHER HALF OF THE TOGGLE: the kinds whose Mermaid side must be DISABLED.
 *
 * The section below proves the button works where it is offered. This one
 * proves it is not offered where it cannot work, and it exists because that
 * failed silently once. `lifecycle` was added as a kind and nobody added it to
 * the toggle's refusal list, so its Mermaid radio stayed enabled: pressing it
 * ran `convertedSourceText`, which returned the `.alab` text UNCHANGED, the
 * pane re-detected `.alab`, the radio snapped back, and the live region
 * announced "Converted the pane to Mermaid." Nothing threw. Nothing rendered
 * wrong. A screen-reader user was simply told a lie.
 *
 * WHICH KINDS ARE INERT IS DERIVED, NEVER LISTED. A hand-written list here
 * would have the same defect as the ternary this replaced — the tenth
 * notation would be missing from it too. Instead every starter is actually
 * converted and the ones that come back as `.alab` are the inert set, so a
 * new kind joins it by behaving that way rather than by anyone remembering.
 * Each one must then appear in `MERMAID_KIND_REFUSALS` in the pane component,
 * which is what disables its button and gives it a sentence.
 *
 * TWO MECHANISMS COUNT AS REFUSING, and the assertion accepts either, because
 * the first draft of it assumed only one and was wrong within the minute.
 * `MERMAID_KIND_REFUSALS` refuses by KIND. Gantt is refused per DOCUMENT — the
 * conversion runs both ways and only a plan with no `starts` line has nothing
 * to anchor to — and the gantt STARTER happens to be exactly such a plan, so
 * it lands in this set too and is caught by that branch instead. What matters
 * is that the pane names the kind somewhere in the refusal it resolves, not
 * which of the two shapes it used; pinning the shape would make this assertion
 * a description of today's code rather than of the behaviour it guards.
 */

console.log("\na kind that cannot become Mermaid has its button disabled");

const PANE_SOURCE = readFileSync(
  path.join(ROOT, "src/features/playground/components/view-playground.tsx"),
  "utf8",
);
const refusalTable = PANE_SOURCE.slice(
  PANE_SOURCE.indexOf("const MERMAID_KIND_REFUSALS"),
  PANE_SOURCE.indexOf("/** The mirror of `MERMAID_IMPORT_CAVEATS`"),
);
/* The per-document branch beside the table, so a kind refused that way counts
   as refused. Sliced from the gate rather than searched for by name: this must
   fail when the gate stops mentioning a kind, not when a comment does. */
const refusalGate = PANE_SOURCE.slice(
  PANE_SOURCE.indexOf("const refusal ="),
  PANE_SOURCE.indexOf("const unsupported ="),
);

for (const [kind, text] of Object.entries(VIEW_STARTER_TEXT)) {
  const parsed = parseViewSource(text);
  if (parsed.status !== "ok") continue;
  const converted = parseViewSource(
    convertedSourceText(parsed.value, "mermaid"),
  );
  const inert =
    converted.status === "ok" &&
    converted.value.kind === kind &&
    converted.value.format === "alab";
  if (!inert) continue;
  check(
    `${kind}: asking for Mermaid returns .alab, so the pane must refuse that half of the toggle by name`,
    new RegExp(`\\b${kind}\\b`).test(refusalTable + refusalGate),
    `converting a ${kind} document to Mermaid is a no-op, but the pane has ` +
      "no refusal sentence for it — the button is enabled, does nothing, and " +
      'announces "Converted the pane to Mermaid." to a screen reader',
  );
}

console.log("\nthe format toggle round-trips every kind");

for (const kind of ["c4", "sequence", "flowchart", "usecase"]) {
  const parsed = parseViewSource(VIEW_STARTER_TEXT[kind]);
  check(
    `the ${kind} starter parses (precondition for the toggle rows below)`,
    parsed.status === "ok",
  );
  if (parsed.status !== "ok") continue;

  const mermaid = convertedSourceText(parsed.value, "mermaid");
  const reparsed = parseViewSource(mermaid);
  check(
    `converting a ${kind} document to Mermaid yields text the pane re-parses as ${kind}/mermaid — otherwise the Mermaid side of the toggle is a dead button`,
    reparsed.status === "ok" &&
      reparsed.value.kind === kind &&
      reparsed.value.format === "mermaid",
    reparsed.status === "ok"
      ? `got ${reparsed.value.kind}/${reparsed.value.format}`
      : JSON.stringify(reparsed.error).slice(0, 160),
  );
  if (reparsed.status !== "ok") continue;

  const back = convertedSourceText(reparsed.value, "alab");
  const restored = parseViewSource(back);
  check(
    `converting the ${kind} Mermaid back to .alab re-parses as ${kind}/alab (or json) — the other direction of the same button`,
    restored.status === "ok" &&
      restored.value.kind === kind &&
      restored.value.format !== "mermaid",
    restored.status === "ok"
      ? `got ${restored.value.kind}/${restored.value.format}`
      : JSON.stringify(restored.error).slice(0, 160),
  );
}

{
  /* The flowchart round trip must also KEEP the document: title (rides the
     frontmatter the detectors now skip), every node with its shape, every
     edge with its label. Without this, the toggle could "work" by producing
     a parseable but different document. */
  const parsed = parseViewSource(VIEW_STARTER_TEXT.flowchart);
  const there = parseViewSource(convertedSourceText(parsed.value, "mermaid"));
  const backAgain =
    there.status === "ok"
      ? parseViewSource(convertedSourceText(there.value, "alab"))
      : there;
  check(
    "a flowchart survives .alab → Mermaid → .alab with title, shapes and edge labels intact — the toggle rewrites the spelling, never the model",
    backAgain.status === "ok" &&
      backAgain.value.file.metadata.title ===
        parsed.value.file.metadata.title &&
      JSON.stringify(
        backAgain.value.file.nodes.map((n) => [n.id, n.shape, n.label]),
      ) ===
        JSON.stringify(
          parsed.value.file.nodes.map((n) => [n.id, n.shape, n.label]),
        ) &&
      JSON.stringify(backAgain.value.file.edges) ===
        JSON.stringify(parsed.value.file.edges),
    backAgain.status === "ok" ? undefined : JSON.stringify(backAgain.error),
  );
}

/* ----------------------------------------------------------------------- */
/* The canvas pane keeps its height on a phone                              */
/* ----------------------------------------------------------------------- */

/*
 * A source assertion, because the bug is invisible to every other check here:
 * the reader detected the document, the parser built the model, and the canvas
 * still rendered as a smudge — or, on iOS Safari, as nothing at all.
 *
 * `flex-1` is `flex: 1 1 0%`, and in a COLUMN flex container `flex-basis` is
 * the main size and outranks `height`. Both canvas panes set
 * `max-lg:h-[70svh]` on themselves and both also carried an unprefixed
 * `flex-1`, so below `lg` the height was never used: the pane fell back to its
 * content height (~250px, at which a wide C4 model fits only at MIN_ZOOM), and
 * Safari — which resolves the intrinsic contribution of a `flex-basis: 0%`
 * item to zero — collapsed it further and shipped an empty box.
 *
 * The rule: an element that sets a `max-lg:` height must not also grow at that
 * breakpoint. `lg:flex-1` is fine, and is what both now use.
 */
{
  const playground = read(
    "src/features/playground/components/view-playground.tsx",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const panes = [...playground.matchAll(/"([^"]*max-lg:h-\[70svh\][^"]*)"/g)];
  check(
    "both canvas panes still claim a viewport-relative height below lg",
    panes.length === 2,
    `found ${panes.length} pane class strings carrying max-lg:h-[70svh], expected 2 (C4, and the shared sequence/flowchart pane)`,
  );
  for (const [, classes] of panes) {
    check(
      "a pane that sets a max-lg height does not also grow unprefixed",
      !/(^|\s)flex-1(\s|$)/.test(classes),
      `"flex-1" sets flex-basis:0%, which beats height in a column — use lg:flex-1. Offending classes: ${classes}`,
    );
  }

  const workbench = read("src/components/ui/split-workbench.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  /* FOUND BY THE ELEMENT, not by its exact class string. This asserted the
     whole `className` verbatim, so adding `max-lg:order-first` to the same
     wrapper — a change that cannot affect a height — failed it, which is an
     assertion about a value where the rule is about a property. The wrapper is
     identified by the child it renders instead, and only the growth rule is
     measured. */
  const canvasWrapper = /<div className="([^"]*)">\s*\{canvas\}/.exec(
    workbench,
  );
  check(
    "the workbench's canvas wrapper is findable by the canvas it renders",
    canvasWrapper !== null,
    "no `<div className=…>{canvas}</div>` in split-workbench.tsx — the growth rule below cannot be measured",
  );
  check(
    "the workbench's canvas wrapper only grows at lg, so the pane's own height rules below it",
    canvasWrapper !== null &&
      /(^|\s)lg:flex-1(\s|$)/.test(canvasWrapper[1]) &&
      !/(^|\s)flex-1(\s|$)/.test(canvasWrapper[1]),
    "the wrapper grows unprefixed again — it will cancel the pane's max-lg height",
  );
}

console.log(
  "\nselecting a row is a press, and a press is reachable by keyboard",
);

/* THE THREE CANVASES THAT LET A READER SELECT A ROW — the gantt, the timeline
   and the lifecycle — used to do it on HOVER as well as on click, and the
   hover was withdrawn: a selection that follows the pointer fires on the way
   to somewhere else, so crossing the canvas set and cleared it repeatedly
   without the reader meaning any of it.

   WHAT THAT COSTS IF IT IS DONE CARELESSLY, and what these assertions exist to
   stop: those rows are `<rect>`s carrying `role="button"` and `tabIndex={0}`,
   and NOTHING IN THE PLATFORM makes Enter or Space activate a non-native
   element. While a hover could light a row that was survivable — a keyboard
   reader could at least tab and look. With the press as the only way to
   select, a canvas missing the key handler is a canvas only a mouse can use,
   and no existing check had an opinion about it.

   DERIVED FROM THE FILESYSTEM, never from a list of three kind names.
   `codebase.md` records three checks in this repo that passed while the
   feature under them was broken, every one because a hardcoded list cannot
   notice what it has never heard of. The set here is "every diagram component
   that makes a shape a button", which a fourth canvas joins by writing the
   role rather than by being remembered. */
{
  const components = readdirSync(path.join(ROOT, "src/features"))
    .flatMap((feature) => {
      const rel = `src/features/${feature}/components/${feature}-diagram.tsx`;
      return existsSync(path.join(ROOT, rel))
        ? [[feature, rel, read(rel)]]
        : [];
    })
    .filter(([, , code]) => /role=\{[^}]*"button"|role="button"/.test(code));

  check(
    `every canvas that makes a shape a button was found (${components.map(([f]) => f).join(", ")})`,
    components.length >= 3,
    `only ${components.length} — the marker stopped matching, so the sweep below proves nothing`,
  );

  for (const [feature, rel, code] of components) {
    check(
      `${feature}: a shape that is a button answers Enter and Space`,
      /onKeyDown=/.test(code),
      `${rel} gives a shape role="button" and tabIndex but no key handler — a control only a mouse can reach`,
    );
    /* AND IT USES THE SHARED HELPER. Six copies of this four-line body existed
       across the canvases before one of them was extracted, which is `dry.md`'s
       own example of real duplication; a seventh written inline would be the
       helper re-implemented one import away from where it lives. */
    check(
      `${feature}: and does it through the one shared keyActivate`,
      /keyActivate/.test(code),
      `${rel} spells the Enter/Space dance out again instead of importing @/lib/key-activate`,
    );
  }

  /* TABBING TO A SHAPE LIGHTS IT, and this is the assertion that lets the
     canvases suppress the browser's focus ring at all.

     Those rings were withdrawn because they were unusable to look at — the hit
     target on three of these canvases is a band the full width of the drawing,
     so `outline` drew a coloured rectangle across the whole diagram. But a
     control that a keyboard reader can reach and cannot SEE is worse than an
     ugly one, so the ring may only go where something else says "you are here".
     On every one of these canvases that something is the focus state itself:
     `onFocus` selects the shape, which lights it and drops everything else.

     THE WIRING IS THE CLAIM, not the stylesheet. A dimming rule can exist and
     still never fire — that is exactly what happened here, where a `forwards`
     entrance held every row at full strength and the focus declarations under
     it applied to nothing for the life of the page. So this asks the component
     whether focus is CONNECTED, and `check:*-motion` asks separately whether
     the entrance lets go so it can take effect. Neither question answers the
     other. */
  for (const [feature, rel, code] of components) {
    check(
      `${feature}: tabbing to a shape selects it, so focus is visible without a ring`,
      /onFocus=/.test(code),
      `${rel} makes a shape focusable but nothing happens when it is focused — with no outline either, a keyboard reader cannot see where they are`,
    );
  }

  /* AND EVERY CANVAS ACTUALLY KILLS THE NATIVE RING, ON BOTH PSEUDO-CLASSES.

     THE FIRST VERSION OF THIS ASSERTION WAS GREEN WITH THE BOX ON SCREEN, and
     that is the whole reason it is written this way. It asked whether any
     stylesheet DECLARED an `outline` other than `none` — and nothing did. The
     rectangle was never authored: `globals.css` puts `outline-ring/50` on every
     element in `@layer base`, so the BROWSER'S OWN indicator paints in `--ring`,
     and Chrome paints `outline: auto` for a plain `:focus` — which is what an
     SVG element with a tabindex gets when it is CLICKED rather than tabbed to.
     Suppressing `:focus-visible` alone left every click showing a violet box.
     `globals.css` had already written that failure down for the use-case and
     flowchart canvases; this asked the wrong question and missed it anyway.

     So the check is now for the SUPPRESSION being present and covering both,
     not for the absence of a declaration. Absence proved nothing, because the
     mark had no declaration behind it. */
  const unsuppressed = components.flatMap(([feature, , code]) => {
    /* THE FEATURE'S OWN HIT CLASS, read out of its component. Deriving it as
       `af-${feature}-hit` would be wrong for the lifecycle, whose class is
       `af-lc-hit`, and a hardcoded map is the thing a seventh canvas would not
       be in. */
    const classes = [
      ...code.matchAll(/className="([^"]*\baf-[\w-]*hit\b[^"]*)"/g),
    ].flatMap((match) =>
      match[1].split(/\s+/).filter((name) => /^af-[\w-]*hit$/.test(name)),
    );
    if (classes.length === 0) return [];

    /* SUPPRESSED IN THE FEATURE'S STYLESHEET OR IN `globals.css` — the
       flowchart and the use case keep theirs in globals beside their shaped
       rings, so both files are searched. But the SELECTOR searched for is
       always this canvas's own class: the first version searched for
       `af-[\w-]*hit:focus` across the concatenation, and `globals.css` carries
       `.af-uc-hit:focus`, so every canvas passed on the use case's rule. A
       break that reverted this very canvas to `:focus-visible` alone stayed
       green. Anchoring the selector is the whole assertion. */
    const stripped = (
      read(`src/features/${feature}/styles/${feature}-motion.css`) +
      read("src/app/globals.css")
    ).replace(/\/\*[\s\S]*?\*\//g, " ");

    return classes.flatMap((name) => {
      /* ONLY A HIT THAT IS ITSELF FOCUSABLE can take `:focus` without
         `:focus-visible`. The sequence canvas puts its handlers on `<g>`
         wrappers rather than on the shape with the tabindex, which is why
         `globals.css` records that it never saw this and needs only the one
         pseudo-class. Asked of the code rather than exempted by name. */
      /* THE ELEMENT IS THE CLASS NAME TO THE NEXT `/>`, with no character
         bound. A bounded window (600) was tried and SILENTLY SKIPPED three
         canvases: their hit rect carries an `onKeyDown` with a five-line
         comment, which pushed the closing `/>` past the window, so `element`
         came back null, `focusable` came back false, and the assertion
         returned early for exactly the canvases it was written for. A break
         reverting one of them to `:focus-visible` alone stayed green. Comments
         are stripped first so a `/*` inside one cannot end an element early. */
      const naked = code.replace(/\/\*[\s\S]*?\*\//g, " ");
      const at = naked.search(
        new RegExp(`className="[^"]*\\b${name}\\b[^"]*"`),
      );
      if (at < 0) return [];
      const element = naked.slice(at, naked.indexOf("/>", at));
      if (!/tabIndex=/.test(element)) return [];

      const inComponent = new RegExp(
        `className="[^"]*\\b${name}\\b[^"]*focus-visible:outline-none`,
      ).test(code);
      const plain = new RegExp(`\\.${name}:focus\\b(?!-visible)`).test(
        stripped,
      );
      const visible = new RegExp(`\\.${name}:focus-visible`).test(stripped);
      return (plain && visible) || (inComponent && plain) ? [] : [name];
    });
  });
  check(
    `every focusable hit target kills the native ring on :focus too (${components.length} canvases)`,
    unsuppressed.length === 0,
    `${unsuppressed.join(", ")} — a CLICK on an SVG element with a tabindex gives it :focus WITHOUT :focus-visible, and the browser paints outline: auto in --ring for that`,
  );

  /* FOCUS ADDS A MARK, IT STILL DOES NOT REPAINT ONE — and this is the line
     that moved, so it is the line that has to be pinned.

     Every one of these canvases carries a standing rule that focus DIMS and
     never REPAINTS: no stroke, fill, width or radius on an existing mark
     changes in either direction, because a focused dot that recolours is a new
     mark where one already was. That rule stands. What it did not say is that
     dimming only ever SUBTRACTS — everything unrelated goes quiet and the thing
     the reader chose gains nothing — which is what a reader reported as the
     focus style not reading well, suggesting a colour change or a glow.

     BOTH SUGGESTIONS HAVE BEEN TRIED HERE AND REMOVED. `new-diagram-type.md`
     records that the rule "used to permit a glow, a colour or a weight, and
     colour and weight were both added and then removed, twice"; the glow was
     an SVG `filter` whose region collapsed on axis-aligned geometry and painted
     bands across the ER canvas, at a cost of three commits. So the answer is
     the one that rule points at — "want a soft edge? draw a wider path" — a
     real SVG shape in space the layout already reserved.

     TWO THINGS ARE ASSERTED, and neither is "a ring exists". First that the
     ring is a DRAWN SHAPE rather than a filter, because a filter is the thing
     that shipped broken. Second that it is drawn BESIDE the mark rather than
     on it, which is what keeps "focus does not repaint" true: if a canvas ever
     satisfies this by restyling its dot, both halves of the rule are gone and
     this check would have blessed it. */
  const haloed = components.filter(([, , code]) => /-ring"/.test(code));
  check(
    `every canvas that lights a selection draws a shaped ring (${haloed.map(([f]) => f).join(", ")})`,
    haloed.length >= 3,
    `only ${haloed.length} — dimming alone subtracts and adds nothing, which is what a reader called weak`,
  );
  for (const [feature, rel, code] of haloed) {
    check(
      `${feature}: its focus ring is a drawn shape, not an SVG filter`,
      !/filter=|filter:/.test(code),
      `${rel} reaches for a filter — a percentage filter region is in objectBoundingBox units, and axis-aligned geometry collapses it (three commits on the ER canvas)`,
    );
    /* THE RING IS ITS OWN ELEMENT, never a class added to the mark. Asserted by
       requiring the class to appear on a line that OPENS an element, so
       `className="af-lc-dot af-lc-ring"` — restyling the dot, which is the
       repaint the rule forbids — cannot satisfy it. */
    const own = new RegExp(
      `className="af-[\\w-]*-ring"[\\s\\S]{0,40}?(cx=|x=)`,
    ).test(code);
    check(
      `${feature}: and is drawn beside the mark rather than onto it`,
      own,
      `${rel} carries the ring class on an existing mark — focus would then be repainting one, which every one of these canvases forbids in its own header`,
    );
  }

  /* AND NO CANVAS DRAWS ONE OF ITS OWN BACK. Written as the absence of the
     mechanism for the same reason the hover rule below is: restoring a focus
     outline is the obvious thing to do if someone reads the accessibility rule
     without reading what replaced it, and in a diff it would look like a fix. */
  const ringed = readdirSync(path.join(ROOT, "src/features")).flatMap(
    (feature) => {
      const rel = `src/features/${feature}/styles/${feature}-motion.css`;
      if (!existsSync(path.join(ROOT, rel))) return [];
      const css = read(rel).replace(/\/\*[\s\S]*?\*\//g, " ");
      /* THE VALUE IS READ AND COMPARED, never matched with a negative
         lookahead. The first draft asked for `outline:\s*(?!none)` and reported
         EVERY canvas, the fixed ones included: `\s*` backtracks to empty, the
         lookahead then sits on the space before "none" instead of on "none",
         and it succeeds for any value at all. An assertion that cannot pass is
         as useless as one that cannot fail, and it is louder about it. */
      return [...css.matchAll(/:focus-visible[^{]*\{([^}]*)\}/g)].some(
        (rule) => {
          const value = /outline:\s*([^;]+)/.exec(rule[1]);
          return value !== null && value[1].trim() !== "none";
        },
      )
        ? [feature]
        : [];
    },
  );
  check(
    "no canvas draws a focus outline on its hit target",
    ringed.length === 0,
    `${ringed.join(", ")} — the hit target is a full-width band, so an outline is a coloured bar across the drawing`,
  );

  /* NO POINTER-HOVER SELECTION ANYWHERE IN THAT FAMILY. Asserted as the
     ABSENCE of the mechanism rather than as the presence of a click, because
     the defect being prevented is a re-addition: the obvious way to "make the
     canvas feel responsive" later is to put the hover back, and it would look
     like an improvement in the diff. */
  const hovering = components.filter(([, , code]) =>
    /onPointerEnter=/.test(code),
  );
  check(
    "no canvas selects a row on hover",
    hovering.length === 0,
    `${hovering.map(([f]) => f).join(", ")} — a selection that follows the pointer fires on the way to somewhere else`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} view-input assertions passed.`);
