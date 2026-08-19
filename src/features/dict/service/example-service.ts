/**
 * The bundled dictionary examples — the sixth registry, following every
 * convention the other five do: sources are `.alab` TEXT parsed by the real
 * parser (so an example that stops parsing becomes a visible `invalid`
 * listing rather than a hidden one), every number on a demo card is COUNTED
 * from the parsed document, and ids share one flat namespace with the other
 * registries — `check:view-input` asserts they do not collide, because the day
 * they do, `?e=` silently resolves the wrong document.
 *
 * The playground seed is reused by import, never copied.
 */

import type { DictLabFile } from "@/types";

import { ArchTextParseError, parseDictText } from "@/features/archtext";

import { DICT_EXAMPLE } from "../input/example";

export interface DictExampleSource {
  id: string;
  blurb: string;
  text: string;
}

/**
 * A second example that is deliberately NOT a database: an event envelope.
 * This is the case that justifies the document type existing separately from
 * ER — it has no tables and no cardinality, so an ER diagram could not draw it
 * at all, and the argument in `src/types/dict.ts` would be hollow without one
 * bundled example that demonstrates it.
 */
const ORDER_EVENT = `archlab 1.0 dict
title "order.placed event"
description "The envelope and payload every downstream consumer subscribes to — a contract with no table behind it."

@dict
  section "Envelope" [Kafka]
    desc "Present on every event on the topic, whatever the payload"
    field event_id uuid required unique
      desc "Deduplication key. A consumer that has seen this id has already processed the event."
      values "RFC 4122"
    field occurred_at timestamptz required
      desc "When the thing happened, not when the message was produced. Producers retry; this does not change."
    field version integer required
      desc "Schema version of the payload below. A consumer must ignore an envelope whose version it does not know."
      example "3"
  section "Payload"
    desc "Version 3. Fields are added, never removed or repurposed."
    field order_id uuid required
      desc "The order this event is about."
      source "orders.order.id"
    field customer_email string required pii
      desc "Denormalised onto the event so consumers need no lookup. Personal data — it leaves the boundary with the event."
      source "accounts.customer.email"
    field total_minor integer required
      desc "The order total in MINOR units, to avoid a float. Divide by 100 for a display value."
      example "128450"
    field currency string required
      values "ISO 4217"
      example "THB"
    field coupon_code string deprecated
      desc "Never populated since v2. Read the discounts array instead; this stays for consumers not yet migrated."
`;

const SOURCES: readonly DictExampleSource[] = [
  {
    id: "customer-api",
    blurb:
      "A REST payload documented field by field — every flag, provenance on each value, and a derived column that lags the data it summarises.",
    text: DICT_EXAMPLE,
  },
  {
    id: "order-event",
    blurb:
      "An event envelope and its payload: the case with no table behind it at all, which is why a dictionary is not an ER diagram.",
    text: ORDER_EVENT,
  },
];

export interface DictExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  sectionCount: number;
  fieldCount: number;
  /**
   * How many fields carry a description — the number that says whether this is
   * a dictionary or a schema dump, and the one the MCP validator leads with.
   * Counted, never written by hand, so a card cannot overstate its example.
   */
  describedCount: number;
}

export type DictExampleListing =
  | { status: "ok"; summary: DictExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type DictExampleResult =
  | { status: "ok"; id: string; blurb: string; file: DictLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

/** `not-found` excluded in the type rather than handled at each call site: the
 * source is in hand by the time this runs, so only the parse can fail. */
type ParsedDictExample = Exclude<DictExampleResult, { status: "not-found" }>;

const cache = new Map<string, ParsedDictExample>();

function parseSource(source: DictExampleSource): ParsedDictExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;
  let result: ParsedDictExample;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseDictText(source.text),
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
export function listDictExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listDictExamples(): DictExampleListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status !== "ok") {
      return { status: "invalid", id: source.id, message: result.message };
    }
    const fields = result.file.sections.flatMap((section) => section.fields);
    return {
      status: "ok",
      summary: {
        id: result.id,
        blurb: result.blurb,
        title: result.file.metadata.title,
        description: result.file.metadata.description ?? null,
        sectionCount: result.file.sections.length,
        fieldCount: fields.length,
        describedCount: fields.filter(
          (field) => field.description !== undefined,
        ).length,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadDictExample(id: string): DictExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
