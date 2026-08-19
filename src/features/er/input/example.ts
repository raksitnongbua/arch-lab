/**
 * The ER document the playground opens with.
 *
 * A SHOP'S ORDER SCHEMA, chosen because it is the schema most readers already
 * hold in their head: it needs no domain explanation, and every construct the
 * grammar has appears in it for a reason a reader can see —
 *
 *   - a COMPOSITE key (`order_line.order_id` is `pk fk`), which is what
 *     `ErAttribute.keys` is an array for;
 *   - a NON-IDENTIFYING line (`..`), so the dashed style is on screen beside
 *     the solid one rather than being something the docs merely mention;
 *   - an entity with NO columns (`audit_log`), which is a legitimate document
 *     and the case an empty `attributes` array would have broken;
 *   - all four cardinalities across the four relationships.
 *
 * Kept as TEXT, not as a model object, so the playground seeds itself through
 * the REAL parser — the same rule the other four kinds follow. A hand-built
 * model would let the starter document drift out of the grammar it is meant
 * to teach.
 */
export const ER_EXAMPLE = `archlab 1.0 er
title "Shop orders"

@er
  entity customer "Customer" [PostgreSQL]
    desc "Anyone who has ever placed an order"
    attr id uuid pk
    attr email string uk
      desc "Lowercased on write, so it can be a unique key"
    attr name string
    attr created_at timestamptz
  entity order "Order"
    attr id uuid pk
    attr customer_id uuid fk
    attr placed_at timestamptz
    attr total numeric(10,2)
  entity order_line "Order line"
    attr order_id uuid pk fk
    attr sku string pk
    attr quantity integer
    attr unit_price numeric(10,2)
  entity address "Address"
    attr id uuid pk
    attr customer_id uuid fk
    attr line1 string
    attr postcode string
  entity audit_log "Audit log"

  customer ||--o{ order : places
  order ||--|{ order_line : contains
  customer ||--o{ address : "ships to"
  order }o..o{ audit_log : writes
`;
