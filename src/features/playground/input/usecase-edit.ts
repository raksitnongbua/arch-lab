/**
 * Use-case-canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The fifth sibling of `canvas-edit.ts` (C4), `sequence-edit.ts`,
 * `flowchart-edit.ts` and `er-edit.ts`. The three rules those files state hold
 * here unchanged — one model, a line patch never a re-emit, and purity so the
 * check scripts can load this through Node's type stripping.
 *
 * WHAT IS DIFFERENT FROM ITS NEAREST SIBLING, `er-edit.ts`:
 *
 *   1. AN ELEMENT'S INDENTATION VARIES. A use-case element sits at two spaces
 *      outside a boundary and four inside one, so
 *      `canonicalUseCaseElementBlock` takes the caller's pad and `patchOne`
 *      reads it off the block it is replacing. Re-deriving it from the model
 *      would mean re-walking the boundary membership, and getting that wrong
 *      moves an element out of its boundary on the first drag — which is the
 *      one failure here that a round trip cannot see.
 *   2. ONE GESTURE SERVES TWO SHAPES. An actor and a use case are one
 *      `UseCaseElement` with a `kind`, so a drag on a stick figure and a drag
 *      on an ellipse are the same edit. Nothing branches on `kind` in this
 *      file, and that is the model being right rather than an omission.
 *
 * Everything else — why absent is the normal case, why there is a way back
 * when the flowchart canvas still has none, and why `pin` ships with the sweep
 * that reads it — is argued in `er-edit.ts` and in ADR 0003. Read those rather
 * than re-deriving them from here.
 */

import type { UseCaseElement, UseCaseLabFile } from "@/types";

import {
  canonicalUseCaseElementBlock,
  parseUseCaseTextWithSpans,
  serializeUseCaseText,
  type UseCaseSpans,
} from "@/features/archtext";
// A deep import, but a PURE one — see the note in `er-edit.ts`.
import { parseUseCaseInput } from "@/features/usecase/input/parse";

import { canvasEditability } from "./canvas-edit";
import { isReleasable } from "./placement";
import {
  applyPatches,
  indentOf,
  type CanvasEdit,
  type LinePatch,
} from "./line-patch";
import type { ViewDocument } from "./parse";

type UseCaseDocument = Extract<ViewDocument, { kind: "usecase" }>;

/* -------------------------------------------------------------------------- */
/* Revise                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The fields a selected element's dock may rewrite.
 *
 * TWO FIELDS OF `UseCaseElement` ARE ABSENT, and that absence is the whole
 * content of this type — the shape `FlowNodeRevision` uses to keep `shape` out
 * of the flowchart's dock, for the same class of reason.
 *
 * `id` IS ABSENT because it is not this element's own wording: every
 * association, dependency and generalization line in the document names an
 * element by id, so retyping one is a GRAPH edit wearing a field edit's
 * clothes. A dock that offered it beside the label would let a reader detach
 * every line touching a symbol while believing they were correcting a slug —
 * and the patch is one block, so the edges would keep naming the old id and
 * the document would stop parsing. A rename that carried its edges is a
 * gesture of its own, with its own verdict about what it rewrites.
 *
 * `kind` IS ABSENT for the reason the flowchart refuses `shape`, doubled.
 * Turning an actor into a use case changes what its edges MEAN — an
 * association from an actor is a person using the system, and between two use
 * cases it is not the same statement — and it also moves the symbol from a
 * flanking column into the boundary, because `layoutUseCase` places actors
 * outside the system's edge and use cases inside it. So one dropdown would
 * rewrite both the diagram's meaning and half its geometry, a screen away from
 * the field the reader was typing in. It is shown read-only in the dock, so
 * the panel still says what the symbol is.
 *
 * REMOVAL IS NOT HERE EITHER, though `canvas-editing.md` puts it under
 * `revise`. Removing an element has to answer for the association and
 * dependency lines that name it: dropping them silently deletes statements the
 * author wrote a screen away from the press, and leaving them writes a
 * document the parser refuses ("does not resolve"). That verdict is a change
 * of its own rather than a branch of this one.
 */
export interface UseCaseElementRevision {
  label: string;
  technology?: string;
  tags?: string[];
  description?: string;
}

