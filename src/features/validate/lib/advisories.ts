/**
 * Advisories — what a document is valid but still worth a word about.
 *
 * A document can be perfectly well-formed `.alab` and still be a bad C4
 * diagram: every container unlabelled with a technology, every relationship
 * labelled "Uses", every element a bare noun with no description. Those are
 * the first things a reviewer of a real diagram objects to, and until now the
 * checker's green tick said nothing about any of them.
 *
 * TWO FAMILIES live here, and the distinction is worth keeping straight:
 *
 *   - C4 CONFORMANCE — the review-checklist items at
 *     c4model.com/diagrams/notation. These apply to C4 models only.
 *   - `.alab` FORMAT HYGIENE — limits the format itself asks for, which hold
 *     whatever kind of document carries them. `long-title` is the first, and it
 *     is why `adviseSequence` exists: a sequence document has no C4 notation to
 *     conform to, but it has a `title` line like any other.
 *
 * Three rules govern everything here:
 *
 *   1. **Never blocking.** `checkSource` keeps returning `ok`; advisories ride
 *      alongside the tick. Failing on style would make the checker useless on
 *      a work-in-progress model — which is exactly when someone pastes into
 *      `/validate`.
 *   2. **Structural facts only.** Nothing here judges prose quality. A rule
 *      fires on an absent field, a measurable length, or a label drawn from a
 *      closed list of contentless verbs — never on a heuristic about how good a
 *      sentence is.
 *   3. **Cited.** Every rule names its source in `ADVISORY_RULES` below — for
 *      the C4 family a sentence on c4model.com, for the format family the
 *      constant that defines the limit. Either way a disagreement is with
 *      something written down rather than with our taste.
 *
 * Pure and synchronous, like `check.ts` — no DOM, no I/O.
 */

import { MAX_TITLE_LENGTH, titleLengthOverCap } from "@/lib/constants";
import type { ArchLabFile, C4Diagram, C4Level, SequenceLabFile } from "@/types";
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
  | "missing-diagram-title"
  | "long-title";

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
  "long-title": {
    title: "Title is very long",
    because:
      `The .alab format asks for titles of at most ${MAX_TITLE_LENGTH} ` +
      "characters (MAX_TITLE_LENGTH). A title is not only a heading: it " +
      "becomes the export filename, the card in the demo gallery, and the name " +
      "a screen reader reads before the diagram. Past that length it is a " +
      "description — and there is a `description` line for that.",
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

/**
 * The `long-title` rule, in ONE place because it is a format rule rather than a
 * C4 one: it holds for a model's own title, for each C4 diagram's title, and for
 * a sequence document's title, and all three should be told off in the same
 * words. `what` names the thing so the message reads naturally in each case.
 */
function adviseTitleLength(
  title: string | undefined,
  what: string,
  where: string,
  out: Advisory[],
): void {
  if (title === undefined) return;
  const length = titleLengthOverCap(title);
  if (length === null) return;
  out.push({
    rule: "long-title",
    where,
    message:
      `${what} is ${length} characters — ${length - MAX_TITLE_LENGTH} over the ` +
      `${MAX_TITLE_LENGTH}-character guide. Move the detail into ` +
      "`description` and keep the title short enough to be a filename.",
  });
}

function adviseDiagram(diagram: C4Diagram, out: Advisory[]): void {
  if (isBlank(diagram.title)) {
    out.push({
      rule: "missing-diagram-title",
      where: diagram.id,
      message: `The ${diagram.level} diagram \`${diagram.id}\` has no title.`,
    });
  }

  adviseTitleLength(
    diagram.title,
    `The ${diagram.level} diagram \`${diagram.id}\`'s title`,
    diagram.id,
    out,
  );

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
  // The MODEL's own title first, before the per-diagram walk: it is the one the
  // export filename and the gallery card are built from.
  adviseTitleLength(file.metadata.title, "The model's title", "title", out);
  for (const diagram of file.diagrams) adviseDiagram(diagram, out);
  return out;
}

/**
 * Advisories for a SEQUENCE document.
 *
 * Short by construction, and that is not an oversight: the C4 rules above are
 * about C4 notation, which a sequence diagram does not use. Only the `.alab`
 * format family applies, so today that is the title.
 *
 * A separate entry point rather than a widened `advise`, for the reason
 * `mcp/tools/sequence.ts` gives at length: the two document kinds are genuinely
 * different shapes, and `CheckOk` is not going to grow a discriminant to pretend
 * otherwise. Same `Advisory` type and the same `groupAdvisories`, so whatever
 * renders one renders the other.
 */
export function adviseSequence(file: SequenceLabFile): Advisory[] {
  const out: Advisory[] = [];
  adviseTitleLength(file.metadata.title, "The diagram's title", "title", out);
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
