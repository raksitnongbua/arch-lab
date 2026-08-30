/**
 * The bundled GANTT examples — the seventh registry beside the C4 models in
 * `viewer/service/model-service.ts`, the sequence flows, the flowcharts, the
 * use-case diagrams, the ER schemas and the data dictionaries, and it follows
 * every convention they share:
 *
 *   - Sources are `.alab` TEXT, parsed by the real parser on first read. An
 *     example that stops parsing becomes a visible `invalid` listing on the
 *     demo index rather than a hidden one — a broken bundled document is a bug
 *     in this repo, and filtering it out is how it stays a bug.
 *   - Every number on a demo card is COUNTED from the parsed document, never
 *     written by hand, so a card can never overstate what its example holds.
 *   - Ids are the `/live/gantt/[exampleId]` route segment AND the `?e=`
 *     value, in ONE flat namespace shared with the other six registries.
 *     `check:view-input` asserts the sets do not collide, because the day they
 *     do, `?e=` silently resolves the wrong document.
 *
 * The playground's seed is NOT duplicated here: `store-migration` reuses
 * `GANTT_EXAMPLE` from `../input/example` by import, the arrangement the
 * sequence registry's `checkout` card had to learn the hard way after its copy
 * and the seed drifted apart in a `desc`.
 */

import { ganttItems } from "@/types";
import type { GanttLabFile } from "@/types";

import { ArchTextParseError, parseGanttText } from "@/features/archtext";

import { GANTT_EXAMPLE } from "../input/example";
import { layoutGantt } from "../lib/layout";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export interface GanttExampleSource {
  /** Stable id — doubles as the `/live/gantt/[exampleId]` route segment. */
  id: string;
  /** One line on what the plan shows, for the demo card. */
  blurb: string;
  /** The `.alab` gantt document, verbatim. */
  text: string;
}

/**
 * A second plan chosen for the shapes the store migration cannot show: a
 * dependency whose length is set by a THIRD PARTY (`crossconnect`, twenty days
 * of carrier lead time that no amount of staffing shortens), a milestone that
 * waits on TWO chains at once, and a whole section — the wind-down — hanging
 * off a milestone rather than off a task.
 *
 * TWO ITEMS CARRY REAL FLOAT, and they carry it for different reasons:
 * `netplan` is fast work sitting beside slow procurement, `salvage` is a
 * branch that nothing downstream waits for. A reader who only ever sees one
 * kind of slack learns to read float as "someone is behind"; these two
 * together say it is a property of the graph.
 *
 * All four states appear. `planned` is spelled as ABSENCE, the way
 * `STATE_IS_DEFAULT` defines it and the way the seed writes it — a plan where
 * most of the work has not started should not carry the word on every line.
 */
const DATACENTRE_MOVE = `archlab 1.0 gantt
title "Frankfurt hall move"
description "Emptying hall 2 into the new cage, and what cannot start until it is done"
starts 2026-03-02

@gantt
  section "Survey"
    task inventory "Rack inventory" 8d done at 0
      desc "Walk the floor and write down what is actually in each rack. The asset database has been wrong since the last move."
    task netplan "Network design" 9d done after inventory
      desc "Fast work sitting beside slow procurement, so it carries eleven days of float and none of the risk."
    task crossconnect "Cross-connect orders" 20d active after inventory
      desc "The long pole, and not ours to shorten: the carrier quotes twenty days and every date below hangs off that."
    milestone approved "Move plan approved" after netplan, crossconnect
  section "Move"
    task ship "Ship and rack" 6d after approved
    task recable "Re-cable and power on" 4d at-risk after ship
      desc "At risk: hall 2's labelling was never reconciled with the diagrams, so the first day is discovery."
    task smoke "Smoke tests" 3d after recable
    milestone live "Traffic in the new cage" after smoke
  section "Wind down"
    task decommission "Decommission hall 2" 10d after live
    task handback "Hand the lease back" 4d after decommission
    task salvage "Salvage and resell" 9d after live
      desc "A branch nothing downstream waits for, so it carries float for a reason that has nothing to do with being behind."
`;

/**
 * A third plan chosen for the one thing neither migration can show: a FIXED
 * TIMEBOX. In the store migration and the hall move the work sets the length —
 * the chain is as long as it is and the end date falls out of it. A sprint
 * inverts that. The fortnight is agreed first and the work is fitted into it,
 * which is why every ceremony here is pinned with `at` and not one of them
 * hangs off an `after`: planning, refinement, review and retro are a CADENCE.
 * Nothing computes them and nothing downstream is allowed to move them.
 *
 * PLANNING IS A TASK AND THE OTHER THREE CEREMONIES ARE MILESTONES, which is
 * not an inconsistency. Planning is a session with a length and the other
 * three are instants, so the notation already has the right word for each. It
 * is also the only arrangement that draws: a milestone diamond centred on day
 * 0 puts half of itself left of the plot's edge, which `check:gantt-layout`
 * fails on by name.
 *
 * TWO MORE SHAPES ARRIVE WITH IT.
 *
 * The first is BREADTH. Both bundled plans are chains, and a reader who only
 * ever meets a chain learns that a gantt is a queue. Three stories fan out of
 * planning and then wait on nothing, each other included — a sprint board is
 * mostly not a graph, and the row solve is worth seeing hold still as well as
 * seeing it reorder.
 *
 * The second is a plan THAT DOES NOT FIT, and it is why the float numbers here
 * read the opposite way round from the other two. `reindex` is another team's
 * window and `synonyms` waits behind it, so the pair lands on day 15 — four
 * days past the review the story was promised for. That pair is the entire
 * critical path, which leaves EVERY committed story carrying float, seven to
 * eleven days of it. In the migrations, float marks the branch nobody is
 * waiting on. Here it marks everything that fitted, and the one chain with no
 * float is the story that rolled over. Same arithmetic, opposite reading, and
 * a bundle that only ever shows one of the two teaches the wrong lesson.
 *
 * `starts` IS HERE ON PURPOSE and it is worth knowing what deleting it does.
 * That one line is what lets this plan leave for Mermaid at all —
 * `serializeMermaidGantt` refuses an origin-less document by name rather than
 * inventing a day 0 — so a bundled sprint without it would be the first screen
 * on which the export is greyed out. Delete it and the axis goes relative
 * (`W1, W2, W3`) and the same document becomes a reusable sprint template that
 * no longer names a particular fortnight. That is a real second use for this
 * file and it costs one keystroke to demonstrate, which is exactly why it is a
 * line in this example rather than a fourth example of its own.
 *
 * All four states appear, `planned` spelled as ABSENCE the way
 * `STATE_IS_DEFAULT` defines it and the way both other plans write it.
 */
