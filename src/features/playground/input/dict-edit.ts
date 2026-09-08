/**
 * Data-dictionary canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The fourth sibling of `canvas-edit.ts` (C4), `sequence-edit.ts` and
 * `flowchart-edit.ts`. The same three rules hold, and they are why this is a
 * fourth file rather than a flag in one of the other three:
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
 *     pure modules — `src/features/dict/index.ts` records that headless
 *     callers deep-import `./input/parse` for exactly this reason.
 *
 * WHAT IS DIFFERENT HERE: EVERY GESTURE IN THIS FILE IS A REORDER, and there
 * is no other kind.
 *
 *   1. THERE IS NO MOVE, AND THERE WILL NOT BE ONE. A dictionary is a flat
 *      SVG table, and `layoutDict` solves the column widths ONCE across the
 *      whole document so that two sections share one grid — which is what
 *      lets a reader scan one against the other. A per-section `(x,y)` would
 *      dissolve that grid, so the grammar carries no coordinate and the
 *      `move` cell refuses on `"grammar"` grounds permanently. Do not read
 *      the gestures below as a step towards one.
 *   2. SO A REORDER RIDES UNDER `revise`, which is the call
 *      `canvas-editing.md` makes for exactly this shape: "if your notation's
 *      drag would take a neighbour's slot rather than land at a point, you are
 *      describing `revise`, not `move`." Order already IS the text here — a
 *      section's place is its position in the file, a field's place is its
 *      position inside its section — so a reorder needs NO format change. It
 *      needs only the spans (`DictSpans`) and the canonical blocks.
 *   3. A REORDER IS A SWAP OF TWO BLOCKS, never a rewrite of the run between
 *      them. The two spans are handed to `applyPatches` together, which sorts
 *      them, so every comment and blank line the author put BETWEEN the two
 *      blocks stays exactly where it was. Lifting a block out and re-inserting
 *      it elsewhere was the obvious alternative and is worse: it would drag
 *      the author's trailing comment along with whichever block it happened to
 *      follow, and nothing in a span says which block a comment belongs to.
 *   4. NOTHING IS ADDED OR REMOVED, which is the property the check pins as a
 *      permutation: the same sections, each with the same fields, in a
 *      different order. A dictionary reorder cannot leave a document the
 *      parser refuses the way a removal can, because it writes no line the
 *      document did not already hold.
 */

import type { DictLabFile } from "@/types";

import {
  canonicalDictFieldBlock,
  canonicalDictSectionBlock,
  parseDictTextWithSpans,
  serializeDictText,
  type DictSpans,
  type LineSpan,
} from "@/features/archtext";
// A deep import, but a PURE one — `input/parse.ts` in that feature exports no
// component, so this module stays loadable by the check script's type
// stripping. The barrel would not be.
import { parseDictInput } from "@/features/dict/input/parse";

import { canvasEditability } from "./canvas-edit";
import { applyPatches, type CanvasEdit } from "./line-patch";
import type { ViewDocument } from "./parse";

type DictDocument = Extract<ViewDocument, { kind: "dict" }>;

/** Which way a block trades places with its neighbour. Named for the READING
 * ORDER rather than for the screen ("up" / "left"), because that is what the
 * text records and the table is drawn top to bottom in one column. */
export type DictReorderDirection = "earlier" | "later";

/** What a reorder addresses. A field names its section as well as itself: a
 * field name is unique inside its section but not across the file, which is
 * the same argument `DictSpans` makes for nesting its map. */
export type DictReorderTarget =
  | { kind: "section"; sectionLabel: string }
  | { kind: "field"; sectionLabel: string; fieldName: string };

/**
 * Why this reorder cannot happen, or `null` when it can.
 *
 * Exported so the canvas can grey the handle and show the sentence BEFORE the
 * reader drags, rather than after a drag that changes nothing — the same job
 * `flowGroupRefusal` does on the flowchart side.
 *
 * THE END-OF-THE-RUN CASE IS A REFUSAL, NOT A WRAP. Moving the first section
 * earlier could be made to mean "send it to the bottom", and that would be a
 * gesture nobody asked for firing on an overshoot: the reader is pushing
 * against a wall and expects the wall.
 */
