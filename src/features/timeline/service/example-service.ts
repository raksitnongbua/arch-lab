/**
 * The bundled TIMELINE examples — the eighth registry beside the C4 models in
 * `viewer/service/model-service.ts`, the sequence flows, the flowcharts, the
 * use-case diagrams, the ER schemas, the data dictionaries and the gantts, and
 * it follows every convention they share:
 *
 *   - Sources are `.alab` TEXT, parsed by the real parser on first read. An
 *     example that stops parsing becomes a visible `invalid` listing on the
 *     demo index rather than a hidden one — a broken bundled document is a bug
 *     in this repo, and filtering it out is how it stays a bug.
 *   - Every number on a demo card is COUNTED from the parsed document, never
 *     written by hand, so a card can never overstate what its example holds.
 *   - Ids are the `/live/timeline/[exampleId]` route segment AND the `?e=`
 *     value, in ONE flat namespace shared with the other seven registries.
 *     `check:view-input` asserts the sets do not collide, because the day they
 *     do, `?e=` silently resolves the wrong document.
 *
 * The playground's seed is NOT duplicated here: `platform-history` reuses
 * `TIMELINE_EXAMPLE` from `../input/example` by import, the arrangement the
 * sequence registry's `checkout` card had to learn the hard way after its copy
 * and the seed drifted apart in a `desc`.
 */

import { timelineEvents } from "@/types";
import type { TimelineLabFile } from "@/types";

import { ArchTextParseError, parseTimelineText } from "@/features/archtext";

import { TIMELINE_EXAMPLE } from "../input/example";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export interface TimelineExampleSource {
  /** Stable id — doubles as the `/live/timeline/[exampleId]` route segment. */
  id: string;
  /** One line on what the history shows, for the demo card. */
  blurb: string;
  /** The `.alab` timeline document, verbatim. */
  text: string;
}

/**
 * A second history chosen for the shapes the platform story cannot show: a
 * period named by a PHRASE rather than a year ("Before anyone noticed"), which
 * is the case that proves a period label is opaque text and never a date the
 * layout parses; and two events whose labels wrap to THREE LINES, which is the case the
 * vertical layout exists for and the one a horizontal timeline cannot draw at
 * all. Those two are the reason the non-collision assertion in
 * `check:timeline-layout` has something to catch: on a fixed row pitch they
 * would run straight through the event below.
 *
 * It is also a post-incident history rather than a company one, because that
 * is the second thing people actually keep timelines of — and it is the one
 * shape where "what happened, in what order" is genuinely all anybody wants
 * and a gantt would be an active nuisance.
 */
const INCIDENT_REVIEW = `archlab 1.0 timeline
title "The checkout outage"
description "What happened on 3 March, in the order it happened"

@timeline
  period "Before anyone noticed"
    event "A routine index migration started on the orders table"
      desc "Reviewed, approved, and run at the quietest hour of the week. Nothing about it was unusual."
    event "Write latency began climbing, slowly enough that no alert fired"
      desc "The alert threshold was an absolute number rather than a rate of change, which is why forty minutes of steady degradation looked like nothing at all."
  period "The first hour"
    event "Checkout error rate crossed the page threshold"
    event "The on-call engineer rolled back the most recent deploy, which was unrelated, and then rolled back the two before it when the error rate did not move"
      desc "The migration had run outside the deploy pipeline, so the timeline everyone was reading did not contain the thing that mattered."
    event "A second engineer joined and found the running migration"
  period "The fix"
    event "The migration was cancelled and the table recovered on its own"
    event "Checkout drained its queue over the following twenty minutes" #recovery
  period "Afterwards"
    event "Long-running schema migrations were moved onto the same deploy timeline as everything else, so the one view everybody opens during an incident contains every change"
      desc "Nobody argued for it before the outage. The argument was that migrations are not deploys, which was true and beside the point."
    event "Latency alerting gained a rate-of-change rule"
    event "This document"
      desc "Written the same week, while people still disagreed about the order, which is the only time a timeline is worth writing."
`;

const SOURCES: readonly TimelineExampleSource[] = [
  {
    id: "platform-history",
    blurb:
      "Ten years of a product in four periods, with bands sized by how much happened in each — one event in the first, five in the last.",
    text: TIMELINE_EXAMPLE,
  },
  {
    id: "incident-review",
    blurb:
      "A post-incident history whose periods are phrases rather than dates, and whose longest events wrap across three lines with a note under each.",
    text: INCIDENT_REVIEW,
  },
];

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export interface TimelineExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  /** Bands in the rail. */
  periodCount: number;
  /** Points on the spine. */
  eventCount: number;
  /**
   * How many events carry a `desc`.
   *
   * COUNTED RATHER THAN THE OBVIOUS THIRD NUMBER, which would have been a
   * duration — and there is none, because nothing in this notation measures.
   * The honest second fact about a timeline is how much of it is annotated:
   * "eleven events, seven of them explained" tells a reader what kind of
   * document they are about to open, where "eleven events" alone does not.
   */
  annotatedCount: number;
}

export type TimelineExampleListing =
  | { status: "ok"; summary: TimelineExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type TimelineExampleResult =
  | { status: "ok"; id: string; blurb: string; file: TimelineLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

/**
 * What parsing a REGISTERED source can produce — `not-found` excluded in the
 * type rather than handled at each call site, for the reason the sequence
 * registry states: the source is in hand by the time this runs, so only the
 * parse can fail, and saying so here makes the impossible branch unwritable.
 */
type ParsedTimelineExample = Exclude<
  TimelineExampleResult,
  { status: "not-found" }
>;

/** Parsed once per id and remembered: the demo index and the read-only route
 * both read the same source in one request. */
const cache = new Map<string, ParsedTimelineExample>();

function parseSource(source: TimelineExampleSource): ParsedTimelineExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ParsedTimelineExample;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseTimelineText(source.text),
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
export function listTimelineExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listTimelineExamples(): TimelineExampleListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status !== "ok") {
      return { status: "invalid", id: source.id, message: result.message };
    }
    const events = timelineEvents(result.file);
    return {
      status: "ok",
      summary: {
        id: result.id,
        blurb: result.blurb,
        title: result.file.metadata.title,
        description: result.file.metadata.description ?? null,
        periodCount: result.file.periods.length,
        eventCount: events.length,
        annotatedCount: events.filter(
          (event) => typeof event.description === "string",
        ).length,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadTimelineExample(id: string): TimelineExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
