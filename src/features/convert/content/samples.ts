/**
 * The one-click samples on `/convert` — one per Mermaid dialect the page
 * reads, so both halves of "whichever it is is detected" can be seen without
 * having a diagram of your own to hand.
 *
 * The sequence sample leads with `box` and `rect` on purpose. Those blocks
 * used to be refused by name, which rejected the whole paste over a bracket
 * and a background tint; they now flatten (see `mermaid/lib/sequence.ts`), and
 * a sample nobody could have converted a release ago is the clearest way to
 * say so. `critical`/`option` is in there for the same reason.
 *
 * Both are asserted to convert by `scripts/validate-samples-check.mjs`
 * (`pnpm check:validate-samples`), so a grammar change that would make this
 * page hand out a broken sample breaks the build instead.
 */

export interface ConvertSample {
  label: string;
  source: string;
}

const SEQUENCE_SAMPLE = `sequenceDiagram
    title Checkout — place an order
    autonumber
    box Aqua Front of house
        actor C as Customer
        participant W as Storefront
    end
    participant A as Order API
    rect rgb(191, 223, 255)
        C->>W: Clicks Place order
        W->>+A: POST /orders
    end
    critical Reserve the stock
        A->>DB: INSERT order
        A-->>-W: 201 Created
    option stock ran out
        A-->>W: 409 Conflict
    end
    Note over C,W: Order flow complete
`;

const C4_SAMPLE = `C4Context
    title Coffee Shop — System Context
    Person(customer, "Customer", "Orders and pays for coffee")
    System(shop, "Coffee Shop System", "Takes orders and charges cards")
    System_Ext(payments, "Payment Provider", "Stripe")

    Rel(customer, shop, "Places orders with", "HTTPS")
    Rel(shop, payments, "Charges cards via", "REST")
`;

export const CONVERT_SAMPLES: readonly ConvertSample[] = [
  { label: "Mermaid sequenceDiagram", source: SEQUENCE_SAMPLE },
  { label: "Mermaid C4", source: C4_SAMPLE },
];
