/**
 * `validate_lifecycle` and `format_lifecycle` — the lifecycle's half of the
 * write-then-check loop.
 *
 * A NINTH PAIR rather than a `kind` argument, for the reason the previous
 * seven exist: the facts worth reporting about a lifecycle are none of the
 * other kinds'. C4 returns levels, sequence ordered messages, flowchart a
 * guarded graph, use case actors and their reach, ER tables and keys, a
 * dictionary its coverage, a gantt its duration and critical chain, a timeline
 * its bands — and one subject's passage through states is none of those.
 *
 * WHAT A PARSE CANNOT SEE HERE, which is the whole justification for this tool
 * beyond the parser. Every finding below describes a document that PARSES —
 * the grammar already refuses a forward rejoin, a self-rejoin, a branch off a
 * branch, an edge between two states and a document with no subject — and is
 * still wrong:
 *
 *   - THE SUBJECT NEVER TERMINATES. Nothing anywhere is marked `ends`, so the
 *     document says the subject reaches the last state and stays there
 *     forever. The parser cannot refuse it, because the first draft of every
 *     lifecycle looks like this and an error on line 1 of a work in progress
 *     helps nobody.
 *   - STATES AFTER A FINAL ONE ARE UNREACHABLE. `ends` means the subject
 *     STOPS, so anything written below such a state is stranded. Each line
 *     alone is valid; only the pair is wrong, which is exactly the class a
 *     line-based parser cannot see.
 *   - A BRANCH NOBODY KNOWS HOW TO TAKE. An exit with no `when` draws a
 *     departure with no condition on it: the picture says the subject can
 *     leave here and refuses to say when, which is worse than not drawing the
 *     branch at all.
 *   - THE DOCUMENT IS A TIMELINE. No exits anywhere means an ordered list of
 *     labelled states with nothing leaving them, which is what
 *     `archlab 1.0 timeline` draws with less machinery. This is the mirror of
 *     `validate_timeline`'s own `singleEventPeriods` note and of
 *     `validate_gantt`'s `barlessSections`: the family's validators are
 *     willing to say a document wants the notation next door.
 *   - STATES WEARING A FLOWCHART'S CLOTHES. A lifecycle state is a place the
 *     subject can BE ("Paid"); a step is something somebody DOES ("Take
 *     payment"). The grammar cannot tell them apart — both are quoted
 *     strings — and a document of imperatives is a flowchart written in this
 *     notation, which is the single failure mode this kind has that no other
 *     kind here shares. Naming it is the most useful thing this validator
 *     does for an agent, which is exactly the caller most likely to produce
 *     one.
 *
 * The reader is `parseLifecycleInput` — the SAME one `/live?d=lifecycle` uses,
 * itself a thin shell over `parseLifecycleText` — so "the MCP server accepted
 * it" means the playground renders it too.
 *
 * ONE DIALECT IN AND ONE OUT. There is no Mermaid caveat to state because
 * there is no Mermaid lifecycle: `stateDiagram-v2` is a state MACHINE, and
 * `features/lifecycle/input/parse.ts` argues why importing or emitting one
 * would misrepresent both.
 */

import type { LifecycleLabFile } from "@/types/lifecycle";
import { lifecycleExits, lifecycleReachableThrough } from "@/types/lifecycle";

import { serializeLifecycleText } from "@/features/archtext";
/* THE VIEWER'S OWN LAYOUT, called server-side — pure, no DOM, so this tool
   reports the wrapping the browser will draw rather than a second estimate
   that could disagree with it. Imported from `lib/layout` rather than the
   feature barrel, exactly as `tools/timeline.ts` imports `layoutTimeline`: the
   barrel re-exports `.tsx` components and `scripts/mcp-check.mjs` loads this
   module through Node's type stripping, which cannot resolve one. */
import { layoutLifecycle } from "@/features/lifecycle/lib/layout";
import type { LifecycleLayout } from "@/features/lifecycle/lib/layout";
import {
  LIFECYCLE_FORMAT_LABEL,
  parseLifecycleInput,
  type LifecycleInputError,
  type LifecycleSourceFormat,
} from "@/features/lifecycle/input/parse";

