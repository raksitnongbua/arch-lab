/**
 * C4 conformance advisories — the review-checklist items at
 * c4model.com/diagrams/notation that a PARSER cannot care about.
 *
 * A document can be perfectly well-formed `.alab` and still be a bad C4
 * diagram: every container unlabelled with a technology, every relationship
 * labelled "Uses", every element a bare noun with no description. Those are
 * the first things a reviewer of a real diagram objects to, and until now the
 * checker's green tick said nothing about any of them.
 *
 * Three rules govern everything here:
 *
 *   1. **Never blocking.** `checkSource` keeps returning `ok`; advisories ride
 *      alongside the tick. Failing on style would make the checker useless on
 *      a work-in-progress model — which is exactly when someone pastes into
 *      `/validate`.
 *   2. **Structural facts only.** Nothing here judges prose quality. A rule
 *      fires on an absent field or a label drawn from a closed list of
 *      contentless verbs, never on a heuristic about how good a sentence is.
 *   3. **Cited.** Every rule traces to a sentence on c4model.com, recorded in
 *      `ADVISORY_RULES` below, so a disagreement is with the C4 model rather
 *      than with our taste.
 *
 * Pure and synchronous, like `check.ts` — no DOM, no I/O.
 */

import type { ArchLabFile, C4Diagram, C4Level } from "@/types";
import { C4_ABSTRACTION, isBoundaryPlaceholder } from "@/types";

/* -------------------------------------------------------------------------- */
/* Rules                                                                       */
/* -------------------------------------------------------------------------- */

export type AdvisoryRule =
  | "missing-technology"
  | "missing-description"
  | "unlabelled-relationship"
  | "vague-relationship"
  | "bidirectional-relationship"
  | "missing-protocol"
  | "missing-diagram-title";

/** Why each rule exists, in C4's own terms. Rendered as the group heading. */
export const ADVISORY_RULES: Record<
  AdvisoryRule,
  { title: string; because: string }
> = {
  "missing-technology": {
    title: "Technology not stated",
    because:
      "C4 asks for the technology on every container and component. Without " +
      "it a container diagram is a context diagram with extra boxes.",
  },
  "missing-description": {
    title: "No description",
    because:
      "C4 asks for a short description on each element, to give an " +
      "at-a-glance view of its key responsibilities.",
  },
  "unlabelled-relationship": {
    title: "Unlabelled relationship",
    because:
      "C4 asks every line to be labelled with the intent of the " +
      "relationship — an unlabelled arrow says only that two things touch.",
  },
  "vague-relationship": {
    title: "Relationship label says nothing",
    because:
      'C4 singles out vague one-word labels like "Uses" as the thing to ' +
      "avoid. Say what flows and why.",
  },
  "bidirectional-relationship": {
    title: "Bidirectional line",
    because:
      "C4 asks that every line represent a unidirectional relationship. Two " +
      "one-way lines can carry two different labels; one two-way line cannot.",
  },
  "missing-protocol": {
    title: "Protocol not stated",
    because:
      "C4 asks container-level relationships to name the technology or " +
      "protocol they use — HTTPS/JSON, gRPC, SQL/TCP.",
  },
  "missing-diagram-title": {
    title: "Diagram has no title",
    because:
      "C4 asks every diagram to carry a title describing its type and scope.",
  },
};

export interface Advisory {
  rule: AdvisoryRule;
  /** `d-cnt-shopflow / api` — where in the model to look. */
  where: string;
  /** The specific complaint, naming the element. */
  message: string;
}

/**
 * Labels that consume a line's worth of space to say "these two things are
 * connected", which the line already said. Deliberately a CLOSED list of
 * contentless verbs rather than a length or word-count heuristic: "Pays" is
 * one short word and a perfectly good label, while "Makes use of" is four
 * and still says nothing.
 */
