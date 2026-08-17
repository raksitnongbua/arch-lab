/**
 * The example the playground opens with when seeded for flowchart
 * (`/view?d=flow`). Same philosophy as the C4 seed's SEED_MODEL
 * (`viewer/input/sync.ts`) and the sequence seed (`sequence/input/example.ts`):
 * an empty canvas teaches nobody the format, so the seed is a realistic flow
 * that demonstrates every headline construct — all six shapes (terminators,
 * steps, a decision pair, `io`, `call`), a tinted `group`, guard labels on a
 * decision's branches, TWO loops (a re-price loop and a payment retry), a
 * `[technology]` attribute, a `#tag`, and a node `desc` revealed in the
 * details dock rather than drawn in the symbol.
 *
 * Hand-written, then canonicalised through the real parser and serializer at
 * module load so it can never drift from the grammar — if the grammar changes
 * and this text stops parsing, the module throws at import time and every
 * check catches it, instead of the playground opening on an error.
 */

import {
  parseFlowchartText,
  serializeFlowchartText,
} from "@/features/archtext";

const RAW = `archlab 1.0 flowchart
title "Checkout payment"
description "One order charged: validate the cart, take payment with one retry, record the outcome."

@flowchart
  start begin "Order placed"
  io load "Load cart and prices" [PostgreSQL]
  decision fresh "Prices still current?"
  step reprice "Re-price the cart"
    desc "Stale prices are re-quoted rather than honoured — a cart can sit open overnight, and charging yesterday's price is a refund ticket tomorrow."
  group "Payment provider" tint=#4a90d9
    call charge "Charge the card" [Stripe]
    decision paid "Charge accepted?"
    step backoff "Wait 30s, retry" #retry
  io receipt "Email the receipt" [SMTP]
  end done "Order confirmed"
  end failed "Order cancelled"

  begin -> load
  load -> fresh
  fresh -> charge : "yes"
  fresh -> reprice : "no"
  reprice -> load
  charge -> paid
  paid -> receipt : "yes"
  paid -> backoff : "declined once"
  backoff -> charge
  paid -> failed : "declined again"
  receipt -> done
`;

/** The canonical seed text — parser-verified at module load. */
export const FLOWCHART_EXAMPLE: string = serializeFlowchartText(
  parseFlowchartText(RAW),
);
