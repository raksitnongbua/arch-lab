/**
 * The example the playground opens with when seeded for sequence
 * (`/view/sequence`). Same philosophy as the C4 seed's SEED_MODEL
 * (`viewer/input/sync.ts`): an empty canvas teaches
 * nobody the format, so the seed is a realistic flow that demonstrates every
 * headline construct — both participant kinds, technologies, all three arrow
 * kinds, activation (`->+` / `..>-`), a message `desc` (the short title on
 * the wire, the endpoint behind it), a self-message, notes in two
 * placements (including an over-two-participants span), and `alt` / `par` /
 * `opt` fragments with a nested pair.
 *
 * Hand-written, then canonicalised through the real parser and serializer at
 * module load so it can never drift from the grammar — if the grammar
 * changes and this text stops parsing, the module throws at import time and
 * every check catches it, instead of the playground opening on an error.
 */

import { parseSequenceText, serializeSequenceText } from "@/features/archtext";

/**
 * The charge call as a runnable request, interpolated into RAW below rather
 * than typed out escaped — same reason as `SEQUENCE_CURL_EXAMPLE` in the
 * syntax-docs snippets: hand-escaping curl's backslashes and a JSON body
 * inside a template literal is four levels deep and wrong every time.
 * `JSON.stringify` produces exactly what the `desc` line wants, and the
 * readable lines stay the source of truth.
 */
const CHARGE_CURL = [
  "curl https://api.payments.example/v1/charges \\",
  "  --request POST \\",
  "  --header 'Idempotency-Key: <order id>' \\",
  '  --data \'{ "amount": 4250, "currency": "THB" }\'',
  "",
  "The idempotency key is the order id, so a retry cannot double-charge.",
].join("\n");

const RAW = `archlab 1.0 sequence
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
  web ->+ api : "Place the order" [HTTPS]
    desc "POST /api/v1/orders\\nbody { cartId, addressId }\\n201 → { orderId }\\n409 → the cart moved on"
  api -> api : "Validates the cart"
  note right api : "Price and stock re-checked server-side"
  alt "card accepted"
    api ->+ pay : "Create charge" [REST]
      desc ${JSON.stringify(CHARGE_CURL)}
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

/** The canonical seed text — parser-verified at module load. */
export const SEQUENCE_EXAMPLE: string = serializeSequenceText(
  parseSequenceText(RAW),
);

/* A Mermaid twin of this flow used to live here, feeding the playground's
 * "Mermaid example" button. Both example buttons were removed with the merge
 * into `features/playground` (the pane auto-detects a pasted `sequenceDiagram`
 * without a demo affordance), so the twin went with them. */
