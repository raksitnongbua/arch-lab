/**
 * Sequence-canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The sibling of `canvas-edit.ts` for the other editable canvas. Same three
 * rules, and they are the reason both files exist rather than one:
 *
 *   - THE ONE MODEL RULE. The page holds exactly one authority for what is on
 *     screen — the `ViewDocument` from the last good parse — and the source
 *     pane is its text. An edit here mutates nothing: it derives a NEW source
 *     text, re-parses it, and hands both back for the page to adopt through
 *     the path a keystroke already takes. No React, no state.
 *   - AN EDIT IS A LINE PATCH. `line-patch.ts` carries the bug that bought
 *     that rule and the splice that keeps it.
 *   - PURITY IS LOAD-BEARING. `check:sequence` loads this through Node's type
 *     stripping, which cannot read `.tsx`. Keep new imports pointed at pure
 *     modules.
 *
 * WHAT IS DIFFERENT FROM THE C4 CANVAS, and why this is not one file with a
 * flag:
 *
 *   1. THERE IS NO GEOMETRY TO EDIT. `src/types/sequence.ts` has no position
 *      field at all — a participant's column is its index in `participants`
 *      and a message's time is its index in `items`. So the gestures are not
 *      "move" and "delete" but "revise" (rewrite one element's own wording)
 *      and "insert" (add one message). `canvasEditability(doc, "revise")`
 *      answers for these; the same function defaulting to `"move"` still
 *      refuses every sequence document, which is correct and unchanged.
 *   2. AN ELEMENT IS ADDRESSED BY PATH, NOT BY ID. Items have no ids; position
 *      is identity (`SequenceItemPath`). Turning what the reader clicked into
 *      such a path is its own problem, solved in `sequence/lib/address.ts`.
 *   3. A PATCH IS A BLOCK, NOT A LINE. A C4 move rewrites one declaration
 *      line because a position can only appear there. These gestures change
 *      `desc`, which is a CONTINUATION line an edit may add, replace or
 *      remove, so the unit is the element's whole block.
 *   4. THERE IS NO RE-EMIT FALLBACK, and this is the sharpest difference. The
 *      C4 canvas re-emits when the pane holds arch-lab JSON, which has no
 *      comments to lose. A sequence document has no JSON pane, so every case
 *      where the patch cannot be made is a case where re-emitting would eat
 *      the reader's comments and blank lines for nothing. Those cases REFUSE
 *      instead — every edit here reports `path: "patch"` or returns `null`,
 *      and `check:sequence` pins that there is no third outcome.
 *
 * FOUR HAZARDS THE INSERT MUST NOT MAKE WORSE, all of them pre-existing and
 * none of them this gesture's to fix. Activation `+`/`-` is unpaired and
 * unvalidated; `autonumber` renumbers positionally; a note attaches by text
 * position rather than by id; and `updated`, `:participant` and
 * `autonumber false` are omitted at their defaults. Every one of them is safe
 * for the same single reason: an insert adds EXACTLY ONE LINE and renormalises
 * nothing. A whole-document re-emit would have disturbed all four.
 */

import type {
  SequenceItemPath,
  SequenceLabFile,
  SequenceMessage,
  SequenceMessageKind,
  SequenceParticipant,
} from "@/types";
import { sequenceItemAt, sequenceItemKey } from "@/types";
import type {
  SequenceMessageRevision,
  SequenceParticipantRevision,
} from "@/types";

import {
  canonicalMessageBlock,
  canonicalParticipantBlock,
  parseSequenceTextWithSpans,
  serializeSequenceText,
  type SequenceSpans,
} from "@/features/archtext";
/* PAST THE BARREL, deliberately, and for the same reason its sibling
   `input/parse.ts` states at length: `@/features/sequence` exports React
   components, and importing it here would drag a canvas into a module that
   `check:sequence` loads through type stripping, which cannot read `.tsx` at
   all. The input layer below is pure by construction. */
import { parseSequenceInput } from "@/features/sequence/input/parse";

import { canvasEditability } from "./canvas-edit";
import {
  applyPatches,
  indentOf,
  type CanvasEdit,
  type LinePatch,
} from "./line-patch";
import type { ViewDocument } from "./parse";

type SequenceDocument = Extract<ViewDocument, { kind: "sequence" }>;

/**
 * The indentation of a ROOT-level item. The `.alab` sequence grammar fixes the
 * body at two spaces — the parser's root context is `itemIndent: 2` and
 * `serializeSequenceText` emits root items at `"  ".repeat(1)` — so an append
 * with no sibling to copy has exactly one legal answer. Named rather than
 * inlined because the two halves of that agreement are in different files;
 * `check:sequence` measures it off a real parse rather than trusting this
 * comment.
 */
