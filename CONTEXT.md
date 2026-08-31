# arch-lab

arch-lab turns plain text into architecture diagrams, rendered live in the
browser. This glossary fixes the words the codebase already uses for its own
concepts, so that two people describing the same feature reach for the same
term. It is a glossary and nothing else: no decisions, no implementation notes.

## Documents

**Notation**:
One of the diagram kinds a document can be — C4, sequence, flowchart, use case,
ER, dictionary, gantt, timeline, lifecycle. The kind is detected from the text,
never declared by the route.
_Avoid_: diagram type, format, mode

**Pane language**:
The surface syntax a document is currently written in — `.alab` or Mermaid. A
notation is what the diagram _is_; a pane language is how it is _spelled_ right
now.
_Avoid_: syntax, dialect, source format

**Seed**:
The starting text the playground offers when no document has been supplied. A
choice of example, not a different page.
_Avoid_: template, default document, preset

## Canvas editing

**Ability**:
One kind of canvas gesture a notation may or may not receive — `move`,
`revise`, `create`, `connect`. Abilities are answered per notation, as a grid,
because the answers genuinely differ per notation.
_Avoid_: capability, permission, feature flag

**Move**:
Writing a **coordinate** into the text by dragging an element to a point. Only
possible where the grammar has a per-element position field.
_Avoid_: drag, reposition, place

**Reorder**:
Changing an element's **index** in an array by dragging it into a neighbour's
slot. Writes no coordinate. This is part of `revise`, not `move`, and
conflating the two is the project's most-repeated modelling error.
_Avoid_: move, drag, sort

**Revise**:
Editing one element's own fields in place — including renaming and removing it
— without rewriting the file. Requires a knowable line range per element and a
place on the canvas to type into.
_Avoid_: edit, update, modify

**Create**:
Adding a new element that must be **placed** somewhere the text can record.
_Avoid_: add, insert, new

**Connect**:
Writing a new relationship line between two existing elements.
_Avoid_: link, join, draw an arrow

**Refusal**:
A notation's stated answer that it does not offer an ability, carrying its
ground and a sentence written for someone who just tried the gesture.
_Avoid_: error, unsupported, not implemented

**Grammar refusal**:
A refusal because the notation's text has nowhere to write the edit. It moves
only if the format changes.
_Avoid_: hard limit, permanent refusal

**Surface refusal**:
A refusal because the grammar could hold the edit but this canvas has nothing
to make it with. It moves when somebody builds the control.
_Avoid_: to-do, not yet, missing feature

**Line patch**:
An edit that rewrites only the lines it is about, leaving every other line —
comments included — exactly as the author wrote them.
_Avoid_: re-emit, re-serialize, regenerate

**Canvas lock**:
The reader's remembered choice that the canvas must not accept edits. Locked is
the default, because the common visit is reading a diagram somebody else sent.
_Avoid_: read-only mode, view mode, edit toggle

## Sharing

**Share link**:
A URL that carries the whole document inside its own fragment. Nothing is
uploaded, and a link already in circulation must keep opening forever.
_Avoid_: permalink, export URL, saved diagram

**Alias**:
A retired route kept alive as a client-side forward, so links minted against it
still open. Never a minting target.
_Avoid_: redirect, legacy route, shortcut
