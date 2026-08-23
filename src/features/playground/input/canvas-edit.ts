/**
 * Canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The playground's C4 canvas is directly editable (behind
 * `CANVAS_EDIT_ENABLED`): drag a node and it moves. This module is what makes
 * that a text edit rather than a second place the diagram lives.
 *
 * It also holds the CAPABILITY MODEL for both editable canvases —
 * `CANVAS_EDIT_OFFERS`, the notation-against-ability grid, and
 * `canvasEditability`, its one reader. The sequence canvas's own gestures live
 * in `sequence-edit.ts` but ask this module whether they may run, so that
 * "which notations can be edited, and how" has exactly one answer.
 * `.claude/rules/canvas-editing.md` is the guideline for adding a notation to
 * that grid.
 *
 * THE ONE MODEL RULE. The page already holds exactly one authority for what is
 * on screen — the `ViewDocument` from the last good parse — and the source pane
 * is its text. A canvas edit therefore does not mutate anything: it derives a
 * NEW source text, re-parses it, and hands both back for the page to adopt
 * through the same path a keystroke takes. Nothing here knows about React, and
 * nothing here holds state.
 *
 * AN EDIT IS A LINE PATCH, NOT A RE-EMIT, and that is the whole reason this
 * module is shaped the way it is. The bug that bought the rule, and the splice
 * itself, are in `line-patch.ts` — shared with the sequence canvas, which
 * needed the identical fix for the identical reason.
 *
 * Here the rule means: touch only the lines the gesture is about.
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
} from "@/features/archtext";
import { parsePane } from "@/features/viewer/input/sync";

import { applyPatches, type CanvasEdit, type LinePatch } from "./line-patch";
import { sourceTextFor, type ViewDocument } from "./parse";

/* -------------------------------------------------------------------------- */
/* The capability model: which notation offers which canvas edit               */
/* -------------------------------------------------------------------------- */

/**
 * Whether the canvas showing `doc` can write its changes back, and — when it
 * cannot — the sentence explaining why, in the reader's terms.
 *
 * The refusals are not a to-do list. Each says which of the two things below
 * is missing, and neither is filled in by deciding to; saying so is the honest
 * answer. `.claude/rules/canvas-editing.md` is the guideline a new notation
 * follows to answer this, and names the checks that fail until it has.
 */
export type CanvasEditability =
  { editable: true } | { editable: false; reason: string };

/**
 * The two things a canvas can write back, and they are NOT the same question —
 * which is why this is a parameter rather than one verdict per document.
 *
 *   - `"move"` — write GEOMETRY. Needs a per-element position in the grammar,
 *     which only the C4 model has: every other notation solves its own layout
 *     from the text, so a drag has nowhere to land.
 *   - `"revise"` — rewrite one element's own FIELDS in place. Needs both a
 *     grammar whose elements each occupy a knowable line range AND a place on
 *     the canvas to type into, which together today mean the sequence document
 *     (`sequence-edit.ts`).
 *
 * A document can therefore refuse one and allow the other, and the C4 and
 * sequence canvases genuinely do exactly that in opposite directions. That is
 * why the answers live in a TABLE below rather than in a chain of
 * `doc.kind !== …` tests: a chain states each notation's answer as the negation
 * of another's, which reads backwards and leaves the grid a reader wants —
 * notation against ability — nowhere on the page.
 *
 * A THIRD ABILITY IS A REAL POSSIBILITY and this union is the place for it, not
 * a per-gesture verdict. The nine sequence gestures share one ability because
 * they gate on the same two facts (an `.alab` sequence pane, the canvas
 * unlocked); a new ability is owed only when a gesture gates on something the
 * existing two do not ask about. Adding one makes `CANVAS_EDIT_OFFERS`
 * incomplete, which is a type error before it is a check failure.
 */
export type CanvasEditAbility = "move" | "revise";

/**
 * The notations a `ViewDocument` can be — the key of the capability table.
 *
 * Keyed off the DOCUMENT UNION rather than off `SeedKind`, even though the two
 * hold the same six names today, because this one is the set that reaches this
 * module: a notation added to `ViewDocument` fails to compile here until it has
 * an answer for every ability. `check:canvas-edit` pins the two sets equal so a
 * notation added to the seed table is caught as well.
 */
type Notation = ViewDocument["kind"];