const ROOT_ITEM_INDENT = "  ";

/**
 * The label a two-click insert gives its new message.
 *
 * NOT the empty string, which the model permits. An unlabelled arrow draws as
 * a bare line with nothing on it, so the reader would complete the gesture and
 * see something they cannot name, cannot find in the source and cannot tell
 * from a rendering glitch. A placeholder is a thing you can see you have to
 * change — and the caller opens the dock on it so changing it is the next
 * keystroke.
 */
export const INSERTED_MESSAGE_LABEL = "New message";

/** The kind a two-click insert gives its new message: the ordinary call. */
export const INSERTED_MESSAGE_KIND: SequenceMessageKind = "sync";

/* The two revision shapes live in `@/types` beside the model they are a subset
   of, not here beside the gesture that applies them: the sequence VIEWER
   declares the callbacks that carry them, and it must not import from this
   feature — the repo's import layering runs editor → viewer → sequence, and
   the playground consumes all three. `src/types/` is the neutral ground both
   sides already share. */

/* -------------------------------------------------------------------------- */
/* The edits                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `doc` with one message's wording rewritten, or `null` when the edit cannot
 * apply — a document that refuses `"revise"`, a pane that cannot be patched, a
 * path that lands on no message, or a revision that changes nothing.
 *
 * `null` FOR AN UNCHANGED REVISION keeps "one text change per commit" true for
 * a form submitted without an edit in it: rewriting the pane with identical
 * text would still cost the reader an undo entry and a re-render.
 */
export function revisedMessageEdit(
  doc: ViewDocument,
  sourceText: string,
  path: SequenceItemPath,
  revision: SequenceMessageRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  const current = sequenceItemAt(doc.file.items, path);
  if (current === undefined || current.step !== "message") return null;

  /* DESTRUCTURED, not spread from `revision` directly, and the difference is
     the whole "whole value" contract: `{ ...current, ...revision }` cannot
     REMOVE a field, because an optional key the caller omitted is simply not
     in the spread and `current`'s value survives. Naming the four makes every
     one of them present as a variable, `undefined` included, which is what
     OVERWRITES the value the reader cleared. This destructure and
     `SequenceMessageRevision` are one unit — a field added there needs a name
     here or it will be silently ignored.
     An explicit `undefined` is enough to remove the field, and the reason is
     in the serializer, not here: `emitMessage` writes each optional field only
     for a value of the right type and routes any OTHER present value to a `!`
     escape — and `undefined` satisfies neither branch, so the field is simply
     not written. That coupling is the thing worth knowing about this line;
     `check:sequence` pins it from the outside ("clearing technology and
     details removes the fields, never blanks them"), which is what would fail
     if the serializer ever started emitting an escape for `undefined`. */
  const { label, kind, technology, description } = revision;
  const edited = replaceItem(doc.file, path, {
    ...current,
    label,
    kind,
    technology,
    description,
  });
  return patchBlock(doc, sourceText, edited, (spans, pad) => ({
    span: spans.items.get(sequenceItemKey(path)),
    lines: canonicalMessageBlock(edited, path, pad),
  }));
}

/**
 * `doc` with one participant's wording rewritten, or `null` on the same four
 * refusals `revisedMessageEdit` documents.
 */
export function revisedParticipantEdit(
  doc: ViewDocument,
  sourceText: string,
  participantId: string,
  revision: SequenceParticipantRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  const current = doc.file.participants.find((p) => p.id === participantId);
  if (current === undefined) return null;

  // Same destructure-and-overwrite contract as `revisedMessageEdit`; see there
  // for why an explicit `undefined` is what removes a field.
  const { name, kind, technology, description } = revision;
  const revised: SequenceParticipant = {
    ...current,
    name,
    kind,
    technology,
    description,
  };
  const edited: SequenceLabFile = {
    ...doc.file,
    participants: doc.file.participants.map((p) =>
      p.id === participantId ? revised : p,
    ),
  };
  return patchBlock(doc, sourceText, edited, (spans, pad) => ({
    span: spans.participants.get(participantId),
    lines: canonicalParticipantBlock(edited, participantId, pad),
  }));
}

