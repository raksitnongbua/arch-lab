/**
 * ER-canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The fourth sibling of `canvas-edit.ts` (C4), `sequence-edit.ts` and
 * `flowchart-edit.ts`. The same three rules hold, and they are why this is a
 * fourth file rather than a flag in one of the others:
 *
 *   - THE ONE MODEL RULE. The page holds exactly one authority for what is on
 *     screen — the `ViewDocument` from the last good parse — and the source
 *     pane is its text. Nothing here mutates: a gesture derives NEW source
 *     text, re-parses it, and hands both back through the path a keystroke
 *     already takes. No React, no state.
 *   - AN EDIT IS A LINE PATCH. `line-patch.ts` carries the bug that bought
 *     that rule and the splice that keeps it.
 *   - PURITY IS LOAD-BEARING. The check scripts load this through Node's type
 *     stripping, which cannot read `.tsx` at all. Keep new imports pointed at
 *     pure modules.
 *
 * WHAT IS DIFFERENT HERE:
 *
 *   1. A POSITION IS OPTIONAL, AND ABSENT IS THE NORMAL CASE. `ErEntity` grew
 *      a `position` in ADR 0003, following ADR 0002's decision for the
 *      flowchart: an entity with no `(x,y)` is placed by its dependency depth
 *      exactly as it always was, and `movedErEntityEdit` opts a single entity
 *      out of the solver. So a move here is not the C4 move — it is an opt
 *      out, not a placement on a grid where everything is placed.
 *   2. THERE IS A WAY BACK, which the flowchart canvas still lacks. ADR 0002
 *      recorded "there is no unpin gesture" as a real gap rather than a
 *      decision, and named its own fix: its own gesture with its own
 *      announcement, never a magic drop target. This module ships that from
 *      the start — `resetErEntityPositionEdit` for one entity and
 *      `resetErPositionsEdit` for the diagram.
 *   3. `pin` HAS A CONSUMER, and it is the sweep. `resetErPositionsEdit`
 *      skips a pinned entity; nothing else reads the field. That is deliberate
 *      and it is the reason the field could be added at all: `C4Node.pinned`
 *      spent two releases documenting a feature that had never existed while
 *      no consumer read it, and a field with no reader is that lie twice.
 *
 * AN ENTITY IS ADDRESSED BY ID, which the parser proves unique per file. A
 * RELATIONSHIP IS ADDRESSED BY INDEX, because it has none and the parser
 * proves nothing about it — `revisedErRelationshipEdit` carries the evidence,
 * and it is the flowchart's edge addressing rather than an exception to this
 * file.
 */

import type { ErEntity, ErLabFile, ErRelationship } from "@/types";

import {
  canonicalErEntityBlock,
  canonicalErRelationshipBlock,
  parseErTextWithSpans,
  serializeErText,
  type ErSpans,
} from "@/features/archtext";
// A deep import, but a PURE one — `input/parse.ts` in that feature exports no
// component, so this module stays loadable by the check script's type
// stripping. The barrel would not be.
import { parseErInput } from "@/features/er/input/parse";

import { canvasEditability } from "./canvas-edit";
import { isReleasable } from "./placement";
import { applyPatches, type CanvasEdit, type LinePatch } from "./line-patch";
import type { ViewDocument } from "./parse";

type ErDocument = Extract<ViewDocument, { kind: "er" }>;

/**
 * The fields a selected entity's detail panel may rewrite — the entity's own
 * PROSE, and only that.
 *
 * TWO FIELDS ARE ABSENT, and the absences are the whole content of this type.
 * `FlowNodeRevision` refuses `shape` because it would change what a step's
 * arrows MEAN; these two refuse for reasons of their own.
 *
 * `id` IS WHAT THE RELATIONSHIP LINES REFER TO. `customer ||--o{ order`
 * names both ends by id, so retyping one is a graph edit wearing a field
 * edit's clothes: this gesture patches one entity's block, every relationship
 * naming the old id would be left pointing at a table that is no longer
 * there, and the reader would get a parse error one keystroke after typing a
 * letter in a box labelled "Name". A rename that worked would have to rewrite
 * lines the reader never pointed at — that is a gesture with its own verdict
 * to state, not a fifth box in this form.
 *
 * `attributes` IS NOT PROSE. Each column is its own LINE with its own
 * micro-grammar — a name, a free-text type, an ordered run of key roles and a
 * quoted comment — and the column ORDER is data the diagram shows on purpose
 * (`src/types/er.ts`: "column order is a decision a reader of the diagram is
 * being shown on purpose"). A field that round-tripped four sub-fields per
 * row through one string would be a second reader of the `attr` grammar, free
 * to disagree with the real one about what the author typed; the panel is
 * where a schema's prose is edited, and the columns stay where they are
 * written. The panel already shows them read-only, so it still says what the
 * table holds.
 */
