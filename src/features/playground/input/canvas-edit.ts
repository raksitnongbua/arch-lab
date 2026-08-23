/**
 * Canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The playground's C4 canvas is directly editable (behind
 * `CANVAS_EDIT_ENABLED`): drag a node and it moves. This module is what makes
 * that a text edit rather than a second place the diagram lives.
 *
 * THE ONE MODEL RULE. The page already holds exactly one authority for what is
 * on screen — the `ViewDocument` from the last good parse — and the source pane
 * is its text. A canvas edit therefore does not mutate anything: it derives a
 * NEW source text, re-parses it, and hands both back for the page to adopt
 * through the same path a keystroke takes. Nothing here knows about React, and
 * nothing here holds state.
 *
 * AN EDIT IS A LINE PATCH, NOT A RE-EMIT, and that is the whole reason this
 * module is shaped the way it is. As shipped in v2.0.0 an edit derived a new
 * `ArchLabFile` and serialised the WHOLE document. Canonical text is a
 * different file from the author's: the C4 parser drops `//` comment lines with
 * no capture and the serializer has nothing to write back, blank lines are
 * reflowed, and any field the author wrote out that canonical form omits at its
 * default is normalised away. So one drag on a commented `.alab` file deleted
 * every comment in it — silently, and the reader's only signal was the pane
 * changing, which a drag is supposed to do.
 *
 * The fix is to touch only the lines the gesture is about.
 * `parseArchTextWithSpans` gives the line range every node and edge came from;
 * `canonicalNodeLine` gives the one line the serializer would have written for
 * a node. Splice one into the other and every byte the gesture did not concern
 * — comments, blank lines, spacing, omitted-at-default fields — is still there
 * because nothing touched it. Every edit reports its `path`, and
 * `check:canvas-edit` pins which gesture takes which, so the safe path can
 * never be mistaken for the lossy one.
 *
 * WHY NOT THE EDITOR'S STORE, which already does all of this. Two reasons, and
 * the first was found the expensive way. `ViewerModel` (what the playground
 * renders) and `EditorModel` (a module-singleton zustand store) are different
 * types with different invariants; routing some edits through one and some
 * through the other is the "two halves of one thing, each self-consistent,
 * that disagree" failure `codebase.md` names as the most expensive class in
 * this repo. Second, the store's authoring surface — palette, inspector,
 * drafts, `^ref` placeholders — is a page's worth of behaviour this canvas
 * deliberately does not offer.
 *
 * PURITY IS LOAD-BEARING, exactly as it is for its sibling `parse.ts`:
 * `check:canvas-edit` loads this module through Node's type stripping, which
 * cannot read `.tsx` at all. An import that reaches a feature barrel exporting
 * a component would remove this file from the only harness it has, silently.
 * Keep new imports pointed at pure modules.
 */

import type { ArchLabFile, C4Diagram, Point } from "@/types";

import {
  canonicalNodeLine,
  parseArchTextWithSpans,
  serializeArchText,
  spanKey,
  type ArchTextSpans,
  type LineSpan,
} from "@/features/archtext";
import { parsePane } from "@/features/viewer/input/sync";

import { sourceTextFor, type ViewDocument } from "./parse";

/* -------------------------------------------------------------------------- */
/* Which documents a canvas may edit                                           */
/* -------------------------------------------------------------------------- */

/**
 * Whether the canvas showing `doc` can write its changes back, and — when it
 * cannot — the sentence explaining why, in the reader's terms.
 *
 * The refusals are not gaps to fill in later. Each one is a document whose
 * geometry has nowhere to be written, so a drag would be undone by the very
 * next render; saying so is the honest answer.
 */
export type CanvasEditability =
  { editable: true } | { editable: false; reason: string };

export function canvasEditability(doc: ViewDocument): CanvasEditability {
  if (doc.kind !== "c4") {
    return {
      editable: false,
      // Not "not supported yet": these five notations SOLVE their geometry
      // from the text (the ER layout derives its columns from the
      // relationships, a dictionary is a table), so there is no per-node
      // position in the grammar to write a drag into.
      reason:
        "Only C4 diagrams can be edited on the canvas. This notation works out " +
        "its own layout from the text, so there is no position to move.",
    };
  }
  if (doc.format === "mermaid") {
    return {
      editable: false,
      // Measured, not assumed: `serializeMermaidC4` emits no geometry at all,
      // so a move would round-trip straight back to where it started.
      reason:
        "Mermaid carries no geometry, so a moved node would snap back. Switch " +
        "the pane to .alab to edit on the canvas.",
    };
  }
  return { editable: true };
}