/**
 * `doc` with one message inserted, or `null` when the edit cannot apply.
 *
 * `after` is the address the new message follows — the focused step's path,
 * which puts the new message in the SAME branch as the message the reader was
 * looking at, at whatever fragment depth that is. `null` appends to the end of
 * the root body, which is what "nothing is focused" means.
 *
 * EXACTLY ONE LINE IS ADDED and nothing else is touched, which is what keeps
 * the four hazards in this file's header from getting worse. The new message
 * carries no `desc` and no `[technology]`, so its canonical block is one line
 * by construction rather than by a rule this function has to remember.
 *
 * WHY THE ANCHOR'S INDENT AND NOT A COMPUTED DEPTH: a message's indentation IS
 * its fragment depth, and the anchor line is the one source that cannot be
 * wrong about which fragment the reader was looking inside. Deriving the depth
 * from the path instead would be a second reading of the tree's shape, free to
 * disagree with the text.
 */
export function insertedMessageEdit(
  doc: ViewDocument,
  sourceText: string,
  after: SequenceItemPath | null,
  from: string,
  to: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  const byId = new Set(doc.file.participants.map((p) => p.id));
  // An endpoint that is not a declared participant makes a document the parser
  // refuses ("does not resolve to a participant"), so the reader would press
  // twice and get an error over a diagram they could no longer edit.
  if (!byId.has(from) || !byId.has(to)) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;

  const message: SequenceMessage = {
    step: "message",
    from,
    to,
    kind: INSERTED_MESSAGE_KIND,
    label: INSERTED_MESSAGE_LABEL,
  };

  const placed = placeAfter(doc.file, patchable.spans, after, sourceText);
  if (placed === null) return null;

  const edited = insertItem(doc.file, placed.path, message);
  const lines = canonicalMessageBlock(edited, placed.path, placed.pad);
  if (lines === null || lines.length !== 1) return null;

  return adopt(
    doc,
    applyPatches(sourceText, [
      // An empty span at `afterLine + 1`: the copy loop stops after
      // `afterLine`, the new line goes in, and nothing is consumed.
      { span: { start: placed.afterLine + 1, end: placed.afterLine }, lines },
    ]),
  );
}

/** Where a new message goes — in the model, and in the text. */
interface Placement {
  path: SequenceItemPath;
  /** 1-based source line the new line is written after. */
  afterLine: number;
  pad: string;
}

