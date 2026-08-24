/**
 * Canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The playground's C4 canvas is directly editable (behind
 * `CANVAS_EDIT_ENABLED`): drag a node and it moves, and the details panel
 * beside a selected node rewrites its wording. This module is what makes
 * each of those a text edit rather than a second place the diagram lives.
 *
 * It also holds the CAPABILITY MODEL for both editable canvases —
 * `CANVAS_EDIT_OFFERS`, the notation-against-ability grid, and
 * `canvasEditability`, its one reader. The sequence canvas's own gestures live
 * in `sequence-edit.ts` but ask this module whether they may run, so that
 * "which notations can be edited, and how" has exactly one answer.
 * `.claude/rules/canvas-editing.md` is the guideline for adding a notation to
 * that grid.
 *
 * AND IT HOLDS THE OUTWARD-FACING SENTENCE, `CANVAS_EDITING_PASSAGE`, which the
 * landing page, both `llms*.txt` documents and `/faq` all quote verbatim. It is
 * assembled from the grid for the same reason the refusals are: the site said
 * "a C4 diagram is editable both ways" for a whole release after that stopped
 * being the whole answer.
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
 * a node, and `canonicalNodeBlock` the whole block when the gesture edits a
 * continuation line. Splice one into the other and every byte the gesture did not concern
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

import type {
  ArchLabFile,
  C4Diagram,
  C4Node,
  C4NodeRevision,
  Point,
} from "@/types";

import {
  canonicalNodeBlock,
  canonicalNodeLine,
  parseArchTextWithSpans,
  serializeArchText,
  spanKey,
  type ArchTextSpans,
} from "@/features/archtext";
import { parsePane } from "@/features/viewer/input/sync";
import { APP_NAME } from "@/lib/constants";

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
 *     the canvas to type into, which today means the sequence document
 *     (`sequence-edit.ts`, edited in its dock) and the C4 document
 *     (`revisedNodeEdit` below, edited in the viewer's details panel).
 *
 * A document can therefore refuse one and allow the other — a sequence
 * document refuses `move` while offering `revise`, and the four text-laid-out
 * notations refuse both. That is
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
       * What a gesture on this canvas WRITES, as a clause that can be dropped
       * into `CANVAS_EDITING_PASSAGE` below — the sentence the home page, both
       * `llms*.txt` documents and `/faq` all quote.
       *
       * Required on every offering cell, and that is the point: the site's
       * claim about which canvases can be edited is then assembled from this
       * table, so a seventh notation that learns a gesture cannot ship with the
       * pages still describing six. The clause must name the notation and say
       * what lands in the text, because REORDER AND POSITION ARE DIFFERENT
       * CLAIMS and a reader arriving from a drawing tool assumes the second —
       * see the `RefusalGround` note above and the `/faq` answer that draws the
       * same distinction.
       */
      onCanvas: string;
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
      onCanvas: "a C4 node drags to a position the text records",
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
      /* "into a new order", never "to a new position". This clause is the one
         the pages quote, and the whole reason the passage is derived from here
         is that a hand-written version of it said "drag" and left a reader
         expecting the box to stay where they dropped it. */
      onCanvas:
        "a sequence message or lifeline drags into a new order, its wording " +
        "edited in place",
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
    /* This cell REVERSED a shipped decision. It refused with `ground:
       "surface"` — "the C4 canvas moves and deletes", a second field editor
       would be two authoring surfaces for one model — and a `"surface"`
       refusal is exactly the one that moves when somebody builds the surface
       (`canvas-editing.md`). The details panel the canvas already renders for
       a selected element is now that surface: it was already the one place
       showing every field a node has, so "edit this" can mean "edit all of
       it" there without a second inspector appearing anywhere. */
    c4: {
      offers: true,
      noun: "C4 diagrams",
      /* "in the details panel", not "in place": the fields are typed into the
         panel beside the node, never onto the node itself, and a clause
         promising in-place typing would send a reader double-clicking a box
         that only drills down. */
      onCanvas:
        "a C4 node's name, description and technology edited in the details " +
        "panel beside it",
      unlessPane: {
        format: "mermaid",
        /* Measured against the emitter, not assumed: `serializeMermaidC4`
           gives `technology` an argument slot only on the Container/Component
           forms (`spec.argStyle === "tech"`), so on a person or a system the
           field has nowhere to land — the "Known lossy spots" note in
           `mermaid/lib/emit.ts` and `MERMAID_C4_EXPORT_CAVEAT` both record it.
           Writing an edit back through a pane that cannot spell it would show
           the change once and lose it on the next round trip, which is worse
           than refusing. */
        because:
          "Mermaid C4 has no technology slot on person or system elements, " +
          "so a [technology] edit there would be lost. Switch the pane to " +
          ".alab to edit on the canvas.",
      },
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
 * The list itself is `joinNouns`, shared with the budgeted summary below.
 */
function onlyTheseNotations(ability: CanvasEditAbility): string {
  const nouns = Object.values(CANVAS_EDIT_OFFERS[ability])
    .filter((offer) => offer.offers)
    .map((offer) => offer.noun);
  return `Only ${joinNouns(nouns)} can be ${ABILITY_PAST_PARTICIPLE[ability]}.`;
}

/**
 * "C4 diagrams and sequence diagrams", or a comma list ending in "and" once
 * there are three.
 *
 * Joined by hand rather than with `Intl.ListFormat` for the reason above: every
 * caller is a contract string, and none of them may vary with the ICU data a
 * runtime happens to ship.
 */
function joinNouns(nouns: readonly string[]): string {
  return nouns.length <= 2
    ? nouns.join(" and ")
    : `${nouns.slice(0, -1).join(", ")} and ${nouns[nouns.length - 1]}`;
}

/* -------------------------------------------------------------------------- */
/* The same capability, said outwards: the passage the site quotes             */
/* -------------------------------------------------------------------------- */

/** Small counts as words, because prose reads them and a digit in a sentence
 *  about notations looks like a version number. Falls back to the numeral
 *  rather than `undefined` if this table is ever outrun. */
const NUMBER_WORD: readonly string[] = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

const inWords = (count: number): string => NUMBER_WORD[count] ?? String(count);

/**
 * THE ONE PASSAGE THE SITE QUOTES about editing, and the reason it is built
 * here rather than typed on each page.
 *
 * It answers, in one place, the question a reader and an assistant both ask —
 * "can I edit an arch-lab diagram on the canvas, and which kinds" — and it
 * appears in the SAME WORDS on the landing page, in `/llms.txt`, in
 * `/llms-full.txt` and in `/faq`, because an assistant quotes a passage rather
 * than a page and four paraphrases are four chances to be quoted wrongly.
 *
 * EVERY FACT IN IT COMES FROM THE GRID ABOVE: the number of notations, how many
 * answer a canvas gesture, and what each of those gestures writes. Nothing here
 * is hand-counted. That is not tidiness — the claim "a C4 diagram is editable
 * both ways", hand-written in the hero, was the FIFTH stale sentence on this
 * branch: correct when written, and still on the page the day the sequence
 * canvas learned to reorder. A sentence assembled from the table cannot outlive
 * the table.
 *
 * IT LEADS WITH THE TEXT, not with the canvas, and that ordering is the honest
 * one: text editing is the universal answer and canvas editing is the exception
 * two notations offer. Opening with the canvas would sell a drawing tool and
 * then take it back.
 *
 * The clauses are joined with "and" rather than by `Intl.ListFormat`, for the
 * same reason `onlyTheseNotations` is: this is a contract string, and it must
 * not vary with the ICU data a runtime happens to ship.
 */
export const CANVAS_EDITING_PASSAGE: string = (() => {
  const notations = Object.keys(CANVAS_EDIT_OFFERS.move) as Notation[];
  const clauses = Object.values(CANVAS_EDIT_OFFERS).flatMap((cells) =>
    Object.values(cells)
      .filter((offer) => offer.offers)
      .map((offer) => offer.onCanvas),
  );
  const editable = new Set(
    notations.filter((notation) =>
      Object.values(CANVAS_EDIT_OFFERS).some((cells) => cells[notation].offers),
    ),
  );
  return (
    `An ${APP_NAME} diagram is edited two ways. All ${inWords(notations.length)} ` +
    `notations are edited as source text; ${inWords(editable.size)} of them are ` +
    `also editable on the canvas — ${clauses.join(", and ")}. Either way the ` +
    `change lands in the same one-line-per-element text you review in a pull ` +
    `request.`
  );
})();

/**
 * The same claim at a fraction of the length, for a BUDGETED surface — a route
 * description has 160 characters for everything it says, and
 * `CANVAS_EDITING_PASSAGE` spends more than twice that.
 *
 * It is a second string rather than a truncation of the first because the two
 * are cut differently: the passage keeps the reorder-versus-position
 * distinction and drops nothing, this keeps only WHICH notations and drops the
 * distinction, and a substring of the passage would have kept whichever half
 * happened to come first. Both are still derived from the same cells, so they
 * cannot disagree about the answer — only about how much of it they have room
 * for.
 *
 * `/live`'s description is the caller. `/faq` and the two `llms*.txt` documents
 * have room for the whole passage and use that instead.
 */
export const CANVAS_EDITABLE_SUMMARY: string = (() => {
  const nouns = [
    ...new Set(
      Object.values(CANVAS_EDIT_OFFERS).flatMap((cells) =>
        Object.values(cells)
          .filter((offer) => offer.offers)
          .map((offer) => offer.noun),
      ),
    ),
  ];
  return `Canvas editing for ${joinNouns(nouns)}.`;
})();

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
  if (current.position.x === position.x && current.position.y === position.y) {
    return null;
  }

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
 * `doc` with one node's own fields rewritten, or `null` when the edit cannot
 * apply — a document that refuses `"revise"`, an id that is not in it, a
 * revision that changes nothing, an empty name, or a boundary placeholder.
 *
 * `null` FOR AN UNCHANGED REVISION keeps "one text change per gesture" true
 * for a form submitted without an edit in it, exactly as the sequence revise
 * gestures document: rewriting the pane with identical text would still cost
 * the reader an undo entry and a re-render.
 *
 * AN EMPTY NAME IS REFUSED, not passed through: the model requires one (the
 * serializer refuses `""` outright), so accepting it would turn an Apply into
 * a dropped edit further down with nothing to say why.
 *
 * A BOUNDARY PLACEHOLDER (`externalRef`) IS REFUSED. Its name is the
 * referenced node's, derived at parse time and shown read-only; writing a
 * local override from a panel that displays derived values would silently
 * fork the mirror from its source. The real node is one level up, where this
 * same gesture edits it.
 *
 * A REVISE PATCHES THE NODE'S WHOLE BLOCK — declaration line plus `desc` and
 * `!` continuations — unlike a move's one line, because `description` IS a
 * continuation line an edit may add, replace or remove. `canonicalNodeBlock`
 * is the serializer's own answer for those lines, so the patched block cannot
 * be non-canonical; the bounded cost (a `!` escape inside the block comes back
 * in canonical order) is documented there. Every byte outside the block is
 * untouched.
 *
 * WHAT A RENAME CARRIES WITH IT, and deliberately does NOT rewrite: a `^ref`
 * in another diagram whose own name the author omitted, and a child diagram
 * head whose title the author omitted, both DERIVE from this node's name at
 * parse time — omission is the format's way of saying "same as the source".
 * The patch leaves those lines alone, so the re-parse lets them follow the new
 * name, which is what the author's own text says should happen; a name or
 * title the author wrote out explicitly stays exactly as written.
 * `check:canvas-edit` measures both directions. (A delete has to REWRITE the
 * referrer lines instead — see `deletedNodeEdit` — because there the source of
 * the derivation stops existing and the file would stop parsing.)
 *
 * The `id` is deliberately not editable here; `C4NodeRevision` carries the
 * argument.
 */
export function revisedNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  nodeId: string,
  revision: C4NodeRevision,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "c4") {
    return null;
  }
  const current = findNode(doc.synced.file, diagramId, nodeId);
  if (current === null) return null;
  if (current.externalRef !== undefined) return null;
  if (revision.name === "") return null;

  /* DESTRUCTURED, not spread from `revision` directly — the same "whole value"
     contract `revisedMessageEdit` argues at length: `{ ...current, ...revision }`
     cannot REMOVE a field, because an optional key the caller omitted is simply
     not in the spread. Naming the three makes each present as a variable,
     `undefined` included, which is what overwrites the value the reader
     cleared — and `emitNode` writes an optional field only for a string, so an
     explicit `undefined` is simply not written. This destructure and
     `C4NodeRevision` are one unit: a field added there needs a name here or it
     is silently ignored. */
  const { name, technology, description } = revision;
  if (
    current.name === name &&
    current.technology === technology &&
    current.description === description
  ) {
    return null;
  }

  const edited = mapDiagram(doc.synced.file, diagramId, (diagram) => ({
    ...diagram,
    nodes: diagram.nodes.map((node) =>
      node.id === nodeId ? { ...node, name, technology, description } : node,
    ),
  }));

  const patchable = patchablePane(doc, sourceText);
  const span = patchable?.spans.nodes.get(spanKey(diagramId, nodeId));
  const lines = canonicalNodeBlock(edited, diagramId, nodeId);
  if (span !== undefined && lines !== null) {
    return adopt(doc, edited, applyPatches(sourceText, [{ span, lines }]));
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
): C4Node | null {
  const node = file.diagrams
    .find((diagram) => diagram.id === diagramId)
    ?.nodes.find((candidate) => candidate.id === nodeId);
  return node === undefined ? null : node;
}
