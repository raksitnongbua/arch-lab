/**
 * The lifecycle the playground opens with.
 *
 * KEPT AS `.alab` TEXT, not as a built model object, for the reason
 * `features/timeline/input/example.ts` is: the seed then goes through the real
 * parser on its way to the canvas, so a grammar change that breaks this
 * document breaks the playground's first screen rather than sitting undetected
 * behind a hand-built object nothing validates.
 *
 * WHY AN ORDER. It is the example everybody already has in their head, which
 * matters more here than anywhere else in this repo: this notation's whole
 * job is to be recognised as NOT a flowchart in the first two seconds, and a
 * reader who has to learn the domain at the same time will read it as one.
 * An order also happens to exercise every part the layout is built for
 * without being contrived:
 *
 *   - TWO TERMINAL BRANCHES AND ONE REJOINING ONE. Cancelled and Refunded
 *     stop; Returned goes back to Packed. That contrast is the picture's
 *     whole content, and it is the one thing a milestone timeline next door
 *     cannot draw at all.
 *   - A BACKWARD REJOIN THAT SKIPS A STATE. Returned lands on Packed, not on
 *     Shipped directly above it, so the rejoin path has to travel past a
 *     state it does not touch — which is exactly the case
 *     `check:lifecycle-layout` measures.
 *   - STATES AND BRANCHES OF VERY DIFFERENT TEXT LENGTHS, with and without
 *     descriptions, so the row heights are visibly solved from the text
 *     rather than pitched.
 *
 * There is deliberately nothing in it a flowchart would draw better: no
 * decision with two forward outcomes, no step that is an ACTION, no loop that
 * is a retry of the same work. If a future edit adds one, the seed has stopped
 * demonstrating this notation and started demonstrating the case for the other
 * one.
 */

export const LIFECYCLE_EXAMPLE = `archlab 1.0 lifecycle
title "An order, from checkout to the doormat"
description "One order, the states it passes through, and the two ways it can leave the track"

@lifecycle
  subject "Order"
    desc "One customer order. Everything below is somewhere this one thing can BE, never something somebody does to it."
  state placed "Placed"
    desc "Checkout finished. Nothing has been charged and no stock is held."
    exit "Cancelled" ends
      when "the customer changes their mind before paying, or the basket expires"
      desc "The commonest way an order leaves, and the cheapest: nothing has moved yet."
  state paid "Paid"
    desc "Payment captured, stock reserved. From here a departure costs somebody something."
    exit "Refunded" ends
      when "the payment is disputed, or the customer cancels before anything is picked"
  state packed "Packed"
    desc "Picked, boxed and labelled, waiting on the carrier."
  state shipped "Shipped"
    exit "Returned" rejoins packed
      when "the parcel comes back unopened — refused at the door, or nobody in after three attempts"
      desc "Back to Packed rather than to Paid: the stock is intact and the box needs only a new label."
  state delivered "Delivered" ends
    desc "Signed for, or left where the customer asked. The order stops here."
`;
