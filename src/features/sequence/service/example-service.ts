/**
 * The registry of example SEQUENCE documents — the sequence-diagram counterpart
 * of `viewer/service/model-service.ts`, and deliberately the same shape.
 *
 * Each example is `.alab` sequence TEXT, not a pre-parsed object, and it is
 * parsed here through the real `parseSequenceText`. That is the same discipline
 * the C4 registry follows with `deserializeModel`: an example that only renders
 * because it skipped the parser is not an example of anything. A broken one is
 * LISTED with its parse error rather than silently dropped, so a typo shows up
 * as a visible failure on the demo index instead of a missing card.
 *
 * Text rather than JSON because sequence documents have no JSON form yet — the
 * `.alab` sequence grammar is the only persisted shape, so the text IS the
 * document.
 *
 * Pure and memoized, safe to call from Server Components and client code alike.
 */

import type { SequenceLabFile } from "@/types";

import { ArchTextParseError, parseSequenceText } from "@/features/archtext";

import { eachMessage } from "../lib/collapse";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export interface SequenceExampleSource {
  /** Stable id — doubles as the `/view/sequence/[exampleId]` route segment. */
  id: string;
  /** One line on what the flow shows, for the demo card. */
  blurb: string;
  /** The `.alab` sequence document, verbatim. */
  text: string;
}

const CHECKOUT = `archlab 1.0 sequence
title "Checkout — Place Order"
description "One order placed: card charged, order stored, receipt sent."

@sequence
  autonumber
  cust:actor "Customer"
  web "Storefront" [Next.js]
  api:participant "Order API" [Go]
  pay:participant "Payments" [Stripe]
  db:participant "Orders DB" [PostgreSQL]

  cust -> web : "Clicks Place order"
  web ->+ api : "POST /orders" [HTTPS]
  api -> api : "Validates the cart"
  note right api : "Price and stock re-checked server-side"
  alt "card accepted"
    api ->+ pay : "Create charge" [REST]
    pay ..>- api : "charge.succeeded"
    api -> db : "INSERT order" [SQL]
    par "receipt"
      api ~> cust : "Emails the receipt"
    and "audit"
      api ~> db : "Writes audit row"
    api ..>- web : "201 Created"
  else "card declined"
    api ..> web : "402 Payment Required"
  opt "first purchase"
    web -> cust : "Shows onboarding tips"
  note over cust db : "Order flow complete"
`;

const PASSWORD_RESET = `archlab 1.0 sequence
title "Password reset — one-time link"
description "A reset that survives a lost inbox: the link is single-use and the old session dies."

@sequence
  autonumber
  user:actor "Account holder"
  web "Web App" [Next.js]
  auth:participant "Auth Service" [Go]
  store:participant "Token Store" [Redis]
  mail:participant "Email Provider" [Postmark]

  user -> web : "Requests a reset"
  web ->+ auth : "POST /reset-requests" [HTTPS]
  auth -> store : "SET token, ttl 15m" [RESP]
  auth ~> mail : "Send reset link" [SMTP]
  auth ..>- web : "202 Accepted"
  note over web user : "Same response whether or not the address exists"

  loop "until the link is used or expires"
    user -> web : "Opens the emailed link"
    web ->+ auth : "POST /reset-confirmations" [HTTPS]
    auth -> store : "GETDEL token" [RESP]
    alt "token valid"
      auth -> auth : "Hashes the new password"
      auth ~> store : "Revoke every session"
      auth ..>- web : "200 OK"
      web -> user : "Signed in with the new password"
    else "token missing or expired"
      auth ..>- web : "410 Gone"
      web -> user : "Asks for a fresh reset"
`;

const SOURCES: readonly SequenceExampleSource[] = [
  {
    id: "checkout",
    blurb:
      "An order placed end to end — activation bars, a card-declined branch, parallel receipt and audit writes, and a note spanning the whole flow.",
    text: CHECKOUT,
  },
  {
    id: "password-reset",
    blurb:
      "A single-use reset link, with a loop around the wait and an alt for the expired-token path — the constructs a real retry story needs.",
    text: PASSWORD_RESET,
  },
];

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

export interface SequenceExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  participantCount: number;
  messageCount: number;
  /** Fragment kinds present, deduplicated in document order. */
  fragmentKinds: readonly string[];
}

export type SequenceExampleListing =
  | { status: "ok"; summary: SequenceExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type SequenceExampleResult =
  | { status: "ok"; id: string; blurb: string; file: SequenceLabFile }
  | { status: "invalid"; id: string; message: string }
  | { status: "not-found"; id: string };

const cache = new Map<string, SequenceExampleResult>();

function parseSource(source: SequenceExampleSource): SequenceExampleResult {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: SequenceExampleResult;
  try {
    result = {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseSequenceText(source.text),
    };
  } catch (error) {
    // The parser's own located message, not a generic one: a broken example
    // should be as debuggable from the demo page as from the playground.
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

/** Fragment kinds in the document, deduplicated, in document order. */
function fragmentKindsOf(file: SequenceLabFile): string[] {
  const kinds: string[] = [];
  const walk = (items: SequenceLabFile["items"]): void => {
    for (const item of items) {
      if (item.step !== "fragment") continue;
      if (!kinds.includes(item.kind)) kinds.push(item.kind);
      for (const branch of item.branches) walk(branch.items);
    }
  };
  walk(file.items);
  return kinds;
}

/** Every registered example's id — for `generateStaticParams`. */
export function listSequenceExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/**
 * Summaries for the demo index. Every number is COUNTED from the parsed
 * document, never written by hand — the same promise the C4 cards make, and the
 * reason a card can never overstate what its example contains.
 */
export function listSequenceExamples(): SequenceExampleListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status !== "ok") {
      return {
        status: "invalid",
        id: source.id,
        message: result.status === "invalid" ? result.message : "Not found.",
      };
    }
    return {
      status: "ok",
      summary: {
        id: result.id,
        blurb: result.blurb,
        title: result.file.metadata.title,
        description: result.file.metadata.description ?? null,
        participantCount: result.file.participants.length,
        messageCount: eachMessage(result.file.items).length,
        fragmentKinds: fragmentKindsOf(result.file),
      },
    };
  });
}

/** One example by id, parsed. */
export function loadSequenceExample(id: string): SequenceExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