/**
 * WHY A REFUSAL IS REFUSED — and there are exactly two answers, because they
 * mean different things to whoever reads them next.
 *
 *   - `"grammar"` — the notation's text has nowhere to write this. A sequence
 *     document has no coordinates at all (a participant's column IS its index
 *     in `participants`, a message's time IS its index in `items`), so a drag
 *     would be undone by the next render. This does not change by building
 *     anything; it changes only if the grammar gains a field, which is a
 *     format change with everything that implies.
 *   - `"surface"` — the grammar could hold the edit; this canvas has nothing to
 *     make it with. That is a smaller statement and the honest one for the four
 *     text-laid-out notations under `"revise"`: nothing about a flowchart's
 *     grammar forbids retyping a step's label, there is simply no dock on that
 *     canvas to type it into. Calling it a grammar property would be a claim
 *     the format does not support.
 *
 * Both are legitimate shipped answers. The distinction is not a to-do marker —
 * it is what tells the next reader whether the refusal is theirs to change.
 */
type RefusalGround = "grammar" | "surface";

/** One notation's answer for one ability. */
type CanvasEditOffer =
  | {
      offers: true;
      /**
       * How this notation reads mid-sentence inside ANOTHER notation's refusal
       * ("Only C4 diagrams can be dragged on the canvas"). Plural, and lower
       * case except where the name is a proper one.
       */
      noun: string;
      /**
       * A pane LANGUAGE this notation cannot honour the ability in, even though
       * its grammar can. It lives in the cell rather than in a separate switch
       * so that everything about one (notation, ability) pair is readable in one
       * place — the format guard used to be reachable only by knowing which
       * branch it sat in.
       */
      unlessPane?: { format: string; because: string };
    }
  | {
      offers: false;
      ground: RefusalGround;
      /** Why, as one sentence about THIS notation. */
      because: string;
      /**
       * A gesture this notation DOES have, when there is one. It replaces the
       * derived "Only … " tail, because naming what the reader can do beats
       * naming the notations they are not looking at.
       */
      instead?: string;
    };

/* The sentences more than one cell needs, named so that rewording one cannot
   reword four of five places. They are constants rather than a per-ability
   default because a DEFAULT is exactly how a seventh notation would inherit an
   answer nobody wrote for it: every cell below is spelled out, and that
   repetition is the point. */

/** The `"grammar"` refusal for every notation that solves its own layout. */
const NO_POSITION_IN_THE_TEXT =
  "This notation works out its own layout from the text, so there is no " +
  "position to move.";

/** The `"surface"` refusal for a canvas that draws a notation but cannot edit
 *  it. It points at the pane in the same breath, because a refusal with no
 *  destination is a dead end. */
const NO_EDITOR_ON_THIS_CANVAS =
  "This canvas has no editor on it, so edit this notation in the source pane.";

/**
 * WHICH NOTATION OFFERS WHICH CANVAS EDIT — the whole capability model, as the
 * grid it is.
 *
 * Read a row as "what the sequence canvas can write back"; read a column as
 * "which notations answer a drag". Every cell is written out, including the
 * four that say the same thing, so that adding a notation is a compile error
 * with six blanks rather than a silent inheritance.
 *
 * `canvasEditability` is the only reader; nothing branches on `doc.kind` for
 * this question any more. Exported because `check:canvas-edit` asserts the
 * table and the function agree, and because a reader looking for "can my
 * notation be edited" should find one object rather than two functions.
 */
export const CANVAS_EDIT_OFFERS: Record<
  CanvasEditAbility,
  Record<Notation, CanvasEditOffer>