const CONTENTLESS_LABELS = new Set([
  "uses",
  "use",
  "used by",
  "makes use of",
  "calls",
  "invokes",
  "talks to",
  "connects to",
  "communicates with",
  "interacts with",
  "depends on",
  "reads",
  "writes",
  "reads/writes",
  "reads and writes",
  "sends",
  "gets",
  "accesses",
]);

/** The two levels where C4 requires an explicit technology. */
function requiresTechnology(level: C4Level): boolean {
  return level === "container" || level === "component";
}

/* -------------------------------------------------------------------------- */
/* Checking                                                                    */
/* -------------------------------------------------------------------------- */

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function adviseDiagram(diagram: C4Diagram, out: Advisory[]): void {
  if (isBlank(diagram.title)) {
    out.push({
      rule: "missing-diagram-title",
      where: diagram.id,
      message: `The ${diagram.level} diagram \`${diagram.id}\` has no title.`,
    });
  }

  for (const node of diagram.nodes) {
    // A placeholder is the same element defined one level up; its technology
    // and description belong to — and are checked at — the original.
    if (isBoundaryPlaceholder(node)) continue;

    const abstraction = C4_ABSTRACTION[node.type];

    if (requiresTechnology(diagram.level) && isBlank(node.technology)) {
      out.push({
        rule: "missing-technology",
        where: `${diagram.id} / ${node.id}`,
        message: `${abstraction} "${node.name}" names no technology.`,
      });
    }

    if (isBlank(node.description)) {
      out.push({
        rule: "missing-description",
        where: `${diagram.id} / ${node.id}`,
        message: `"${node.name}" has no description — a reader has only the name to go on.`,
      });
    }
  }

  const nameById = new Map(diagram.nodes.map((node) => [node.id, node.name]));
  const named = (id: string): string => nameById.get(id) ?? id;

  for (const edge of diagram.edges) {
    const pair = `${named(edge.source)} → ${named(edge.target)}`;

    const label = edge.label?.trim() ?? "";
    if (label === "") {
      out.push({
        rule: "unlabelled-relationship",
        where: `${diagram.id} / ${edge.id}`,
        message: `${pair} is unlabelled.`,
      });
    } else if (CONTENTLESS_LABELS.has(label.toLowerCase())) {
      out.push({
        rule: "vague-relationship",
        where: `${diagram.id} / ${edge.id}`,
        message:
          `${pair} is labelled "${label}". Prefer the intent — ` +
          `"Submits order for fulfilment", not "Uses".`,
      });
    }

    if (edge.direction === "bidirectional") {
      out.push({
        rule: "bidirectional-relationship",
        where: `${diagram.id} / ${edge.id}`,
        message: `${pair} is drawn both ways. Split it into two labelled one-way lines.`,
      });
    }

    if (diagram.level === "container" && isBlank(edge.technology)) {
      out.push({
        rule: "missing-protocol",
        where: `${diagram.id} / ${edge.id}`,
        message: `${pair} names no protocol.`,
      });
    }
  }
}

/**
 * Every advisory in the model, in document order (diagrams as stored, then
 * nodes, then edges) so two runs over the same file always agree.
 */
export function advise(file: ArchLabFile): Advisory[] {
  const out: Advisory[] = [];
  for (const diagram of file.diagrams) adviseDiagram(diagram, out);
  return out;
}

/**
 * Advisories bucketed by rule, in `ADVISORY_RULES` declaration order — the
 * shape both the `/validate` panel and the MCP tool render. Empty buckets are
 * dropped: a rule with nothing to say should not appear at all.
 */
export function groupAdvisories(
  advisories: readonly Advisory[],
): Array<{ rule: AdvisoryRule; items: Advisory[] }> {
  const order = Object.keys(ADVISORY_RULES) as AdvisoryRule[];
  return order
    .map((rule) => ({
      rule,
      items: advisories.filter((advisory) => advisory.rule === rule),
    }))
    .filter((group) => group.items.length > 0);
}
