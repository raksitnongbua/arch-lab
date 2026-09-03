#!/usr/bin/env node
/**
 * Quick fixes for `.alab` parse errors: the parser is allowed to offer the
 * reader a one-click rewrite, and this proves the offers are honest.
 *
 * Nothing else can catch a regression here, and the reason is that the failure
 * is SILENT IN THE WORST WAY. A wrong fix does not throw and does not fail a
 * build: the reader clicks a button, the error goes away, the diagram
 * re-renders, and it draws something they did not write. `pnpm build`
 * type-checks the plumbing; `check:archtext` and its siblings prove the
 * grammar still refuses what it refused. Neither can say that applying a fix
 * lands on the model the author had before they made the typo.
 *
 * It loads the REAL modules through Node's type stripping — nine parsers, the
 * nine serializers, `lib/fix.ts`, `lib/issue-codes.ts` and the playground's
 * bundled-example registry — so this exercises what the app ships. That also
 * PINS THE PURITY of `fix.ts` and `issue-codes.ts`, the duty `check:view-input`
 * performs for its sibling: type stripping cannot read `.tsx`, so an import
 * reaching a feature barrel that exports a component fails here loudly rather
 * than quietly removing the module from its only harness.
 *
 * What it asserts:
 *
 *   1. EVERY THROW SITE IS ON THE RATCHET. The three main parsers and the
 *      shared cursor are read off the filesystem, every `failAt(` / `.fail(`
 *      call is located, and the ones carrying no `code:` are counted. The
 *      count may FALL and never RISE above `UNCODED_BASELINE`. A new error
 *      kind added without a code is one the UI can only render as prose, and
 *      prose is not a discriminator — nine sites in this feature share a
 *      sentence byte for byte.
 *   2. THE REGISTRY IS CLOSED BOTH WAYS. Every `ISSUE_CODES` key is raised by
 *      at least one parser, and every code a parser raises is registered. A
 *      key nothing raises is a promise to the UI that cannot be kept; a code
 *      nothing registers has no declared fixability, so assertion 3 would
 *      skip it in silence.
 *   3. FIXABILITY IS HONOURED AT RUNTIME, over every fixture and every
 *      mutation this script produces: `none` carries no `fixes` at all,
 *      `safe` carries only `safe` candidates, and `choice` carries NO safe
 *      candidate. This is the assertion that keeps a guess out of the
 *      one-click path — the UI reads `kind` to decide whether a fix gets a
 *      button or a radio list, and a `choice` code leaking a `safe` candidate
 *      is a keyword typo one keystroke from the author's text.
 *   4. A SAFE FIX IS MINIMAL AND STRICTLY ADVANCES. Every byte outside the
 *      edit ranges is identical after applying it, and re-parsing either
 *      succeeds or fails at a strictly later `(line, column)`. Minimality is
 *      what makes the diff reviewable, which is this product's whole
 *      collaboration story; advancement is what stops a "fix" that re-raises
 *      the same error and leaves the reader clicking a button that does
 *      nothing.
 *   5. NO SILENT DEFORMATION — the generated mutation corpus, and the
 *      assertion that earns this script. Every bundled example, in every
 *      notation, is broken on purpose once per safe code — a line tabbed, an
 *      arrow spelled the Mermaid way, a quote dropped, `id:type` spaced out —
 *      and then: the parser must report THAT code, the fix must apply, and
 *      `serialize(parse(fixed))` must equal `serialize(parse(original))`. The
 *      fix has to restore the MODEL, not merely make the text parse. A fix
 *      that quotes to end of line rather than to the next token makes a
 *      document that parses beautifully and has eaten the technology field;
 *      only a round trip through the model can see that.
 *      And its converse, asserted separately: A CODE THE CORPUS CANNOT SEED A
 *      MUTATION FOR IS NOT ALLOWED TO BE `safe`. An unexercised one-click
 *      rewrite is the same risk with none of the evidence.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT: that any message still reads the way
 * it did. Adding a code to a throw site must not touch its sentence, and the
 * proof of that lives in the scripts that already pin the prose —
 * `check:archtext`, `check:sequence`, `check:flowchart`, `check:usecase`,
 * `check:syntax-docs` and `check:skill` carry ~150 substring assertions and 7
 * byte-exact ones between them. Restating any of that here would be a second
 * copy of a contract that already has an owner. Run them alongside this.
 *
 * Exits non-zero on any failure. Run with: pnpm check:quickfix
 */

