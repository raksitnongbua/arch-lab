---
paths:
  - "src/features/playground/**"
  - "src/features/sequence/**"
  - "src/features/viewer/**"
  - "scripts/canvas-edit-check.mjs"
  - "scripts/sequence-check.mjs"
---

# Editing a Diagram on the Canvas

Two of the six notations can be edited by pointing at the picture rather than at
the text. This file is how a seventh answers the same question, and it exists
because that question has been answered wrongly four times on one branch — each
time in a way that typechecked, passed every check, and was visible to the first
person who opened the page.

Read [`new-diagram-type.md`](new-diagram-type.md) first if you are adding a
notation; canvas editing is one line of its step 2 and this file is that line
expanded.

## The model, in one paragraph

A canvas edit is an edit to the SOURCE TEXT. Nothing mutates a model: a gesture
derives new text, re-parses it, and hands both back through the path a keystroke
already takes. Which gestures a document may receive is one table —
`CANVAS_EDIT_OFFERS` in `src/features/playground/input/canvas-edit.ts` — keyed by
notation and by **ability**, and `canvasEditability(doc, ability)` is its only
reader. There are two abilities:

| Ability    | What it writes                        | Needs                                             | Offered by |
| ---------- | ------------------------------------- | ------------------------------------------------- | ---------- |
| `"move"`   | geometry — a coordinate               | a per-element position **in the grammar**         | C4         |
| `"revise"` | one element's own fields, in place    | a knowable line range per element **and** a place on the canvas to type into | sequence   |

C4 offers `move` and refuses `revise`; a sequence document does the exact
opposite. That is not an accident of what got built first — it is what the two
grammars can hold, which is why the answers are a grid and not a flag.

## Does my notation have anything to edit on a canvas?

Three questions, in this order. Answer them before writing any component.

**1. Does an element of my grammar carry a position?** If a reader drags a box,
is there a field in the text the coordinate can be written into? If the layout is
solved from the relationships — ER columns, flowchart ranks, a dictionary table —
the answer is no, and it is no *permanently*: a drag would be undone by the next
render, because the next parse re-derives the layout. That refusal's `ground` is
`"grammar"`.

**A reorder is not a move, and conflating them is the trap.** A sequence document
has no coordinates at all: a participant's column IS its index in `participants`,
a message's time IS its index in `items`. Dragging one there changes an array
order, writes no coordinate, and is therefore part of `"revise"`. If your
notation's drag would take a neighbour's slot rather than land at a point, you
are describing `revise`, not `move`.

**2. Can one element's text be found and replaced without rewriting the file?**
`"revise"` needs the parser to report a line range per element — the `…WithSpans`
parse — because every edit is a line patch (see below). Without spans there is no
`revise`.

**3. Is there somewhere on the canvas to make the edit?** A grammar that could
hold the edit and a canvas with no dock, inspector or handle to make it with is a
legitimate refusal too, with `ground: "surface"`. The four text-laid-out
notations refuse `revise` on exactly these grounds, and the C4 canvas refuses it
deliberately: it already has move and delete, and a second, weaker field editor
on it would be two authoring surfaces for one model.

**The two grounds are both shipped answers.** `"surface"` is not a to-do marker.
The distinction is there so the next reader knows whether the refusal is theirs
to change: a `"grammar"` refusal only moves if the format changes, a `"surface"`
one moves if somebody builds a dock.

## What you must write

**A cell for every ability, even the boring ones.** `CANVAS_EDIT_OFFERS` is a
total `Record` over `ViewDocument["kind"]`, so a notation added to that union
fails to compile until all its cells exist. Write each one out. There is
deliberately **no default cell** — a default is how a new notation inherits an
answer nobody wrote for it, and inheriting "editable" is how a reader ends up
dragging a node that springs back with no explanation.

**A refusal sentence that stays specific.** Refusals are read by someone who
just tried something, so:

- Say why in terms of the notation, not the roadmap. `check:canvas-edit` fails on
  "not supported", "not yet", "coming soon" and "for now".
- **Point somewhere.** Either name a gesture your notation does have (the
  `instead` field — the sequence move refusal sends the reader to the wording
  editor, which is a whole feature one click away), or let the derived
  "Only … can be … on the canvas" tail name the notations that do offer it.
  `check:canvas-edit` fails a refusal that does neither.
