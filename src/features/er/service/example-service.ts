/**
 * The bundled ER examples — the fifth registry beside the C4 models in
 * `viewer/service/model-service.ts`, the sequence flows, the flowcharts and
 * the use-case diagrams, and it follows all four conventions deliberately:
 *
 *   - Sources are `.alab` TEXT, parsed by the real parser on first read. An
 *     example that stops parsing becomes a visible `invalid` listing on the
 *     demo index rather than a hidden one — a broken bundled document is a bug
 *     in this repo, and filtering it out is how it stays a bug.
 *   - Every number on a demo card is COUNTED from the parsed document, never
 *     written by hand, so a card can never overstate what its example holds.
 *   - Ids are the `/view/er/[exampleId]` route segment AND the `?e=` value, in
 *     ONE flat namespace shared with the other four registries.
 *     `check:view-input` asserts the sets do not collide, because the day they
 *     do, `?e=` silently resolves the wrong document.
 *
 * The playground's seed is NOT duplicated here. The sequence registry learned
 * that the hard way — its `checkout` card and the playground seed were separate
 * copies of the same lines and had already drifted apart in a `desc` — so
 * `shop-orders` reuses `ER_EXAMPLE` from `../input/example` by import.
 */

import type { ErLabFile } from "@/types";

import { ArchTextParseError, parseErText } from "@/features/archtext";

import { ER_EXAMPLE } from "../input/example";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export interface ErExampleSource {
  /** Stable id — doubles as the `/view/er/[exampleId]` route segment. */
  id: string;
  /** One line on what the diagram shows, for the demo card. */
  blurb: string;
  /** The `.alab` ER document, verbatim. */
  text: string;
}

/**
 * A second example chosen to show what the first one cannot: a JOIN TABLE
 * whose whole primary key is foreign (`enrolment`), a SELF-JOIN (a course
 * that has a prerequisite course), and a non-identifying line to a table that
 * outlives what it points at. Those three are the shapes a reader hits on
 * their first real schema and the shapes a grammar most often cannot spell.
 */
const COURSE_CATALOGUE = `archlab 1.0 er
title "Course catalogue"
description "A join table whose key is entirely foreign, a course that requires another course, and enrolments that outlive a term."

@er
  entity student "Student" [PostgreSQL]
    desc "Anyone who has ever enrolled, including alumni."
    attr id uuid pk
    attr email string uk
    attr full_name string
  entity course "Course"
    attr id uuid pk
    attr code string uk
      desc "The printed code, e.g. CS101 — unique, but never the primary key, because codes get reused across faculties."
    attr title string
    attr prerequisite_id uuid fk
  entity term "Term"
    attr id uuid pk
    attr name string
    attr starts_on date
  entity enrolment "Enrolment"
    desc "A join table: its primary key is the three foreign keys together, so a student can take a course once per term and no more."
    attr student_id uuid pk fk
    attr course_id uuid pk fk
    attr term_id uuid pk fk
    attr grade string

  student ||--o{ enrolment : takes
  course ||--o{ enrolment : "is taken as"
  term ||--o{ enrolment : "runs in"
  course |o--o{ course : "requires"
`;

const SOURCES: readonly ErExampleSource[] = [
  {
    id: "shop-orders",
    blurb:
      "A shop's order tables: a composite key on the order line, a dashed non-identifying line to the audit log, and one table with no columns at all.",
    text: ER_EXAMPLE,
  },
  {
    id: "course-catalogue",
    blurb:
      "A join table whose entire primary key is foreign, plus a course that requires another course — a self-join drawn beside its own box.",
    text: COURSE_CATALOGUE,
  },
];

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export interface ErExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  /** Entities — how many tables the diagram covers. */
  entityCount: number;
  /** Columns, summed across every entity — the diagram's real weight, and the
   * number that separates an overview from a schema. */
  columnCount: number;
  /**
   * Relationships. ONE number, unlike the use-case registry's split, because
   * an ER diagram draws exactly one kind of line: identifying and
   * non-identifying are a STYLE on that line, not two different relationships.
   * Splitting them would suggest a distinction the notation does not make at
   * the level a count operates on, and the blurb says which shapes an example
   * carries in words.
   */
  relationshipCount: number;
}

export type ErExampleListing =
  | { status: "ok"; summary: ErExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type ErExampleResult =
  | { status: "ok"; id: string; blurb: string; file: ErLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

/**
 * What parsing a REGISTERED source can produce — `not-found` excluded in the
 * type rather than handled at each call site, for the reason the sequence
 * registry states: the source is in hand by the time this runs, so only the
 * parse can fail, and saying so here makes the impossible branch unwritable.
 */
type ParsedErExample = Exclude<ErExampleResult, { status: "not-found" }>;

/** Parsed once per id and remembered: the demo index and the read-only route
 * both read the same source in one request. */
const cache = new Map<string, ParsedErExample>();

function parseSource(source: ErExampleSource): ParsedErExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ParsedErExample;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseErText(source.text),
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
export function listErExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listErExamples(): ErExampleListing[] {
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
        entityCount: result.file.entities.length,
        columnCount: result.file.entities.reduce(
          (sum, entity) => sum + (entity.attributes?.length ?? 0),
          0,
        ),
        relationshipCount: result.file.relationships.length,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadErExample(id: string): ErExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
