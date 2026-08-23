/**
 * The example the playground opens with when seeded for use case
 * (`/live?d=uc`). Same philosophy as the C4 seed's SEED_MODEL
 * (`viewer/input/sync.ts`), the sequence seed (`sequence/input/example.ts`)
 * and the flowchart seed (`flowchart/input/example.ts`): an empty canvas
 * teaches nobody the format, so the seed is a realistic diagram that
 * demonstrates every headline construct — actors, a titled `boundary` with a
 * tint, use cases (one with a `desc` for the details dock, one with a
 * `[technology]`), an undirected association with and without a multiplicity
 * label, both `..>` stereotypes («include» and «extend»), and an actor
 * generalization (`--|>`).
 *
 * Hand-written, then canonicalised through the real parser and serializer at
 * module load so it can never drift from the grammar — if the grammar changes
 * and this text stops parsing, the module throws at import time and every
 * check catches it, instead of the playground opening on an error.
 */

import { parseUseCaseText, serializeUseCaseText } from "@/features/archtext";

const RAW = `archlab 1.0 usecase
title "Food delivery"
description "Who does what at the system's edge: guests browse, customers order and track, couriers deliver — and every order includes payment."

@usecase
  actor guest "Guest"
  actor customer "Customer"
  actor courier "Courier"
  boundary "Food Delivery Service" tint=#4a90d9
    usecase browse "Browse restaurants"
    usecase order "Place an order"
      desc "The heart of the system: a cart becomes a paid order with a courier assigned to it."
    usecase pay "Pay for the order" [Stripe]
    usecase track "Track the delivery"
    usecase deliver "Deliver the order"

  guest -- browse
  customer -- order : "1..*"
  customer -- track
  courier -- deliver
  order ..> pay : include
  track ..> order : extend
  customer --|> guest
`;

/** The canonical seed text — parser-verified at module load. */
export const USECASE_EXAMPLE: string = serializeUseCaseText(
  parseUseCaseText(RAW),
);