> = {
  move: {
    c4: {
      offers: true,
      noun: "C4 diagrams",
      unlessPane: {
        format: "mermaid",
        // Measured, not assumed: `serializeMermaidC4` emits no geometry at all,
        // so a move would round-trip straight back to where it started.
        because:
          "Mermaid carries no geometry, so a moved node would snap back. " +
          "Switch the pane to .alab to edit on the canvas.",
      },
    },
    /* The one notation with a DIFFERENT canvas edit to offer, so its refusal
       names that instead of the derived tail. A dead end on the one notation
       that CAN be edited another way sends the reader away from a feature that
       is right there. */
    sequence: {
      offers: false,
      ground: "grammar",
      because: NO_POSITION_IN_THE_TEXT,
      instead: "Click a message or a lifeline to edit its wording instead.",
    },
    flowchart: {
      offers: false,
      ground: "grammar",
      because: NO_POSITION_IN_THE_TEXT,
    },
    usecase: {
      offers: false,
      ground: "grammar",
      because: NO_POSITION_IN_THE_TEXT,
    },
    er: { offers: false, ground: "grammar", because: NO_POSITION_IN_THE_TEXT },
    dict: {
      offers: false,
      ground: "grammar",
      because: NO_POSITION_IN_THE_TEXT,
    },
  },
  revise: {
    sequence: {
      offers: true,
      noun: "sequence diagrams",
      unlessPane: {
        format: "mermaid",
        /* Measured against the emitter, not assumed: the fields this gesture
           edits are `label`, `kind`, `technology` and `desc`, and
           `MERMAID_SEQUENCE_EXPORT_CAVEAT` in `mermaid/lib/sequence-emit.ts`
           records that Mermaid holds none of the last two. Writing an edit back
           through a pane that cannot spell it would show the change once and
           lose it on the next round trip, which is worse than refusing. */
        because:
          "Mermaid sequenceDiagram cannot hold a message's desc detail or its " +
          "[technology], so those edits would be lost. Switch the pane to " +
          ".alab to edit on the canvas.",
      },
    },
    /* `"surface"`, not `"grammar"`: the C4 grammar holds every field a node
       has. The refusal is a DECISION — that canvas offers move and delete, and
       a second, weaker field editor on it would be two authoring surfaces for
       one model. */
    c4: {
      offers: false,
      ground: "surface",
      because: "The C4 canvas moves and deletes.",
      instead: "A node's wording is edited in the source pane beside it.",
    },
    flowchart: {
      offers: false,
      ground: "surface",
      because: NO_EDITOR_ON_THIS_CANVAS,
    },
    usecase: {
      offers: false,
      ground: "surface",
      because: NO_EDITOR_ON_THIS_CANVAS,
    },
    er: { offers: false, ground: "surface", because: NO_EDITOR_ON_THIS_CANVAS },
    dict: {
      offers: false,
      ground: "surface",
      because: NO_EDITOR_ON_THIS_CANVAS,
    },
  },
};

export function canvasEditability(
  doc: ViewDocument,
  ability: CanvasEditAbility = "move",
): CanvasEditability {
  const offer = CANVAS_EDIT_OFFERS[ability][doc.kind];
  if (!offer.offers) {
    return {
      editable: false,
      reason: `${offer.because} ${offer.instead ?? onlyTheseNotations(ability)}`,
    };
  }
  if (
    offer.unlessPane !== undefined &&
    doc.format === offer.unlessPane.format
  ) {
    return { editable: false, reason: offer.unlessPane.because };
  }
  return { editable: true };
}

/** How each ability reads in the derived tail of another notation's refusal. */
const ABILITY_PAST_PARTICIPLE: Record<CanvasEditAbility, string> = {
  move: "dragged on the canvas",
  revise: "edited on the canvas",
};

/**
 * "Only C4 diagrams can be dragged on the canvas." — built from the table that
 * decides it, which is the whole reason this function exists rather than five
 * copies of the sentence.
 *
 * The failure it removes has already happened three times on this branch in
 * other files: a claim about which canvas is editable, hand-written, surviving
 * the day it stopped being true, with every check still green (`codebase.md`
 * habit 4). Here it would have been a refusal telling four notations that only
 * C4 can be dragged, on the day a fifth learned to be. `check:canvas-edit`
 * proves the derivation by flipping a cell and reading the sentence back.
 *
 * Joined by hand rather than with `Intl.ListFormat`: this is a contract string,
 * and it must not vary with the ICU data a runtime happens to ship.
 */
function onlyTheseNotations(ability: CanvasEditAbility): string {
  const nouns = Object.values(CANVAS_EDIT_OFFERS[ability])
    .filter((offer) => offer.offers)
    .map((offer) => offer.noun);
  const list =
    nouns.length <= 2
      ? nouns.join(" and ")
      : `${nouns.slice(0, -1).join(", ")} and ${nouns[nouns.length - 1]}`;
  return `Only ${list} can be ${ABILITY_PAST_PARTICIPLE[ability]}.`;
}

/* -------------------------------------------------------------------------- */
/* The edits                                                                   */
/* -------------------------------------------------------------------------- */

export type { CanvasEdit, CanvasEditPath } from "./line-patch";

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