import { existsSync, readFileSync, statSync } from "node:fs";
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
   * code to suit this script. Same hook, same reasoning, as
   * `scripts/mcp-check.mjs`, which reaches the same registry.
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

const archtext = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { ISSUE_CODES, applyTextEdit, offsetOf } = archtext;
const { listBundledExamples, loadBundledExample } = await import(
  pathToFileURL(
    path.join(ROOT, "src/features/playground/lib/example-registry.ts"),
  ).href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function ok(label) {
  assertions += 1;
  console.log(`  ✓ ${label}`);
}

function bad(label, detail) {
  failures += 1;
  assertions += 1;
  console.log(`  ✗ ${label}`);
  if (detail !== undefined) console.log(`      ${detail}`);
}

function expect(condition, label, detail) {
  if (condition) ok(label);
  else bad(label, detail);
}

/* ----------------------------------------------------------------------- */
/* The nine grammars, by the header word that selects them                  */
/* ----------------------------------------------------------------------- */

/**
 * A parse/serialize pair per document kind, keyed by the `SeedKind` the
 * bundled-example registry reports. Written out because the barrel exports
 * nine named functions rather than a table; `EXAMPLE_KINDS` is a total record
 * on the registry side, so a tenth notation shows up here as an undefined
 * lookup and fails loudly at the first example it holds.
 */
const GRAMMARS = {
  c4: [archtext.parseArchText, archtext.serializeArchText],
  sequence: [archtext.parseSequenceText, archtext.serializeSequenceText],
  flowchart: [archtext.parseFlowchartText, archtext.serializeFlowchartText],
  usecase: [archtext.parseUseCaseText, archtext.serializeUseCaseText],
  er: [archtext.parseErText, archtext.serializeErText],
  dict: [archtext.parseDictText, archtext.serializeDictText],
  gantt: [archtext.parseGanttText, archtext.serializeGanttText],
  timeline: [archtext.parseTimelineText, archtext.serializeTimelineText],
  lifecycle: [archtext.parseLifecycleText, archtext.serializeLifecycleText],
};

/** `{ ok }` or `{ issue }` — a parse attempt reduced to what this script reads. */
function attempt(parse, text) {
  try {
    return { ok: true, file: parse(text) };
  } catch (error) {
    const issue = error?.issues?.[0];
    if (issue === undefined) throw error;
    return { ok: false, issue };
  }
}

/* ======================================================================= */
/* 1. Every throw site is on the ratchet                                    */
/* ======================================================================= */

/**
 * How many `failAt` / `.fail` calls in the coded parsers still carry no code.
 *
 * THE RATCHET, and the number is the point: coding ~520 throw sites across
 * nine grammars in one change would be an unreviewable diff, so a site
 * without a code stays legal while this number only ever falls. Lower it when
 * you code sites; the check fails if it rises, which is what stops a new
 * error kind arriving that the UI can only print.
 *
 * Measured over the three main grammars and the shared cursor — the surfaces
 * this feature's quick fixes cover. The six smaller grammars inherit every
 * cursor code for free and have no codes of their own yet, so counting their
 * direct sites here would put a number in the way that no work on this
 * surface can move.
 */
const UNCODED_BASELINE = 217;

const CODED_SOURCES = [
  "src/features/archtext/lib/cursor.ts",
  "src/features/archtext/lib/parse.ts",
  "src/features/archtext/lib/sequence/parse.ts",
  "src/features/archtext/lib/flowchart/parse.ts",
];

/**
 * Every throw call in `source`, as `{ line, coded }`.
 *
 * Brace-counted rather than regexed over one line, because a throw site in
 * this feature is routinely fifteen lines long and the `code:` that answers
 * for it can be anywhere inside the argument list. A line-wise grep would
 * report every multi-line call as uncoded and the baseline would be
 * meaningless.
 */
function throwSites(source) {
  const sites = [];
  const pattern = /\b(?:failAt|(?:cursor|this)\.fail)\(/g;
  for (let match; (match = pattern.exec(source)) !== null;) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i += 1) {
      const ch = source.charAt(i);
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = source.slice(match.index, i + 1);
    sites.push({
      line: source.slice(0, match.index).split("\n").length,
      coded: /\bcode:\s*"/.test(body),
    });
  }
  return sites;
}

console.log("\n1. Every throw site is on the ratchet");

let uncoded = 0;
let totalSites = 0;
for (const file of CODED_SOURCES) {
  const sites = throwSites(readFileSync(path.join(ROOT, file), "utf8"));
  const missing = sites.filter((site) => !site.coded).length;
  uncoded += missing;
  totalSites += sites.length;
  console.log(`     ${file}: ${sites.length - missing}/${sites.length} coded`);
}
expect(
  uncoded <= UNCODED_BASELINE,
  `uncoded throw sites ${uncoded} <= baseline ${UNCODED_BASELINE} (of ${totalSites})`,
  `A new throw site arrived without a "code:". The UI can only print it as prose, and prose is not a discriminator — code the site, or raise the baseline deliberately and say why.`,
);
if (uncoded < UNCODED_BASELINE) {
  console.log(
    `     note: ${UNCODED_BASELINE - uncoded} sites below the baseline — lower UNCODED_BASELINE to ${uncoded} to keep the ratchet tight.`,
  );
}

/* ======================================================================= */
/* 2. The registry is closed both ways                                      */
/* ======================================================================= */

console.log("\n2. The registry is closed both ways");

const registered = Object.keys(ISSUE_CODES);
const raisedInSource = new Set();
for (const file of [
  ...CODED_SOURCES,
  // Read the whole feature, not just the coded four: a code raised from a
  // grammar nobody remembered to list would otherwise read as unregistered.
  ...["usecase", "er", "dict", "gantt", "timeline", "lifecycle"].map(
    (kind) => `src/features/archtext/lib/${kind}/parse.ts`,
  ),
]) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  for (const match of source.matchAll(/\bcode:\s*"([a-z0-9.-]+)"/g)) {
    raisedInSource.add(match[1]);
  }
}