/* -------------------------------------------------------------------------- */
/* The edits                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How an edit produced its text. Returned on every edit so the caller — and
 * `check:canvas-edit` — can tell the safe path from the lossy one by name
 * rather than by inspecting the output.
 *
 *   - `"patch"` — whole lines were spliced into the author's own text. Every
 *     byte outside the spliced lines is untouched: comments, blank lines,
 *     spacing, fields written out that canonical form omits at their default.
 *   - `"reemit"` — the document was serialised from the model, which DROPS all
 *     of the above. Reached only when the pane cannot be patched at all; the
 *     two cases that force it are named on `patchablePane`.
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

/**
 * Which path an edit against `doc` with pane content `sourceText` will take,
 * and — for `"patch"` — the parse the spans belong to.
 *
 * TWO THINGS FORCE A RE-EMIT, and neither is a gap to fill in later:
 *
 *  1. THE PANE IS NOT `.alab`. A C4 document can sit in the pane as arch-lab
 *     JSON, and line numbers from the `.alab` grammar mean nothing there. JSON
 *     loses nothing to a re-emit anyway — it has no comments, and the pane only
 *     ever holds the canonical form the JSON writer produced.
 *  2. THE PANE AND THE CANVAS DISAGREE. A drag is allowed while the pane holds
 *     text that does not parse (the canvas keeps showing the last good version),
 *     and the debounce can leave a keystroke un-parsed for a moment. In both
 *     cases the pane's line numbers describe a document that is not the one on
 *     screen, so splicing into it would corrupt the reader's text rather than
 *     preserve it. Agreement is MEASURED — the pane re-serialises to the same
 *     bytes as the on-screen model — not assumed from a flag that could lie.
 */
function patchablePane(
  doc: Extract<ViewDocument, { kind: "c4" }>,
  sourceText: string,
): { spans: ArchTextSpans } | null {
  if (doc.format !== "alab") return null;
  let spans: ArchTextSpans;
  try {
    const parsed = parseArchTextWithSpans(sourceText);
    if (serializeArchText(parsed.file) !== doc.synced.aftText) return null;
    spans = parsed.spans;
  } catch {
    return null;
  }
  return { spans };
}

/**
 * `doc` with one node moved to `position`, or `null` when the edit cannot
 * apply — an uneditable document, an id that is not in it, or a position that
 * is already what the node has.
 *
 * `null` FOR AN UNCHANGED POSITION is what keeps "one text change per
 * press-to-release" true even for a press that ends where it began: a drag of
 * under half a grid step snaps back to the same coordinates, and rewriting the
 * pane with identical text would still cost the reader an undo entry.
 *
 * A MOVE PATCHES EXACTLY ONE LINE — the node's declaration line — because that
 * is the only line a position can appear on. The node's `desc` and `!`
 * continuation lines are left alone rather than re-emitted with it: a re-emit
 * of the block would reflow their spacing for no reason, and leaving them means
 * `! position.<unknown>` escapes survive the drag instead of being normalised
 * out of the file.
 */
export function movedNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  nodeId: string,
  position: Point,
): CanvasEdit | null {
  if (!canvasEditability(doc).editable || doc.kind !== "c4") return null;

  const current = findNode(doc.synced.file, diagramId, nodeId);
  if (current === null) return null;
  if (current.x === position.x && current.y === position.y) return null;

  const edited = mapDiagram(doc.synced.file, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      node.id === nodeId ? { ...node, position } : node,
    ),
  }));

  const patchable = patchablePane(doc, sourceText);
  const span = patchable?.spans.nodes.get(spanKey(diagramId, nodeId));
  const line = canonicalNodeLine(edited, diagramId, nodeId);
  if (span !== undefined && line !== null) {
    return adopt(
      doc,
      edited,
      applyPatches(sourceText, [
        { span: { start: span.start, end: span.start }, lines: [line] },
      ]),
    );
  }
  return adopt(doc, edited, null);
}