import { guardSourceSize } from "../lib/limits";
import {
  errorResult,
  fence,
  joinSections,
  quoteSourceLine,
  textResult,
  type McpTextResult,
} from "../lib/render";

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

function renderReadError(error: LifecycleInputError): string {
  if (error.kind === "parse") {
    return joinSections(
      `INVALID as ${LIFECYCLE_FORMAT_LABEL[error.format]}.`,
      `line ${error.line}, column ${error.column}: ${error.message}`,
      error.lineText === null
        ? null
        : quoteSourceLine(error.lineText, error.line, error.column),
    );
  }
  return error.message;
}

export type ReadLifecycleResult =
  | { status: "ok"; file: LifecycleLabFile; format: LifecycleSourceFormat }
  | {
      status: "error";
      kind: LifecycleInputError["kind"] | "size";
      message: string;
    };

export function readLifecycle(source: string): ReadLifecycleResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", kind: "size", message: size.message };

  const result = parseLifecycleInput(source);
  if (result.status === "error") {
    return {
      status: "error",
      kind: result.error.kind,
      message: renderReadError(result.error),
    };
  }
  return { status: "ok", file: result.value.file, format: result.value.format };
}

/* -------------------------------------------------------------------------- */
/* The audit                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Verbs that turn a state label into a STEP.
 *
 * ANCHORED AT THE START AND ON A WORD BOUNDARY, which is what makes this safe
 * to report: `^Ship\b` does not match "Shipped", `^Pay\b` does not match
 * "Paid", and `^Cancel\b` does not match "Cancelled" — the past participles
 * that are the correct spelling of a state are exactly the forms this must not
 * flag. A pattern anywhere in the label would have flagged every one of them
 * and the finding would have been noise a caller learns to ignore.
 *
 * A TABLE RATHER THAN ONE REGEX so the message can quote the word it matched:
 * "«Take» is something somebody does" is actionable where "this looks like a
 * step" is a label the caller has to translate first.
 *
 * WHAT IS DELIBERATELY ABSENT, because a false positive here is worse than a
 * miss: `open` is a perfectly good STATE ("Open", "Closed"), `hold` is one
 * too ("On hold"), and `refund` is as often a noun as a verb. This finding is
 * advice about wording, so a caller who is told twice that a correct label is
 * wrong stops reading the whole report — which would cost the three findings
 * above it as well. When in doubt, leave the word out.
 */
const IMPERATIVE_VERBS: readonly string[] = [
  "add",
  "approve",
  "archive",
  "assign",
  "calculate",
  "cancel",
  "check",
  "close",
  "confirm",
  "create",
  "decide",
  "deliver",
  "deploy",
  "escalate",
  "fix",
  "generate",
  "handle",
  "merge",
  "notify",
  "pack",
  "pay",
  "process",
  "publish",
  "reject",
  "resolve",
  "review",
  "send",
  "ship",
  "start",
  "submit",
  "take",
  "update",
  "validate",
  "verify",
  "wait",
];

const IMPERATIVE_RE = new RegExp(`^(${IMPERATIVE_VERBS.join("|")})\\b`, "i");

interface SteppishState {
  id: string;
  label: string;
  verb: string;
}

interface UnconditionalExit {
  from: string;
  label: string;
}

/**
 * The facts an agent writing a lifecycle it cannot see has no other way to
 * learn. See the file header for why each one is beyond the parser.
 */
interface LifecycleAudit {
  /** Nothing anywhere is marked `ends`. */
  neverEnds: boolean;
  /** States the subject can no longer arrive at, because a final state comes
   * before them. Ids, in track order. */
  unreachable: string[];
  /** Exits with no `when`. */
  unconditional: UnconditionalExit[];
  /** The document has no departures at all. */
  noExits: boolean;
  /** States whose label reads as a step rather than a condition. */
  steppish: SteppishState[];
  /** States whose label wraps past `OVERLONG_LINES` in the real layout. */
  overlong: { label: string; lines: number }[];
}

