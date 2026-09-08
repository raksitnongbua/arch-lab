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
 * AN ENTITY IS ADDRESSED BY ID, which the parser proves unique per file, so
 * none of the index-addressing the flowchart needs for its edges applies here.
 */

import type { ErEntity, ErLabFile } from "@/types";

import {
  canonicalErEntityBlock,
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
