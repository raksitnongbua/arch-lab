---
status: accepted
---

# A use-case element and an ER entity can be pinned to a position

`UseCaseElement` and `ErEntity` have grown an optional `position` — spelled
`(x,y)` on the declaration line, the same token a flowchart node uses — and an
optional `pinned`, spelled `pin` / `pin=false`, the same keyword a C4 node
uses. Both grammars refused `move` on `"grammar"` grounds until now, and
`.claude/rules/canvas-editing.md` says the only legitimate way such a refusal
moves is that the format changes. So it changed.

This follows [ADR 0002](0002-flowchart-node-positions.md), which did the same
thing for the flowchart and supersedes [ADR 0001](0001-flowchart-canvas-editing.md).
All three should be read together: 0001 is the argument for refusing, and every
cost it named is still real here.

## Why the refusal was right, and what changed

Both notations solve their own layout, and solve it well. `layoutUseCase`
places actors in the columns flanking a boundary and refines which side each
one takes by reading the solved geometry back; `layoutEr` buckets entities into
columns by longest-path dependency depth and then centres each column
vertically. A drag had nowhere in the text to land, so the next parse re-derived
the layout and put the element back. That is a fact about the format, not a gap
in the canvas.

What changed is the only thing that could have: **the format.** The product
owner asked for it with the costs listed in front of them, and chose them over
the two cheaper answers — not doing it, and a reorder within the solved
structure, which needs no format change but cannot express "put this here".

## What was accepted along with it

These are costs, not risks. None is mitigated, and a future reader should not
go looking for the code that handles them.

- **A pinned element can overlap a solved one.** Neither layout has a collision
  pass and neither grew one.
- **ER: a connector into a pinned entity can leave the wrong face.**
  `connectorSides` and `crowdedErSides` read the *solved* geometry — a pin moves
  the drawn box, never the column — so an entity dragged across the diagram
  keeps the sides its column earned it.
- **ER: pinning one entity can shift another's absolute `y`.** A column's
  vertical centring is measured from the heights the solver still owns, so
  removing one box from that measurement moves the rest. Columns and within-
  column order are unaffected. This is the same shape as ADR 0002's third cost.
- **Use-case: a pinned actor keeps its solved side.** The side refinement runs
  on solved geometry, so an actor dragged across the boundary still has its
  spokes leave from the side the layout chose, and they can now cross the
  boundary they used to flank.
- **`purpose.md` calls correct-and-ugly a bug here**, and every one of the above
  can produce it. A pin is a tool for an author who wants a specific picture,
  not a default anybody falls into.

### The boundary grows; the drawing does not shift

ADR 0002 accepted a fourth cost it later had to amend — a coordinate outside the
solved bounds was **cropped out of the picture**, and a pinned step drew 64%
outside the frame on screen and cropped identically in the PNG. That mistake is
not repeated here. The shift and the frame are two different numbers: the
use-case boundary rectangle and both layouts' reported bounds **grow** around a
far-flung pin, and every surface takes its viewBox from the bounds, so nothing
is cropped and the drag still lands under the cursor.

## `pin` needed an answer neither precedent had

The two precedents disagree, and combining them raised a question with no
existing answer: **what does `pin` mean on an element with no `(x,y)`?**

- The flowchart grammar has no keyword at all — a bare `(x,y)` *is* the pin — so
  the case cannot arise.
- The C4 grammar has the keyword beside a **mandatory** geometry, so it cannot
  arise there either.

**It is a parse error, in both directions.** `pin` names coordinates to keep,
and an element that states none has nothing to keep; `pin=false` is refused the
same way, because "explicitly not keeping a position I never stated" is not a
document anybody meant to write, and one rule is easier to hold than a rule with
an exception. Refusing it is the answer that cannot be misread later.

`pin` also ships **with the reset sweep it exempts from, or not at all.**
`C4Node.pinned` spent two releases documenting a feature that had never existed
in this repo while no consumer read the field; a second field with no reader
would be the same lie twice.

## What was NOT given up

- **Absent is still the normal case.** An element with no `(x,y)` is solved
  exactly as before. Every `.alab` use-case and ER document already on disk and
  in every share link parses and lays out to the same pixel, which is why this
  is a minor change rather than a breaking one.
- **Structure is never overridden.** A pin moves the drawn shape. An ER
  entity's column is still its dependency depth, a use-case actor's side is
  still the solver's, and no drag rewrites either.
- **The `!` escape still carries an unspellable point.** A point with a third
  key from a newer minor rides the escape whole rather than being written as
  `(x,y)` with the extra key silently dropped. That was a real data loss in the
  flowchart serializer, found by writing the assertion, and both new
  serializers are asserted against it.
- **`pin=false` survives.** Absent and explicitly-off are different documents,
  and the serializer writes the `false` out rather than omitting it at its
  default — the shape of the numbering-toggle bug `canvas-editing.md` records.
- **One reader, not three.** The `(x,y)` token is read by one shared
  `readPointToken`; the flowchart's inline copy was moved onto it rather than a
  third and fourth copy being written.

## Two things deliberately left out

- **Mermaid.** Neither Mermaid use-case nor Mermaid ER has syntax for a
  coordinate, so both cells carry an `unlessPane` exception measured against the
  emitter rather than assumed.
- **A dictionary position.** A data dictionary solves its column widths **once
  across the whole document** so that every section shares one grid, and that
  shared grid is what lets a reader scan two sections against each other. A
  free coordinate would break it, and there is no graph for one to fight with.
  Its `move` cell stays refused on grammar grounds. What a dictionary drag
  writes is a **reorder**, which needs no format change because order already
  *is* the text — and per `canvas-editing.md` a reorder is not a move, so it
  rides under `revise`.
