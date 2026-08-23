/**
 * The bundled FLOWCHART examples — the third registry beside the C4 models in
 * `viewer/service/model-service.ts` and the sequence flows in
 * `sequence/service/example-service.ts`, and it follows both conventions
 * deliberately:
 *
 *   - Sources are `.alab` TEXT, parsed by the real parser on first read. An
 *     example that stops parsing becomes a visible `invalid` listing on the
 *     demo index rather than a hidden one — a broken bundled document is a bug
 *     in this repo, and filtering it out is how it stays a bug.
 *   - Every number on a demo card is COUNTED from the parsed document, never
 *     written by hand, so a card can never overstate what its example holds.
 *   - Ids are the `/live/flowchart/[exampleId]` route segment AND the `?e=`
 *     value, in ONE flat namespace shared with the other two registries.
 *     `check:view-input` asserts the three sets do not collide, because the day
 *     they do, `?e=` silently resolves the wrong document.
 *
 * The playground's seed is NOT duplicated here. The sequence registry learned
 * that the hard way — its `checkout` card and the playground seed were separate
 * copies of the same 42 lines and had already drifted apart in a `desc` — so
 * `intake` reuses `FLOWCHART_EXAMPLE` from `../input/example` by import.
 */

import type { FlowchartLabFile } from "@/types";

import { ArchTextParseError, parseFlowchartText } from "@/features/archtext";

import { FLOWCHART_EXAMPLE } from "../input/example";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export interface FlowchartExampleSource {
  /** Stable id — doubles as the `/live/flowchart/[exampleId]` route segment. */
  id: string;
  /** One line on what the flow shows, for the demo card. */
  blurb: string;
  /** The `.alab` flowchart document, verbatim. */
  text: string;
}

const INCIDENT_TRIAGE = `archlab 1.0 flowchart
title "Incident triage"
description "Who looks at an alert, and when it stops being one person's problem."

@flowchart
  start fired "Alert fires"
  io read "Read the dashboard" [Grafana]
  decision real "Real customer impact?"
  step silence "Silence and tune the rule"
    desc "A rule that pages twice a week and is wrong twice a week trains people to ignore the pager. Tuning it is the fix, not a faster ack."
  decision known "Known failure mode?"
  group "Response" tint=#f0a8a8
    call runbook "Follow the runbook"
    decision fixed "Recovered?"
    step escalate "Page the on-call lead"
  io postmortem "Write it up" [Notion]
  end closed "Closed"

  fired -> read
  read -> real
  real -> known : "yes"
  real -> silence : "no"
  silence -> closed
  known -> runbook : "yes"
  known -> escalate : "no"
  runbook -> fixed
  fixed -> postmortem : "yes"
  fixed -> escalate : "no"
  escalate -> runbook : "new runbook"
  postmortem -> closed
`;

const RELEASE_GATE = `archlab 1.0 flowchart
title "Release gate"
description "Every check a change clears between a merge and production, and where it goes back."

@flowchart
  start merged "Merged to main"
  group "Automated" tint=#a8c8f0
    call types "Typecheck" [tsc]
    call lint "Lint" [ESLint]
    call build "Production build" [Next.js]
  decision green "All green?"
  step fix "Fix forward on a branch"
  io preview "Publish a preview" [Vercel]
  decision approved "Reviewer approves?"
  io deploy "Promote to production" [Vercel]
  end live "Live"

  merged -> types
  types -> lint
  lint -> build
  build -> green
  green -> preview : "yes"
  green -> fix : "no"
  fix -> types : "re-run"
  preview -> approved
  approved -> deploy : "yes"
  approved -> fix : "changes requested"
  deploy -> live
`;

const SOURCES: readonly FlowchartExampleSource[] = [
  {
    id: "intake",
    // The playground's seed IS this example — one definition, in
    // `../input/example`. See the file header for why it is imported rather
    // than copied.
    blurb:
      "An order taken end to end — a stale-price loop, a payment retry, a tinted provider group and an io pair on one graph.",
    text: FLOWCHART_EXAMPLE,
  },
  {
    id: "incident-triage",
    blurb:
      "Two decisions that re-merge, an escalation that loops back into the runbook, and the branch where the right answer is to silence the alert.",
    text: INCIDENT_TRIAGE,
  },
  {
    id: "release-gate",
    blurb:
      "Three checks in a group, one gate, and two different ways back to the start — the shape a real CI pipeline has.",
    text: RELEASE_GATE,
  },
];

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export interface FlowchartExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  nodeCount: number;
  edgeCount: number;
  /** Decisions — the count that says whether the graph actually branches. */
  decisionCount: number;
}

export type FlowchartExampleListing =
  | { status: "ok"; summary: FlowchartExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type FlowchartExampleResult =
  | { status: "ok"; id: string; blurb: string; file: FlowchartLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

/**
 * What parsing a REGISTERED source can produce — `not-found` excluded in the
 * type rather than handled at each call site, for the reason the sequence
 * registry states: the source is in hand by the time this runs, so only the
 * parse can fail, and saying so here makes the impossible branch unwritable.
 */
type ParsedFlowchartExample = Exclude<
  FlowchartExampleResult,
  { status: "not-found" }
>;

/** Parsed once per id and remembered: the demo index and the read-only route
 * both read the same source in one request. */
const cache = new Map<string, ParsedFlowchartExample>();

function parseSource(source: FlowchartExampleSource): ParsedFlowchartExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ParsedFlowchartExample;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseFlowchartText(source.text),
    };
  } catch (error) {
    result = {
      status: "invalid",
      id: source.id,
      message:
        error instanceof ArchTextParseError
          ? `line ${error.line}, column ${error.column}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Failed to parse.",
    };
  }
  cache.set(source.id, result);
  return result;
}

/** Every registered example's id — for `generateStaticParams`. */
export function listFlowchartExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listFlowchartExamples(): FlowchartExampleListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status !== "ok") {
      return { status: "invalid", id: source.id, message: result.message };
    }
    return {
      status: "ok",
      summary: {
        id: result.id,
        blurb: result.blurb,
        title: result.file.metadata.title,
        description: result.file.metadata.description ?? null,
        nodeCount: result.file.nodes.length,
        edgeCount: result.file.edges.length,
        decisionCount: result.file.nodes.filter(
          (node) => node.shape === "decision",
        ).length,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadFlowchartExample(id: string): FlowchartExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