/**
 * `doc` with one node — and every relationship touching it — removed, or
 * `null` when the edit cannot apply.
 *
 * THE EDGES GO WITH IT, and that is not a tidy-up. An edge naming a node that
 * no longer exists fails the model's own validation, so leaving them would
 * turn Delete into a document that will not re-parse — the reader would press
 * one key and get a parse error over a diagram they could no longer edit.
 *
 * A node owning a CHILD DIAGRAM is refused rather than cascaded. Deleting one
 * box would otherwise silently take a whole level of the model with it, and
 * nothing about pressing Delete on a node suggests that. `ownsChildDiagram`
 * lets the caller say so instead of appearing to do nothing.
 *
 * A DELETE IS ALSO A LINE PATCH — several spans removed rather than one line
 * replaced, which is the same guarantee: the rest of the file keeps its bytes.
 * The whole block goes, continuation lines included, or a stray `desc` line
 * would be left indented under nothing and the file would stop parsing.
 *
 * ONE THING CASCADES, and it was found by measuring rather than by reasoning:
 * a node in another diagram that `^ref`s the deleted one. The serializer omits
 * such a node's NAME when the referenced node supplies it, so removing the
 * target leaves a `^ref` line the parser can no longer derive a name for — the
 * patched file stops parsing and the edit is dropped. Their declaration lines
 * are therefore re-derived from the edited model too, which writes the name out
 * because `nodeHome` no longer resolves it. Falling back to a whole-document
 * re-emit here was the alternative and was rejected: it would mean the one
 * gesture most likely to be regretted is also the one that eats the comments.
 *
 * A `//` COMMENT ABOVE A DELETED NODE IS LEFT IN PLACE. The grammar does not
 * attach a comment to a declaration, so there is nothing to read that says
 * which lines of prose were about the removed box; guessing would delete the
 * author's writing on a heuristic, which is a worse failure than an orphaned
 * line the reader can see and remove.
 *
 * GEOMETRY IS NOT RE-EMITTED FOR THE SURVIVORS, and does not need to be: nodes
 * whose position the text omits are laid out by `defaultPositions` from the
 * remaining ids at PARSE time, so the layout re-derives on the way back in
 * exactly as it would after a whole-document re-emit.
 */
export function deletedNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  nodeId: string,
): CanvasEdit | null {
  if (!canvasEditability(doc).editable || doc.kind !== "c4") return null;
  if (findNode(doc.synced.file, diagramId, nodeId) === null) return null;
  if (ownsChildDiagram(doc, diagramId, nodeId)) return null;

  const doomedEdgeIds = (
    doc.synced.file.diagrams.find((diagram) => diagram.id === diagramId)
      ?.edges ?? []
  )
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => edge.id);

  const edited = mapDiagram(doc.synced.file, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.filter((node) => node.id !== nodeId),
    edges: diagram.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    ),
  }));

  const patchable = patchablePane(doc, sourceText);
  if (patchable !== null) {
    const removals: (LinePatch | undefined)[] = [
      patchable.spans.nodes.get(spanKey(diagramId, nodeId)),
      ...doomedEdgeIds.map((id) =>
        patchable.spans.edges.get(spanKey(diagramId, id)),
      ),
    ].map((span) => (span === undefined ? undefined : { span, lines: [] }));

    const rewrites = referrersTo(edited, diagramId, nodeId).map((referrer) => {
      const span = patchable.spans.nodes.get(
        spanKey(referrer.diagramId, referrer.nodeId),
      );
      const line = canonicalNodeLine(
        edited,
        referrer.diagramId,
        referrer.nodeId,
      );
      return span === undefined || line === null
        ? undefined
        : { span: { start: span.start, end: span.start }, lines: [line] };
    });

    // Every patch or none. A partial application would leave an edge naming a
    // node that no longer exists, or a `^ref` with no name to derive — either
    // way the reader presses Delete and gets a parse error over a diagram they
    // can no longer edit.
    const patches = [...removals, ...rewrites];
    if (patches.every((patch) => patch !== undefined)) {
      return adopt(
        doc,
        edited,
        applyPatches(sourceText, patches as LinePatch[]),
      );
    }
  }
  return adopt(doc, edited, null);
}