export interface ErEntityRevision {
  label: string;
  technology?: string;
  tags?: string[];
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Revise                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one entity's own wording rewritten, or `null` when the edit
 * cannot apply.
 *
 * DESTRUCTURE AND OVERWRITE, matching all three siblings: an explicit
 * `undefined` in the revision is what REMOVES a field, so a panel whose
 * technology box was emptied drops the `[…]` from the line rather than
 * leaving the old value behind. Spreading the current entity and overlaying
 * the revision would make a cleared field indistinguishable from an
 * untouched one.
 *
 * THE PLACEMENT IS CARRIED, AND IT IS CARRIED EXPLICITLY. An entity's `(x,y)`
 * and its `pin` are not wording, so this gesture must not rewrite them — but
 * it must not omit them either, because a block patch respells the whole
 * declaration line and an absent key IS a released entity. Building the
 * revised entity from the revision alone would throw a table the reader had
 * just dragged back to the solver the moment they retyped its label, which
 * reads as the canvas undoing the previous gesture rather than as a field
 * edit.
 */
export function revisedErEntityEdit(
  doc: ViewDocument,
  sourceText: string,
  entityId: string,
  revision: ErEntityRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "er") {
    return null;
  }
  const current = doc.file.entities.find((entity) => entity.id === entityId);
  if (current === undefined) return null;

  const { label, technology, tags, description } = revision;
  /* An empty label is a document the parser refuses ("the entity label must
     not be empty"), so the reader would press once and be left with an error
     over a diagram they could no longer edit. Whitespace counts as empty: the
     serializer would quote it, and `entity order " "` draws a box with no
     name on it. */
  if (label.trim() === "") return null;

  return patchOne(doc, sourceText, entityId, (entity) => {
    /* SPREAD, THEN DELETE — and it was named field by field, which ATE THE
       AUTHOR'S `!` ESCAPES. The old comment's reasoning was sound as far as it
       went ("a spread cannot REMOVE a key and an emptied box has to") and the
       conclusion was wrong: naming the fields means naming ALL of them, and a
       forward-compatible key from a newer minor is one nobody here can name.
       An entity carrying `! weight : 3` lost that line the moment its label
       was retyped, because `assemble` puts an unknown on the entity as its own
       property and the rebuild simply did not copy it.

       Same class as the two bugs beside it: `revisedFlowNodeEdit` dropping a
       node's `position`, and this module's own relationship gesture, which was
       written field by field first and ate a join's escape until its
       assertion caught it. A block patch respells the whole declaration, so
       anything the rebuild forgets is anything the author loses.

       Delete is what an emptied box needs, and it is the only thing a spread
       could not do — so the spread comes first and the deletes follow. */
    const next = { ...entity, label };
    if (technology === undefined) delete next.technology;
    else next.technology = technology;
    if (tags === undefined || tags.length === 0) delete next.tags;
    else next.tags = tags;
    if (description === undefined) delete next.description;
    else next.description = description;
    /* `position`, `pinned` and the columns are CARRIED, and now by the spread
       rather than by three lines that had to remember them. */
    return next;
  });
}

/**
 * The one field a selected relationship's panel may rewrite: the VERB on the
 * line.
 *
 * WHY THE LABEL EARNS A GESTURE. It is the only part of a join the crow's
 * feet cannot draw. The panel already spells the cardinalities in words
 * ("exactly one customer places zero or more orders"), and the label is the
 * middle of that sentence — the one word in it the reader can be wrong about
 * and the diagram cannot correct.
 *
 * THREE FIELDS ARE ABSENT, and the absences are the content of this type.
 * `FlowNodeRevision` refuses `shape` because it would change what a step's
 * arrows MEAN; these refuse in the same spirit, and the argument has to be
 * made per field rather than by analogy:
 *
 * `fromCardinality`/`toCardinality` ARE THE NOTATION, not a caption on it.
 * The pair IS the crow's-foot glyph at each end, and changing one restates
 * what the schema permits — "an order belongs to exactly one customer" versus
 * "to zero or one" is a nullable foreign key, which is a claim about the
 * database and not about the drawing. It is also the one field on this line
 * whose two halves are positional (`ErRelationship`: "the pairing is
 * positional, not inferred"), so a form offering them would have to teach
 * which end is which before it could be used correctly. A gesture for this
 * belongs on the ENDS the reader can see — a control on the glyph itself,
 * with its own verdict about what it means to loosen a constraint — not in a
 * text field under a label box.
 *
 * `kind` IS THE `--`/`..` TOKEN, and it says whether the child can exist
 * without its parent. Same class of claim: identifying versus non-identifying
 * is a statement about the key, which the panel already explains in a
 * sentence of its own ("the child cannot exist without its parent"). A
 * checkbox that rewrote it would let a reader change what the schema asserts
 * while believing they were retyping a verb.
 *
 * `from`/`to` NAME ENTITIES, so they are refused outright rather than argued
 * — a graph edit wearing a field edit's clothes, exactly as `ErEntityRevision`
 * refuses `id`. Repointing a join is a gesture whose verdict has to answer
 * for the entity left with nothing pointing at it, and it is not this one.
 *
 * REMOVAL IS NOT HERE EITHER, and its absence is a decision rather than an
 * oversight: `canvas-editing.md` has removal riding under `revise` but settled
 * separately per notation, and a removed join asks what happens to a child
 * whose parent it was identifying. That verdict is unwritten, so the gesture
 * is unbuilt.
 */
