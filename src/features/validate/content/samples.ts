/**
 * The one-click samples on `/validate` — one for each of the two text
 * grammars, plus a deliberately broken `.alab` document so the error
 * presentation can be seen without having to invent a mistake. There is no
 * JSON sample: the equivalent `.archlab.json` runs to hundreds of lines, and
 * pasting one is what people arrive at this page already holding.
 *
 * The valid samples are asserted against the real parsers by
 * `scripts/validate-samples-check.mjs` (`pnpm check:validate-samples`), and
 * the broken one is asserted to FAIL — so a grammar change that would make
 * this page lie breaks the build instead.
 */

export interface ValidateSample {
  label: string;
  source: string;
}

const ALAB_SAMPLE = `archlab 1.0
title "Coffee Shop"
description "A tiny two-level example."

@context d-ctx "Coffee Shop — Context"
  customer:person "Customer"
    desc "Orders and pays for coffee."
  shop:system "Coffee Shop System" >d-cnt
  payments:external "Payment Provider" [Stripe]

  customer -> shop : "Places orders with" [HTTPS]
  shop ..> payments : "Charges cards via" [REST]

@container d-cnt "Coffee Shop System — Containers" owner=shop
  app:container "Ordering App" [Next.js]
  api:container "Order API" [Go]
  db:database "Order Store" [PostgreSQL]

  app -> api : "Calls" [JSON/HTTPS]
  api -> db : "Reads and writes" [SQL]
`;

/** A plausible typo — `sistem` for `system` — located to line 6, column 8. */
const BROKEN_SAMPLE = `archlab 1.0
title "Coffee Shop"

@context d-ctx "Coffee Shop — Context"
  customer:person "Customer"
  shop:sistem "Coffee Shop System"

  customer -> shop : "Places orders with"
`;

const MERMAID_SAMPLE = `C4Context
  title Coffee Shop — Context
  Person(customer, "Customer", "Orders and pays for coffee.")
  System(shop, "Coffee Shop System", "Takes orders and brews coffee.")
  System_Ext(payments, "Payment Provider", "Stripe")

  Rel(customer, shop, "Places orders with", "HTTPS")
  Rel(shop, payments, "Charges cards via", "REST")
`;

export const SAMPLES: readonly ValidateSample[] = [
  { label: ".alab", source: ALAB_SAMPLE },
  { label: "Mermaid C4", source: MERMAID_SAMPLE },
  { label: "A broken one", source: BROKEN_SAMPLE },
];