/**
 * Whether deleting `nodeId` would be refused for owning a child diagram, so
 * the UI can explain the refusal rather than swallow the keystroke.
 */
export function ownsChildDiagram(
  doc: ViewDocument,
  diagramId: string,
  nodeId: string,
): boolean {
  if (doc.kind !== "c4") return false;
  const node = doc.synced.file.diagrams
    .find((diagram) => diagram.id === diagramId)
    ?.nodes.find((candidate) => candidate.id === nodeId);
  return typeof node?.childDiagramId === "string" && node.childDiagramId !== "";
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

/** One line range of the source, and what replaces it — nothing, to remove it. */
interface LinePatch {
  span: LineSpan;
  lines: readonly string[];
}

/**
 * Apply `patches` to `source`, leaving every line no patch names byte-identical.
 *
 * Spans are 1-based and inclusive, sorted here rather than by the caller, and
 * must not overlap — the parser cannot produce overlapping node or edge blocks,
 * so an overlap would be a bug in the caller rather than input to tolerate.
 *
 * The trailing newline survives because the split and the join use the same
 * separator the serializer writes: a final empty element stays a final empty
 * element.
 */
function applyPatches(source: string, patches: readonly LinePatch[]): string {
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
 * Read `text` back through the REAL pane parser, so the returned document's
 * model, canonical `.alab` text and JSON twin all come from the parser rather
 * than from this module's idea of what the edit did.
 *
 * The re-parse is the point, not overhead. It is what makes the text the
 * authority rather than a rendering of it: geometry the text omits is filled by
 * `defaultPositions` here exactly as it is for a file opened from disk, so the
 * canvas draws what the text says rather than what the gesture intended. Once
 * per press-to-release, so the cost is a parse per gesture.
 *
 * `null` when the result will not parse. That is a bug in this module rather
 * than input to explain — a move and an edge-complete delete cannot turn a
 * valid file invalid — and dropping the edit is better than replacing the
 * reader's document with an error they cannot act on.
 *
 * The pane's FORMAT is carried over untouched: a canvas edit must never flip
 * the language the reader chose to look at.
 */
function adopt(
  doc: Extract<ViewDocument, { kind: "c4" }>,
  edited: ArchLabFile,
  /** The patched text, or `null` to re-emit `edited` from the model. */
  patched: string | null,
): CanvasEdit | null {
  const parsed = parsePane("aft", patched ?? serializeArchText(edited));
  if (parsed.status !== "ok") return null;
  const next: ViewDocument = {
    kind: "c4",
    format: doc.format,
    synced: parsed.value,
  };
  return {
    doc: next,
    // A patch already IS the pane's text. A re-emit has to be regenerated in
    // the pane's own LANGUAGE, which for `format: "json"` is the JSON twin and
    // not the `.alab` text just parsed — `sourceTextFor` is the one place that
    // knows which, and the JSON pane is the reason a re-emit path exists at all.
    text: patched ?? sourceTextFor(next),
    path: patched === null ? "reemit" : "patch",
  };
}

function mapDiagram(
  file: ArchLabFile,
  diagramId: string,
  edit: (diagram: C4Diagram) => C4Diagram,
): ArchLabFile {
  return {
    ...file,
    diagrams: file.diagrams.map((diagram) =>
      diagram.id === diagramId ? edit(diagram) : diagram,
    ),
  };
}

/**
 * Every node that names `diagramId`/`nodeId` as its `externalRef` — the nodes
 * whose declaration line depends on the referenced node still being there. See
 * the cascade note on `deletedNodeEdit`.
 */
function referrersTo(
  file: ArchLabFile,
  diagramId: string,
  nodeId: string,
): { diagramId: string; nodeId: string }[] {
  return file.diagrams.flatMap((diagram) =>
    diagram.nodes
      .filter(
        (node) =>
          node.externalRef?.diagramId === diagramId &&
          node.externalRef.nodeId === nodeId,
      )
      .map((node) => ({ diagramId: diagram.id, nodeId: node.id })),
  );
}

function findNode(
  file: ArchLabFile,
  diagramId: string,
  nodeId: string,
): Point | null {
  const node = file.diagrams
    .find((diagram) => diagram.id === diagramId)
    ?.nodes.find((candidate) => candidate.id === nodeId);
  return node === undefined ? null : node.position;
}
