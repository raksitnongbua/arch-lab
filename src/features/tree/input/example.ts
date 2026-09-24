/**
 * The playground's starter tree, kept as `.alab` TEXT rather than as a model
 * object so it goes through the real parser on every load — the rule every
 * kind's seed follows here. A seed that bypassed the grammar could drift into
 * something the format no longer accepts and nothing would notice.
 *
 * DELIBERATELY SMALL. The first draft of this seed was a fourteen-leaf test
 * plan four levels deep, which filled the pane, shrank to an unreadable scale
 * and taught a first-time reader nothing except that the notation produces a
 * wall. A starter's job is to show the SHAPE in one glance and be editable
 * without scrolling: three branches, two levels, two short columns. The full
 * test plan is still bundled as an example (`service/example-service.ts`),
 * where a reader has asked for it.
 */
export const TREE_EXAMPLE = `archlab 1.0 tree
title "Checkout, broken down"

@tree
  levels "Area" "Part"
  columns "Owner" "State"
  node checkout "Checkout"
    node cart "Cart"
      cell "Web"
      cell "Done"
    node pay "Payment"
      cell "Payments"
      cell "In progress"
    node ship "Shipping"
      cell "Fulfilment"
      cell "Not started"
`;
