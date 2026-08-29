#!/usr/bin/env node
/**
 * Milestone-timeline format check (`.alab` timeline grammar). Follows the
 * pattern of `scripts/gantt-check.mjs` and `scripts/dict-check.mjs`: loads the
 * REAL library from `src/features/archtext/**` through Node's built-in type
 * stripping (`scripts/lib/resolve-ts.mjs`), so this script and the app
 * exercise the exact same code rather than a copy of it.
 *
 * What it proves — and why each clause is here. The timeline makes the same
 * promise the other seven `.alab` grammars make, "text and model are two faces
 * of the same document". It is the SMALLEST grammar in the family, which
 * changes what is worth asserting rather than how much: there are no bare
 * tokens, so the bare/quoted symmetry group every sibling check carries has
 * nothing to test here — and in its place sits a group no sibling needs, which
 * is that the grammar still refuses everything it was designed not to hold.
 *
 *   1. The SEED the playground opens with round-trips byte-identically. It is
 *      checked before the kitchen sink on purpose: a grammar change that
 *      breaks it breaks the first screen a reader ever sees.
 *   2. A KITCHEN SINK exercising every construct — several periods, events
 *      with and without tags, an event with a description, a period whose
 *      label is a phrase rather than a year, and a label carrying an embedded
 *      newline — round-trips byte-identically.
 *   3. THE REFUSALS THAT ARE THE NOTATION. A timeline sits one keyword away
 *      from being a worse gantt, so every construct it deliberately cannot
 *      hold is asserted to be refused BY NAME, and — the part that matters —
 *      each refusal must POINT AT THE GANTT. A refusal that says only "not
 *      valid here" sends the author looking for a spelling; one that names
 *      `archlab 1.0 gantt` sends them to the notation that draws what they
 *      have. This is the group that would go quietly stale if someone
 *      "simplified" the parser's error strings.
 *   4. THE RENAMED-GANTT CASE, which is unique to this notation and is a real
 *      document on somebody's disk: `timeline` was the GANTT's header word
 *      until an hour before this grammar existed, so a file headed
 *      `archlab 1.0 timeline` over an `@gantt` block now reaches THIS parser.
 *      It must be refused with a message naming the gantt and saying how to
 *      convert, not with a bare syntax error about line 4.
 *   5. Unknown `!` fields from a newer minor survive a round trip verbatim and
 *      in their original key position, at file, metadata, period and event
 *      scope.
 *   6. STRUCTURAL REFUSALS — an empty period, a duplicate period label, a
 *      `desc` on a period, an event outside any period — each naming a line
 *      and a column that point into the source.
 *   7. NO CROSS-PARSING, in both directions, across all eight grammars. THIS
 *      IS THE ASSERTION THAT MATTERS MOST HERE, and more than it did for the
 *      seventh notation: the eighth notation's header word USED TO MEAN
 *      SOMETHING ELSE IN THIS REPO. A sniffer that answers confidently and
 *      wrongly does not fail — it routes the text to a parser that then
 *      reports a syntax error about line 1 of a document that is not
 *      malformed.
 *   8. `detectAlabKind` gives the right verdict for all eight headers, and
 *      refuses timeline near-misses — the regexes are anchored to the whole
 *      line for the reason in clause 7.
 *
 * Exits non-zero on any failure. Run with: pnpm check:timeline
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
  parseTimelineText,
  serializeTimelineText,
  detectAlabKind,
  ArchTextParseError,
} = await load("src/features/archtext/index.ts");

const { TIMELINE_EXAMPLE } = await load(
  "src/features/timeline/input/example.ts",
);
const { RESERVED_TIMELINE_WORDS } = await load(
  "src/features/archtext/lib/timeline/keywords.ts",
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

/** Runs `parseTimelineText` and returns the error, or null if it parsed. */
function refusalFor(source) {
  try {
    parseTimelineText(source);
    return null;
  } catch (error) {
    return error;
  }
}

/* ----------------------------------------------------------------------- */
/* 1. The seed the playground opens with                                    */
/* ----------------------------------------------------------------------- */

console.log("the seed (the playground's first screen)");

{
  const text = serializeTimelineText(parseTimelineText(TIMELINE_EXAMPLE));
  check(
    "the seeded example round-trips byte-identically",
    text === TIMELINE_EXAMPLE,
    firstDiff(TIMELINE_EXAMPLE, text),
  );
}

