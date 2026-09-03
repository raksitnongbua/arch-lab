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

import { defaultPositions } from "@/features/archtext";
/* The release row's own label. This advice used to end at "the shape is only
   changed by moving them", which was true when nothing offered to remove the
   coordinates and became a dead end the day something did — and naming the row
   in prose here would go stale the day it is reworded. */
import { resetLayerLabel } from "@/lib/prose";
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
  | "long-title"
  | "column-layout"
  | "path-revisits-element"
  | "path-teleports";

/** Why each rule exists, in C4's own terms. Rendered as the group heading. */
export const ADVISORY_RULES: Record<
  AdvisoryRule,
  { title: string; because: string }
> = {
  "column-layout": {
    title: "Layout will read as a column",
    because:
      "A diagram far deeper than it is wide is shrunk to fit a landscape " +
      "frame — every screen a diagram is presented on is landscape — and its " +
      "labels shrink with it. Not a C4 rule: this one is about how an `.alab` " +
      "document will be DRAWN rather than what it says, and it is advice " +
      "rather than a fix because the layout direction is the author's line to " +
      "write and nothing may write it for them.",
  },
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
  "path-revisits-element": {
    title: "A beat doubles back",
    because:
      "A beat that names the same element twice in one chain draws a walk " +
      "that goes out and comes home inside a single step, which is two " +
      "sentences told as one. The `.alab` parser cannot refuse it — a round " +
      "trip is a legitimate thing to say — but it almost always wanted to be " +
      "two beats.",
  },
  "path-teleports": {
    title: "A path jumps with nothing joining it",
    because:
      "Consecutive beats that share no element leave a reader with no thread " +
      "between one step and the next: the light moves somewhere else on the " +
      "diagram and nothing on screen says why. Legal, and occasionally " +
      "deliberate — a path may follow a theme rather than a route — but worth " +
      "a look, because the usual cause is a beat left out. Advice rather than " +
      "an `.alab` error for that reason: only the author knows which it is.",
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

/**
 * A diagram far deeper than it is wide, and what to do about it.
 *
 * MEASURED FROM THE MODEL'S OWN COORDINATES, not from a re-derived layout, so
 * it tells the truth about a diagram whose positions were hand-written or
 * dragged — those are what will be drawn, whatever the layout would have said.
 *
 * The projected size is only offered when the document OMITS its geometry,
 * which is testable: the positions match what the top-down layout produces.
 * For a hand-placed diagram `direction=lr` would move nothing, and promising
 * a new shape there would be advice that does not work.
 */
const COLUMN_RATIO = 0.6;
/** Below this many elements a tall diagram is just a small diagram. */
const COLUMN_MIN_NODES = 6;

function extentOf(
  diagram: C4Diagram,
): { width: number; height: number } | null {
  if (diagram.nodes.length === 0) return null;
  const xs = diagram.nodes.map((node) => node.position.x);
  const ys = diagram.nodes.map((node) => node.position.y);
  const rights = diagram.nodes.map((node) => node.position.x + node.size.width);
  const bottoms = diagram.nodes.map(
    (node) => node.position.y + node.size.height,
  );
  return {
    width: Math.max(...rights) - Math.min(...xs),
    height: Math.max(...bottoms) - Math.min(...ys),
  };
}

function laidOutBy(
  diagram: C4Diagram,
  direction: "tb" | "lr",
): Map<string, { x: number; y: number }> {
  return defaultPositions(
    diagram.nodes.map((node) => node.id).sort(),
    diagram.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    direction,
  );
}

function adviseColumnLayout(diagram: C4Diagram, out: Advisory[]): void {
  /* No "already asked for lr" guard: it would be dead code. Under `lr` a
   * deep flow is folded toward 16:9 and a diagram wider than it is deep is
   * left top-down, so neither outcome is tall enough to reach the test below.
   * Proven by dropping the guard and finding no fixture that changed. */
  if (diagram.nodes.length < COLUMN_MIN_NODES) return;
  const extent = extentOf(diagram);
  if (extent === null || extent.height === 0) return;
  const ratio = extent.width / extent.height;
  if (ratio >= COLUMN_RATIO) return;

  const shape = `${Math.round(extent.width)}x${Math.round(extent.height)} (ratio ${ratio.toFixed(2)})`;

  const derived = laidOutBy(diagram, "tb");
  /* COUNTED, not just detected, because the advice below names the control
     that releases them and that control's label is singular for one. */
  const placed = diagram.nodes.filter((node) => {
    const at = derived.get(node.id);
    return (
      at === undefined || at.x !== node.position.x || at.y !== node.position.y
    );
  });

  if (placed.length > 0) {
    out.push({
      rule: "column-layout",
      where: diagram.id,
      message:
        `"${diagram.title}" is ${shape} — far deeper than it is wide, so a ` +
        "landscape frame will shrink it and its labels. Its coordinates are " +
        "written into the document, so a layout direction would not move " +
        `them — open it in the playground and choose “${resetLayerLabel(placed.length)}” ` +
        "in the direction menu to hand them back, or move them yourself.",
    });
    return;
  }

  const folded = laidOutBy(diagram, "lr");
  const sizes = diagram.nodes.map((node) => node.size);
  const fx = [...folded.values()].map((at) => at.x);
  const fy = [...folded.values()].map((at) => at.y);
  const fw =
    Math.max(...fx.map((x, i) => x + (sizes[i]?.width ?? 0))) - Math.min(...fx);
  const fh =
    Math.max(...fy.map((y, i) => y + (sizes[i]?.height ?? 0))) -
    Math.min(...fy);

  out.push({
    rule: "column-layout",
    where: diagram.id,
    message:
      `"${diagram.title}" is ${shape} — far deeper than it is wide, so a ` +
      `landscape frame will shrink it and its labels. \`direction=lr\` on ` +
      `this diagram lays it out at about ${Math.round(fw)}x${Math.round(fh)} ` +
      `(ratio ${(fw / fh).toFixed(2)}) instead.`,
  });
}

/**
 * The two defects a PARSE cannot see. Every id resolves and every hop is
 * joined — the grammar guarantees that — so what is left is whether the walk
 * reads as one story, which is a judgement and therefore advice.
 */
function advisePaths(diagram: C4Diagram, out: Advisory[]): void {
  for (const path of diagram.paths ?? []) {
    for (const beat of path.beats) {
      for (const chain of beat.chains) {
        const seen = new Set<string>();
        for (const id of chain.nodes) {
          if (seen.has(id)) {
            out.push({
              rule: "path-revisits-element",
              where: `${diagram.id} / ${path.id}`,
              message: `A beat of "${path.title}" passes through \`${id}\` twice in one chain.`,
            });
            break;
          }
          seen.add(id);
        }
      }
    }
    for (let i = 1; i < path.beats.length; i += 1) {
      const previous = new Set(
        path.beats[i - 1].chains.flatMap((chain) => chain.nodes),
      );
      const shares = path.beats[i].chains.some((chain) =>
        chain.nodes.some((id) => previous.has(id)),
      );
      if (!shares) {
        out.push({
          rule: "path-teleports",
          where: `${diagram.id} / ${path.id}`,
          message: `Beat ${(i + 1).toString()} of "${path.title}" shares no element with the beat before it.`,
        });
      }
    }
  }
}

function adviseDiagram(diagram: C4Diagram, out: Advisory[]): void {
  adviseColumnLayout(diagram, out);
  advisePaths(diagram, out);
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
