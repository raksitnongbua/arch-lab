# The lifecycle grammar

Part of the `alab` skill — open this when you are writing `archlab 1.0 lifecycle` — one thing and its states.

## Lifecycles (`archlab 1.0 lifecycle`)

One thing, the states it passes through, and where it can stop.
Opened by **`archlab 1.0 lifecycle`**, validated with
`validate_lifecycle`.

```
archlab 1.0 lifecycle
title "An order, from checkout to the doormat"

@lifecycle
  subject "Order"
    desc "One customer order, followed from checkout until it stops."
  state placed "Placed"
    exit "Cancelled" ends
      when "the customer changes their mind before paying"
  state paid "Paid"
  state packed "Packed"
  state shipped "Shipped"
    exit "Returned" rejoins packed
      when "the parcel comes back unopened"
  state delivered "Delivered" ends
```

**The thing to learn first is an absence: there is no line between two
states.** Declaration order IS the track, and the only branches are
`exit … ends` and `exit … rejoins <id>`. This notation overlaps the
flowchart on purpose and is deliberately the smaller of the two, so
the words that would draw an edge are refused by name:

```
archlab 1.0 lifecycle
title "What a lifecycle will not hold"

@lifecycle
  subject "The thing"
  state first "First"
    // A branch belongs to the state it leaves, and lands in one of two
    // places: it "ends", or it "rejoins" a state declared EARLIER.
    exit "Gave up" ends
      when "nothing happens for a week"
  state second "Second"
    // Each of these is refused by name, and each points at the flowchart:
    //   state third "Third" to second   — no edge; the track IS the order
    //   exit "Skip" rejoins last        — no forward rejoin; that is a shortcut
    //   exit "Sent back" rejoins first  — this one is FINE: first comes earlier
    //     exit "And then"               — no branch off a branch; depth is one
    //   subject "Something else"        — one subject; two would be a graph
    // If the picture is really steps that can go anywhere, write
    // "archlab 1.0 flowchart".
    exit "Sent back" rejoins first
      when "it needs redoing"
  state last "Last" ends
```

If the states need arbitrary edges between them, write a flowchart.

---

*Generated from arch-lab's syntax reference — do not edit by hand.*
*Regenerate with `pnpm build:skill`.*
