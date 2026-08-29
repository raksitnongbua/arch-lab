/**
 * The bundled LIFECYCLE examples — the ninth registry beside the C4 models in
 * `viewer/service/model-service.ts`, the sequence flows, the flowcharts, the
 * use-case diagrams, the ER schemas, the data dictionaries, the gantts and the
 * milestone timelines, and it follows every convention they share:
 *
 *   - Sources are `.alab` TEXT, parsed by the real parser on first read. An
 *     example that stops parsing becomes a visible `invalid` listing on the
 *     demo index rather than a hidden one — a broken bundled document is a bug
 *     in this repo, and filtering it out is how it stays a bug.
 *   - Every number on a demo card is COUNTED from the parsed document, never
 *     written by hand, so a card can never overstate what its example holds.
 *   - Ids are the `/live/lifecycle/[exampleId]` route segment AND the `?e=`
 *     value, in ONE flat namespace shared with the other eight registries.
 *     `check:view-input` asserts the sets do not collide, because the day they
 *     do, `?e=` silently resolves the wrong document.
 *
 * The playground's seed is NOT duplicated here: `order-lifecycle` reuses
 * `LIFECYCLE_EXAMPLE` from `../input/example` by import, the arrangement the
 * sequence registry's `checkout` card had to learn the hard way after its copy
 * and the seed drifted apart in a `desc`.
 */

import { lifecycleExits } from "@/types";
import type { LifecycleLabFile } from "@/types";

import { ArchTextParseError, parseLifecycleText } from "@/features/archtext";

import { LIFECYCLE_EXAMPLE } from "../input/example";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export interface LifecycleExampleSource {
  /** Stable id — doubles as the `/live/lifecycle/[exampleId]` route segment. */
  id: string;
  /** One line on what the lifecycle shows, for the demo card. */
  blurb: string;
  /** The `.alab` lifecycle document, verbatim. */
  text: string;
}

/**
 * A second lifecycle chosen for the shapes the order story cannot show, and
 * every one of them is a case the layout has to survive rather than a
 * different domain for its own sake:
 *
 *   - TWO REJOINS IN ONE DOCUMENT, so the reserved channels have to hold more
 *     than one branch and the check has something to prove about them being
 *     distinct.
 *   - ONE STATE WITH TWO DEPARTURES, one terminal and one returning, which is
 *     the case that shows the branch lane stacking and the two stop-marks
 *     side by side.
 *   - A REJOIN THAT TRAVELS PAST STATES IT DOES NOT TOUCH — "sent back for
 *     revision" returns from `underReview` all the way to `submitted`, over
 *     `screened` in between. That is the exact geometry
 *     `check:lifecycle-layout` measures, and the order example's single
 *     one-state hop does not exercise it.
 *
 * Peer review rather than another commerce flow, because it is the second
 * thing people genuinely keep lifecycles of and because its returns are
 * obviously returns: nobody reads "sent back for revision" as a forward step.
 */
const PEER_REVIEW = `archlab 1.0 lifecycle
title "A manuscript, from submission to print"
description "One submission, the states it passes through, and every way it can leave"

@lifecycle
  subject "Manuscript"
    desc "One submitted paper, followed from the moment it arrives until it is in print or out of the process."
  state submitted "Submitted"
    desc "Uploaded and assigned a number. Nobody has read it yet."
  state screened "Screened"
    desc "An editor has checked scope, formatting and ethics approval."
    exit "Desk rejected" ends
      when "it is out of scope, or the ethics paperwork is missing and cannot be produced"
      desc "Roughly half of everything that arrives leaves here, within a week."
  state underReview "Under review"
    desc "With two or three reviewers, who have six weeks."
    exit "Rejected" ends
      when "the reviewers agree the work does not stand up"
    exit "Sent back for revision" rejoins submitted
      when "the reviewers want changes large enough to need a fresh read"
      desc "It goes all the way back to Submitted rather than to Screened: a revised manuscript is screened again, because the changes can move it out of scope."
  state accepted "Accepted"
    desc "The editor has taken it. Nothing about the content changes after this."
  state typeset "Typeset"
    exit "Proof corrections needed" rejoins accepted
      when "the author finds an error in the proofs"
  state published "Published" ends
    desc "Assigned a DOI and out. The manuscript stops here."
`;

const SOURCES: readonly LifecycleExampleSource[] = [
  {
    id: "order-lifecycle",
    blurb:
      "An order from checkout to the doormat, with two ways it can stop and one way it goes back a step.",
    text: LIFECYCLE_EXAMPLE,
  },
  {
    id: "peer-review",
    blurb:
      "A manuscript through peer review: six states, two dead ends, and two returns — one of them all the way back past a state it skips.",
    text: PEER_REVIEW,
  },
];

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export interface LifecycleExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  /** The one thing the document follows. */
  subject: string;
  /** States on the main track. */
  stateCount: number;
  /**
   * Departures that STOP, and departures that come BACK.
   *
   * TWO NUMBERS RATHER THAN ONE "branches" TOTAL, because they are the two
   * different things a reader wants to know before opening a lifecycle: how
   * many ways out there are, and how much of the picture loops. A single
   * total says neither, and the split is exactly the distinction this
   * notation draws by shape on the canvas.
   */
  terminalCount: number;
  returningCount: number;
}

export type LifecycleExampleListing =
  | { status: "ok"; summary: LifecycleExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type LifecycleExampleResult =
  | { status: "ok"; id: string; blurb: string; file: LifecycleLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

/**
 * What parsing a REGISTERED source can produce — `not-found` excluded in the
 * type rather than handled at each call site, for the reason the sequence
 * registry states: the source is in hand by the time this runs, so only the
 * parse can fail, and saying so here makes the impossible branch unwritable.
 */
type ParsedLifecycleExample = Exclude<
  LifecycleExampleResult,
  { status: "not-found" }
>;

/** Parsed once per id and remembered: the demo index and the read-only route
 * both read the same source in one request. */
const cache = new Map<string, ParsedLifecycleExample>();

function parseSource(source: LifecycleExampleSource): ParsedLifecycleExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ParsedLifecycleExample;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseLifecycleText(source.text),
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
export function listLifecycleExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listLifecycleExamples(): LifecycleExampleListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status !== "ok") {
      return { status: "invalid", id: source.id, message: result.message };
    }
    const exits = lifecycleExits(result.file);
    return {
      status: "ok",
      summary: {
        id: result.id,
        blurb: result.blurb,
        title: result.file.metadata.title,
        description: result.file.metadata.description ?? null,
        subject: result.file.subject.label,
        stateCount: result.file.states.length,
        terminalCount: exits.filter((exit) => exit.rejoins === undefined)
          .length,
        returningCount: exits.filter((exit) => exit.rejoins !== undefined)
          .length,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadLifecycleExample(id: string): LifecycleExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