export function dictReorderRefusal(
  file: DictLabFile,
  target: DictReorderTarget,
  direction: DictReorderDirection,
): string | null {
  const run = reorderRun(file, target);
  if (run === null) {
    return target.kind === "section"
      ? `${quoted(target.sectionLabel)} is not in this dictionary any more.`
      : `${quoted(target.fieldName)} is not in ${quoted(target.sectionLabel)} any more.`;
  }
  const { names, at } = run;
  const neighbour = at + (direction === "earlier" ? -1 : 1);
  if (neighbour < 0 || neighbour >= names.length) {
    const edge = direction === "earlier" ? "first" : "last";
    return target.kind === "section"
      ? `${quoted(target.sectionLabel)} is already the ${edge} section.`
      : /* A field's refusal says where the wall comes from, because the
           obvious next attempt is to drag it into the section next door — and
           that is unspellable rather than merely refused: nesting is what puts
           a field in a section, so a field outside one has no place to be. */
        `${quoted(target.fieldName)} is already the ${edge} field in ${quoted(target.sectionLabel)}, and a field only reorders inside its own section — its section is what declares it.`;
  }
  return null;
}

/**
 * `doc` with one section trading places with its neighbour, or `null` when the
 * edit cannot apply.
 *
 * THE SECTION CARRIES ITS FIELDS, because `canonicalDictSectionBlock` writes
 * them and `DictSpans` covers them: a heading that moved alone would land
 * above rows it does not introduce, which is a document the parser still reads
 * and a table that lies.
 */
export function reorderedDictSectionEdit(
  doc: ViewDocument,
  sourceText: string,
  sectionLabel: string,
  direction: DictReorderDirection,
): CanvasEdit | null {
  /* ASKED HERE RATHER THAN TRUSTED FROM THE CALLER, which is the rule every
     gesture in these four modules follows: a gesture that trusts its caller is
     unguarded the day somebody points it at another notation. `revise` is the
     ability that answers for a reorder — see this file's header. */
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "dict") {
    return null;
  }
  const target: DictReorderTarget = { kind: "section", sectionLabel };
  if (dictReorderRefusal(doc.file, target, direction) !== null) return null;

  const run = reorderRun(doc.file, target);
  if (run === null) return null;
  const otherLabel = run.names[run.at + (direction === "earlier" ? -1 : 1)];

  return swap(doc, sourceText, (spans, file) => [
    {
      span: spans.sections.get(sectionLabel),
      lines: canonicalDictSectionBlock(file, sectionLabel),
    },
    {
      span: spans.sections.get(otherLabel),
      lines: canonicalDictSectionBlock(file, otherLabel),
    },
  ]);
}

/**
 * `doc` with one field trading places with its neighbour INSIDE its own
 * section, or `null` when the edit cannot apply.
 *
 * IT CANNOT CROSS A SECTION BOUNDARY, and that is enforced by the addressing
 * rather than by a check: both ends are resolved out of one section's field
 * map and one section's field array, so there is no expressible gesture that
 * names a field in one section and a slot in another.
 */