/** How many wrapped lines a state label may take before it stops being the
 * name of a condition. Two is the wrap the bundled examples reach at their
 * longest, so this fires above what the product itself ships rather than at an
 * invented threshold. */
const OVERLONG_LINES = 2;

function auditLifecycle(
  file: LifecycleLabFile,
  layout: LifecycleLayout,
): LifecycleAudit {
  const exits = lifecycleExits(file);
  const anyEnds =
    file.states.some((state) => state.final === true) ||
    exits.some((exit) => exit.rejoins === undefined);

  /* THE SAME BOUNDARY THE CANVAS FADES AT, imported rather than recomputed:
     `lifecycleReachableThrough` is the one definition of where the track
     stops, so the report and the picture can never disagree about which
     states are stranded. */
  const through = lifecycleReachableThrough(file);

  const unconditional: UnconditionalExit[] = [];
  for (const state of file.states) {
    for (const exit of state.exits ?? []) {
      if (typeof exit.when !== "string" || exit.when === "") {
        unconditional.push({ from: state.id, label: exit.label });
      }
    }
  }

  const steppish: SteppishState[] = [];
  for (const state of file.states) {
    const match = IMPERATIVE_RE.exec(state.label);
    if (match !== null) {
      steppish.push({ id: state.id, label: state.label, verb: match[1] });
    }
  }

  return {
    neverEnds: !anyEnds,
    unreachable: file.states.slice(through + 1).map((state) => state.id),
    unconditional,
    noExits: exits.length === 0,
    steppish,
    overlong: layout.states
      .filter((state) => state.labelLines.length > OVERLONG_LINES)
      .map((state) => ({
        label: state.label,
        lines: state.labelLines.length,
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

const quote = (text: string): string =>
  `"${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`;

function renderSummary(
  file: LifecycleLabFile,
  layout: LifecycleLayout,
): string {
  const exits = lifecycleExits(file);
  const terminal = exits.filter((exit) => exit.rejoins === undefined).length;
  const returning = exits.length - terminal;
  return [
    `Title: ${file.metadata.title}`,
    `Subject: ${file.subject.label}`,
    `Track: ${file.states.map((state) => state.label).join(" → ")}`,
    `Ways out: ${exits.length} — ${terminal} that end, ${returning} that return`,
    /* The one number a caller genuinely cannot compute from their own text:
       the drawn height depends on how every label wrapped and on how many
       branches each state carries. */
    `Size: ${Math.round(layout.width)} x ${Math.round(layout.height)} px — the height is solved from the wrapped text and the branch lane, so a longer condition makes a taller diagram.`,
  ].join("\n");
}

/** Every state as a row: where it sits, whether it stops, and what leaves it. */
function renderStates(file: LifecycleLabFile, layout: LifecycleLayout): string {
  const rows = layout.states.map((state, index) => {
    const source = file.states[index];
    const exits = layout.exits.filter((exit) => exit.from === state.id);
    const ways =
      exits.length === 0
        ? "—"
        : exits
            .map(
              (exit) =>
                `${exit.label} → ${exit.rejoins === null ? "ends" : exit.rejoins}`,
            )
            .join("; ");
    const marks = [
      state.final ? "ends here" : "",
      state.reachable ? "" : "unreachable",
      typeof source?.description === "string" ? "described" : "",
    ]
      .filter((mark) => mark !== "")
      .join(", ");
    return `| ${index + 1} | ${state.id} | ${state.label.replace(/\|/g, "\\|")} | ${ways.replace(/\|/g, "\\|")} | ${marks === "" ? "—" : marks} |`;
  });
  return [
    "| # | Id | State | Ways out | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/**
 * The audit, rendered only when it has something to say, and worded as the
 * REMEDY rather than the complaint — the caller is a model about to edit the
 * document, and "mark Delivered with `ends`" is actionable where "the subject
 * never terminates" is a label it must translate first.
 */
function renderAudit(
  audit: LifecycleAudit,
  file: LifecycleLabFile,
): string | null {
  const notes: string[] = [];

  if (audit.neverEnds) {
    const last = file.states[file.states.length - 1];
    notes.push(
      `The subject never terminates: no state and no exit carries \`ends\`, so this document says ${quote(file.subject.label)} ` +
        "reaches the last state and stays there. A lifecycle that cannot " +
        "finish is missing its whole right-hand answer. Add `ends` to the " +
        `state where it stops${last === undefined ? "" : ` — probably \`state ${last.id} ${JSON.stringify(last.label)} ends\``}, and to any exit that is a dead end.`,
    );
  }
  if (audit.unreachable.length > 0) {
    notes.push(
      `Unreachable states: ${audit.unreachable.map((id) => `\`${id}\``).join(", ")} — \`ends\` means the subject STOPS there, so everything ` +
        "declared after a final state is stranded: nothing in the document " +
        "can put the subject in one of them. The canvas draws them faded for " +
        "the same reason. Either move the `ends` marker to the real last " +
        "state, or move these states above it.",
    );
  }
  if (audit.unconditional.length > 0) {
    notes.push(
      `Branches nobody knows how to take: ${audit.unconditional
        .map((exit) => `${quote(exit.label)} (out of \`${exit.from}\`)`)
        .join(
          "; ",
        )} — an exit with no \`when\` draws a departure and refuses ` +
        "to say what causes it, which leaves a reader with a line they cannot " +
        'act on. Add a nested `when "…"` line saying, in your own words, the ' +
        "circumstance under which the subject leaves here.",
    );
  }
  if (audit.steppish.length > 0) {
    notes.push(
      `States that read as steps: ${audit.steppish
        .map(
          (state) =>
            `${quote(state.label)} (\`${state.id}\`, starts with "${state.verb}")`,
        )
        .join("; ")} — a lifecycle state is a place the subject can BE ` +
        '("Paid", "Shipped"), not something somebody does to it ("Take ' +
        'payment", "Ship it"). The grammar cannot tell the two apart, so ' +
        "nothing else in arch-lab will notice — but a document of imperatives " +
        "is a flowchart written in this notation, and a flowchart draws it " +
        "better: `archlab 1.0 flowchart`, `validate_flowchart`, which has real " +
        "decisions and guarded edges. If these really are states, reword them " +
        "in the past participle.",
    );
  }
  if (audit.noExits) {
    notes.push(
      "No ways out at all: every state on the track and nothing leaving any " +
        "of them. That is an ordered list of labelled points, which is what a " +
        "MILESTONE TIMELINE draws with less machinery (`archlab 1.0 " +
        "timeline`, `validate_timeline`). This notation earns its keep on the " +
        "branches — where the subject can stop, and where it goes back to. If " +
        "there genuinely are none, write a timeline; if there are, add `exit` " +
        "lines under the states they leave.",
    );
  }
  if (audit.overlong.length > 0) {
    notes.push(
      `States that wrap past ${OVERLONG_LINES.toString()} lines: ${audit.overlong
        .map(
          (entry) => `${quote(entry.label)} (${entry.lines.toString()} lines)`,
        )
        .join("; ")} — measured with the same layout the canvas draws, so ` +
        "this is what a reader will see rather than an estimate. A state's " +
        "label is the NAME of a condition and reads as one at a glance; a " +
        "sentence belongs in the nested `desc` line under it, which is drawn " +
        "in the quieter style and is there for exactly this.",
    );
  }
  return notes.length === 0 ? null : notes.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export function validateLifecycle(source: string): McpTextResult {
  const read = readLifecycle(source);
  if (read.status === "error") return errorResult(read.message);

  const layout = layoutLifecycle(read.file);
  const audit = auditLifecycle(read.file, layout);

  return textResult(
    joinSections(
      `VALID as ${LIFECYCLE_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file, layout),
      layout.states.length === 0 ? null : renderStates(read.file, layout),
      renderAudit(audit, read.file),
    ),
  );
}

export function formatLifecycle(source: string): McpTextResult {
  const read = readLifecycle(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      `Canonical .alab lifecycle text, read as ${LIFECYCLE_FORMAT_LABEL[read.format]}.`,
      fence("", serializeLifecycleText(read.file)),
    ),
  );
}