- **Never hand-type which notations are editable.** That clause is derived from
  the table by `onlyTheseNotations`. A hand-written "only C4 diagrams can be
  dragged" is the shape that has now gone stale three times on this branch in
  other files (a playground heading, the FAQ, the mouse guide's own caveat) —
  correct code, green checks, a page telling the reader the opposite of what
  ships. `check:canvas-edit` proves the derivation by flipping a cell and reading
  the sentence back.

**A pane-language exception where one applies.** A cell that offers an ability
can still refuse it in one pane language, via `unlessPane`: Mermaid C4 carries no
geometry, and Mermaid `sequenceDiagram` holds neither `desc` nor `[technology]`.
Both are **measured against the emitter**, not assumed —
`MERMAID_SEQUENCE_EXPORT_CAVEAT` is the evidence, and a check asserts the caveat
still says what the refusal claims it says. If you add such an exception, name
the fields that would be lost; "the format is not supported" tells the reader
nothing about what switching the pane would buy them.

**Every gesture asks before it acts.** Each entry point in
`sequence-edit.ts` / `canvas-edit.ts` calls `canvasEditability` itself. A gesture
that trusts its caller is unguarded the day somebody points it at another
notation, and the check derives the gesture list from the viewer's own handler
interface so a new one is covered automatically.

**Every gesture is a LINE PATCH, never a re-emit.** `0a9cbf1` bought this rule:
a full re-serialize deleted every `//` comment in the author's file on the first
drag, and it passed every assertion for a release, because a re-emit of canonical
text *is* canonical text. Patch only the lines the gesture is about, and prove it
from deliberately non-canonical text.

**And the control that gates it must render in the branch your notation takes.**
`67b35ae` is the most expensive bug in this area: the canvas lock was correct in
`canvasEditability` and rendered only inside the C4 branch, so a reader who had
ever locked the canvas found the sequence canvas silently uneditable with no
control anywhere to unlock it — for a whole release, with every assertion green,
because they all asked whether the *module* says a document is editable and none
asked whether the *control* was reachable. If your notation becomes editable, it
renders `CanvasLockButton` and it gets its own wording in `CANVAS_LOCK_COPY`.

**And a page has to say the gesture exists.** A shipped gesture that no sentence
mentions is a feature nobody finds. The playground heading names every verb the
canvas offers, and the check fails until a new one is named there.

## Which checks fail until you have done it

| Check                | Fails on                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `check:canvas-edit`  | a notation with no cell for an ability, or a cell for a notation that no longer exists; a refusal that reads as unfinished, is a dead end, or has no `ground`; the function disagreeing with the table; refusal prose that stopped being derived; a lockable canvas with no lock rendered or no wording; a gesture no control invokes; a stale claim about what the canvas can do |
| `check:sequence`     | a sequence gesture that re-emits instead of patching, or that leaves a document the parser refuses                          |
| `check:view-input`   | an impure import in `input/parse.ts`; `check:canvas-edit` and `check:sequence` do the same for their two edit modules. All three load the real code through Node's type stripping, which cannot read `.tsx` at all, so an import reaching a feature barrel that exports a component removes the module from its only harness |
| `check:archtext` / `check:roundtrip` | a grammar or serializer change your edit path needed that broke open-change-nothing-save                        |

**Write the assertion, then break the code and watch it fail.** This has gone
wrong five times on this branch: a break string that no longer matched after
prettier rewrapped a line, an assertion that crashed instead of failing, one that
passed on a different guard's refusal, two that passed because a second guard
caught the break. Confirm the break landed in the file before you trust the red
line — and confirm the failure names *your* assertion.

## Two hazards specific to editing

**A toggle must put back what it found.** `4a1254e`: the numbering toggle
silently deleted a hand-written `autonumber false`, because the grammar omits
that field at its default and "absent" and "explicitly off" are different
documents. Worse, the assertion that should have caught it measured a different
transition — so if you are pinning a three-state toggle, assert the transition
that loses information, not the one that is easy to write.

**A removal is not the inverse of an insert.** An insert adds one line and
renormalises nothing. A removal can leave a document the parser refuses, or one
that draws something the reader did not ask for a screen away from where they
pressed. Every removal states its own verdict at the gesture — what it refuses,
what it carries rather than eats, and what it renumbers.