export interface ErRelationshipRevision {
  /** The verb, or absent to strip the `: label` from the line entirely. */
  label?: string;
}

/**
 * `doc` with one relationship's label rewritten, or `null` when the edit
 * cannot apply.
 *
 * BY INDEX, and the evidence is the parser's rather than this file's. An ER
 * relationship carries no id, and `parseErTextWithSpans` proves no uniqueness
 * over relationships at all — it rejects a duplicate entity id and a
 * duplicate column name, and says nothing about two lines joining the same
 * pair. So `customer ||--o{ order : places` and `customer ||--o{ order :
 * returns` are both legal in one file, and a `from`/`to` key would rewrite
 * whichever came first: silently, and a screen away from the line the reader
 * pressed. `ErSpans.relationships` is therefore the index-aligned ARRAY
 * `FlowchartSpans.edges` is, built from the same pending array `resolve` maps
 * into the model, so `spans.relationships[i]` and `file.relationships[i]` are
 * one line by construction.
 *
 * AN EMPTIED LABEL IS DROPPED rather than written as `: ""`. The parser
 * refuses an empty one outright and says to omit the `":"` instead, and the
 * serializer THROWS on it — so writing one would take the page down from the
 * panel's Apply. Whitespace counts as empty for the same reason it does in
 * `revisedErEntityEdit`: the serializer would quote it and the canvas would
 * draw a line captioned with a space.
 *
 * EVERYTHING ELSE ON THE LINE IS CARRIED BY SPREADING THE CURRENT
 * RELATIONSHIP, then dropping or writing the one field — the shape
 * `pinnedErEntityEdit` uses, and the opposite of the entity wording
 * gesture's field-by-field rebuild. Naming the fields was written first and
 * was WRONG, caught by the assertion for it: a relationship carries the
 * author's `!` escapes as extra keys (`emitRelationship` writes them back out
 * of `splitUnknowns`), and a rebuild from the five known fields silently ate
 * an `! weight: 3` the reader never pointed at. A block patch respells the
 * whole block, so anything the rebuild forgets is anything the author loses:
 * the two cardinalities and the kind would come back as the serializer's
 * reading of a half-built record and quietly restate the schema, and the
 * escapes would simply be gone. Spreading carries all of it; `delete` is what
 * a spread cannot do on its own, and an emptied box needs it.
 */
export function revisedErRelationshipEdit(
  doc: ViewDocument,
  sourceText: string,
  index: number,
  revision: ErRelationshipRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "er") {
    return null;
  }
  const relationships = doc.file.relationships ?? [];
  const current = relationships[index];
  if (current === undefined) return null;

  const { label } = revision;
  const trimmed = label === undefined ? "" : label.trim();
  const revised: ErRelationship = { ...current };
  /* An EMPTIED box strips the `: label` from the line rather than writing
     `: ""`, which the parser refuses and the serializer throws on. Absent is
     a real state here — an unlabelled join is a choice in a dense diagram
     (`ErRelationship.label`) — so this is a removal, not a defaulting. */
  if (trimmed === "") delete revised.label;
  else revised.label = trimmed;

  const edited: ErLabFile = {
    ...doc.file,
    relationships: relationships.map((relationship, at) =>
      at === index ? revised : relationship,
    ),
  };

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const span = patchable.spans.relationships[index];
  const lines = canonicalErRelationshipBlock(edited, index);
  if (span === undefined || lines === null) return null;

  const patched = applyPatches(sourceText, [{ span, lines }]);
  /* A form submitted with nothing changed in it: no text change, no undo
     entry, no re-render — the same answer `patchOne` gives a drag that landed
     where it began. */
  if (patched === sourceText) return null;
  return adopt(doc, patched);
}