export function reorderedDictFieldEdit(
  doc: ViewDocument,
  sourceText: string,
  sectionLabel: string,
  fieldName: string,
  direction: DictReorderDirection,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "dict") {
    return null;
  }
  const target: DictReorderTarget = { kind: "field", sectionLabel, fieldName };
  if (dictReorderRefusal(doc.file, target, direction) !== null) return null;

  const run = reorderRun(doc.file, target);
  if (run === null) return null;
  const otherName = run.names[run.at + (direction === "earlier" ? -1 : 1)];

  return swap(doc, sourceText, (spans, file) => {
    const inSection = spans.fields.get(sectionLabel);
    return [
      {
        span: inSection?.get(fieldName),
        lines: canonicalDictFieldBlock(file, sectionLabel, fieldName),
      },
      {
        span: inSection?.get(otherName),
        lines: canonicalDictFieldBlock(file, sectionLabel, otherName),
      },
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* The shared machinery                                                       */
/* -------------------------------------------------------------------------- */

/** A label or a name as the refusals quote it — the same curly quotes the
 * canvas copy uses, so a sentence read off a control matches one read in a
 * toast. */
const quoted = (text: string): string => `“${text}”`;

/**
 * The run a target reorders within, and where in it the target sits — the one
 * place the two gestures' bookkeeping lives, so "which is my neighbour" cannot
 * be answered one way by the refusal and another by the patch.
 *
 * `null` when the target is not in the document: a section that was renamed in
 * the pane, or a field the reader dragged and then deleted.
 */
function reorderRun(
  file: DictLabFile,
  target: DictReorderTarget,
): { names: readonly string[]; at: number } | null {
  if (target.kind === "section") {
    const names = file.sections.map((section) => section.label);
    const at = names.indexOf(target.sectionLabel);
    return at === -1 ? null : { names, at };
  }
  const section = file.sections.find(
    (candidate) => candidate.label === target.sectionLabel,
  );
  if (section === undefined) return null;
  const names = section.fields.map((field) => field.name);
  const at = names.indexOf(target.fieldName);
  return at === -1 ? null : { names, at };
}

/**
 * Whether `sourceText` can be patched by line number for the document on
 * screen, and — when it can — the spans that parse produced.
 *
 * THE PANE AND THE CANVAS CAN DISAGREE: an edit is reachable while the pane
 * holds text that does not parse — the canvas keeps showing the last good
 * version — and the keystroke debounce can leave a change un-parsed for a
 * moment. The pane's line numbers then describe a different document, and
 * splicing into it would corrupt the reader's file rather than preserve it.
 * Agreement is MEASURED, by re-serialising both sides to the same canonical
 * bytes, rather than read off a flag that could lie.
 *
 * There is no Mermaid fork to refuse here, unlike the three siblings: Mermaid
 * has no data dictionary, so `.alab` is the only pane this document has
 * (`features/dict/input/parse.ts` argues that). The format is still asserted,
 * because the check that it holds costs nothing and a second dialect arriving
 * silently is precisely how a splice would start writing into text with no
 * `.alab` line numbers in it.
 */
function patchablePane(
  doc: DictDocument,
  sourceText: string,
): { spans: DictSpans } | null {
  if (doc.format !== "alab") return null;
  try {
    const parsed = parseDictTextWithSpans(sourceText);
    if (serializeDictText(parsed.file) !== serializeDictText(doc.file)) {
      return null;
    }
    return { spans: parsed.spans };
  } catch {
    return null;
  }
}

/**
 * The shape both gestures share: locate two blocks, ask the serializer for
 * each one's canonical lines, and splice each into the OTHER's span.
 *
 * ONE SPLICE, TWO PATCHES. `applyPatches` sorts the pair and walks the source
 * once, so the two edits cannot disagree about line numbers and the caller
 * need not know which block comes first in the file. Neither block's own
 * indentation is read off the source, because neither helper takes a pad: the
 * parser pins a section to indent 2 and a field to indent 4, and a swap never
 * changes either depth.
 *
 * Returns `null` — never a re-emit — for every case that cannot be patched.
 */
function swap(
  doc: DictDocument,
  sourceText: string,
  resolve: (
    spans: DictSpans,
    file: DictLabFile,
  ) => readonly [
    { span: LineSpan | undefined; lines: string[] | null },
    { span: LineSpan | undefined; lines: string[] | null },
  ],
): CanvasEdit | null {
  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const [first, second] = resolve(patchable.spans, doc.file);
  if (first.span === undefined || second.span === undefined) return null;
  if (first.lines === null || second.lines === null) return null;

  const patched = applyPatches(sourceText, [
    { span: first.span, lines: second.lines },
    { span: second.span, lines: first.lines },
  ]);
  /* Two neighbours whose canonical blocks are byte-identical — legal text,
     since only a section's LABEL is unique and two fields in different
     sections may match line for line. Nothing changed, so there is no text
     change and no undo entry, exactly as `patchBlock` decides on the
     flowchart side. */
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
 */
function adopt(doc: DictDocument, patched: string): CanvasEdit | null {
  const parsed = parseDictInput(patched);
  if (parsed.status !== "ok") return null;
  return {
    doc: { kind: "dict", format: doc.format, file: parsed.value.file },
    text: patched,
    path: "patch",
  };
}