/* ----------------------------------------------------------------------- */
/* 2. Kitchen sink                                                          */
/* ----------------------------------------------------------------------- */

console.log("kitchen sink (.alab timeline, every construct)");

const KITCHEN_SINK = `archlab 1.0 timeline
title "Everything the grammar has"
description "Four periods, tags, a note and a wrapped label"
owner "Platform"
tags #core #history
created 2026-08-01T00:00:00Z

@timeline
  period "2016"
    event "One event, nothing else on the line"
  period "Before the rewrite"
    event "A period label that is a phrase, not a year"
      desc "The one nested slot a timeline has."
    event "An event carrying tags" #board #funding
  period "2024"
    event "A label with\\na real newline in it"
    event "The last one"
`;

{
  const model = parseTimelineText(KITCHEN_SINK);
  const text = serializeTimelineText(model);
  check(
    "canonical timeline text round-trips byte-identically",
    text === KITCHEN_SINK,
    firstDiff(KITCHEN_SINK, text),
  );
  check(
    "every period and event survives",
    model.periods.length === 3 &&
      model.periods[0].events.length === 1 &&
      model.periods[1].events.length === 2 &&
      model.periods[2].events.length === 2,
    JSON.stringify(model.periods.map((p) => p.events.length)),
  );
  check(
    "a period label that is a phrase is kept verbatim, never parsed",
    model.periods[1].label === "Before the rewrite",
    model.periods[1].label,
  );
  check(
    "an embedded newline survives the round trip as one label",
    model.periods[2].events[0].label.includes("\n"),
    JSON.stringify(model.periods[2].events[0].label),
  );
  check(
    "an event with no tags omits `tags` rather than writing []",
    model.periods[0].events[0].tags === undefined &&
      Array.isArray(model.periods[1].events[1].tags),
    JSON.stringify(model.periods[0].events[0]),
  );
}

/* A HAND-BUILT MODEL, not one the parser produced, because the serializer has
   to be able to write anything a caller can construct — the MCP tools and the
   Mermaid importer both build models in code. Every label here is a string the
   parser reads back through `JSON.parse`, which is what the absence of any
   bare-token slot buys: there is no quoting decision for the two sides to
   disagree about, so the only way this can fail is a genuinely broken escape. */
console.log("hand-built model (not one the parser produced)");