/* -------------------------------------------------------------------------- */
/* Move                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one entity placed at `position`, or `null` when the edit cannot
 * apply.
 *
 * COORDINATES ARE ROUNDED, because a drag produces sub-pixel floats and a
 * `.alab` file is something a human reads and diffs. `240.00000000000003` in
 * an author's text is noise this gesture created, and no layout can tell the
 * difference.
 *
 * AND DELIBERATELY NOT CLAMPED. `layoutEr` reports the rectangle the drawing
 * occupies and every surface takes its viewBox from it, so a negative
 * coordinate is a place on the canvas rather than a place off it. Clamping at
 * the origin was the mistake ADR 0002 had to amend for the flowchart, where it
 * made a whole half of the canvas undroppable.
 */
export function movedErEntityEdit(
  doc: ViewDocument,
  sourceText: string,
  entityId: string,
  position: { x: number; y: number },
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "er") {
    return null;
  }
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const current = doc.file.entities.find((entity) => entity.id === entityId);
  if (current === undefined) return null;

  const at = { x: Math.round(position.x), y: Math.round(position.y) };
  return patchOne(doc, sourceText, entityId, (entity) => ({
    ...entity,
    position: at,
  }));
}

/* -------------------------------------------------------------------------- */
/* Pin                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one entity's pin set or cleared, or `null` when the edit cannot
 * apply.
 *
 * PINNING REQUIRES A POSITION TO KEEP. `pin` on an entity that states no
 * `(x,y)` is a parse error (see `src/types/er.ts`), so this refuses rather
 * than writing text its own parser rejects — the guard is here as well as in
 * the grammar because a gesture that trusts its input is unguarded the day
 * something else calls it.
 *
 * CLEARING REMOVES THE KEY rather than writing `pin=false`, and this is NOT
 * the numbering-toggle bug `canvas-editing.md` records. That bug mattered
 * because `autonumber` absent and `autonumber false` are different DOCUMENTS:
 * absent means "the grammar's default", false means "explicitly off", and the
 * two rendered differently. Here they do not differ to any consumer — the
 * sweep asks `pinned !== true`, so absent and `false` are one answer — and
 * absent is the normal case, so normalising to it keeps the file thin instead
 * of accreting a token that changes nothing. The SERIALIZER still writes an
 * author's `pin=false` out, because open-change-nothing-save must be
 * byte-identical; that is a different question from what a deliberate toggle
 * should write, and both answers are asserted.
 */
export function pinnedErEntityEdit(
  doc: ViewDocument,
  sourceText: string,
  entityId: string,
  pinned: boolean,
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "er") {
    return null;
  }
  const current = doc.file.entities.find((entity) => entity.id === entityId);
  if (current === undefined) return null;
  if (pinned && current.position === undefined) return null;

  return patchOne(doc, sourceText, entityId, (entity) => {
    if (pinned) return { ...entity, pinned: true };
    /* Spread then `delete`, the shape `releasedNode` uses for the same job on
       a C4 node: it drops the key rather than setting it to a value, which is
       what "absent" has to be for the serializer to omit the token. */
    const next = { ...entity };
    delete next.pinned;
    return next;
  });
}

/* -------------------------------------------------------------------------- */
/* Release                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one entity handed back to the layout — its `(x,y)` and its `pin`
 * both gone — or `null` when there was nothing to release.
 *
 * BOTH KEYS, ALWAYS. A `pin` with no position is a parse error, so releasing
 * the position and leaving the pin would write a document this file's own
 * parser refuses.
 *
 * A PINNED ENTITY IS RELEASED BY THIS, on purpose. The pin exempts an entity
 * from the SWEEP, not from the author: pointing at one thing and asking for it
 * to be placed is a direct request, and a control that silently did nothing
 * would be the C4 `pinned` lie in a new place.
 */
export function resetErEntityPositionEdit(
  doc: ViewDocument,
  sourceText: string,
  entityId: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "er") {
    return null;
  }
  const current = doc.file.entities.find((entity) => entity.id === entityId);
  if (current === undefined || current.position === undefined) return null;

  return patchOne(doc, sourceText, entityId, (entity) => {
    const next = { ...entity };
    delete next.position;
    delete next.pinned;
    return next;
  });
}

