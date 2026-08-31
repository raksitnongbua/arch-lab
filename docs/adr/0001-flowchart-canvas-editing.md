---
status: superseded by ADR-0002
---

# The flowchart canvas is editable, but a flowchart node will never be draggable

> **Superseded by [ADR 0002](0002-flowchart-node-positions.md).** The heading's
> "never" did not survive: the format grew the coordinate this file argued it
> should not have, which is the one thing that can move a `"grammar"` refusal.
> This file is kept rather than rewritten because its argument was sound and
> every cost it named is still real and still unmitigated — ADR 0002 lists them
> as accepted costs. Read both.

The flowchart canvas is being given two of the four canvas-edit abilities —
`revise` (a selected node's or edge's own wording) and `connect` (drawing a new
arrow between two existing nodes) — while `move` stays refused **permanently**
and `create` stays refused for now. This is recorded because the obvious reading
of "make the flowchart editable like C4" is drag-a-box-to-move-it, and that one
is not coming.

## Why `move` cannot happen

`FlowchartNode` carries no position field, and it must not grow one. A
flowchart's layout is solved from its edges and ranks, so a dragged node would
be put back by the very next parse — the drag would have nowhere in the text to
land. This is a `"grammar"` refusal in `CANVAS_EDIT_OFFERS`, not a `"surface"`
one: no amount of building moves it. The only alternative was adding coordinates
to the `.alab` flowchart grammar, which is a format change affecting every
flowchart file already on disk, in exchange for a gesture that fights the
renderer rather than working with it.

`create` stays refused as well, but on weaker footing than it looks: its cell
inherits `NO_PLACE_IN_THE_TEXT` from the notations that solve their own layout,
and a flowchart node's placement is arguably its *edges* rather than a
coordinate. That cell deserves to be re-argued on its own merits rather than
flipped in passing, which is why this change leaves it alone.

## Considered options worth remembering

**Where a new edge's line is written.** `src/types/flowchart.ts` states that
`edges` is the author's narration order and that a decision's branches are read
in the order its outgoing edges appear — so insertion position is data, not
formatting. Inserting after the source node's last outgoing edge would keep a
decision's branches contiguous; appending to the end of the block produces the
smaller, more obvious diff. **We chose to append**, accepting that a decision's
branches will drift apart as the gesture is used. This was chosen with the
trade-off visible, not overlooked. If branch contiguity later matters more than
diff size, the fix is a separate tidy action, not a change to the insert.

**How much the canvas may delete.** Removal rides under `revise`, so offering
`revise` did not settle it. Edge removal ships; node removal does not. A node
removal's verdict has to answer three questions this feature has no opinion on —
what happens to a group left empty, to a decision left with a single branch, and
to a graph split in two — and each answer would change the diagram a screen away
from where the reader pressed.

**Guards the parser does not have.** The gesture refuses self-edges, duplicate
edges, and edges leaving an `end` terminator or entering a `start` one. All
three are legal `.alab` and remain so: a gesture may decline to author what the
grammar tolerates, whereas tightening the *parser* would invalidate files people
already have.

**The Mermaid pane.** `revise` is refused while the pane is Mermaid, because the
emitter provably drops `desc`, `[technology]` and `#tags`. `connect` is not
refused there, because the same emitter provably keeps every edge and its label.
The asymmetry is deliberate: `.claude/rules/canvas-editing.md` requires a pane
exception to be measured against the emitter, and a refusal for `connect` would
have no evidence behind it.
