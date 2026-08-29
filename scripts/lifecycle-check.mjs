#!/usr/bin/env node
/**
 * Lifecycle format check (`.alab` lifecycle grammar). Follows the pattern of
 * `scripts/timeline-check.mjs` and `scripts/gantt-check.mjs`: loads the REAL
 * library from `src/features/archtext/**` through Node's built-in type
 * stripping (`scripts/lib/resolve-ts.mjs`), so this script and the app
 * exercise the exact same code rather than a copy of it.
 *
 * What it proves — and why each clause is here. The lifecycle makes the same
 * promise the other eight `.alab` grammars make, "text and model are two faces
 * of the same document". What is different is WHY the refusals matter: this
 * notation's whole case rests on being unable to express something
 * (`src/types/lifecycle.ts` records that the overlap with the flowchart was
 * waived rather than argued away), so the group that proves the grammar still
 * CANNOT is the group this file exists for.
 *
 *   1. The SEED the playground opens with round-trips byte-identically. It is
 *      checked before the kitchen sink on purpose: a grammar change that
 *      breaks it breaks the first screen a reader ever sees.
 *   2. A KITCHEN SINK exercising every construct — a subject with a note,
 *      states with and without tags, descriptions and `ends`, terminal and
 *      rejoining exits, an exit with and without a `when` — round-trips
 *      byte-identically.
 *   3. THE ANTI-GRAPH INVARIANT, asserted structurally rather than by reading
 *      the parser. For every document this grammar accepts: a state's only
 *      successor is the next one declared, and every rejoin points strictly
 *      BACKWARD. If either ever stops holding, the notation has become a
 *      flowchart and should be deleted rather than extended.
 *   4. THE REFUSALS THAT ARE THE NOTATION. Every construct that would make
 *      the grammar able to express an arbitrary graph is asserted to be
 *      refused BY NAME, and — the part that matters — each refusal must POINT
 *      AT THE FLOWCHART. A refusal that says only "not valid here" sends the
 *      author looking for a spelling; one that names `archlab 1.0 flowchart`
 *      sends them to the notation that draws what they have. The edge-word
 *      list is READ FROM THE PARSER'S OWN TABLE, so a word added there is
 *      covered here the day it lands rather than the day somebody remembers.
 *   5. BARE/QUOTED SYMMETRY, from a HAND-BUILT model. This grammar has one
 *      bare-token slot (a state's id) and two bare MARKERS (`ends`,
 *      `rejoins`), so a state whose id IS one of those words is the oldest
 *      round-trip bug class in this family. The parser will never produce
 *      such a model; the MCP tools can.
 *   6. Unknown `!` fields from a newer minor survive a round trip verbatim and
 *      in their original key position, at file, metadata, subject, state and
 *      exit scope.
 *   7. STRUCTURAL REFUSALS — a missing subject, a second subject, a state
 *      before the subject, an exit outside a state, an exit that says nowhere
 *      to land, a self-rejoin, a rejoin naming no state — each naming a line
 *      and a column that point into the source.
 *   8. WHAT IT MUST NOT REFUSE. Four documents that PARSE and are still wrong
 *      are the whole reason `validate_lifecycle` exists, so a parser that
 *      tightened into refusing one of them would silently delete that tool's
 *      subject. Asserted as acceptances.
 *   9. NO CROSS-PARSING, in both directions, across all nine grammars.
 *  10. `detectAlabKind` gives the right verdict for all nine headers, and
 *      refuses lifecycle near-misses — the regexes are anchored to the whole
 *      line because a confidently wrong answer routes text to the wrong
 *      parser, and that error message misleads worse than no answer.
 *
 * Exits non-zero on any failure. Run with: pnpm check:lifecycle
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
  parseLifecycleText,
  serializeLifecycleText,
  detectAlabKind,
  ArchTextParseError,
} = await load("src/features/archtext/index.ts");

const { LIFECYCLE_EXAMPLE } = await load(
  "src/features/lifecycle/input/example.ts",
);
const { GANTT_STATE_WORDS, REFUSED_EDGE_WORDS, RESERVED_LIFECYCLE_WORDS } =
  await load("src/features/archtext/lib/lifecycle/keywords.ts");
const { listLifecycleExampleIds, loadLifecycleExample } = await load(
  "src/features/lifecycle/service/example-service.ts",
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

/** Runs `parseLifecycleText` and returns the error, or null if it parsed. */
function refusalFor(source) {
  try {
    parseLifecycleText(source);
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
  const text = serializeLifecycleText(parseLifecycleText(LIFECYCLE_EXAMPLE));
  check(
    "the seeded example round-trips byte-identically",
    text === LIFECYCLE_EXAMPLE,
    firstDiff(LIFECYCLE_EXAMPLE, text),
  );
}

/* ----------------------------------------------------------------------- */
/* 2. Kitchen sink                                                          */
/* ----------------------------------------------------------------------- */

console.log("kitchen sink (.alab lifecycle, every construct)");

const KITCHEN_SINK = `archlab 1.0 lifecycle
title "Everything the grammar has"
description "A subject, five states, both kinds of exit, and every optional slot"
owner "Platform"
tags #core #states
created 2026-08-01T00:00:00Z

@lifecycle
  subject "Claim"
    desc "One insurance claim, from the moment it arrives."
  state filed "Filed" #intake
    desc "Submitted and given a number."
    exit "Withdrawn" ends
      when "the claimant changes their mind"
      desc "The cheapest outcome for everybody."
    exit "Rejected on sight" ends
  state assessed "Assessed"
  state approved "Approved" #money
    exit "Disputed" rejoins assessed
      when "the claimant challenges the amount"
  state paid "Paid"
  state closed "Closed" ends
    desc "Nothing further happens to a closed claim."
`;

{
  const model = parseLifecycleText(KITCHEN_SINK);
  const text = serializeLifecycleText(model);
  check(
    "canonical lifecycle text round-trips byte-identically",
    text === KITCHEN_SINK,
    firstDiff(KITCHEN_SINK, text),
  );
  check(
    "the subject and every state survive",
    model.subject.label === "Claim" && model.states.length === 5,
    JSON.stringify(model.states.map((state) => state.id)),
  );
  check(
    "a state with no exits omits `exits` rather than writing []",
    model.states[1].exits === undefined && Array.isArray(model.states[0].exits),
    JSON.stringify(model.states[1]),
  );
  check(
    "`ends` on a state becomes `final: true`, and its absence writes nothing",
    model.states[4].final === true && !("final" in model.states[0]),
    JSON.stringify({ closed: model.states[4], filed: model.states[0] }),
  );
  check(
    "a terminal exit omits `rejoins`, and a returning one carries the target id",
    model.states[0].exits[0].rejoins === undefined &&
      model.states[2].exits[0].rejoins === "assessed",
    JSON.stringify(model.states[2].exits[0]),
  );
  check(
    "an exit with no `when` omits it — the case validate_lifecycle reports",
    model.states[0].exits[1].when === undefined,
    JSON.stringify(model.states[0].exits[1]),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. The anti-graph invariant                                              */
/* ----------------------------------------------------------------------- */

console.log(
  "the anti-graph invariant (if this fails, the notation is a flowchart)",
);

{
  /* EVERY DOCUMENT THIS GRAMMAR CAN PRODUCE, not a chosen one: the seed, both
     registered examples and the kitchen sink. The property is what makes the
     picture readable as elapsed time rather than as a graph layout, and it is
     the one thing a future widening of the grammar would take away. */
  const documents = [
    ["seed", parseLifecycleText(LIFECYCLE_EXAMPLE)],
    ["kitchen sink", parseLifecycleText(KITCHEN_SINK)],
    ...listLifecycleExampleIds().map((id) => {
      const example = loadLifecycleExample(id);
      return [id, example.status === "ok" ? example.file : null];
    }),
  ].filter(([, file]) => file !== null);

  check(
    `there are documents to measure (${documents.length}, from the registry)`,
    documents.length >= 4,
    "a registered example failed to parse — the rest of this group is vacuous",
  );

  for (const [name, file] of documents) {
    /* NO FIELD ANYWHERE NAMES A SUCCESSOR. Asserted over the JSON rather than
       over the parser, because that is where a future widening would show up:
       a `to`, `next` or `then` key on a state is the shape that would make the
       track a graph, and it would arrive as a forward-tolerant `!` field
       before it ever arrived as syntax. */
    const successorKeys = file.states.flatMap((state) =>
      Object.keys(state).filter((key) =>
        ["to", "next", "then", "goes", "after", "from"].includes(key),
      ),
    );
    check(
      `${name}: no state carries a successor field — the track is declaration order`,
      successorKeys.length === 0,
      `${successorKeys.join(", ")} — a state that names its own successor IS a graph edge`,
    );

    const indexById = new Map(
      file.states.map((state, index) => [state.id, index]),
    );
    const forward = [];
    file.states.forEach((state, stateIndex) => {
      for (const exit of state.exits ?? []) {
        if (exit.rejoins === undefined) continue;
        const target = indexById.get(exit.rejoins);
        if (target === undefined || target >= stateIndex) {
          forward.push(
            `${state.id} → ${exit.rejoins} (${target === undefined ? "no such state" : `index ${target} >= ${stateIndex}`})`,
          );
        }
      }
    });
    check(
      `${name}: every rejoin points strictly BACKWARD`,
      forward.length === 0,
      `${forward.join("; ")} — a forward rejoin is a shortcut along the track, which is the flowchart's edge`,
    );

    /* BRANCH DEPTH IS ONE, read off the model: an exit has no `exits`. This is
       true by the type today, so the assertion is guarding a future edit
       rather than a current bug — which is what makes it worth writing, since
       nothing else would notice. */
    const nested = file.states.flatMap((state) =>
      (state.exits ?? []).filter((exit) => exit.exits !== undefined),
    );
    check(
      `${name}: no exit has exits of its own — branch depth is one`,
      nested.length === 0,
      "a tree of alternatives is a decision graph, which is what a flowchart draws",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 4. The refusals that ARE the notation                                    */
/* ----------------------------------------------------------------------- */

console.log(
  "the refusals that are the notation (each must point at the flowchart)",
);

const BODY = (lines) =>
  `archlab 1.0 lifecycle\ntitle "T"\n\n@lifecycle\n  subject "Thing"\n${lines}\n`;

/*
 * EVERY EDGE WORD FROM THE PARSER'S OWN TABLE, walked rather than retyped. A
 * word added to `REFUSED_EDGE_WORDS` is covered here the day it lands, which
 * is the `codebase.md` rule about a hardcoded list being unable to notice the
 * thing it has never heard of.
 */
check(
  `the edge-word table has entries to walk (${REFUSED_EDGE_WORDS.length})`,
  REFUSED_EDGE_WORDS.length >= 3,
  "nothing to walk — this whole group would pass vacuously",
);

for (const word of REFUSED_EDGE_WORDS) {
  const error = refusalFor(BODY(`  state a "A"\n  state b "B" ${word} a`));
  if (error === null) {
    fail(`"${word}" between two states is refused`, "it parsed");
    continue;
  }
  check(
    `"${word}" between two states is refused, and the message points at the flowchart`,
    error instanceof ArchTextParseError && /flowchart/i.test(error.message),
    `line ${error.line}, column ${error.column}: ${error.message}`,
  );
}

/* THE SAME WORDS ON AN EXIT LINE, which is the second place a reader reaches
   for an arbitrary destination: `exit "X" to b` would let a branch land
   anywhere, which is the flowchart edge wearing the exit's clothes. */
for (const word of REFUSED_EDGE_WORDS) {
  const error = refusalFor(
    BODY(`  state a "A"\n  state b "B"\n    exit "Out" ${word} a`),
  );
  if (error === null) {
    fail(`"${word}" as an exit destination is refused`, "it parsed");
    continue;
  }
  check(
    `"${word}" as an exit destination is refused, naming the flowchart`,
    error instanceof ArchTextParseError && /flowchart/i.test(error.message),
    `line ${error.line}, column ${error.column}: ${error.message}`,
  );
}

/* A FORWARD REJOIN, which is the one edge word this grammar DOES have and
   therefore the one that has to be caught by direction rather than by
   spelling. */
{
  const error = refusalFor(
    BODY(
      `  state a "A"\n    exit "Skip" rejoins c\n  state b "B"\n  state c "C"`,
    ),
  );
  if (error === null) {
    fail("a forward rejoin is refused", "it parsed");
  } else {
    check(
      "a forward rejoin is refused, naming the flowchart",
      /flowchart/i.test(error.message) && /earlier/i.test(error.message),
      `line ${error.line}, column ${error.column}: ${error.message}`,
    );
  }
}

/* AN EXIT NESTED IN AN EXIT — branch depth is one, and the refusal must say
   so rather than reporting an indent. */
{
  const error = refusalFor(
    BODY(`  state a "A"\n    exit "Out" ends\n      exit "And then" ends`),
  );
  if (error === null) {
    fail("an exit inside an exit is refused", "it parsed");
  } else {
    check(
      "an exit inside an exit is refused, naming the flowchart",
      /flowchart/i.test(error.message) && /depart/i.test(error.message),
      `line ${error.line}, column ${error.column}: ${error.message}`,
    );
  }
}

/* THE GANTT'S STATE VOCABULARY, walked from its own table. A reader arriving
   from a plan meets a keyword called `state` and reaches for these three; the
   refusal has to name `ends` or they try the next spelling. */
for (const word of GANTT_STATE_WORDS) {
  const error = refusalFor(BODY(`  state a "A" ${word}`));
  if (error === null) {
    fail(`the gantt state word "${word}" is refused`, "it parsed");
    continue;
  }
  check(
    `the gantt state word "${word}" is refused, and the message names "ends"`,
    /\bends\b/.test(error.message) && /gantt/i.test(error.message),
    `line ${error.line}, column ${error.column}: ${error.message}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Bare/quoted symmetry, from a hand-built model                         */
/* ----------------------------------------------------------------------- */

console.log(
  "bare/quoted symmetry (a hand-built model, not one the parser made)",
);

{
  /* THE ONE BUG CLASS THIS GRAMMAR CAN HAVE THAT THE TIMELINE CANNOT. A state
     id is a bare token and `ends`/`rejoins` are bare markers, so an id spelled
     as either reads back as a marker unless the serializer quotes it — and the
     parser will never produce such a model, so only a hand-built one gets
     here. The MCP tools build models in code. */
  const model = {
    version: "1.0",
    kind: "lifecycle",
    metadata: {
      title: "Awkward ids",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
    subject: { label: 'A subject with "quotes" in it' },
    states: [
      { id: "ends", label: "A state whose id is the terminal marker" },
      { id: "rejoins", label: 'He said "no", then \\left' },
      { id: "state", label: "A state whose id is the keyword" },
      {
        id: "with space",
        label: "A state whose id is not a bare token at all",
        exits: [{ label: "Back", rejoins: "ends" }],
      },
    ],
  };
  const text = serializeLifecycleText(model);
  /* THE REPARSE IS GUARDED, and that is not defensive coding — it is the
     difference between a red line and a stack trace. Break `idToken` and the
     serializer writes `state ends "…"`, which its own parser refuses: an
     unguarded `parseLifecycleText` here would THROW out of the script, and
     `canvas-editing.md` names that exact shape ("an assertion that crashed
     instead of failing") as one of the five ways an assertion in this repo has
     failed to fail. Confirmed by breaking `idToken` and reading the output. */
  let reparsed = null;
  let reparseError = "";
  try {
    reparsed = parseLifecycleText(text);
  } catch (error) {
    reparseError = error instanceof Error ? error.message : String(error);
  }
  check(
    "model -> text -> model is structurally identical",
    reparsed !== null && JSON.stringify(reparsed) === JSON.stringify(model),
    reparsed === null
      ? `the serializer wrote text its own parser refuses: ${reparseError}`
      : JSON.stringify(reparsed),
  );
  for (const word of [...RESERVED_LIFECYCLE_WORDS].filter((candidate) =>
    model.states.some((state) => state.id === candidate),
  )) {
    check(
      `a state whose id is "${word}" is written QUOTED, so it cannot read as a marker`,
      text.includes(`  state ${JSON.stringify(word)} `),
      text,
    );
  }
  check(
    "and a rejoin naming such an id is quoted the same way",
    text.includes(`rejoins ${JSON.stringify("ends")}`),
    text,
  );
  check(
    "an ordinary id stays bare — the quoting is not blanket",
    serializeLifecycleText({
      ...model,
      states: [{ id: "placed", label: "Placed" }],
    }).includes('  state placed "Placed"\n'),
    "a serializer that quoted everything would pass the assertions above and produce unreadable text",
  );
}

/* ----------------------------------------------------------------------- */
/* 6. Forward tolerance                                                     */
/* ----------------------------------------------------------------------- */

console.log("forward tolerance");

const FORWARD = `archlab 1.0 lifecycle
title "Forward"
! meta.futureMeta : {"a":1}
! futureFile : [1,2]

@lifecycle
  subject "Thing"
    ! futureSubject : "s"
  state a "A"
    ! futureState : true
    exit "Out" ends
      ! futureExit : 3
`;

{
  const text = serializeLifecycleText(parseLifecycleText(FORWARD));
  check(
    "unknown fields at file, meta, subject, state and exit scope round-trip verbatim",
    text === FORWARD,
    firstDiff(FORWARD, text),
  );
}

/* `rejoins` MUST NOT BE REACHABLE THROUGH THE ESCAPE HATCH, which is the one
   field where forward tolerance would route around a rule rather than a
   spelling: a `! rejoins : "later"` line could name a state declared after
   this one, which is the forward edge the notation exists without. */
{
  const error = refusalFor(
    BODY(`  state a "A"\n    exit "Out" ends\n      ! rejoins : "a"`),
  );
  check(
    'a "! rejoins" escape is refused — the direction rule lives on the exit line',
    error !== null && /rejoins/.test(error.message),
    error === null ? "it parsed" : error.message,
  );
}

/* ----------------------------------------------------------------------- */
/* 7. Structural refusals, each located                                     */
/* ----------------------------------------------------------------------- */

console.log("structural refusals");

const HEAD = 'archlab 1.0 lifecycle\ntitle "T"\n\n@lifecycle\n';

const REFUSALS = [
  ["a file with no subject", `${HEAD}  state a "A"\n`, /subject|state OF/i],
  [
    "a second subject",
    BODY('  state a "A"\n  subject "Another"'),
    /duplicate "subject"/i,
  ],
  [
    "a subject after the first state",
    `${HEAD}  state a "A"\n  subject "Late"\n`,
    /before the first|subject/i,
  ],
  ["a lifecycle with no states", `${HEAD}  subject "Thing"\n`, /no states/i],
  [
    "an exit outside any state",
    `${HEAD}  subject "Thing"\n  exit "Out" ends\n`,
    /belongs inside one|departure FROM/i,
  ],
  [
    "an exit that says nowhere to land",
    BODY('  state a "A"\n    exit "Out"'),
    /does not say where/i,
  ],
  [
    "an exit that says both",
    BODY('  state a "A"\n  state b "B"\n    exit "Out" ends rejoins a'),
    /exactly once/i,
  ],
  [
    "a self-rejoin",
    BODY('  state a "A"\n    exit "Loop" rejoins a'),
    /rejoins the state it leaves|went nowhere/i,
  ],
  [
    "a rejoin naming no state",
    BODY('  state a "A"\n  state b "B"\n    exit "Out" rejoins ghost'),
    /names no state/i,
  ],
  [
    "a duplicate state id",
    BODY('  state a "A"\n  state a "Again"'),
    /duplicate state id/i,
  ],
  [
    "a bare state id that is a keyword",
    BODY('  state ends "A"'),
    /keyword|quotes/i,
  ],
  ["an empty state label", BODY('  state a ""'), /must not be empty/i],
  ["an empty subject label", `${HEAD}  subject ""\n`, /must not be empty/i],
  [
    "an empty exit label",
    BODY('  state a "A"\n    exit "" ends'),
    /must not be empty/i,
  ],
  [
    "a `when` on a state",
    BODY('  state a "A"\n    when "no"'),
    /DEPARTURE|exit/i,
  ],
  ["a tab for indentation", `${HEAD}\tsubject "Thing"\n`, /tabs/i],
  ["an odd indent", `${HEAD}   subject "Thing"\n`, /indentation/i],
  [
    "a duplicate @lifecycle block",
    `${HEAD}  subject "Thing"\n  state a "A"\n@lifecycle\n`,
    /duplicate/i,
  ],
  [
    "a file with no title",
    'archlab 1.0 lifecycle\n\n@lifecycle\n  subject "T"\n  state a "A"\n',
    /title/i,
  ],
  [
    "a file with no @lifecycle block",
    'archlab 1.0 lifecycle\ntitle "T"\n',
    /@lifecycle/i,
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

/* ----------------------------------------------------------------------- */
/* 8. What the parser must NOT refuse                                       */
/* ----------------------------------------------------------------------- */

console.log("what the parser must NOT refuse (validate_lifecycle's subject)");

/*
 * EVERY ONE OF THESE IS A DOCUMENT THAT PARSES AND IS STILL WRONG, which is
 * exactly what `validate_lifecycle` reports. A parser that tightened into
 * refusing one would silently delete that tool's subject — and it would do it
 * while looking like a stricter, better parser, which is why the acceptances
 * are asserted rather than left to be noticed.
 */
for (const [what, source] of [
  [
    "a subject that never terminates (nothing carries `ends`)",
    BODY('  state a "A"\n  state b "B"'),
  ],
  [
    "states declared after a final one (they are unreachable)",
    BODY('  state a "A" ends\n  state b "B"'),
  ],
  [
    "an exit with no `when` (a branch nobody knows how to take)",
    BODY('  state a "A"\n    exit "Out" ends'),
  ],
  [
    "a lifecycle with no exits at all (this document is a timeline)",
    BODY('  state a "A"\n  state b "B" ends'),
  ],
  [
    "two states with the same LABEL but different ids",
    BODY('  state a "Pending"\n  state b "Pending" ends'),
  ],
  [
    'a state whose label is an action ("Take payment")',
    BODY('  state a "Take payment" ends'),
  ],
]) {
  check(
    `${what} is accepted`,
    refusalFor(source) === null,
    "the parser refused a document validate_lifecycle exists to report on",
  );
}

/* ----------------------------------------------------------------------- */
/* 9. No cross-parsing between the nine grammars                            */
/* ----------------------------------------------------------------------- */

console.log("no cross-parsing (nine grammars, both directions)");

{
  const LIFECYCLE_DOC = BODY('  state a "A" ends');

  /* [kind, its header, its parser, the word the lifecycle parser must use for
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
    ["timeline", "archlab 1.0 timeline", parseTimelineText, "timeline"],
  ];

  for (const [kind, header, otherParser, named] of OTHERS) {
    let message = "";
    try {
      parseLifecycleText(`${header}\ntitle "T"\n`);
    } catch (error) {
      message = error.message;
    }
    check(
      `the lifecycle parser refuses a ${kind} header by name ("${named}")`,
      message.includes(named),
      message || "it parsed",
    );

    let refusal = null;
    try {
      otherParser(LIFECYCLE_DOC);
    } catch (error) {
      refusal = error;
    }
    check(
      kind === "c4"
        ? "the c4 parser refuses a lifecycle document"
        : `the ${kind} parser refuses a lifecycle document, naming "lifecycle"`,
      refusal !== null &&
        (kind === "c4" || refusal.message.includes("lifecycle")),
      refusal === null ? "it parsed" : refusal.message,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 10. Document-type detection across all nine grammars                     */
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
    ["archlab 1.0 lifecycle", "lifecycle"],
  ];
  for (const [header, kind] of HEADERS) {
    check(
      `"${header}" detects as ${kind}`,
      detectAlabKind(`${header}\ntitle "T"\n`) === kind,
      `got ${detectAlabKind(`${header}\ntitle "T"\n`)}`,
    );
  }
  check(
    "the seeded example detects as lifecycle",
    detectAlabKind(LIFECYCLE_EXAMPLE) === "lifecycle",
    `got ${detectAlabKind(LIFECYCLE_EXAMPLE)}`,
  );
  /* Anchored to the whole line, and case-sensitive: a confidently wrong answer
     routes text to the wrong parser, and that error misleads worse than no
     answer at all. `Lifecycle` is here because the word is capitalised
     everywhere a reader meets it in prose, and `life-cycle` because that is
     the other spelling of the English word. */
  for (const near of [
    "archlab 1.0 lifecycles",
    "archlab 1.0 lifecycle x",
    "archlab 1.0lifecycle",
    "archlab 1.0 Lifecycle",
    "archlab 1.0 life-cycle",
  ]) {
    check(
      `"${near}" is not mistaken for a lifecycle header`,
      detectAlabKind(`${near}\n`) !== "lifecycle",
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