{
  const model = {
    version: "1.0",
    kind: "timeline",
    metadata: {
      title: "Awkward strings",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
    periods: [
      {
        label: 'A period with "quotes" in it',
        events: [
          { label: "period" },
          { label: "event" },
          { label: 'He said "no", then \\left' },
        ],
      },
    ],
  };
  const text = serializeTimelineText(model);
  check(
    "model -> text -> model is structurally identical",
    JSON.stringify(parseTimelineText(text)) === JSON.stringify(model),
    JSON.stringify(parseTimelineText(text)),
  );
  /* THE RESERVED WORDS ARE NOT A QUOTING PROBLEM HERE, and this asserts why:
     an event whose label is literally `event` needs no special handling,
     because a label is ALWAYS quoted. In every sibling grammar this is the
     case that forces a reserved-word table into the serializer. */
  check(
    "an event labelled with a reserved word is written as an ordinary label",
    [...RESERVED_TIMELINE_WORDS]
      .filter((word) =>
        model.periods[0].events.some((event) => event.label === word),
      )
      .every((word) => text.includes(`    event "${word}"\n`)) &&
      text.includes('    event "period"\n') &&
      text.includes('    event "event"\n'),
    text,
  );
}

/* ----------------------------------------------------------------------- */
/* 3. The refusals that ARE the notation                                    */
/* ----------------------------------------------------------------------- */

console.log(
  "the refusals that are the notation (each must point at the gantt)",
);

const BODY = (line) =>
  `archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period "P"\n${line}\n`;

/*
 * EACH OF THESE IS A THING A READER ARRIVING FROM A PLAN TOOL WILL TRY, and
 * each is refused for a reason `src/types/timeline.ts` records. The second
 * condition is the one that would rot: a refusal must NAME THE GANTT, because
 * a reader who is told "not valid here" tries another spelling and a reader
 * who is told "write a gantt" stops.
 */
for (const [what, line] of [
  ["a duration on an event", '    event "Migration" 5d'],
  ["an `after` dependency", '    event "Cutover" after freeze'],
  ["an explicit start", '    event "Rewrite" at 12'],
  ["a state word", '    event "Rollout" active'],
  ["a bare id before the label", '    event rollout "Rollout"'],
]) {
  const error = refusalFor(BODY(line));
  if (error === null) {
    fail(`${what} is refused`, "it parsed");
    continue;
  }
  check(
    `${what} is refused, and the message points at the gantt`,
    error instanceof ArchTextParseError && /gantt/i.test(error.message),
    `line ${error.line}, column ${error.column}: ${error.message}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 4. The renamed-gantt case                                                */
/* ----------------------------------------------------------------------- */

console.log("a document from before the gantt was renamed");

{
  /* A REAL FILE SOMEBODY HAS. `timeline` headed the gantt grammar until it was
     renamed to `gantt`, so this exact text used to parse as a plan and now
     reaches the timeline parser. Refusing it is correct; refusing it with
     "header lines must appear before @timeline" would send its author hunting
     for a typo in a document whose only fault is its age. */
  const STALE = `archlab 1.0 timeline
title "Order store migration"
starts 2026-09-07

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
`;
  const error = refusalFor(STALE);
  if (error === null) {
    fail("a pre-rename gantt document is refused", "it parsed");
  } else {
    check(
      "a pre-rename gantt document is refused with a message naming the gantt",
      /gantt/.test(error.message),
      error.message,
    );
    check(
      "and says which header to change it to",
      error.message.includes("archlab 1.0 gantt"),
      error.message,
    );
    /* IT STOPS AT `starts`, NOT AT `@gantt`, and that is the better answer
       rather than a near miss: `starts` is line 3 and the block opener is
       line 5, so the FIRST thing in the file that cannot be a timeline is the
       header line — and a parser that read past it to complain about the body
       would be pointing at the second symptom. Both lines carry a
       gantt-naming refusal (the block opener's is asserted separately below),
       so whichever a document reaches first says the same thing. */
    check(
      "and stops at the first line that cannot be a timeline",
      error.line === 3,
      `line ${error.line}`,
    );
  }
}

{
  /* THE SAME STALE DOCUMENT WITH ITS `starts` LINE ALREADY REMOVED, which is
     what an author gets after acting on the message above. The body is still
     a gantt's, and the `@gantt` opener must name the notation too — otherwise
     the second attempt fails with "header lines must appear before @timeline",
     which describes the file's shape and not its problem. */
  const STALE_BODY = `archlab 1.0 timeline
title "Order store migration"

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
`;
  const error = refusalFor(STALE_BODY);
  if (error === null) {
    fail("a `@gantt` body under a timeline header is refused", "it parsed");
  } else {
    check(
      "a `@gantt` body under a timeline header names the gantt too",
      /gantt/.test(error.message) &&
        error.message.includes("archlab 1.0 gantt"),
      error.message,
    );
    check(
      "and points at the `@gantt` line",
      error.line === 4,
      `line ${error.line}`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 5. Forward tolerance                                                     */
/* ----------------------------------------------------------------------- */

console.log("forward tolerance");

const FORWARD = `archlab 1.0 timeline
title "Forward"
! meta.futureMeta : {"a":1}
! futureFile : [1,2]

@timeline
  period "P"
    ! futurePeriod : "p"
    event "E"
      ! futureEvent : true
`;

{
  const text = serializeTimelineText(parseTimelineText(FORWARD));
  check(
    "unknown fields at file, meta, period and event scope round-trip verbatim",
    text === FORWARD,
    firstDiff(FORWARD, text),
  );
}

/* ----------------------------------------------------------------------- */
/* 6. Structural refusals, each located                                     */
/* ----------------------------------------------------------------------- */

console.log("structural refusals");

const REFUSALS = [
  [
    "a period with no events",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period "P"\n',
    /holds no events/i,
  ],
  [
    "two periods with one label",
    BODY('    event "E"\n  period "P"\n    event "F"'),
    /duplicate period/i,
  ],
  [
    "an event outside any period",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  event "E"\n',
    /belongs inside a "period"/i,
  ],
  [
    "a `desc` on a period",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period "P"\n    desc "no"\n    event "E"\n',
    /has no description/i,
  ],
  [
    /* At indent 4 with an EVENT above it, `desc` is past the window where it
       could bind to anything: an event's continuation sits at indent 6. (The
       same word directly under a `period` line is a different refusal — see
       the case above — and both must stay distinguishable.) */
    "a `desc` at the start of a line, after an event",
    BODY('    event "E"\n    desc "orphan"'),
    /continuation/i,
  ],
  ["an empty event label", BODY('    event ""'), /must not be empty/i],
  [
    "an empty period label",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period ""\n    event "E"\n',
    /must not be empty/i,
  ],
  [
    "nested periods",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period "A"\n    event "E"\n  period "B"\n    event "F"\n    period "C"\n',
    /do not nest|starts with "event"/i,
  ],
  [
    "a tab for indentation",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n\tperiod "P"\n',
    /tabs/i,
  ],
  [
    "an odd indent",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n   period "P"\n',
    /indentation/i,
  ],
  [
    "a duplicate @timeline block",
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period "P"\n    event "E"\n@timeline\n',
    /duplicate/i,
  ],
  [
    "a file with no title",
    'archlab 1.0 timeline\n\n@timeline\n  period "P"\n    event "E"\n',
    /title/i,
  ],
  [
    "a file with no @timeline block",
    'archlab 1.0 timeline\ntitle "T"\n',
    /@timeline/i,
  ],
];

for (const [what, source, pattern] of REFUSALS) {
  const error = refusalFor(source);
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

/* ONE THING THE PARSER MUST NOT REFUSE, asserted so nobody tightens it into a
   defect: two events with the SAME LABEL. Across periods a repeated label is a
   real history ("Raised money" twice is two occasions), within one it is
   allowed too and reported by `validate_timeline` instead — because there is
   no id for a duplicate to break, and a parser that refused it would make a
   legitimate document unwritable. */
check(
  "two events with the same label are NOT refused — there is no id to collide",
  refusalFor(BODY('    event "Series A"\n    event "Series A"')) === null,
  "the parser refused a document a history can legitimately contain",
);

/* ----------------------------------------------------------------------- */
/* 7. No cross-parsing between the eight grammars                           */
/* ----------------------------------------------------------------------- */

console.log("no cross-parsing (eight grammars, both directions)");

{
  const TIMELINE_DOC =
    'archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period "P"\n    event "E"\n';

  /* [kind, its header, its parser, the word the timeline parser must use for
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
    ["gantt", "archlab 1.0 gantt", parseGanttText, "gantt"],
  ];

  for (const [kind, header, otherParser, named] of OTHERS) {
    let message = "";
    try {
      parseTimelineText(`${header}\ntitle "T"\n`);
    } catch (error) {
      message = error.message;
    }
    check(
      `the timeline parser refuses a ${kind} header by name ("${named}")`,
      message.includes(named),
      message || "it parsed",
    );

    let refusal = null;
    try {
      otherParser(TIMELINE_DOC);
    } catch (error) {
      refusal = error;
    }
    check(
      kind === "c4"
        ? "the c4 parser refuses a timeline document"
        : `the ${kind} parser refuses a timeline document, naming "timeline"`,
      refusal !== null &&
        (kind === "c4" || refusal.message.includes("timeline")),
      refusal === null ? "it parsed" : refusal.message,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 8. Document-type detection across all eight grammars                     */
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
    ["archlab 1.0 timeline", "timeline"],
  ];
  for (const [header, kind] of HEADERS) {
    check(
      `"${header}" detects as ${kind}`,
      detectAlabKind(`${header}\ntitle "T"\n`) === kind,
      `got ${detectAlabKind(`${header}\ntitle "T"\n`)}`,
    );
  }
  check(
    "the seeded example detects as timeline",
    detectAlabKind(TIMELINE_EXAMPLE) === "timeline",
    `got ${detectAlabKind(TIMELINE_EXAMPLE)}`,
  );
  /* Anchored to the whole line, and case-sensitive: a confidently wrong answer
     routes text to the wrong parser, and that error misleads worse than no
     answer at all. `Timeline` is here because the word is capitalised
     everywhere a reader meets it in prose. */
  for (const near of [
    "archlab 1.0 timelines",
    "archlab 1.0 timeline x",
    "archlab 1.0timeline",
    "archlab 1.0 Timeline",
  ]) {
    check(
      `"${near}" is not mistaken for a timeline header`,
      detectAlabKind(`${near}\n`) !== "timeline",
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