const unraised = registered.filter((code) => !raisedInSource.has(code));
expect(
  unraised.length === 0,
  "every registered code is raised by a parser",
  `Registered but never raised: ${unraised.join(", ")}. A key nothing raises is a promise to the UI that cannot be kept.`,
);

const unregistered = [...raisedInSource].filter(
  (code) => !Object.hasOwn(ISSUE_CODES, code),
);
expect(
  unregistered.length === 0,
  "every raised code is registered",
  `Raised but not registered: ${unregistered.join(", ")}. Without a registry entry the code has no declared fixability, so assertion 3 would skip it in silence.`,
);

expect(
  registered.every((code) =>
    ["safe", "choice", "none"].includes(ISSUE_CODES[code].fixability),
  ),
  "every registered code declares a known fixability",
);

/* ======================================================================= */
/* The corpus                                                              */
/* ======================================================================= */

/**
 * Documents to break: every bundled example, plus a hand-written host per
 * feature no bundled example happens to use.
 *
 * THE SYNTHETIC HOSTS ARE NOT A CONVENIENCE. Assertion 5's converse — a safe
 * code must be seedable — is only worth anything if "seedable" cannot be
 * dodged by declining to write the fixture. Four safe rewrites act on syntax
 * the bundled examples do not contain (a quoted reserved word, an activation
 * suffix, a spaced `id : type`, an unclosed technology bracket), and the
 * honest answer is a document that does contain it rather than an exemption.
 * Each is a REAL document: it parses, and it round-trips, which the corpus
 * loop asserts before it breaks anything.
 */