/**
 * `doc` with every releasable entity handed back to the layout, or `null` when
 * there is nothing to release.
 *
 * WHAT "RELEASABLE" MEANS: it states a position and it is not pinned. Read off
 * the source's own answer — `position !== undefined` — rather than by
 * comparing coordinates against the solved layout. Those are different
 * questions with different answers, and answering the first with the second is
 * what once left a hand-placed C4 diagram silently unmovable.
 *
 * ALL OR NOTHING. A partial patch would leave the pane holding a document that
 * disagrees with the model this returns — half the diagram released in the
 * text, all of it released on the canvas.
 */
export function resetErPositionsEdit(
  doc: ViewDocument,
  sourceText: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "er") {
    return null;
  }
  /* THE RULE LIVES IN `placement.ts`, not here and not in the sibling
     module: three callers asked it and three spelled it. Its own note carries
     why it is token presence rather than a comparison. */
  const releasable = doc.file.entities.filter(isReleasable);
  if (releasable.length === 0) return null;

  const released = new Set(releasable.map((entity) => entity.id));
  const edited: ErLabFile = {
    ...doc.file,
    entities: doc.file.entities.map((entity) => {
      if (!released.has(entity.id)) return entity;
      const next = { ...entity };
      delete next.position;
      delete next.pinned;
      return next;
    }),
  };

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const patches: LinePatch[] = [];
  for (const id of released) {
    const span = patchable.spans.entities.get(id);
    const lines = canonicalErEntityBlock(edited, id);
    if (span === undefined || lines === null) return null;
    patches.push({ span, lines });
  }
  if (patches.length !== released.size) return null;
  const patched = applyPatches(sourceText, patches);
  if (patched === sourceText) return null;
  return adopt(doc, patched);
}

/* -------------------------------------------------------------------------- */
/* The splice                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether `sourceText` can be patched by line number for the document on
 * screen, and — when it can — the spans that parse produced.
 *
 * TWO THINGS FORCE A REFUSAL. A pane holding Mermaid has no `.alab` line
 * numbers to splice into at all. And THE PANE AND THE CANVAS CAN DISAGREE: an
 * edit is reachable while the pane holds text that does not parse — the canvas
 * keeps showing the last good version — and the keystroke debounce can leave a
 * change un-parsed for a moment. The pane's line numbers then describe a
 * different document, and splicing into it would corrupt the reader's file
 * rather than preserve it. Agreement is MEASURED, by re-serialising both sides
 * to the same canonical bytes, rather than read off a flag that could lie.
 */
function patchablePane(
  doc: ErDocument,
  sourceText: string,
): { spans: ErSpans } | null {
  if (doc.format !== "alab") return null;
  try {
    const parsed = parseErTextWithSpans(sourceText);
    if (serializeErText(parsed.file) !== serializeErText(doc.file)) return null;
    return { spans: parsed.spans };
  } catch {
    return null;
  }
}

/**
 * One entity rewritten in place: find its span, ask the serializer for its
 * canonical block, splice.
 *
 * NO `pad` IS READ, unlike the flowchart's equivalent. The parser pins an ER
 * entity to one indentation — entities do not nest — so
 * `canonicalErEntityBlock` takes no pad and there is nothing here to get
 * wrong. Its own doc comment carries the argument.
 *
 * Returns `null` — never a re-emit — for every case that cannot be patched,
 * including a press that landed where it began: no text change, no undo
 * entry, no re-render.
 */
function patchOne(
  doc: ErDocument,
  sourceText: string,
  entityId: string,
  revise: (entity: ErEntity) => ErEntity,
): CanvasEdit | null {
  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const span = patchable.spans.entities.get(entityId);
  if (span === undefined) return null;

  const edited: ErLabFile = {
    ...doc.file,
    entities: doc.file.entities.map((entity) =>
      entity.id === entityId ? revise(entity) : entity,
    ),
  };
  const lines = canonicalErEntityBlock(edited, entityId);
  if (lines === null) return null;

  const patched = applyPatches(sourceText, [{ span, lines }]);
  if (patched === sourceText) return null;
  return adopt(doc, patched);
}

/**
 * The patched text, re-parsed, as the new authority — a rendering of the text
 * rather than a model assembled beside it. `null` when the result will not
 * parse: that is a bug in this module rather than input to explain, and
 * dropping the edit beats replacing the reader's document with an error they
 * cannot act on.
 */
function adopt(doc: ErDocument, patched: string): CanvasEdit | null {
  const parsed = parseErInput(patched);
  if (parsed.status !== "ok" || parsed.value.format !== "alab") return null;
  return {
    doc: { kind: "er", format: doc.format, file: parsed.value.file },
    text: patched,
    path: "patch",
  };
}
