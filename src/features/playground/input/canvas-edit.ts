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
 * NEW `ArchLabFile`, serialises it, and hands the text back for the page to
 * adopt through the same path a keystroke takes. Nothing here knows about
 * React, and nothing here holds state.
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

import { serializeArchText } from "@/features/archtext";
import { parsePane } from "@/features/viewer/input/sync";

import type { ViewDocument } from "./parse";

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
 * `doc` with one node moved to `position`, or `null` when the edit cannot
 * apply — an uneditable document, an id that is not in it, or a position that
 * is already what the node has.
 *
 * `null` FOR AN UNCHANGED POSITION is what keeps "one text change per
 * press-to-release" true even for a press that ends where it began: a drag of
 * under half a grid step snaps back to the same coordinates, and rewriting the
 * pane with identical text would still cost the reader an undo entry.
 */
export function movedNodeDocument(
  doc: ViewDocument,
  diagramId: string,
  nodeId: string,
  position: Point,
): ViewDocument | null {
  if (!canvasEditability(doc).editable || doc.kind !== "c4") return null;

  const current = findNode(doc.synced.file, diagramId, nodeId);
  if (current === null) return null;
  if (current.x === position.x && current.y === position.y) return null;

  return rebuild(
    doc,
    mapDiagram(doc.synced.file, diagramId, (diagram) => ({
      ...diagram,
      nodes: diagram.nodes.map((node) =>
        node.id === nodeId ? { ...node, position } : node,
      ),
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Serialise the edited file and read it back, so the returned document's
 * model, `.alab` text and JSON twin are all products of the REAL parser.
 *
 * The re-parse is the point, not overhead. It is what makes the text the
 * authority rather than a rendering of it: anything the serialiser omits at
 * its defaults (a node dragged back to where the layout would have put it
 * loses its `(x,y wxh)` token entirely) is omitted here too, and the canvas
 * then draws what the text says rather than what the drag intended. Once per
 * press-to-release, so the cost is a parse per gesture.
 *
 * The pane's FORMAT is carried over untouched — `sourceTextFor` regenerates in
 * whatever language the pane is already in, and a canvas edit must never flip
 * the language the reader chose to look at.
 */
function rebuild(
  doc: Extract<ViewDocument, { kind: "c4" }>,
  file: ArchLabFile,
): ViewDocument | null {
  const parsed = parsePane("aft", serializeArchText(file));
  // An edited model that will not re-parse is a bug in this module, not input
  // to explain: geometry and edge removal cannot make a valid file invalid.
  // Returning null drops the edit rather than replacing the reader's document
  // with an error.
  if (parsed.status !== "ok") return null;
  return { kind: "c4", format: doc.format, synced: parsed.value };
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