const SEARCH_SPRINT = `archlab 1.0 gantt
title "Search sprint 31"
description "A fortnight, fixed. What was fitted into it, and the one story that did not fit"
starts 2026-04-06

@gantt
  section "Ceremonies"
    task planning "Sprint planning" 1d done at 0
      desc "The only line in this plan that sets a date instead of reading one. The box is agreed here and everything below is fitted into it."
    milestone refinement "Backlog refinement" at 7
    milestone review "Sprint review" at 11
    milestone retro "Retrospective" at 11
  section "Committed stories"
    task typeahead "Type-ahead suggestions" 4d done after planning
      desc "One of three stories that leave planning together and then wait on nothing, each other included. A sprint board is mostly not a graph."
    task filters "Filter chips" 3d done after planning
    task export "Export results to CSV" 5d active after planning
    task exportdocs "Document the export format" 2d after export
      desc "The section's only dependency, and a small one: the format has to exist before anybody can write it down."
  section "Waiting on the platform team"
    task reindex "Reindex window" 12d at-risk at 0
      desc "Not ours to shorten and not ours to schedule — the platform team owns the cluster, and the window is where the window is."
    task synonyms "Synonym dictionary live" 3d after reindex
      desc "Cannot start until the day after the review it was promised for. This is the story that rolls over, and it is the only chain here with no float."
`;

const SOURCES: readonly GanttExampleSource[] = [
  {
    id: "store-migration",
    blurb:
      "A store migration: two tasks waiting on one audit, a backfill with a day of float, and all four reporting states on the first screen.",
    text: GANTT_EXAMPLE,
  },
  {
    id: "datacentre-move",
    blurb:
      "A data-centre move whose critical chain is set by a carrier's lead time, with a milestone waiting on two chains and a wind-down branch that carries slack.",
    text: DATACENTRE_MOVE,
  },
  {
    id: "search-sprint",
    blurb:
      "An agile sprint: ceremonies pinned to the calendar rather than to a dependency, three stories running side by side out of planning, and one story blocked outside the team that takes the whole critical path past the review.",
    text: SEARCH_SPRINT,
  },
];

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export interface GanttExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  /** Bands in the rail — the plan's phases. */
  sectionCount: number;
  /** Tasks: items drawn as a bar. Counted apart from milestones because the
   * two are different work — "nine tasks and two milestones" is a plan, "eleven
   * items" is a number. */
  taskCount: number;
  milestoneCount: number;
  /**
   * How long the plan runs, in days, taken from `layoutGantt`'s own
   * schedule.
   *
   * THE ONE REGISTRY HERE THAT IMPORTS A LAYOUT, and deliberately: duration is
   * what a gantt is about, and the only honest source for it is the same
   * forward pass the canvas draws from. Counting it here by hand would be a
   * second scheduler, free to disagree with the picture the card links to.
   * `layoutGantt` is total — a cyclic document is drawn, not refused — so
   * this cannot throw where the parse already succeeded.
   */
  dayCount: number;
}

export type GanttExampleListing =
  | { status: "ok"; summary: GanttExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type GanttExampleResult =
  | { status: "ok"; id: string; blurb: string; file: GanttLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

/**
 * What parsing a REGISTERED source can produce — `not-found` excluded in the
 * type rather than handled at each call site, for the reason the sequence
 * registry states: the source is in hand by the time this runs, so only the
 * parse can fail, and saying so here makes the impossible branch unwritable.
 */
type ParsedGanttExample = Exclude<GanttExampleResult, { status: "not-found" }>;

/** Parsed once per id and remembered: the demo index and the read-only route
 * both read the same source in one request. */
const cache = new Map<string, ParsedGanttExample>();

function parseSource(source: GanttExampleSource): ParsedGanttExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ParsedGanttExample;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseGanttText(source.text),
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
export function listGanttExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listGanttExamples(): GanttExampleListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status !== "ok") {
      return { status: "invalid", id: source.id, message: result.message };
    }
    const items = ganttItems(result.file);
    const milestoneCount = items.filter(
      (item) => item.milestone === true,
    ).length;
    return {
      status: "ok",
      summary: {
        id: result.id,
        blurb: result.blurb,
        title: result.file.metadata.title,
        description: result.file.metadata.description ?? null,
        sectionCount: result.file.sections.length,
        taskCount: items.length - milestoneCount,
        milestoneCount,
        dayCount: layoutGantt(result.file).end,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadGanttExample(id: string): GanttExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
