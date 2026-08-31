---
status: accepted
supersedes: ADR-0001
---

# A flowchart node can be pinned to a position after all

`FlowchartNode` has an optional `position` — spelled `(x,y)` on the declaration
line, the same token a C4 node's geometry uses minus the size — and dragging a
step on the canvas writes it. [ADR 0001](0001-flowchart-canvas-editing.md)
decided the opposite four days earlier and is superseded, not deleted: its
argument was sound, every cost it named is still real, and a reader who found
only this file would think nobody had weighed them.

## Why the earlier refusal was right, and what changed

ADR 0001 refused a position on `"grammar"` grounds: the field did not exist, a
flowchart's ranks are solved from its arrows, and a drag would therefore be
undone by the very next parse — a gesture that springs back, not a feature. That
was a fact about the format rather than a gap in the canvas, which is exactly
what a `grammar` refusal means in `CANVAS_EDIT_OFFERS`.

What changed is the only thing that could have: **the format.** The product
owner asked for real coordinates with all four costs listed in front of them,
and chose them over the two cheaper answers (a sideways reorder within the rank,
which needs no format change; and not doing it). That is a decision about what
the product is for, and it is theirs.

## What was accepted along with it

Written down because these are the costs, not the risks — none of them is
mitigated, and a future reader should not go looking for the code that handles
them:

- **A pinned node can overlap a solved one.** Nothing separates them. The
  layout has no collision pass and did not grow one.
- **An arrow into a pinned node can run backwards up the page.** Routing still
  reads the *solved* ranks — a pin moves the drawn box, never the rank — so a
  node dragged above its predecessor keeps its rank and its arrow reverses
  direction on the page.
- **Pinning one node can shift other rows vertically.** Moving a box changes
  which flanks are free for loop routing, which changes how many lanes a
  channel needs, which changes that channel's height. Ranks and within-rank
  order are unaffected; absolute `y` is not. This surprised the implementation
  and is kept because the alternative — planning the routing against the box's
  old place — puts arrows where the node no longer is.
- **`purpose.md` calls correct-and-ugly a bug here**, and all three of the
  above can produce it. A pin is therefore a tool for an author who wants a
  specific picture, not a default anyone falls into.

## What was NOT given up

- **Absent is still the normal case.** A node with no `(x,y)` is solved from
  the arrows exactly as before. Every `.alab` flowchart already on disk and in
  every share link parses and lays out to the same pixel, which is why this was
  a minor change rather than a breaking one.
- **Rank is never overridden.** A pin moves the box. The flow's logic — what
  follows what — remains the arrows' to state, and no drag can rewrite it.
- **The `!` escape still carries an unspellable point.** A point with a third
  key from a newer minor rides the escape whole rather than being written as
  `(x,y)` with the extra key dropped. That was a real data loss, found by
  writing the assertion.
- **Mermaid refuses the drag rather than losing it.** Mermaid has no syntax for
  a coordinate, so `CANVAS_EDIT_OFFERS.move.flowchart` carries an `unlessPane`
  exception measured against the emitter, and the export caveat names the loss.

## There is no unpin gesture

Dragging pins; nothing on the canvas is shaped like "give this node back to the
solver". Deleting the `(x,y)` in the source pane is the only way back. That is a
gap rather than a decision — the first person who wants it should add it as its
own gesture with its own announcement, not as a magic drop target.
