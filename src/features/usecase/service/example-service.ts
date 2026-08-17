/**
 * The bundled USE-CASE examples — the fourth registry beside the C4 models in
 * `viewer/service/model-service.ts`, the sequence flows in
 * `sequence/service/example-service.ts` and the flowcharts in
 * `flowchart/service/example-service.ts`, and it follows all three conventions
 * deliberately:
 *
 *   - Sources are `.alab` TEXT, parsed by the real parser on first read. An
 *     example that stops parsing becomes a visible `invalid` listing on the
 *     demo index rather than a hidden one — a broken bundled document is a bug
 *     in this repo, and filtering it out is how it stays a bug.
 *   - Every number on a demo card is COUNTED from the parsed document, never
 *     written by hand, so a card can never overstate what its example holds.
 *   - Ids are the `/view/usecase/[exampleId]` route segment AND the `?e=`
 *     value, in ONE flat namespace shared with the other three registries.
 *     `check:view-input` asserts the four sets do not collide, because the day
 *     they do, `?e=` silently resolves the wrong document.
 *
 * The playground's seed is NOT duplicated here. The sequence registry learned
 * that the hard way — its `checkout` card and the playground seed were separate
 * copies of the same 42 lines and had already drifted apart in a `desc` — so
 * `food-delivery` reuses `USECASE_EXAMPLE` from `../input/example` by import.
 */

import type { UseCaseLabFile } from "@/types";

import { ArchTextParseError, parseUseCaseText } from "@/features/archtext";

import { USECASE_EXAMPLE } from "../input/example";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export interface UseCaseExampleSource {
  /** Stable id — doubles as the `/view/usecase/[exampleId]` route segment. */
  id: string;
  /** One line on what the diagram shows, for the demo card. */
  blurb: string;
  /** The `.alab` use-case document, verbatim. */
  text: string;
}

const HOTEL_BOOKING = `archlab 1.0 usecase
title "Hotel booking"
description "Two systems share one stay: guests book online, staff run the front desk — and the specialised actors inherit everything the general ones may do."

@usecase
  actor guest "Guest"
  actor member "Member"
  actor receptionist "Receptionist"
  actor manager "Duty manager"
  boundary "Booking Site" tint=#a8c8f0
    usecase browse "Browse rooms"
    usecase book "Book a room"
      desc "The one promise both systems keep: a booking made here is exactly what the front desk sees at check-in."
    usecase redeem "Redeem points"
  boundary "Front Desk" tint=#f0d6a8
    usecase checkin "Check a guest in"
    usecase adjust "Adjust a rate"

  guest -- browse
  guest -- book : "0..*"
  member -- redeem
  receptionist -- checkin
  manager -- adjust
  member --|> guest
  manager --|> receptionist
`;

const AIRPORT_CHECKIN = `archlab 1.0 usecase
title "Airport check-in"
description "One base use case taken apart with dependencies: the steps check-in always includes, and the ones that only sometimes extend it."

@usecase
  actor passenger "Passenger"
  actor agent "Gate agent"
  boundary "Check-in System" tint=#b8a8f0
    usecase checkin "Check in"
      desc "The base use case. Everything else in the boundary hangs off it: two steps it always runs, two it runs only when the passenger asks."
    usecase verify "Verify travel documents" [e-gates]
    usecase issue "Issue a boarding pass"
    usecase baggage "Add extra baggage"
    usecase upgrade "Upgrade the seat"

  passenger -- checkin
  agent -- verify
  checkin ..> verify : include
  checkin ..> issue : include
  baggage ..> checkin : extend
  upgrade ..> checkin : extend
`;

const SOURCES: readonly UseCaseExampleSource[] = [
  {
    id: "food-delivery",
    // The playground's seed IS this example — one definition, in
    // `../input/example`. See the file header for why it is imported rather
    // than copied.
    blurb:
      "Every line the grammar draws, on one small system: three actors at a tinted boundary, an «include» to payment, an «extend» from tracking, and a customer who is-a guest.",
    text: USECASE_EXAMPLE,
  },
  {
    id: "hotel-booking",
    blurb:
      "Four actors against two boundaries — the booking site and the front desk — with a generalization family on each side of the counter.",
    text: HOTEL_BOOKING,
  },
  {
    id: "airport-checkin",
    blurb:
      "One base use case and its four dependencies: two «include» arrows for the steps it always takes, two «extend» arrows for the ones it only sometimes does.",
    text: AIRPORT_CHECKIN,
  },
];

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export interface UseCaseExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  /** Actors — how many hands the system's edge is drawn against. */
  actorCount: number;
  /** Use cases — how much of the system the diagram covers. */
  useCaseCount: number;
  /**
   * Boundaries — how many SYSTEMS the diagram spans, which is the count that
   * separates "one service" from "the booking site and the front desk".
   *
   * A dependency/generalization count was considered for a fourth slot and
   * deliberately left out: unlike a flowchart's decisions (which say whether
   * the graph branches at all), a lumped "4 relationships" mixes three
   * different lines into one number, and the fact that actually distinguishes
   * an example — WHICH kinds of line it draws — is not a count. The blurb
   * states it in words instead.
   */
  boundaryCount: number;
}

export type UseCaseExampleListing =
  | { status: "ok"; summary: UseCaseExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type UseCaseExampleResult =
  | { status: "ok"; id: string; blurb: string; file: UseCaseLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

/**
 * What parsing a REGISTERED source can produce — `not-found` excluded in the
 * type rather than handled at each call site, for the reason the sequence
 * registry states: the source is in hand by the time this runs, so only the
 * parse can fail, and saying so here makes the impossible branch unwritable.
 */
type ParsedUseCaseExample = Exclude<
  UseCaseExampleResult,
  { status: "not-found" }
>;

/** Parsed once per id and remembered: the demo index and the read-only route
 * both read the same source in one request. */
const cache = new Map<string, ParsedUseCaseExample>();

function parseSource(source: UseCaseExampleSource): ParsedUseCaseExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ParsedUseCaseExample;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseUseCaseText(source.text),
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
export function listUseCaseExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listUseCaseExamples(): UseCaseExampleListing[] {
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
        actorCount: result.file.elements.filter(
          (element) => element.kind === "actor",
        ).length,
        useCaseCount: result.file.elements.filter(
          (element) => element.kind === "usecase",
        ).length,
        boundaryCount: result.file.boundaries?.length ?? 0,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadUseCaseExample(id: string): UseCaseExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