/**
 * `doc` with one element's own wording rewritten, or `null` when the edit
 * cannot apply.
 *
 * DESTRUCTURE AND OVERWRITE rather than spread the current element: an
 * explicit `undefined` in the revision is what REMOVES a field, so a dock
 * whose technology box has been cleared drops the `[…]` from the line instead
 * of leaving the old value behind. Spreading and overlaying would make a
 * cleared field indistinguishable from an untouched one.
 *
 * THE PLACEMENT KEYS ARE CARRIED EXPLICITLY, which is the one thing this
 * gesture must not get wrong: `position` and `pin` are not wording, and an
 * element rebuilt without them would be handed back to the solver by a reader
 * who retyped a caption — the release gesture running itself, unasked, from
 * the wrong control.
 */
export function revisedUseCaseElementEdit(
  doc: ViewDocument,
  sourceText: string,
  elementId: string,
  revision: UseCaseElementRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "usecase") {
    return null;
  }
  const current = doc.file.elements.find((element) => element.id === elementId);
  if (current === undefined) return null;

  const { label, technology, tags, description } = revision;
  /* An empty label is a document the parser refuses ("the element label must
     not be empty"), so a reader who cleared the box and pressed once would be
     left with an error over a diagram they could no longer edit. */
  if (label === "") return null;

  return patchOne(doc, sourceText, elementId, (element) => ({
    // Carried, never revised — see `UseCaseElementRevision`.
    id: element.id,
    kind: element.kind,
    label,
    ...(technology === undefined ? {} : { technology }),
    ...(tags === undefined || tags.length === 0 ? {} : { tags }),
    ...(description === undefined ? {} : { description }),
    ...(element.position === undefined ? {} : { position: element.position }),
    ...(element.pinned === undefined ? {} : { pinned: element.pinned }),
  }));
}

/* -------------------------------------------------------------------------- */
/* Move                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one element placed at `position`, or `null` when the edit cannot
 * apply. Rounded and deliberately not clamped, for the reasons
 * `movedErEntityEdit` states.
 */
export function movedUseCaseElementEdit(
  doc: ViewDocument,
  sourceText: string,
  elementId: string,
  position: { x: number; y: number },
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "usecase") {
    return null;
  }
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const current = doc.file.elements.find((element) => element.id === elementId);
  if (current === undefined) return null;

  const at = { x: Math.round(position.x), y: Math.round(position.y) };
  return patchOne(doc, sourceText, elementId, (element) => ({
    ...element,
    position: at,
  }));
}

/* -------------------------------------------------------------------------- */
/* Pin                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one element's pin set or cleared, or `null` when the edit cannot
 * apply. Pinning requires a position to keep, and clearing removes the key
 * rather than writing `pin=false` — `pinnedErEntityEdit` carries the argument
 * for both, including why the second is not the numbering-toggle bug.
 */
export function pinnedUseCaseElementEdit(
  doc: ViewDocument,
  sourceText: string,
  elementId: string,
  pinned: boolean,
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "usecase") {
    return null;
  }
  const current = doc.file.elements.find((element) => element.id === elementId);
  if (current === undefined) return null;
  if (pinned && current.position === undefined) return null;

  return patchOne(doc, sourceText, elementId, (element) => {
    if (pinned) return { ...element, pinned: true };
    /* Spread then `delete`, the shape `releasedNode` uses for the same job on
       a C4 node: it drops the key rather than setting it to a value, which is
       what "absent" has to be for the serializer to omit the token. */
    const next = { ...element };
    delete next.pinned;
    return next;
  });
}

/* -------------------------------------------------------------------------- */
/* Release                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one element handed back to the layout — its `(x,y)` and its `pin`
 * both gone — or `null` when there was nothing to release. Both keys always,
 * and a pinned element is released by this on purpose; see
 * `resetErEntityPositionEdit`.
 */
export function resetUseCaseElementPositionEdit(
  doc: ViewDocument,
  sourceText: string,
  elementId: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "usecase") {
    return null;
  }
  const current = doc.file.elements.find((element) => element.id === elementId);
  if (current === undefined || current.position === undefined) return null;

  return patchOne(doc, sourceText, elementId, (element) => {
    const next = { ...element };
    delete next.position;
    delete next.pinned;
    return next;
  });
}

