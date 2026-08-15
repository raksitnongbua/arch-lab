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

import { SEQUENCE_EXAMPLE } from "../input/example";
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
  web ->+ auth : "Ask for a reset link" [HTTPS]
    desc "POST /api/v1/reset-requests\\nbody { email }\\n202 always — the response cannot say whether the address exists"
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

/**
 * The grouping example. It exists because `box`, `rect`, `critical` and
 * `break` are the four constructs a reader is most likely to arrive holding
 * (they are ordinary Mermaid) and least likely to discover from the other two
 * examples, which predate them. A construct nobody can see an example of is,
 * for practical purposes, undocumented.
 */
const PAYMENT_CAPTURE = `archlab 1.0 sequence
title "Payment capture — the money leg"
description "Where an order stops being a promise: authorise, capture, and the two ways it does not finish."

@sequence
  autonumber
  box "Our services" tint=#bfdfff
    api:participant "Order API" @golang [Go]
    ledger:participant "Ledger" @postgresql [PostgreSQL]
  box "Third party" tint=#ffe4e1
    psp:participant "Card Processor" @external [Stripe]
    risk:participant "Fraud Scoring" @ai-model

  rect tint=#bfdfff
    api ->+ psp : "Authorise the card" [REST]
      desc "POST /v1/payment_intents\\nbody { amount, currency, card_token }\\n201 → { intent_id, status: requires_capture }"
    psp ~> risk : "Score the attempt"
    psp ..>- api : "requires_capture"
  critical "Capture within 7 days"
    api ->+ psp : "Capture the intent" [REST]
    psp ..>- api : "succeeded"
    api -> ledger : "Post the entry" [SQL]
  option "processor unreachable"
    api -> api : "Schedules a retry with backoff"
    note right api : "The authorisation holds; only the capture is late"
  option "already captured"
    api -> ledger : "Reconciles against the existing entry" [SQL]
  break "card declined"
    api ..> psp : "Void the authorisation" [REST]
    api -> ledger : "Posts nothing — there is no money to record" [SQL]
`;

const SOURCES: readonly SequenceExampleSource[] = [
  {
    id: "checkout",
    // The playground's seed IS this example — one definition, in
    // `../input/example`. They were separate copies of the same 42 lines and had
    // already drifted: the same `desc` said "the cart moved on" in one and "the
    // cart changed under us" in the other, so the demo page and the playground
    // disagreed about one flow.
    blurb:
      "An order placed end to end — activation bars, a card-declined branch, parallel receipt and audit writes, and a note spanning the whole flow.",
    text: SEQUENCE_EXAMPLE,
  },
  {
    id: "password-reset",
    blurb:
      "A single-use reset link, with a loop around the wait and an alt for the expired-token path — the constructs a real retry story needs.",
    text: PASSWORD_RESET,
  },
  {
    id: "payment-capture",
    blurb:
      "Lifelines bracketed into ours and theirs with an icon each, the authorisation leg highlighted, and the two ways a capture ends — box, rect, critical, break and @icon on one flow.",
    text: PAYMENT_CAPTURE,
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

/**
 * What parsing a REGISTERED source can produce.
 *
 * `not-found` is excluded in the type rather than handled at each call site:
 * the source is in hand by the time this runs, so only the parse can fail.
 * Stated here, the compiler makes the impossible branch unwritable — this used
 * to be typed as the full `SequenceExampleResult`, and the one caller duly
 * invented a user-facing `"Not found."` for a case it could never reach.
 */
type ParsedSequenceExample = Exclude<
  SequenceExampleResult,
  { status: "not-found" }
>;

const cache = new Map<string, ParsedSequenceExample>();

function parseSource(source: SequenceExampleSource): ParsedSequenceExample {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ParsedSequenceExample;
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
      return { status: "invalid", id: source.id, message: result.message };
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
