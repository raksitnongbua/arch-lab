#!/usr/bin/env node
/**
 * Gantt document format check (`.alab` gantt grammar). Follows the
 * pattern of `scripts/er-check.mjs` and `scripts/dict-check.mjs`: loads the
 * REAL library from `src/features/archtext/**` through Node's built-in type
 * stripping (`scripts/lib/resolve-ts.mjs`), so this script and the app
 * exercise the exact same code rather than a copy of it.
 *
 * What it proves — and why each clause is here. The gantt makes the same
 * promise the other six `.alab` grammars make, "text and model are two faces
 * of the same document", and it adds one nobody else has: an item line whose
 * tail is an unordered bag of self-identifying parts. Each clause below is one
 * way those promises could break without anything else noticing.
 *
 *   1. The SEED the playground opens with round-trips byte-identically. It is
 *      checked before the kitchen sink on purpose: a grammar change that
 *      breaks it breaks the first screen a reader ever sees.
 *   2. A KITCHEN SINK exercising every construct — tasks and milestones in
 *      several sections, the three state words a canonical file can carry,
 *      `at`, single and multi-id `after`, tags, descriptions, a quoted
 *      reserved id and a quoted id in an `after` list — round-trips
 *      byte-identically in the serializer's canonical order. The fourth state
 *      word is deliberately absent: writing it is not canonical, which is
 *      clause 3's subject.
 *   3. THE STATE ASYMMETRY, pinned rather than left to be rediscovered:
 *      `planned` is spellable, parses to an ABSENT `state`, and therefore
 *      writes back as nothing. Typing the default is idempotent, not sticky,
 *      and this is the one place in the grammar where the text a person wrote
 *      legitimately does not come back.
 *   4. Unknown `!` fields from a newer minor survive a round trip verbatim and
 *      in their original key position, at file, metadata, section and item
 *      scope.
 *   5. REFUSALS BY NAME, each naming a line and a column that point into the
 *      source. Every one of these is a rule the notation exists to make, and a
 *      parser that let one through would draw a lie rather than report an
 *      error: a `0d` task (a bar of no length), a duration on a milestone (an
 *      instant with an extent), `at` beside `after` (two claims about one
 *      number), an origin that is not a day on the calendar (`2026-02-31`
 *      matches the shape and is not a date), a leading-zero duration (two
 *      spellings of one length, which alone breaks the byte-identical round
 *      trip), an `after` naming an id that does not exist, an item waiting for
 *      itself, a duplicate id, and a state word outside the closed vocabulary.
 *   6. NO CROSS-PARSING, in both directions, across all seven grammars. THIS
 *      IS THE ASSERTION THAT MATTERS MOST HERE. The seventh notation is the
 *      seventh chance for a sniffer to answer confidently and wrongly, and a
 *      wrong kind does not fail — it routes the text to a parser that then
 *      reports a syntax error about line 1 of a document that is not
 *      malformed. So the six older parsers must each refuse a gantt, and
 *      the gantt parser must refuse each of theirs BY NAME.
 *   7. `detectAlabKind` gives the right verdict for all seven headers, and
 *      refuses gantt near-misses — the regexes are anchored to the whole
 *      line for the reason in clause 6.
 *
 * Exits non-zero on any failure. Run with: pnpm check:gantt
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const {
  parseArchText,
  parseSequenceText,
  parseFlowchartText,
  parseUseCaseText,
  parseErText,
  parseDictText,
  parseGanttText,
  serializeGanttText,
  detectAlabKind,
  ArchTextParseError,
} = await load("src/features/archtext/index.ts");

const { ITEM_STATES, STATE_IS_DEFAULT } = await load(
  "src/features/archtext/lib/gantt/keywords.ts",
);
const { GANTT_EXAMPLE } = await load("src/features/gantt/input/example.ts");

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function ok(label) {
  assertions += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  assertions += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

function check(label, condition, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function firstDiff(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) {
      return `first difference at line ${i + 1}:\n    a: ${la[i]}\n    b: ${lb[i]}`;
    }
  }
  return "";
}

/* ----------------------------------------------------------------------- */
/* 1. The seed the playground opens with                                    */
/* ----------------------------------------------------------------------- */

console.log("the seeded example (the playground's first screen)");