const SYNTHETIC_HOSTS = [
  {
    id: "synthetic:c4-kitchen",
    kind: "c4",
    alabText: `archlab 1.0
title "Quick fix hosts"

@context d-root "Context"
  customer:person "Customer" (480,80 160x96)
  api:system "Payments API" [Go 1.22] (400,320 320x120)
    desc "Takes card payments."

  customer -> api : "Pays for an order" [HTTPS] id=e-customer-api
`,
  },
  {
    id: "synthetic:sequence-kitchen",
    kind: "sequence",
    alabText: `archlab 1.0 sequence
title "Quick fix hosts"

@sequence
  user:actor "User"
  api "API"
  "null" "Nothing here"

  user ->+ api : "Place an order"
    desc "The happy path."
  api ->- user : "Confirmation"
`,
  },
];

const corpus = [];
for (const listing of listBundledExamples()) {
  if (listing.status !== "ok") continue;
  const result = loadBundledExample(listing.example.id);
  if (result.status !== "ok") continue;
  corpus.push({
    id: listing.example.id,
    kind: result.document.example.kind,
    alabText: result.document.alabText,
  });
}
corpus.push(...SYNTHETIC_HOSTS);

console.log(
  `\n   corpus: ${corpus.length} documents (${corpus.length - SYNTHETIC_HOSTS.length} bundled, ${SYNTHETIC_HOSTS.length} synthetic)`,
);

/* ----------------------------------------------------------------------- */
/* Mutations — one per safe code                                            */
/* ----------------------------------------------------------------------- */

/** The index of the first line satisfying `test`, or -1. */
function findLine(lines, test) {
  return lines.findIndex(test);
}

function withLine(lines, index, replacement) {
  const out = [...lines];
  out[index] = replacement;
  return out.join("\n");
}

/**
 * How to break a valid document so a given safe code fires.
 *
 * Each entry returns the mutated text, or `null` when this document has no
 * place to apply it — which is why the corpus is looped over per code rather
 * than per document: a mutation only needs ONE host to prove its code, and
 * different notations host different ones.
 *
 * Every mutation is chosen to be exactly invertible by the fix under test.
 * That is the whole design of assertion 5: if the mutation removes a comma
 * and the fix inserts a comma, the model must come back byte for byte, and
 * anything less means the fix is doing something the mutation did not ask
 * for.
 */