function placeAfter(
  file: SequenceLabFile,
  spans: SequenceSpans,
  after: SequenceItemPath | null,
  sourceText: string,
): Placement | null {
  const lines = sourceText.split("\n");
  if (after === null) {
    /* APPENDED AFTER THE LAST THING THE PARSER SAW, not at the last line of
       the file. A file may end in comments or blank lines the author put there
       on purpose, and pushing a message past them would reorder their prose
       relative to the diagram it annotates. Derived from the span map rather
       than by scanning for content, so it cannot disagree with the parse. */
    const ends = [
      ...[...spans.participants.values()].map((span) => span.end),
      ...[...spans.items.values()].map((span) => span.end),
    ];
    if (ends.length === 0) return null;
    const root = file.items.length;
    return {
      path: [root],
      afterLine: Math.max(...ends),
      /* A root sibling's own indent when the document has one, so an appended
         message matches the file it joins; the grammar's fixed body indent
         otherwise. */
      pad:
        root > 0
          ? indentOf(
              lines[
                (spans.items.get(sequenceItemKey([root - 1]))?.end ?? 1) - 1
              ],
            )
          : ROOT_ITEM_INDENT,
    };
  }

  const anchor = spans.items.get(sequenceItemKey(after));
  if (anchor === undefined) return null;
  if (sequenceItemAt(file.items, after) === undefined) return null;
  const sibling = [...after];
  sibling[sibling.length - 1] += 1;
  return {
    path: sibling,
    afterLine: anchor.end,
    pad: indentOf(lines[anchor.start - 1]),
  };
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `file` with the item at `path` replaced. Rebuilds only the branches on the
 * path — every other item stays the SAME object, which is what
 * `sequence/lib/address.ts` resolves a fold against.
 */
function replaceItem(
  file: SequenceLabFile,
  path: SequenceItemPath,
  next: SequenceMessage,
): SequenceLabFile {
  return { ...file, items: spliceAt(file.items, path, () => [next]) };
}

/** `file` with `message` inserted at `path`, same structural sharing. */
function insertItem(
  file: SequenceLabFile,
  path: SequenceItemPath,
  message: SequenceMessage,
): SequenceLabFile {
  return {
    ...file,
    items: spliceAt(file.items, path, (existing) =>
      existing === undefined ? [message] : [message, existing],
    ),
  };
}

/**
 * The one tree walk both edits share: descend `path`, then replace the item it
 * lands on with whatever `edit` returns for it (`undefined` when the index is
 * one past the end, which is how an append reaches this).
 */
function spliceAt(
  items: readonly SequenceLabFile["items"][number][],
  path: SequenceItemPath,
  edit: (
    existing: SequenceLabFile["items"][number] | undefined,
  ) => SequenceLabFile["items"][number][],
): SequenceLabFile["items"] {
  const [index, branchIndex, ...rest] = path;
  if (path.length === 1) {
    const out = [...items];
    out.splice(
      index,
      items[index] === undefined ? 0 : 1,
      ...edit(items[index]),
    );
    return out;
  }
  const fragment = items[index];
  if (fragment === undefined || fragment.step !== "fragment") return [...items];
  const branch = fragment.branches[branchIndex];
  if (branch === undefined) return [...items];
  return items.map((item, at) =>
    at !== index
      ? item
      : {
          ...fragment,
          branches: fragment.branches.map((candidate, branchAt) =>
            branchAt !== branchIndex
              ? candidate
              : { ...candidate, items: spliceAt(branch.items, rest, edit) },
          ),
        },
  );
}

/**
 * Whether `sourceText` can be patched by line number for the document on
 * screen, and — when it can — the parse the spans belong to.
 *
 * ONE THING FORCES A REFUSAL, and it is the second of the two conditions
 * `canvas-edit.ts` names (the first, a pane holding JSON, has no sequence
 * equivalent). THE PANE AND THE CANVAS DISAGREE: an edit is reachable while
 * the pane holds text that does not parse — the canvas keeps showing the last
 * good version — and the keystroke debounce can leave a change un-parsed for a
 * moment. The pane's line numbers then describe a document that is not the one
 * on screen, and splicing into it would corrupt the reader's file rather than
 * preserve it. Agreement is MEASURED, by re-serialising both sides to the same
 * canonical bytes, rather than read off a flag that could lie.
 */
function patchablePane(
  doc: SequenceDocument,
  sourceText: string,
): { spans: SequenceSpans } | null {
  if (doc.format !== "alab") return null;
  try {
    const parsed = parseSequenceTextWithSpans(sourceText);
    if (
      serializeSequenceText(parsed.file) !== serializeSequenceText(doc.file)
    ) {
      return null;
    }
    return { spans: parsed.spans };
  } catch {
    return null;
  }
}

/**
 * The shape both revise gestures share: find the element's span, ask the
 * serializer for its canonical block at that span's own indentation, splice.
 *
 * Returns `null` — not a re-emit — for every case that cannot be patched. See
 * point 4 of this file's header.
 */
function patchBlock(
  doc: SequenceDocument,
  sourceText: string,
  edited: SequenceLabFile,
  resolve: (
    spans: SequenceSpans,
    pad: string,
  ) => {
    span: { start: number; end: number } | undefined;
    lines: string[] | null;
  },
): CanvasEdit | null {
  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const lines = sourceText.split("\n");

  /* The span is resolved twice on purpose: once with an empty pad to LOCATE
     the block, then again with the pad read off its first line to write it.
     Two calls beat threading the pad in from the caller, which would put the
     indentation rule in two places. */
  const located = resolve(patchable.spans, "");
  if (located.span === undefined) return null;
  const pad = indentOf(lines[located.span.start - 1]);
  const written = resolve(patchable.spans, pad);
  if (written.lines === null) return null;

  const patch: LinePatch = { span: located.span, lines: written.lines };
  const patched = applyPatches(sourceText, [patch]);
  // A form submitted with nothing changed in it: no text change, no undo
  // entry, no re-render.
  if (patched === sourceText) return null;
  return adopt(doc, patched);
}

/**
 * Read `patched` back through the REAL pane parser, so the adopted document's
 * model comes from the parser rather than from this module's idea of what the
 * edit did.
 *
 * The re-parse is the point, not overhead: it is what makes the text the
 * authority rather than a rendering of it. `null` when the result will not
 * parse — that is a bug in this module rather than input to explain, and
 * dropping the edit beats replacing the reader's document with an error they
 * cannot act on.
 *
 * `path` is always `"patch"`. There is no other outcome; see point 4 of the
 * header.
 */
function adopt(doc: SequenceDocument, patched: string): CanvasEdit | null {
  const parsed = parseSequenceInput(patched);
  if (parsed.status !== "ok" || parsed.value.format !== "alab") return null;
  return {
    doc: { kind: "sequence", format: doc.format, file: parsed.value.file },
    text: patched,
    path: "patch",
  };
}