{
  const model = parseGanttText(GANTT_EXAMPLE);
  const text = serializeGanttText(model);
  check(
    "GANTT_EXAMPLE round-trips byte-identically",
    text === GANTT_EXAMPLE,
    firstDiff(GANTT_EXAMPLE, text),
  );
  check(
    "the seed carries an origin, so the axis opens on real dates",
    model.origin === "2026-09-07",
    `origin=${JSON.stringify(model.origin)}`,
  );
  const states = new Set(
    model.sections
      .flatMap((section) => section.items)
      .map((item) => item.state ?? STATE_IS_DEFAULT),
  );
  /* The seed is where the palette is judged. A state that never appears on the
     first screen is a colour nobody sees until they open a document that does
     not exist yet. */
  check(
    `the seed exercises all ${ITEM_STATES.length} states (${[...states].sort().join(", ")})`,
    ITEM_STATES.every((state) => states.has(state)),
    `missing: ${ITEM_STATES.filter((s) => !states.has(s)).join(", ")}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 2. Kitchen sink — canonical text, byte-identical round trip              */
/* ----------------------------------------------------------------------- */

console.log("kitchen sink (.alab gantt, every construct)");

const KITCHEN_SINK = `archlab 1.0 gantt
title "Every construct"
description "One document exercising the whole grammar"
owner "Platform"
tags #core #plan
starts 2026-01-01
created 2026-08-01T00:00:00Z
reviewed 2026-08-19T00:00:00Z

@gantt
  section "Prepare"
    task kickoff "Kick-off" 2d done at 0
      desc "Where the plan starts, and the only item with an explicit start."
    task "after" "Reserved word as an id" 3d active after kickoff
    task spike "Spike" 1d after kickoff #risk
    task shape "Shape the work" 4d at-risk after "after", spike
      desc "Two dependencies, one of them quoted because it is a reserved word."
    milestone ready "Ready to build" after shape
  section "Build"
    task build "Build it" 8d after ready #core #delivery
    milestone shipped "Shipped" after build
`;

{
  const model = parseGanttText(KITCHEN_SINK);
  const text = serializeGanttText(model);
  check(
    "canonical gantt text round-trips byte-identically",
    text === KITCHEN_SINK,
    firstDiff(KITCHEN_SINK, text),
  );
  const items = model.sections.flatMap((section) => section.items);
  check(
    "every section and row survives",
    model.sections.length === 2 && items.length === 7,
    `got ${model.sections.length} sections, ${items.length} rows`,
  );
  const milestone = items.find((item) => item.id === "ready");
  check(
    "a milestone carries `milestone: true` and NO duration",
    milestone?.milestone === true && milestone.duration === undefined,
    JSON.stringify(milestone),
  );
  const kickoff = items.find((item) => item.id === "kickoff");
  check(
    "an item with no dependencies omits `after` rather than writing []",
    kickoff.after === undefined && kickoff.at === 0,
    JSON.stringify(kickoff),
  );
  const shape = items.find((item) => item.id === "shape");
  check(
    "an `after` list keeps the author's order, not a sorted one",
    JSON.stringify(shape.after) === '["after","spike"]',
    JSON.stringify(shape.after),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. The state asymmetry — `planned` is spellable and normalises to absence */
/* ----------------------------------------------------------------------- */

console.log("the state vocabulary (closed, with one spellable default)");

{
  /* Pinned here rather than left in a comment: this is the ONE place where
     text a person wrote does not come back, and it is intended. Writing the
     default must be idempotent — an author moving a task back from `active`
     types `planned`, saves, and the word disappears rather than sticking. */
  const spelled = parseGanttText(
    `archlab 1.0 gantt\ntitle "T"\n\n@gantt\n  section "S"\n    task a "A" 3d ${STATE_IS_DEFAULT}\n`,
  );
  const item = spelled.sections[0].items[0];
  check(
    `"${STATE_IS_DEFAULT}" parses to an ABSENT state, not to the word`,
    item.state === undefined,
    `got ${JSON.stringify(item.state)}`,
  );
  check(
    `writing "${STATE_IS_DEFAULT}" is idempotent — it serializes back to nothing`,
    serializeGanttText(spelled) ===
      `archlab 1.0 gantt\ntitle "T"\n\n@gantt\n  section "S"\n    task a "A" 3d\n`,
    serializeGanttText(spelled),
  );

  /* Every OTHER state survives verbatim, walked from the real table so a
     fifth value added tomorrow is covered without editing this script. */
  const lost = [];
  for (const state of ITEM_STATES) {
    if (state === STATE_IS_DEFAULT) continue;
    const src = `archlab 1.0 gantt\ntitle "T"\n\n@gantt\n  section "S"\n    task a "A" 3d ${state}\n`;
    const back = serializeGanttText(parseGanttText(src));
    if (back !== src) lost.push(state);
  }
  check(
    `every non-default state round-trips verbatim (${ITEM_STATES.length - 1} of ${ITEM_STATES.length})`,
    lost.length === 0,
    lost.join(", "),
  );
}

/* ----------------------------------------------------------------------- */
/* 4. Forward tolerance — unknown fields at every scope                     */
/* ----------------------------------------------------------------------- */

console.log("forward tolerance (unknown fields from a newer minor)");

const FORWARD = `archlab 1.0 gantt
title "Forward"
! meta.futureMeta : {"a":1}
! futureFile : [1,2]

@gantt
  section "Prepare"
    ! futureSection : "s"
    task audit "Audit" 5d
      desc "A description beside an unknown key, so their order is exercised too."
      ! futureItem : true
`;

{
  const model = parseGanttText(FORWARD);
  const text = serializeGanttText(model);
  check(
    "unknown fields at file, meta, section and item scope round-trip verbatim",
    text === FORWARD,
    firstDiff(FORWARD, text),
  );
  check(
    "an unknown field keeps its value, not a stringified copy",
    model.futureFile.length === 2 &&
      model.sections[0].futureSection === "s" &&
      model.sections[0].items[0].futureItem === true,
    JSON.stringify(model.futureFile),
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Refusals — each names a line, a column, and the rule                  */
/* ----------------------------------------------------------------------- */

console.log("refusals (line, column, and the rule by name)");

const BODY = (body) =>
  `archlab 1.0 gantt\ntitle "T"\n\n@gantt\n  section "S"\n${body}\n`;

const REFUSALS = [
  [
    "a zero-day task, which is a milestone by another name",
    BODY('    task a "A" 0d'),
    /zero-day task is an instant/i,
  ],
  [
    "a duration on a milestone, which marks an instant",
    BODY('    milestone m "M" 3d'),
    /takes no duration/i,
  ],
  [
    "`at` beside `after` — two claims about one start",
    BODY('    task a "A" 3d\n    task b "B" 2d after a at 4'),
    /sets its start twice/i,
  ],
  [
    "an origin that matches the shape but is not a day (2026-02-31)",
    'archlab 1.0 gantt\ntitle "T"\nstarts 2026-02-31\n\n@gantt\n  section "S"\n    task a "A" 3d\n',
    /not a day that exists/i,
  ],
  [
    "an origin that is not even the right shape",
    'archlab 1.0 gantt\ntitle "T"\nstarts 2026-09-07T00:00:00Z\n\n@gantt\n  section "S"\n    task a "A" 3d\n',
    /not a calendar date/i,
  ],
  [
    "a leading-zero duration — two spellings of one length",
    BODY('    task a "A" 05d'),
    /leading zeroes are refused/i,
  ],
  [
    "an `after` naming an id that is not in the file",
    BODY('    task a "A" 3d after ghost'),
    /not an id in this file/i,
  ],
  [
    "an item that waits for itself",
    BODY('    task a "A" 3d after a'),
    /waits for itself/i,
  ],
  [
    "a duplicate id, which `after` could not resolve",
    BODY('    task a "A" 3d\n    task a "B" 2d'),
    /duplicate id/i,
  ],
  [
    "a state word outside the closed vocabulary",
    BODY('    task a "A" 3d blocked'),
    /vocabulary is closed/i,
  ],
  [
    "a task with no duration at all",
    BODY('    task a "A"'),
    /has no duration/i,
  ],
  [
    "a row outside any section, which would have no band to belong to",
    'archlab 1.0 gantt\ntitle "T"\n\n@gantt\n  task a "A" 3d\n',
    /belongs inside a "section"/i,
  ],
  [
    "a section that draws no rows",
    'archlab 1.0 gantt\ntitle "T"\n\n@gantt\n  section "S"\n',
    /draws no rows/i,
  ],
  [
    "a bare reserved word used as an id",
    BODY('    task after "A" 3d'),
    /is reserved/i,
  ],
  [
    "a tab for indentation",
    'archlab 1.0 gantt\ntitle "T"\n\n@gantt\n\tsection "S"\n',
    /tabs/i,
  ],
  [
    "an odd indent",
    'archlab 1.0 gantt\ntitle "T"\n\n@gantt\n   section "S"\n',
    /indentation/i,
  ],
  [
    "a file with no title",
    'archlab 1.0 gantt\n\n@gantt\n  section "S"\n    task a "A" 3d\n',
    /title/i,
  ],
  ["a file with no @gantt block", 'archlab 1.0 gantt\ntitle "T"\n', /@gantt/i],
];

for (const [what, source, pattern] of REFUSALS) {
  let error = null;
  try {
    parseGanttText(source);
  } catch (caught) {
    error = caught;
  }
  if (error === null) {
    fail(`${what} is refused`, "it parsed");
    continue;
  }
  if (!(error instanceof ArchTextParseError)) {
    fail(
      `${what} is refused`,
      `threw ${error.constructor.name}, not ArchTextParseError`,
    );
    continue;
  }
  const lines = source.split("\n");
  const inRange =
    error.line >= 1 &&
    error.line <= lines.length &&
    error.column >= 1 &&
    error.column <= (lines[error.line - 1] ?? "").length + 1;
  check(
    `${what} is refused, at a line and column that point into the source`,
    pattern.test(error.message) && inRange,
    `line ${error.line}, column ${error.column}: ${error.message}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 6. No cross-parsing between the seven grammars                          */
/* ----------------------------------------------------------------------- */

console.log("no cross-parsing (seven grammars, both directions)");

{
  const GANTT_DOC =
    'archlab 1.0 gantt\ntitle "T"\n\n@gantt\n  section "S"\n    task a "A" 3d\n';

  /* [kind, its header, its parser, the word the gantt parser must use for
     it]. `c4` is the one kind whose header carries no word, so there is
     nothing for the OTHER parsers to name when they refuse it — see the note
     on the reverse direction below. */
  const OTHERS = [
    ["c4", "archlab 1.0", parseArchText, "C4"],
    ["sequence", "archlab 1.0 sequence", parseSequenceText, "sequence"],
    ["flowchart", "archlab 1.0 flowchart", parseFlowchartText, "flowchart"],
    ["usecase", "archlab 1.0 usecase", parseUseCaseText, "use-case"],
    ["er", "archlab 1.0 er", parseErText, "ER"],
    ["dict", "archlab 1.0 dict", parseDictText, "dictionary"],
  ];

  for (const [kind, header, otherParser, named] of OTHERS) {
    /* The gantt parser, shown another kind's header, must name that kind.
       "unexpected token on line 1" would send the author hunting for a typo
       in a document that has none. */
    let message = "";
    try {
      parseGanttText(`${header}\ntitle "T"\n`);
    } catch (error) {
      message = error.message;
    }
    check(
      `the gantt parser refuses a ${kind} header by name ("${named}")`,
      message.includes(named),
      message || "it parsed",
    );

    /* And the other parser, shown a gantt, must refuse it rather than
       half-parsing a document it cannot draw. Only the C4 parser is exempt
       from naming the word: its own header has no kind word, so it can only
       report that there is text after the version. */
    let refusal = null;
    try {
      otherParser(GANTT_DOC);
    } catch (error) {
      refusal = error;
    }
    check(
      kind === "c4"
        ? "the c4 parser refuses a gantt document"
        : `the ${kind} parser refuses a gantt document, naming "gantt"`,
      refusal !== null && (kind === "c4" || refusal.message.includes("gantt")),
      refusal === null ? "it parsed" : refusal.message,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 7. Document-type detection across all seven grammars                     */
/* ----------------------------------------------------------------------- */

console.log("document-type detection");

{
  const HEADERS = [
    ["archlab 1.0", "c4"],
    ["archlab 1.0 sequence", "sequence"],
    ["archlab 1.0 flowchart", "flowchart"],
    ["archlab 1.0 usecase", "usecase"],
    ["archlab 1.0 er", "er"],
    ["archlab 1.0 dict", "dict"],
    ["archlab 1.0 gantt", "gantt"],
  ];
  for (const [header, kind] of HEADERS) {
    check(
      `"${header}" detects as ${kind}`,
      detectAlabKind(`${header}\ntitle "T"\n`) === kind,
      `got ${detectAlabKind(`${header}\ntitle "T"\n`)}`,
    );
  }
  check(
    "the seeded example detects as gantt",
    detectAlabKind(GANTT_EXAMPLE) === "gantt",
    `got ${detectAlabKind(GANTT_EXAMPLE)}`,
  );
  /* Anchored to the whole line, and case-sensitive: a confidently wrong answer
     routes text to the wrong parser, and that error misleads worse than no
     answer at all. `Gantt` is here because the word is a proper noun
     everywhere else a reader meets it, so the capitalised spelling is the one
     that gets typed by hand. */
  for (const near of [
    "archlab 1.0 gantts",
    "archlab 1.0 gantt x",
    "archlab 1.0gantt",
    "archlab 1.0 Gantt",
  ]) {
    check(
      `"${near}" is not mistaken for a gantt header`,
      detectAlabKind(`${near}\n`) !== "gantt",
      `got ${detectAlabKind(`${near}\n`)}`,
    );
  }
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