const MUTATIONS = {
  "alab.indent-tabs": ({ lines }) => {
    const at = findLine(
      lines,
      (line) => line.startsWith("  ") && line.trim() !== "",
    );
    if (at === -1) return null;
    return withLine(lines, at, `\t${lines[at].slice(2)}`);
  },
  "cursor.expected-token": ({ lines }) => {
    /* A geometry token's closing paren. Chosen over the comma inside it
       because `expect` inserts the literal AT THE CARET, so only a token
       whose absence is noticed exactly where it belongs is invertible — drop
       the comma and the parser reads `48080` as x and demands the comma after
       it, which restores the text and not the model. */
    const at = findLine(lines, (line) => /\(\d+,\d+ \d+x\d+\)$/.test(line));
    if (at === -1) return null;
    return withLine(lines, at, lines[at].slice(0, -1));
  },
  "cursor.quote-missing": ({ lines }) => {
    const at = findLine(lines, (line) => /^title "[^"\\[(#]+"$/.test(line));
    if (at === -1) return null;
    return withLine(lines, at, lines[at].replace(/"([^"]+)"/, "$1"));
  },
  "cursor.quote-unclosed": ({ lines, kind }) => {
    /* A node NAME mid-line, not a `title` at end of line, and the choice is
       the point: end-of-line is the case a "close it at the end" fix passes
       trivially, and mid-line is the case where that fix swallows the
       technology and geometry into the name. This mutation is the one that
       would have caught it. */
    if (kind !== "c4") return null;
    const at = findLine(lines, (line) =>
      /^ {2}[\w.-]+:[a-z]+ "[^"\\[(#]+" \S/.test(line),
    );
    if (at === -1) return null;
    return withLine(lines, at, lines[at].replace(/^(.*?"[^"]+)"/, "$1"));
  },
  "c4.node-type-spaced": ({ lines, kind }) => {
    if (kind !== "c4") return null;
    const at = findLine(lines, (line) => /^ {2}[\w.-]+:[a-z]+ "/.test(line));
    if (at === -1) return null;
    return withLine(lines, at, lines[at].replace(":", " : "));
  },
  "c4.technology-unclosed": ({ lines, kind }) => {
    /* Mid-line again, for the reason `cursor.quote-unclosed` is: a bracket
       that is last on its line proves nothing about where the `]` belongs. */
    if (kind !== "c4") return null;
    const at = findLine(lines, (line) => /\[[^\]]+\] \S/.test(line));
    if (at === -1) return null;
    return withLine(lines, at, lines[at].replace("] ", " "));
  },
  "flow.arrow-unknown": ({ lines, kind }) => {
    if (kind !== "flowchart") return null;
    const at = findLine(lines, (line) => / -> /.test(line));
    if (at === -1) return null;
    return withLine(lines, at, lines[at].replace(" -> ", " --> "));
  },
  "flow.indent-expected": ({ lines, kind }) => {
    if (kind !== "flowchart") return null;
    // The FIRST body line only: it is the one whose expected indent is 2
    // whatever groups appear later, so the fix's target is known here.
    const block = findLine(lines, (line) => line === "@flowchart");
    if (block === -1 || !lines[block + 1]?.startsWith("  ")) return null;
    return withLine(lines, block + 1, `      ${lines[block + 1].trim()}`);
  },
  "seq.indent-expected": ({ lines, kind }) => {
    if (kind !== "sequence") return null;
    const block = findLine(lines, (line) => line === "@sequence");
    if (block === -1 || !lines[block + 1]?.startsWith("  ")) return null;
    return withLine(lines, block + 1, `      ${lines[block + 1].trim()}`);
  },
  "seq.reserved-word": ({ lines, kind }) => {
    /* `null` is the ONLY word that reaches the reserved fallthrough:
       `RESERVED_BODY_WORDS` also holds `note`, `desc`, `autonumber`, `box`
       and every fragment and branch keyword, and each of those has a
       production that claims it first. So this is the whole of the code's
       reachable surface, and the synthetic host exists because no bundled
       example names a participant after a keyword. */
    if (kind !== "sequence") return null;
    const at = findLine(lines, (line) => /^ {2}"null" "/.test(line));
    if (at === -1) return null;
    return withLine(lines, at, lines[at].replace('"null"', "null"));
  },
  "seq.activation-duplicate": ({ lines, kind }) => {
    if (kind !== "sequence") return null;
    const at = findLine(lines, (line) => /->\+ /.test(line));
    if (at === -1) return null;
    return withLine(lines, at, lines[at].replace("->+ ", "->++ "));
  },
  "seq.desc-indent": ({ lines, kind }) => {
    if (kind !== "sequence") return null;
    const at = findLine(lines, (line) => /^ {4}desc /.test(line));
    if (at === -1) return null;
    return withLine(lines, at, `  ${lines[at].trim()}`);
  },
};

/* ======================================================================= */
/* 3 + 4. Fixability at runtime, and safe fixes minimal and advancing       */
/* ======================================================================= */

/** Every fixture this script produces, so 3 and 4 see the same population. */
const observations = [];

function observe(label, kind, text) {
  const [parse] = GRAMMARS[kind];
  const result = attempt(parse, text);
  if (result.ok) return null;
  observations.push({ label, kind, text, issue: result.issue });
  return result.issue;
}

/**
 * Broken documents beyond the mutation corpus, so assertions 3 and 4 see the
 * `choice` and `none` codes too — the corpus only breaks things a SAFE fix
 * can put back, which by construction never exercises a guess.
 */
const NEGATIVE_FIXTURES = [
  [
    "c4 unknown node type",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  shop:sistem "Shop"\n',
  ],
  [
    "c4 type illegal at level",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  shop:component "Shop"\n',
  ],
  [
    "c4 unknown level",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@contect d "C"\n  shop:system "Shop"\n',
  ],
  [
    "c4 mermaid arrow",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  a:system "A"\n  b:system "B"\n\n  a --> b : "x"\n',
  ],
  [
    "c4 unresolved target",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  api:system "A"\n  web:system "B"\n\n  api -> wev : "x"\n',
  ],
  [
    "c4 duplicate id",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  api:system "A"\n  api:system "B"\n',
  ],
  [
    "c4 unknown attribute",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  api:system "A" wobble\n',
  ],
  [
    "c4 pin not boolean",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  api:system "A" pin=yes\n',
  ],
  [
    "c4 unresolved frame",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n  api:system "A" in=zone\n',
  ],
  ["c4 trailing text", "c4", "archlab 1.0 wobble\n"],
  [
    "c4 odd indent",
    "c4",
    'archlab 1.0\ntitle "T"\n\n@context d "C"\n   api:system "A"\n',
  ],
  [
    "seq mermaid arrow",
    "sequence",
    'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  a "A"\n  b "B"\n\n  a ->> b : "x"\n',
  ],
  [
    "seq unresolved participant",
    "sequence",
    'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  api "A"\n\n  api -> wev : "x"\n',
  ],
  [
    "seq bad participant kind",
    "sequence",
    'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  api:actr "A"\n',
  ],
  [
    "seq late participant",
    "sequence",
    'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  a "A"\n  b "B"\n\n  a -> b : "x"\n  c "C"\n',
  ],
  [
    "seq bad note placement",
    "sequence",
    'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  a "A"\n\n  note above a : "x"\n',
  ],
  [
    "seq autonumber word",
    "sequence",
    'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  autonumber yes\n  a "A"\n',
  ],
  [
    "flow unresolved node",
    "flowchart",
    'archlab 1.0 flowchart\ntitle "T"\n\n@flowchart\n  start a "A"\n  end b "B"\n  a -> bb\n',
  ],
  [
    "flow duplicate id",
    "flowchart",
    'archlab 1.0 flowchart\ntitle "T"\n\n@flowchart\n  start a "A"\n  end a "B"\n',
  ],
];

for (const [label, kind, text] of NEGATIVE_FIXTURES) {
  const issue = observe(label, kind, text);
  if (issue === undefined) {
    bad(`fixture "${label}" parses — it was written to fail`);
  }
}

console.log("\n3. Fixability is honoured at runtime");

const seenCodes = new Set();
let fixabilityBreaches = [];
for (const { label, issue } of observations) {
  if (issue.code === undefined) continue;
  seenCodes.add(issue.code);
  const declared = ISSUE_CODES[issue.code]?.fixability;
  const fixes = issue.fixes ?? [];
  if (declared === "none" && issue.fixes !== undefined) {
    fixabilityBreaches.push(
      `${label}: ${issue.code} is "none" but carries ${fixes.length} fix(es)`,
    );
  }
  if (declared === "safe" && fixes.some((fix) => fix.kind !== "safe")) {
    fixabilityBreaches.push(
      `${label}: ${issue.code} is "safe" but carries a non-safe candidate`,
    );
  }
  if (declared === "choice" && fixes.some((fix) => fix.kind === "safe")) {
    fixabilityBreaches.push(
      `${label}: ${issue.code} is "choice" but carries a SAFE candidate — that is a guess in the one-click path`,
    );
  }
  if (fixes.length === 0 && issue.fixes !== undefined) {
    fixabilityBreaches.push(
      `${label}: ${issue.code} carries an EMPTY fixes array — absent and empty must not come to mean different things`,
    );
  }
}
expect(
  fixabilityBreaches.length === 0,
  `every observed issue matches its declared fixability (${seenCodes.size} codes seen)`,
  fixabilityBreaches.join("\n      "),
);

console.log("\n4. A safe fix is minimal and strictly advances");

const advanceBreaches = [];
for (const { label, kind, text, issue } of observations) {
  const [parse] = GRAMMARS[kind];
  for (const fix of issue.fixes ?? []) {
    let fixed;
    try {
      fixed = applyTextEdit(text, fix.edits);
    } catch (error) {
      advanceBreaches.push(
        `${label}: "${fix.title}" would not apply — ${error.message}`,
      );
      continue;
    }

    /* MINIMALITY, measured rather than reasoned about: cut each declared
       range out of the original and out of the result, and what is left must
       be the same bytes. The UI applies these ranges through
       `setRangeText`, so a candidate whose effect reaches outside them is one
       the pane would perform differently from this proof — the two-halves
       failure `codebase.md` §4 names, with the author's document in between. */
    const ranges = fix.edits
      .map((edit) => ({
        from: offsetOf(text, edit.start),
        to: offsetOf(text, edit.end),
        length: edit.text.length,
      }))
      .sort((a, b) => a.from - b.from);
    let before = "";
    let after = "";
    let cutOriginal = 0;
    let delta = 0;
    for (const range of ranges) {
      before += text.slice(cutOriginal, range.from);
      after += fixed.slice(cutOriginal + delta, range.from + delta);
      delta += range.length - (range.to - range.from);
      cutOriginal = range.to;
    }
    before += text.slice(cutOriginal);
    after += fixed.slice(cutOriginal + delta);
    if (before !== after) {
      advanceBreaches.push(
        `${label}: "${fix.title}" changed bytes outside its edit ranges`,
      );
    }

    if (fix.kind !== "safe") continue;

    /* A SAFE FIX MAY NOT REACH INTO A `//` COMMENT. This is the one place in
       a `.alab` file where the author's text is none of the parser's
       business, and a one-click rewrite that lands inside one is editing
       prose it cannot read. The ambiguous-quote code exists precisely to
       demote that case to a choice; this asserts nothing slipped past it. */
    for (const edit of fix.edits) {
      const body = text.split("\n")[edit.start.line - 1] ?? "";
      const comment = body.indexOf("//");
      if (comment !== -1 && edit.end.column - 1 > comment) {
        advanceBreaches.push(
          `${label}: safe fix "${fix.title}" reaches into the // comment on line ${edit.start.line}`,
        );
      }
    }
    const next = attempt(parse, fixed);
    if (next.ok) continue;
    const advanced =
      next.issue.line > issue.line ||
      (next.issue.line === issue.line && next.issue.column > issue.column);
    if (!advanced) {
      advanceBreaches.push(
        `${label}: safe fix "${fix.title}" left the parse at or before (${issue.line},${issue.column}) — now (${next.issue.line},${next.issue.column}) ${next.issue.code ?? "?"}`,
      );
    }
  }
}
expect(
  advanceBreaches.length === 0,
  "every fix is minimal, and every safe fix advances the parse",
  advanceBreaches.join("\n      "),
);

/* ======================================================================= */
/* 5. No silent deformation — the mutation corpus                           */
/* ======================================================================= */

console.log("\n5. No silent deformation — the mutation corpus");

const safeCodes = Object.keys(ISSUE_CODES).filter(
  (code) => ISSUE_CODES[code].fixability === "safe",
);
const unseedable = [];
const deformations = [];
let restored = 0;

for (const code of safeCodes) {
  const mutate = MUTATIONS[code];
  if (mutate === undefined) {
    unseedable.push(`${code}: no mutation is written for it`);
    continue;
  }
  let hosts = 0;
  for (const document of corpus) {
    const [parse, serialize] = GRAMMARS[document.kind];
    const original = attempt(parse, document.alabText);
    if (!original.ok) continue;
    const mutated = mutate({
      lines: document.alabText.replace(/\n$/, "").split("\n"),
      kind: document.kind,
    });
    if (mutated === null) continue;

    const broken = attempt(parse, mutated);
    if (broken.ok) continue;
    if (broken.issue.code !== code) continue;
    const fixes = (broken.issue.fixes ?? []).filter(
      (fix) => fix.kind === "safe",
    );
    if (fixes.length === 0) {
      deformations.push(
        `${code} on ${document.id}: reported the code but offered no safe fix`,
      );
      continue;
    }
    hosts += 1;

    const fixed = applyTextEdit(mutated, fixes[0].edits);
    const reparsed = attempt(parse, fixed);
    if (!reparsed.ok) {
      deformations.push(
        `${code} on ${document.id}: the fix left the document unparseable — (${reparsed.issue.line},${reparsed.issue.column}) ${reparsed.issue.message}`,
      );
      continue;
    }
    /* THE ASSERTION THAT EARNS THIS SCRIPT: the model, not the text. A fix
       that quotes to end of line instead of to the next token produces a
       document that parses perfectly and has swallowed the technology field.
       Only a round trip through the serializer can see that. */
    if (serialize(reparsed.file) !== serialize(original.file)) {
      deformations.push(
        `${code} on ${document.id}: the fix made it parse but changed the MODEL`,
      );
      continue;
    }
    restored += 1;
  }
  if (hosts === 0) {
    unseedable.push(
      `${code}: its mutation found no host in ${corpus.length} documents`,
    );
  }
}

expect(
  unseedable.length === 0,
  `every safe code is seeded by the corpus (${safeCodes.length} safe codes)`,
  `A code the corpus cannot break is a one-click rewrite with no evidence behind it. Either write its mutation, or demote it out of "safe".\n      ${unseedable.join("\n      ")}`,
);
expect(
  deformations.length === 0,
  `every safe fix restored the original model (${restored} mutation/fix round trips)`,
  deformations.join("\n      "),
);

/* ======================================================================= */
/* 6. Every surface renders what the parser sent                            */
/* ======================================================================= */

console.log("\n6. Every surface renders what the parser sent");

/* `/validate` is the one surface whose plumbing is a pure function, so it is
   asserted for real rather than source-scanned: `checkSource` must carry the
   code and the candidates through to the row the page renders. The broken
   `.alab` sample shipped with the page is the fixture — that document is what
   a reader lands on, so if anything is going to lose the fixes on the way it
   will lose them here. */
const { checkSource } = await import(
  pathToFileURL(path.join(ROOT, "src/features/validate/lib/check.ts")).href
);
const { SAMPLES } = await import(
  pathToFileURL(path.join(ROOT, "src/features/validate/content/samples.ts"))
    .href
);

const brokenSample = SAMPLES.map((sample) => checkSource(sample.source, "auto"))
  .filter((result) => result.status === "error")
  .flatMap((result) => result.issues)
  .find((issue) => issue.code !== undefined);
expect(
  brokenSample !== undefined,
  "checkSource carries a code through to a /validate row",
  `No sample on /validate produced a coded issue. Either the samples all parse now (fine — say so and drop this), or the code is being dropped between the parser and \`CheckIssue\`, in which case the page can only ever print prose.`,
);
if (brokenSample !== undefined) {
  expect(
    ISSUE_CODES[brokenSample.code] !== undefined,
    `the /validate row's code (${brokenSample.code}) is registered`,
  );
}

/* The other two surfaces are `.tsx`, which type stripping cannot load — so
   they are SOURCE assertions, the tactic `check:shortcuts` and
   `check:viewer-motion` already use for facts that live only in a component.
   What is asserted is the affordance's presence, not its markup: a panel that
   stops rendering `FixOffer` reports a parse error the reader cannot act on,
   and nothing else in the suite would notice. */
const SURFACES = [
  [
    "the playground's source error panel",
    "src/features/playground/components/view-playground.tsx",
  ],
  [
    "the editor's text pane error panel",
    "src/features/editor/text-pane/model-text-pane.tsx",
  ],
  ["the /validate issue row", "src/features/validate/components/validator.tsx"],
];
for (const [label, file] of SURFACES) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  expect(
    source.includes("<FixOffer") && source.includes("applyFixToTextarea"),
    `${label} renders FixOffer and applies through the textarea`,
    `${file} must render <FixOffer> and apply its candidates with applyFixToTextarea — assigning a new value instead loses the caret and the native undo entry, which is what makes clicking a fix low-stakes.`,
  );
}

/* ----------------------------------------------------------------------- */

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${assertions - failures}/${assertions} assertions`,
);
process.exit(failures === 0 ? 0 : 1);
