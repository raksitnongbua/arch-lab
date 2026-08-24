/**
 * Splicing whole LINES of the author's own source text — the mechanism both
 * editable canvases write their gestures through.
 *
 * WHY A CANVAS EDIT IS A LINE PATCH AND NOT A RE-EMIT. As shipped in v2.0.0 a
 * C4 drag derived a new model and serialised the WHOLE document. Canonical
 * `.alab` is a different file from the author's: both grammars' parsers drop
 * `//` comment lines and blank lines with no capture, so the serializer has
 * nothing to write back, and any field the author wrote out that canonical
 * form omits at its default is normalised away. One gesture on a commented
 * file therefore deleted every comment in it — silently, with the pane
 * changing as a gesture is supposed to make it.
 *
 * Touching only the lines the gesture is about fixes that by construction:
 * every byte outside the spliced span is still there because nothing looked at
 * it. The two grammars supply their own halves — a span map from their parser,
 * a canonical block from their serializer — and share this splice and the
 * vocabulary for talking about it.
 *
 * THIS FILE HAS NO GRAMMAR IN IT, deliberately. `canvas-edit.ts` (C4) and
 * `sequence-edit.ts` (sequence) stay separate because their gestures differ
 * where it cannot be papered over: a C4 edit is keyed by `(diagramId,
 * nodeId)`, a sequence edit by an index PATH, and each grammar supplies its
 * own span map and canonical lines. The splice itself is the genuinely shared
 * operation — a C4 move patches one declaration line (a position can only
 * appear there), and a C4 revise patches the element's whole block exactly as
 * every sequence gesture does (`desc` is a continuation line an edit may add
 * or remove) — which is why it lives HERE, once, and the two grammar modules
 * do not merge: a merged module would mean a function taking both keys and
 * honouring one.
 *
 * PURITY IS LOAD-BEARING, as it is for every module in this directory:
 * `check:canvas-edit` and `check:sequence` load these through Node's type
 * stripping, which cannot read `.tsx` at all. An import reaching a feature
 * barrel that exports a component would remove the module from the only
 * harness it has, silently. Keep new imports pointed at pure modules.
 */

import type { LineSpan } from "@/features/archtext";

import type { ViewDocument } from "./parse";

/**
 * How an edit produced its text. Returned on every edit so the caller — and
 * the `check:*` scripts — can tell the safe path from the lossy one by name
 * rather than by inspecting the output.
 *
 *   - `"patch"` — whole lines were spliced into the author's own text. Every
 *     byte outside the spliced lines is untouched: comments, blank lines,
 *     spacing, fields written out that canonical form omits at their default.
 *   - `"reemit"` — the document was serialised from the model, which DROPS all
 *     of the above. Reached only where a pane cannot be patched at all AND
 *     has nothing to lose; the C4 JSON pane is the only such case, and
 *     `canvas-edit.ts` names it. A sequence edit never takes this path —
 *     `sequence-edit.ts` says why it refuses instead.
 */
export type CanvasEditPath = "patch" | "reemit";

/** One canvas gesture, resolved into text the page can adopt. */
export interface CanvasEdit {
  /** The document to render — the product of re-parsing `text`. */
  doc: ViewDocument;
  /** The text the source pane must hold. */
  text: string;
  path: CanvasEditPath;
}

/** One line range of the source, and what replaces it — nothing, to remove it. */
export interface LinePatch {
  span: LineSpan;
  lines: readonly string[];
}

/**
 * Apply `patches` to `source`, leaving every line no patch names byte-identical.
 *
 * Spans are 1-based and inclusive, sorted here rather than by the caller, and
 * must not overlap — neither parser can produce overlapping blocks, so an
 * overlap would be a bug in the caller rather than input to tolerate.
 *
 * An INSERT is a patch whose span is empty in the `{ start: n + 1, end: n }`
 * sense: the copy loop runs to line `n`, the new lines go in, and the cursor
 * resumes at `n` — nothing is consumed. That is the same arithmetic a
 * replacement uses, which is why insertion needs no second code path.
 *
 * The trailing newline survives because the split and the join use the same
 * separator the serializers write: a final empty element stays a final empty
 * element.
 */
export function applyPatches(
  source: string,
  patches: readonly LinePatch[],
): string {
  const ordered = [...patches].sort((a, b) => a.span.start - b.span.start);
  const lines = source.split("\n");
  const out: string[] = [];
  let cursor = 0; // 0-based index of the next line to copy
  for (const patch of ordered) {
    while (cursor < patch.span.start - 1) {
      out.push(lines[cursor]);
      cursor += 1;
    }
    out.push(...patch.lines);
    cursor = patch.span.end;
  }
  while (cursor < lines.length) {
    out.push(lines[cursor]);
    cursor += 1;
  }
  return out.join("\n");
}

/**
 * The leading spaces of `line` — the indentation a patched block must keep.
 *
 * Read off the source rather than derived from the model because indentation
 * carries meaning both grammars cannot recover from the model alone at the
 * point of a patch: a sequence participant nested in a `box` sits two spaces
 * deeper than one outside it, and a message's indent IS its fragment depth, so
 * a re-derived pad could move a message into or out of a fragment.
 */
export function indentOf(line: string | undefined): string {
  const match = /^ */.exec(line ?? "");
  return match === null ? "" : match[0];
}
