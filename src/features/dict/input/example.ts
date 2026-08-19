/**
 * The dictionary the playground opens with.
 *
 * A CUSTOMER API PAYLOAD rather than a database table, chosen deliberately:
 * the argument for this document type existing at all is that a dictionary
 * describes things with no tables and no cardinality, so the starter should
 * be one of those rather than something an ER diagram could have drawn.
 *
 * Every flag appears, and every prose slot, because each is a thing a reader
 * has to see once to know it exists. Kept as TEXT so the playground seeds
 * itself through the REAL parser — the rule every other kind follows.
 */
export const DICT_EXAMPLE = `archlab 1.0 dict
title "Customer API"
description "Every field the customer endpoints return, what it means, and where it comes from"

@dict
  section "Customer" [REST payload] #api
    desc "Returned by GET /customers/:id and embedded in every order"
    field id uuid required unique
      desc "Stable identifier. Never reused, so a deleted customer's id stays dead."
      source "accounts.customer.id"
      values "RFC 4122"
      example "9f2a1c3e-1c2f-4b6a-9c1e-0f2a1c3e4b5a"
    field email string required unique pii
      desc "Lowercased on write, which is what lets it be a unique key. Verified before an order may be placed."
      source "accounts.customer.email"
      values "RFC 5322"
    field display_name string
      desc "What the customer asked to be called. Free text — do not parse it into first and last."
      source "accounts.customer.display_name"
    field lifetime_value decimal(10,2) derived
      desc "Sum of settled orders. Recomputed nightly, so it lags a same-day order by up to 24 hours."
      source "warehouse.customer_ltv"
      example "1284.50"
    field legacy_crm_ref string deprecated
      desc "The pre-2024 identifier. Still written for the reporting export; read nothing new from it."
      source "crm.contact_ref"
  section "Order summary" [REST payload]
    desc "The abbreviated order embedded in a customer response"
    field id uuid required unique
      desc "The order's own identifier."
      source "orders.order.id"
    field status string required
      desc "Where the order is in its lifecycle."
      values "one of draft | sent | paid | refunded"
      example "paid"
    field placed_at timestamptz required
      desc "When the customer confirmed, not when the payment settled."
      source "orders.order.placed_at"
`;
