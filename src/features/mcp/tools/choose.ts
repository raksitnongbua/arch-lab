/**
 * `choose_notation` — the decision table, not the decision.
 *
 * WHY A TOOL AND NOT A BETTER TOOL DESCRIPTION. An agent handed "document how
 * a refund works" has to pick one of ten grammars before it writes a line, and
 * everything that could help it is scattered: each kind's one-line job lives in
 * its own `validate_*` description, and the facts that separate two NEAR
 * neighbours live nowhere an agent can read at all — they are in
 * `kind-copy.ts` comments, written for the person maintaining the wording. So
 * the agent's only cheap move was `list_example_models`, which answers "what
 * is bundled" rather than "which of these answers my question".
 *
 * WHY IT DOES NOT RANK. Every other answer this server gives is the real
 * parser's; a keyword score over the user's sentence would be the one heuristic
 * in the building, and a confident wrong rank is worse than no rank — the agent
 * would stop reading at the top entry. The agent has the whole conversation
 * behind the request and this server has one string; the useful division of
 * labour is that the server supplies the discriminating facts and the agent,
 * or its human, spends them.
 *
 * That is also the rule `../lib/ask.ts` states for the ask envelope — prove the
 * fork, never settle it — applied one step earlier, before any text exists to
 * prove anything from.
 *
 * WHY THE SEPARATIONS ARE WRITTEN HERE RATHER THAN DERIVED. `KIND_BLURB` is
 * the source for what each kind is FOR and is interpolated below verbatim, so
 * the tool and the product cannot drift. What cannot be derived is which pairs
 * a reader actually confuses: that is a judgement, it is recorded in the
 * `kind-copy.ts` comments, and `check:mcp` pins that every kind named here is
 * a real one.
 */

import {
  KIND_BLURB,
  EXAMPLE_NOTATION_LABEL,
} from "@/features/playground/lib/kind-copy";
import type { SeedKind } from "@/features/playground/input/parse";

import { joinSections, textResult, type McpTextResult } from "../lib/render";

/**
 * The pairs a reader genuinely confuses, and the one fact that settles each.
 *
 * NOT EVERY PAIR — only the ones with a real overlap, because a table that
 * separated all forty-five pairs would bury the four that matter. Three of
 * these are recorded as waivers or near-misses in `src/types/*.ts`, which is
 * where the argument lives; this is the short form an agent can act on.
 */
const SEPARATIONS: Partial<Record<SeedKind, readonly [SeedKind, string][]>> = {
  c4: [
    [
      "tree",
      "C4's four levels are a fixed vocabulary; a tree's depth is whatever you nested.",
    ],
    [
      "flowchart",
      "C4 draws what a system IS; a flowchart draws what it DOES, in order.",
    ],
  ],
  tree: [
    [
      "c4",
      "A tree's subject is anything and its depth is yours; C4 draws systems through four named levels.",
    ],
    [
      "dict",
      "A dictionary is exactly two deep and is about what a field MEANS; a tree is any depth and is about containment.",
    ],
    [
      "flowchart",
      "A tree's child is INSIDE its parent; a flowchart's next step is AFTER it.",
    ],
  ],
  flowchart: [
    [
      "lifecycle",
      "A flowchart is many things doing; a lifecycle is one thing being, and its order is declaration order.",
    ],
    [
      "sequence",
      "A flowchart has no actors; a sequence diagram's whole axis is who calls whom.",
    ],
  ],
  lifecycle: [
    [
      "flowchart",
      "A lifecycle cannot express an arbitrary graph — that subtraction is the notation.",
    ],
    [
      "timeline",
      "A timeline records what DID happen once; a lifecycle names every outcome that is possible.",
    ],
  ],
  gantt: [
    [
      "timeline",
      "A gantt is work that has NOT happened, with dependencies; a timeline is what already did.",
    ],
  ],
  timeline: [
    [
      "gantt",
      "A timeline has no durations and no dependencies — if you need either, it is a gantt.",
    ],
    [
      "sequence",
      "A timeline names no actor; a sequence diagram is ordered BY actor.",
    ],
  ],
  er: [
    [
      "dict",
      "An ER schema draws how one record finds another; a dictionary explains what one field means.",
    ],
  ],
  dict: [
    [
      "er",
      "A dictionary carries meaning and provenance per field, and draws no relationships.",
    ],
    ["tree", "A dictionary stops at two levels by the shape of its own model."],
  ],
  usecase: [
    [
      "flowchart",
      "A use-case diagram draws the system's EDGE — who may do what — never the steps inside.",
    ],
  ],
  sequence: [
    [
      "flowchart",
      "A sequence diagram is ordered by message between named participants; a flowchart is ordered by step.",
    ],
  ],
};

/** The first line of a document of this kind. C4 is the one with no kind word,
 *  which is a fact an agent needs before it writes line 1. */
function headerLine(kind: SeedKind): string {
  return kind === "c4" ? "`archlab 1.0`" : `\`archlab 1.0 ${kind}\``;
}

/** The order the table reads in — the order the notations were added. */
const ORDER = Object.keys(KIND_BLURB) as SeedKind[];

export function chooseNotation(): McpTextResult {
  const rows = ORDER.map((kind) => {
    const lines = [
      `## ${EXAMPLE_NOTATION_LABEL[kind]} — ${headerLine(kind)}`,
      KIND_BLURB[kind] + ".",
    ];
    for (const [other, why] of SEPARATIONS[kind] ?? []) {
      lines.push(`- Not a ${EXAMPLE_NOTATION_LABEL[other]}: ${why}`);
    }
    lines.push(
      `- Check it with \`${kind === "c4" ? "validate_model" : `validate_${kind}`}\`.`,
    );
    return lines.join("\n");
  });

  return textResult(
    joinSections(
      "Pick by the QUESTION the document answers, not by the shapes it draws — " +
        "every notation here can be bent into boxes and lines, and the question " +
        "is the only thing that separates them.",
      rows.join("\n\n"),
      "This tool does not rank: it has one sentence of the request and you have " +
        "the conversation behind it. If two of these still fit after reading " +
        "the separations, that is a real fork and it belongs to your human — " +
        "put both to them with the question each answers, and do not pick for " +
        "them. `get_example_model` will show you a finished document of any " +
        "kind before you commit to one.",
    ),
  );
}