/**
 * `doc` with every releasable element handed back to the layout, or `null`
 * when there is nothing to release. Releasable means "states a position and is
 * not pinned", read off the source's own answer; all or nothing, so the pane
 * and the canvas cannot disagree. `resetErPositionsEdit` carries both
 * arguments.
 */
export function resetUseCasePositionsEdit(
  doc: ViewDocument,
  sourceText: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "move").editable || doc.kind !== "usecase") {
    return null;
  }
  /* THE RULE LIVES IN `placement.ts`, not here and not in the sibling
     module: three callers asked it and three spelled it. Its own note carries
     why it is token presence rather than a comparison. */
  const releasable = doc.file.elements.filter(isReleasable);
  if (releasable.length === 0) return null;

  const released = new Set(releasable.map((element) => element.id));
  const edited: UseCaseLabFile = {
    ...doc.file,
    elements: doc.file.elements.map((element) => {
      if (!released.has(element.id)) return element;
      const next = { ...element };
      delete next.position;
      delete next.pinned;
      return next;
    }),
  };

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const lines = sourceText.split("\n");
  const patches: LinePatch[] = [];
  for (const id of released) {
    const span = patchable.spans.elements.get(id);
    if (span === undefined) return null;
    /* THE PAD IS PER ELEMENT, not per document: this sweep can touch an actor
       at two spaces and a use case inside a boundary at four in the same
       patch, so it is read off each block rather than once for the run. */
    const block = canonicalUseCaseElementBlock(
      edited,
      id,
      indentOf(lines[span.start - 1]),
    );
    if (block === null) return null;
    patches.push({ span, lines: block });
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
 * screen. Mermaid has no `.alab` line numbers, and the pane can hold text that
 * does not parse or has not been re-parsed yet — so agreement is MEASURED by
 * re-serialising both sides rather than read off a flag that could lie. The
 * full argument is in `er-edit.ts`.
 */
function patchablePane(
  doc: UseCaseDocument,
  sourceText: string,
): { spans: UseCaseSpans } | null {
  if (doc.format !== "alab") return null;
  try {
    const parsed = parseUseCaseTextWithSpans(sourceText);
    if (serializeUseCaseText(parsed.file) !== serializeUseCaseText(doc.file)) {
      return null;
    }
    return { spans: parsed.spans };
  } catch {
    return null;
  }
}

/**
 * One element rewritten in place: find its span, read the indentation off the
 * block being replaced, ask the serializer for its canonical block at that
 * indentation, splice.
 *
 * THE PAD IS READ, NEVER DERIVED. It is the only source that cannot be wrong
 * about boundary membership — the model alone cannot say whether an element
 * sits inside a boundary without re-walking it, and a wrong answer silently
 * moves the element out of the boundary it was written in.
 *
 * Returns `null` — never a re-emit — for every case that cannot be patched,
 * a press that landed where it began included.
 */
function patchOne(
  doc: UseCaseDocument,
  sourceText: string,
  elementId: string,
  revise: (element: UseCaseElement) => UseCaseElement,
): CanvasEdit | null {
  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const span = patchable.spans.elements.get(elementId);
  if (span === undefined) return null;

  const edited: UseCaseLabFile = {
    ...doc.file,
    elements: doc.file.elements.map((element) =>
      element.id === elementId ? revise(element) : element,
    ),
  };
  const sourceLines = sourceText.split("\n");
  const lines = canonicalUseCaseElementBlock(
    edited,
    elementId,
    indentOf(sourceLines[span.start - 1]),
  );
  if (lines === null) return null;

  const patched = applyPatches(sourceText, [{ span, lines }]);
  if (patched === sourceText) return null;
  return adopt(doc, patched);
}

/**
 * The patched text, re-parsed, as the new authority. `null` when the result
 * will not parse — a bug in this module rather than input to explain.
 */
function adopt(doc: UseCaseDocument, patched: string): CanvasEdit | null {
  const parsed = parseUseCaseInput(patched);
  if (parsed.status !== "ok" || parsed.value.format !== "alab") return null;
  return {
    doc: { kind: "usecase", format: doc.format, file: parsed.value.file },
    text: patched,
    path: "patch",
  };
}
