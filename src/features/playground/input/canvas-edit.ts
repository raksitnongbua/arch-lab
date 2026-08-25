/**
 * Canvas edits, expressed as edits to the SOURCE TEXT.
 *
 * The playground's C4 canvas is directly editable (behind
 * `CANVAS_EDIT_ENABLED`): drag a node and it moves, the details panel beside
 * a selected node rewrites its wording, and the palette under the breadcrumb
 * adds a new node. This module is what makes each of those a text edit rather
 * than a second place the diagram lives.
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
  C4Edge,
  C4Frame,
  C4Node,
  C4NodeFrameChoice,
  C4NodeRevision,
  C4NodeType,
  ExternalRef,
  Point,
} from "@/types";
import { childLevelOf } from "@/types";

import {
  canonicalDiagramBlock,
  canonicalEdgeBlock,
  canonicalFrameDeclaration,
  canonicalFrameLine,
  canonicalNodeBlock,
  canonicalNodeLine,
  canonicalTagColorLine,
  defaultEdgeId,
  defaultPositions,
  defaultSizeFor,
  KEYWORD_BY_NODE_TYPE,
  parseArchTextWithSpans,
  serializeArchText,
  spanKey,
  type ArchTextSpans,
} from "@/features/archtext";
// A deep import, but a PURE one (type-only imports, no component), which is
// what this module's harness requires — and it is the one table that knows
// which of a node's tags carry colour, so a second copy here would be the
// "two halves of one thing" failure `codebase.md` names.
import { colorTagsOf } from "@/features/editor/lib/node-colors";
// The same deep-but-pure precedent (`editor/state/model.ts` imports only
// `@/types`, `@/lib/slug` and a type): `uniqueId` is the de-collision every id
// in the saved format uses, and minting ids here with a second suffix loop is
// how `new-person-2` and `new-person2` end up meaning the same thing.
import { uniqueId } from "@/features/editor/state/model";
import { parsePane } from "@/features/viewer/input/sync";
import { EDIT_GRID } from "@/features/viewer/lib/canvas-constants";
import {
  creatableNodeTypes,
  referenceableNodes,
} from "@/features/viewer/lib/node-palette";
import { APP_NAME } from "@/lib/constants";
import { slugify } from "@/lib/slug";

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
 *   - `"create"` — add a NEW element at a POSITION the text records. This is
 *     `move`'s question asked at birth: it needs the same per-element position
 *     in the grammar (the new node must land somewhere that is not on top of
 *     an existing one, and the text must be able to say where), plus a palette
 *     on the canvas to pick a type from. An INSERT INTO AN ORDER is not this
 *     ability, for the reason a reorder is not a move: the sequence canvas
 *     adds messages and lifelines, but those land at an INDEX and write no
 *     coordinate, so they belong to `revise` with the other eight sequence
 *     gestures — see the sequence `create` cell, whose refusal points at them.
 *   - `"connect"` — write a RELATIONSHIP between two elements: a new line in
 *     the text that names a PAIR and carries no coordinate. Its own row
 *     rather than a stretch of an existing one, by both of the tests this
 *     union states: neither definition holds it (`revise` rewrites one
 *     element's own fields in place — an edge is not a field of either
 *     endpoint — and `create` is a placement, which a coordinate-free line
 *     cannot be), and it gates on a fact no other ability asks about — the
 *     diagram's own relationship set, because whether a pair may be connected
 *     (the same element twice, a pair already related) is a question about
 *     EDGES that move, revise and create never pose. The sequence canvas's
 *     message insert is deliberately NOT this ability, for the reason its
 *     cell states: a sequence relationship is an ordered EVENT that lands at
 *     an index, which is `revise`'s territory with the other inserts.
 *
 * A document can therefore refuse one and allow the other — a sequence
 * document refuses `move` while offering `revise`, and the four text-laid-out
 * notations refuse all four. That is
 * why the answers live in a TABLE below rather than in a chain of
 * `doc.kind !== …` tests: a chain states each notation's answer as the negation
 * of another's, which reads backwards and leaves the grid a reader wants —
 * notation against ability — nowhere on the page.
 *
 * A FIFTH ABILITY IS A REAL POSSIBILITY and this union is the place for it,
 * not a per-gesture verdict. The nine sequence gestures share one ability
 * because they gate on the same two facts (an `.alab` sequence pane, the
 * canvas unlocked); a new ability is owed only when a gesture gates on
 * something the existing ones do not ask about — `create` earned its row by
 * gating on a third fact, the diagram level's own set of legal node types,
 * and `connect` by gating on the relationship set (see its entry above).
 * Adding one makes `CANVAS_EDIT_OFFERS` incomplete, which is a type error
 * before it is a check failure.
 */
export type CanvasEditAbility = "move" | "revise" | "create" | "connect";

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

/** The `"grammar"` refusal for `create` on every notation that solves its own
 *  layout: a created element is PLACED, and these have nowhere to write the
 *  placement — the same fact `NO_POSITION_IN_THE_TEXT` states for a move,
 *  said for an element that does not exist yet. */
const NO_PLACE_IN_THE_TEXT =
  "This notation works out its own layout from the text, so there is no " +
  "position to place a new element at.";

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
         that only drills down. The boundary and the child view ride in this
         clause rather than earning an ability of their own because both are
         writes to THE NODE'S OWN FIELDS (`frameId`, `childDiagramId` — both
         live on its declaration line), gated on exactly the two facts every
         revise gates on; the companion line each one mints (a `frame`
         declaration, a diagram head) follows the colour edit's precedent,
         where the header's `tagcolor` line rides the same gesture. A selected
         boundary's own rename (`renamedFrameEdit`) rides here for the same
         test: a frame is an element with its own declaration line and span,
         so its label edit gates on nothing the other revises do not. */
      onCanvas:
        "a C4 node's type, name, description, technology, icon, colour, " +
        "tags and boundary edited in the details panel beside it, where a " +
        "child view is added or removed and a selected boundary renamed too",
      unlessPane: {
        format: "mermaid",
        /* Measured against the emitter, not assumed: `serializeMermaidC4`
           gives `technology` an argument slot only on the Container/Component
           forms (`spec.argStyle === "tech"`), so on a person or a system the
           field has nowhere to land, and it emits NO argument at all for a
           node's `icon`, its tags or the header's `tagColors` — its `emitNode`
           reads tags solely for `boundary:` membership and the `_Ext`
           coercion (`toElementForm`), every other tag dropped — so the
           panel's icon, colour and tag edits have nowhere to land on ANY
           element. The "Known lossy spots" note in `mermaid/lib/emit.ts` and
           `MERMAID_C4_EXPORT_CAVEAT` both record it. The two structural edits
           are measured the same way: the emitter writes ONE diagram (so the
           child view a nest creates is simply not in the pane's text), and
           its boundary blocks are rebuilt from `x-mermaid.boundaries` plus
           `boundary:` tags — it never reads `C4Diagram.frames` or
           `C4Node.frameId`, so a membership edit has nowhere to land either.
           Writing an edit back through a pane that cannot spell it would show
           the change once and lose it on the next round trip, which is worse
           than refusing. */
        because:
          "Mermaid C4 has no slot for a node's icon or colour, keeps a tag " +
          "only when it marks a boundary or an external element, and has " +
          "none for [technology] on person or system elements; it also " +
          "holds a single diagram whose boundaries come from the import " +
          "alone, so a boundary or child-view edit would be lost too. " +
          "Switch the pane to .alab to edit on the canvas.",
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
  create: {
    c4: {
      offers: true,
      noun: "C4 diagrams",
      /* "at a spot the text records" carries the ability's whole definition:
         creation here is a PLACEMENT, and the reader can drag the new node
         from that spot because the position is a field of the text — the
         same claim the move clause makes, made at birth. A `^ref` placement
         belongs to this cell rather than to an ability of its own for the
         same reason: what lands is a NEW element at a coordinate — that it
         mirrors a node from an outer level is a property of what was
         created, exactly as the node's type is. */
      onCanvas:
        "a new C4 node — or a reference to an element from an outer level — " +
        "added from the palette, at a spot the text records",
      unlessPane: {
        format: "mermaid",
        // The same measurement the `move` cell cites: `serializeMermaidC4`
        // emits no geometry at all (`mermaid/lib/emit.ts`, "Known lossy
        // spots"), so the spot this gesture writes could not be said in the
        // pane's language — the node would appear wherever the default layout
        // puts it and the placement would be lost on the round trip. A `^ref`
        // fares worse: the emitter never reads `externalRef`, so the
        // placeholder would come back as an ordinary element claiming to BE
        // the thing it only mirrors.
        because:
          "Mermaid carries no geometry, so a placed node would not stay " +
          "put — and a reference's link to its home level has no slot at " +
          "all. Switch the pane to .alab to edit on the canvas.",
      },
    },
    /* The one notation that adds elements ANOTHER way. Its inserts land at an
       INDEX, not a position, so they belong to `revise` (see the ability's
       doc) — but a refusal that only said "no coordinates" would send the
       reader away from two add buttons that are right there in the dock. */
    sequence: {
      offers: false,
      ground: "grammar",
      because: NO_PLACE_IN_THE_TEXT,
      instead:
        "Use the Add controls under the canvas to add a message or a lifeline instead.",
    },
    flowchart: {
      offers: false,
      ground: "grammar",
      because: NO_PLACE_IN_THE_TEXT,
    },
    usecase: {
      offers: false,
      ground: "grammar",
      because: NO_PLACE_IN_THE_TEXT,
    },
    er: { offers: false, ground: "grammar", because: NO_PLACE_IN_THE_TEXT },
    dict: {
      offers: false,
      ground: "grammar",
      because: NO_PLACE_IN_THE_TEXT,
    },
  },
  connect: {
    c4: {
      offers: true,
      noun: "C4 diagrams",
      /* "a relationship line" is the ability's whole definition said outward:
         what lands is a line naming a PAIR, never a coordinate — the claim
         that separates this row from `create`. "or onto a new element added
         with it" is the create-then-connect half, worded so the reader knows
         one gesture yields both lines. */
      onCanvas:
        "a relationship drawn from one C4 element onto another — or onto a " +
        "new element added with it — landing as a relationship line",
      unlessPane: {
        format: "mermaid",
        /* Measured against the emitter, not assumed: `serializeMermaidC4`
           writes ONE diagram (its `Rel`/`BiRel` lines carry only source,
           target, label and technology — no slot for an edge's `id`), so a
           relationship drawn on any other level is simply not in the pane's
           text, and a second relationship on an already-related pair — which
           this gesture may add, `connect-verdict.ts`'s duplicate caution —
           comes back indistinguishable from the first. Writing an edit back
           through a pane that cannot spell it would show the change once and
           lose it on the next round trip, which is worse than refusing. */
        because:
          "Mermaid C4 holds a single diagram and gives a relationship no id, " +
          "so an edge drawn on another level — or a second one on the same " +
          "pair — would be lost. Switch the pane to .alab to edit on the " +
          "canvas.",
      },
    },
    /* The one notation whose relationships are EVENTS: a message has a place
       in time (its index in `items`), so a bare pair-naming line is not in
       the grammar — and the dock's insert, which does write messages, belongs
       to `revise` for the reason the ability doc gives. The refusal points at
       that control rather than at the derived tail, because it is one click
       away. */
    sequence: {
      offers: false,
      ground: "grammar",
      because:
        "In this notation a relationship is a message with a place in time, " +
        "so there is no bare line between two elements to write.",
      instead:
        "Use the Add controls under the canvas to insert a message between two lifelines instead.",
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
    /* `"grammar"`, unlike its three neighbours: a dictionary's grammar holds
       no relationship at all — sections and fields, no line between two
       entries — so no dock could ever move this refusal. */
    dict: {
      offers: false,
      ground: "grammar",
      because:
        "A data dictionary declares fields, not relationships, so there is " +
        "no line between two entries to write.",
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
  create: "given a new element on the canvas",
  connect: "connected on the canvas",
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
 * Every offering cell's `onCanvas` clause, as the list it already is — one
 * entry per (notation, ability) pair the grid says yes to, in the grid's own
 * ability-then-notation order.
 *
 * Exported for `/live`'s "what you can do on the canvas" disclosure, which
 * renders these as bullets, and consumed by `CANVAS_EDITING_PASSAGE` below,
 * which joins them into its one sentence — ONE derivation, so the page a
 * reader scans and the passage an assistant quotes cannot disagree about what
 * a gesture writes. The failure this prevents is the intro's old hand-kept
 * verb list: every new gesture grew the sentence by hand (and grew the
 * check-window that policed it, 240 → 340 → 380 characters) until the intro
 * read as a wall. A clause added to the grid now reaches both surfaces with
 * nothing retyped. `check:canvas-edit` pins this list equal to the grid and
 * pins the disclosure rendering it.
 */
export const CANVAS_GESTURE_CLAUSES: readonly string[] = Object.values(
  CANVAS_EDIT_OFFERS,
).flatMap((cells) =>
  Object.values(cells)
    .filter((offer) => offer.offers)
    .map((offer) => offer.onCanvas),
);

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
  const editable = new Set(
    notations.filter((notation) =>
      Object.values(CANVAS_EDIT_OFFERS).some((cells) => cells[notation].offers),
    ),
  );
  return (
    `An ${APP_NAME} diagram is edited two ways. All ${inWords(notations.length)} ` +
    `notations are edited as source text; ${inWords(editable.size)} of them are ` +
    `also editable on the canvas — ${CANVAS_GESTURE_CLAUSES.join(", and ")}. ` +
    `Either way the change lands in the same one-line-per-element text you ` +
    `review in a pull request.`
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
 * A boundary intent resolved into the membership it writes and, for
 * `{ kind: "new" }`, the one `frame` declaration it mints. Shared by
 * `revisedNodeEdit` (one node's boundary select) and `groupedNodesEdit` (the
 * marquee's grouping), extracted so the two gestures cannot drift on what a
 * choice means — the "two halves of one thing" failure `codebase.md` names.
 *
 * `null` refuses. An unknown existing frame: `in=` naming no frame is a
 * document the parser rejects, and only a pane lagging the canvas can ask for
 * one. A blank new label: the validator refuses an empty frame label, and
 * inventing one would name a boundary nobody asked for. The minted id
 * convention is the editor store's (`createFrame`), so every authoring
 * surface mints the same id for the same label.
 */
function resolvedFrameChoice(
  diagramFrames: readonly C4Frame[],
  choice: C4NodeFrameChoice,
): {
  frameId: string | undefined;
  mintedFrame: { id: string; label: string } | null;
} | null {
  if (choice.kind === "none") return { frameId: undefined, mintedFrame: null };
  if (choice.kind === "existing") {
    if (!diagramFrames.some((frame) => frame.id === choice.frameId)) {
      return null;
    }
    return { frameId: choice.frameId, mintedFrame: null };
  }
  const label = choice.label.trim();
  if (label === "") return null;
  const id = uniqueId(
    `f-${slugify(label, "frame")}`,
    new Set(diagramFrames.map((frame) => frame.id)),
  );
  return { frameId: id, mintedFrame: { id, label } };
}

/**
 * The insert patch for a minted `frame` line, or `null` when the mint must be
 * refused — colour's escape refusal, for frames: a frame the parser did not
 * read from a `frame` line has no span, which means the diagram spells its
 * frames some other way a minted line would collide with.
 *
 * Spliced after the diagram's last `frame` line so frames stay together; a
 * frameless diagram takes the line directly above its first node declaration
 * — the canonical spot, since frames precede nodes. That anchor can BE a line
 * another patch replaces: callers put this insert FIRST in their patch list,
 * because `applyPatches` sorts stably, so on a tied start the empty insert
 * lands above the replaced line instead of below it.
 */
function frameMintPatch(
  spans: ArchTextSpans,
  file: ArchLabFile,
  diagramId: string,
  minted: { id: string; label: string },
): LinePatch | null {
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  const diagramFrames = diagram?.frames ?? [];
  const frameSpans = diagramFrames.flatMap((frame) => {
    const frameSpan = spans.frames.get(spanKey(diagramId, frame.id));
    return frameSpan === undefined ? [] : [frameSpan.end];
  });
  if (frameSpans.length < diagramFrames.length) return null;
  const nodeStarts = (diagram?.nodes ?? []).flatMap((node) => {
    const nodeSpan = spans.nodes.get(spanKey(diagramId, node.id));
    return nodeSpan === undefined ? [] : [nodeSpan.start];
  });
  if (frameSpans.length === 0 && nodeStarts.length === 0) return null;
  const anchor =
    frameSpans.length > 0
      ? Math.max(...frameSpans) + 1
      : Math.min(...nodeStarts);
  return {
    span: { start: anchor, end: anchor - 1 },
    lines: [canonicalFrameLine(minted.id, minted.label)],
  };
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
 * AN ICON EDIT IS PART OF THE SAME BLOCK: `@slug` lives on the declaration
 * line, so the block patch already carries it. Absent `icon` means the type's
 * default — the same omission the format writes — so clearing the picker
 * removes the token rather than spelling a default out; `iconSource` travels
 * only with an icon, exactly as `C4Node` states.
 *
 * A TYPE EDIT REWRITES THE KEYWORD the declaration line opens with, guarded
 * by `creatableNodeTypes` — the Add palette's own derivation, so the panel's
 * select and this guard cannot disagree about what is legal at the level
 * (`container` written into a context diagram would come back from the
 * re-parse as an error the reader cannot act on). What travels with it is
 * decided here, each the less-destructive verdict of its pair:
 *
 *   - THE DEFAULT SIZE FOLLOWS, an authored one stays. A node whose size is
 *     the OLD type's default has no geometry token in the text — omission
 *     means "the default" — so it adopts the NEW type's default and stays
 *     token-free; keeping the old numbers would freeze an accident of the
 *     previous type into an explicit size the author never chose. A size
 *     that differs from the default IS the author's and keeps its bytes.
 *   - THE ICON FIELD IS UNTOUCHED, all three states. An absent icon already
 *     follows the type by construction (`DEFAULT_ICON_BY_TYPE` resolves at
 *     render), an explicit (`!`) one is the author's pick and is never
 *     auto-overridden (`C4Node`'s own rule for technology edits, applied
 *     here too), and an inferred (`~`) one derives from `technology`, which
 *     this edit does not change — so its basis is intact. The silhouette,
 *     the colour role and the `[Type]` metadata line all follow the new
 *     keyword on their own, which is what keeps a former database from
 *     still reading as one.
 *   - A `^ref` MIRROR ELSEWHERE IS NOT REWRITTEN: a mirror's keyword is its
 *     own statement about how the element draws at ITS level, not a
 *     derivation from the source — the format happily mirrors a `system` as
 *     an `external` one level down, and the level rules can force exactly
 *     that. Only the NAME is derived, and a type edit does not touch it.
 *
 * A COLOUR EDIT IS TWO WRITES, because the format spells colour as a pairing:
 * a `#tag` on the node and a `tagcolor` line in the header. The revision
 * carries the INTENT (`C4NodeColorChoice`) and this gesture derives both
 * writes, because the precedence trap lives between them: when a node wears
 * several coloured tags, the FIRST in stored order wins (`resolveTagColor`),
 * so naively appending a tag can lose the race and change nothing. A colour
 * change therefore takes every OTHER colour-carrying tag off the node — on
 * this node those tags were functioning as its colour, and the reader asked
 * for a different one — while the header keeps their `tagcolor` lines, which
 * other nodes may wear. A tag the document already colours is joined, never
 * recoloured: rewriting its header line would repaint every node wearing it,
 * a blast radius a single-element panel must not have. Only a tag the
 * document does NOT define mints a header line, spliced after the last
 * `tagcolor` line (or the header's end), so ten nodes coloured "amber" cost
 * the header one line. `color: undefined` makes no claim at all — the one
 * field of the revision that is not whole-value, argued at its declaration.
 *
 * ONE REFUSAL IS COLOUR'S OWN: a document whose `tagColors` live in a
 * `! meta` escape line instead of `tagcolor` lines cannot take a minted line
 * (the parser rejects the field spelled both ways), and re-emitting would eat
 * the reader's comments over a colour change — so the mint is refused there.
 *
 * A TAG EDIT OWNS THE NON-COLOUR HALF of the node's tag list, and only that
 * half — the division `C4NodeRevision.tags` argues: the colour-carrying tags
 * (`colorTagsOf`) ARE the colour, and a list that could touch them would
 * fight the colour intent over precedence. So `tags` replaces the plain tags
 * wholesale, the colour outcome above keeps its own, and a value naming a
 * tag the document colours — or an empty string, which would spell `#""` —
 * is REFUSED rather than merged: silently dropping it would eat typed text,
 * and honouring it would let one control repaint what the other owns. The
 * panel's tag field shows exactly this half and says where the other lives.
 * One bounded cost is inherited rather than added: the serializer sorts a
 * tag list on write (`tagsLine`), so on a hand-written file wearing several
 * coloured tags out of order ANY block patch can hand the precedence race to
 * a different tag — true of every revise before this one, since every block
 * patch respells the tags in canonical order.
 *
 * A BOUNDARY EDIT IS MEMBERSHIP PLUS, AT MOST, ONE MINT — colour's shape on a
 * diagram-level declaration. Membership is the node's own `in=`, already on
 * the declaration line the block patch rewrites; only `{ kind: "new" }` adds
 * a second write, a `frame` line minted from the label and spliced after the
 * diagram's last `frame` line (or, when it has none, directly above its first
 * node declaration — the canonical spot, since frames precede nodes). Leaving
 * a boundary (`"none"`, or joining another) never deletes the frame line even
 * when the node was its last member: an empty frame is not drawn but stays
 * declared (`C4Frame`), other nodes may rejoin it, and eating a declaration
 * the author wrote over a membership change is the same blast radius the
 * colour edit refuses. The mint shares colour's escape refusal too: a diagram
 * whose frames the parser did not read from `frame` lines cannot take one.
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
  const diagram = doc.synced.file.diagrams.find(
    (candidate) => candidate.id === diagramId,
  );
  if (diagram === undefined) return null;
  const current = diagram.nodes.find((candidate) => candidate.id === nodeId);
  if (current === undefined) return null;
  if (current.externalRef !== undefined) return null;
  if (revision.name === "") return null;

  /* DESTRUCTURED, not spread from `revision` directly — the same "whole value"
     contract `revisedMessageEdit` argues at length: `{ ...current, ...revision }`
     cannot REMOVE a field, because an optional key the caller omitted is simply
     not in the spread. Naming each makes it present as a variable,
     `undefined` included, which is what overwrites the value the reader
     cleared — and `emitNode` writes an optional field only for a string, so an
     explicit `undefined` is simply not written. This destructure and
     `C4NodeRevision` are one unit: a field added there needs a name here or it
     is silently ignored. (`type` and `tags` are the exceptions, resolved
     below rather than named here, because both are claim-fields whose
     `undefined` means "keep" — their declarations carry the argument.) */
  const { name, technology, description, icon, color } = revision;
  // "Present only when `icon` is" (C4Node): a source marker on a cleared icon
  // would be a `! iconSource` escape line describing nothing.
  const iconSource = icon === undefined ? undefined : revision.iconSource;

  /* The type claim, guarded by the Add palette's own derivation — the header
     states what follows a change (the default size) and what deliberately
     does not (the icon field, `^ref` mirrors elsewhere). */
  const type = revision.type ?? current.type;
  if (
    type !== current.type &&
    !creatableNodeTypes(diagram.level).some((row) => row.type === type)
  ) {
    return null;
  }
  const oldDefault = defaultSizeFor(current.type);
  const size =
    type !== current.type &&
    current.size.width === oldDefault.width &&
    current.size.height === oldDefault.height
      ? defaultSizeFor(type)
      : current.size;

  /* The colour intent, resolved into the colour-carrying tags the node ends
     up wearing and, at most, one minted header line. `worn` is every
     colour-carrying tag in stored order; the choice is already in force
     exactly when the chosen tag is the FIRST of them (or, for "role", when
     there are none) — anything else and the colour half is rewritten. */
  const tagColors = doc.synced.file.metadata.tagColors;
  const worn = colorTagsOf(current, tagColors);
  let colorHalf: readonly string[] = worn;
  let minted: { tag: string; color: string } | null = null;
  if (color !== undefined) {
    const chosen = color.kind === "tag" ? color : null;
    const inForce =
      chosen === null ? worn.length === 0 : worn[0] === chosen.tag;
    if (!inForce) {
      colorHalf = chosen === null ? [] : [chosen.tag];
      if (chosen !== null && (tagColors?.[chosen.tag] ?? "") === "") {
        // A mint with no colour in it is not a colour choice.
        if (chosen.color === "") return null;
        minted = { tag: chosen.tag, color: chosen.color };
      }
    }
  }

  /* The tags claim owns the OTHER half — the header's division. Refusals
     rather than repairs, because both bad values arrive only from a caller
     that skipped the panel (the field filters colour tags out and says so):
     a colour-carrying tag would fight the colour intent over precedence,
     and an empty string would spell `#""`. */
  let plainHalf = (current.tags ?? []).filter((tag) => !worn.includes(tag));
  if (revision.tags !== undefined) {
    if (
      revision.tags.some((tag) => tag === "" || (tagColors?.[tag] ?? "") !== "")
    ) {
      return null;
    }
    plainHalf = [...new Set(revision.tags)];
  }
  /* Sorted because that is the order the serializer writes and the re-parse
     will store; [] becomes absence, as everywhere in the format. The current
     ARRAY survives (reference untouched) when the members are unchanged, so
     the no-op test below stays an identity check. */
  const nextTags = [...new Set([...colorHalf, ...plainHalf])].sort();
  const currentTags = current.tags ?? [];
  const tags =
    nextTags.length === currentTags.length &&
    nextTags.every((tag) => currentTags.includes(tag))
      ? current.tags
      : nextTags.length === 0
        ? undefined
        : nextTags;

  /* The boundary intent, resolved into membership and at most one mint by the
     helper the marquee's grouping shares — its header carries the refusals
     (an unknown existing frame, a blank new label) and why each is refused. */
  const diagramFrames = diagram.frames ?? [];
  let frameId = current.frameId;
  let mintedFrame: { id: string; label: string } | null = null;
  if (revision.frame !== undefined) {
    const resolved = resolvedFrameChoice(diagramFrames, revision.frame);
    if (resolved === null) return null;
    ({ frameId, mintedFrame } = resolved);
  }

  if (
    current.name === name &&
    current.type === type &&
    current.technology === technology &&
    current.description === description &&
    current.icon === icon &&
    current.iconSource === iconSource &&
    // Reference equality is the change test on purpose: `tags` is reassigned
    // exactly when a claim computed a genuinely different list, and `size`
    // exactly when a type change re-derived the default.
    current.tags === tags &&
    current.size === size &&
    minted === null &&
    current.frameId === frameId &&
    mintedFrame === null
  ) {
    return null;
  }

  const withNode = mapDiagram(doc.synced.file, diagramId, (candidate) => ({
    ...candidate,
    // Spread-guarded so a diagram that has no `frames` key does not gain one
    // holding `undefined` — absence is how the format spells "no boundaries".
    ...(mintedFrame === null
      ? {}
      : { frames: [...(candidate.frames ?? []), mintedFrame] }),
    nodes: candidate.nodes.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            name,
            type,
            size,
            technology,
            description,
            icon,
            iconSource,
            tags,
            frameId,
          }
        : node,
    ),
  }));
  const edited: ArchLabFile =
    minted === null
      ? withNode
      : {
          ...withNode,
          metadata: {
            ...withNode.metadata,
            tagColors: { ...tagColors, [minted.tag]: minted.color },
          },
        };

  const patchable = patchablePane(doc, sourceText);
  const span = patchable?.spans.nodes.get(spanKey(diagramId, nodeId));
  const lines = canonicalNodeBlock(edited, diagramId, nodeId);
  if (patchable !== null && span !== undefined && lines !== null) {
    const patches: LinePatch[] = [{ span, lines }];
    if (mintedFrame !== null) {
      /* The mint's splice point and its escape refusal both live in
         `frameMintPatch`, shared with the marquee's grouping. FIRST in
         `patches`, for the tied-anchor rule its header states — the anchor
         can BE the edited node's own line. */
      const insert = frameMintPatch(
        patchable.spans,
        doc.synced.file,
        diagramId,
        mintedFrame,
      );
      if (insert === null) return null;
      patches.unshift(insert);
    }
    if (minted !== null) {
      /* The mint refusal argued in the header: `tagcolor` lines the parser
         recorded are the only proof the map is spelled as lines. An entry
         with no line means a `! meta` escape holds it, and a minted line
         beside that would fail the re-parse — refusing beats an edit that
         silently applies nothing. */
      const headerSpans = patchable.spans.header;
      const placeable = Object.keys(tagColors ?? {}).every((tag) =>
        headerSpans.tagColors.has(tag),
      );
      if (!placeable) return null;
      const anchor =
        headerSpans.tagColors.size > 0
          ? Math.max(...headerSpans.tagColors.values())
          : headerSpans.end;
      patches.push({
        span: { start: anchor + 1, end: anchor },
        lines: [canonicalTagColorLine(minted.tag, minted.color)],
      });
    }
    return adopt(doc, edited, applyPatches(sourceText, patches));
  }
  return adopt(doc, edited, null);
}

/**
 * `doc` with one frame's label rewritten, or `null` when the edit cannot
 * apply — a document that refuses `"revise"`, a frame that is not in the
 * diagram, a blank label, or a label that is already what the frame has.
 * This is the gesture behind selecting a boundary on the canvas and renaming
 * it in its details card.
 *
 * PART OF `"revise"`, NOT A FOURTH ABILITY, by the ability doc's own test: a
 * new ability is owed only when a gesture gates on a fact the existing ones
 * do not ask about, and this one gates on exactly the two facts every revise
 * gates on — an `.alab` C4 pane and the canvas unlocked. A frame is an
 * element of the grammar with its own declaration line and its own span
 * (`spans.frames`), so rewriting its label is the same shape as rewriting a
 * node's name; the C4 revise cell's Mermaid caveat already covers it for the
 * measured reason the grouping cites — the Mermaid emitter rebuilds its
 * boundary blocks from `x-mermaid.boundaries` plus `boundary:` tags and never
 * reads `C4Diagram.frames`, so a renamed label would be lost on the round
 * trip.
 *
 * A RENAME PATCHES EXACTLY ONE LINE — the frame's declaration, the only line
 * a frame has (`spans.frames` records it as a one-line span). The line is
 * `canonicalFrameDeclaration`'s answer for the edited model, so a nested
 * frame's `in=` comes back exactly as the serializer would spell it rather
 * than being re-derived here. Members are untouched: they name the frame by
 * ID (`in=<id>`), and the id is deliberately NOT re-minted from the new label
 * — rewriting every member's declaration line to chase a cosmetic slug would
 * give a one-word rename the blast radius of a grouping.
 *
 * A BLANK LABEL IS REFUSED, not passed through: the serializer refuses an
 * empty frame label outright (as the validator does), so accepting it would
 * turn an Apply into a dropped edit further down with nothing to say why —
 * the same rule the node revise states for an empty name.
 */
export function renamedFrameEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  frameId: string,
  label: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "c4") {
    return null;
  }
  const file = doc.synced.file;
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  const frame = diagram?.frames?.find((candidate) => candidate.id === frameId);
  if (frame === undefined) return null;
  const trimmed = label.trim();
  if (trimmed === "") return null;
  // `null` for an unchanged label keeps "one text change per gesture" true
  // for a form submitted without an edit in it — every gesture's contract.
  if (frame.label === trimmed) return null;

  const edited = mapDiagram(file, diagramId, (current) => ({
    ...current,
    frames: (current.frames ?? []).map((candidate) =>
      candidate.id === frameId ? { ...candidate, label: trimmed } : candidate,
    ),
  }));

  const patchable = patchablePane(doc, sourceText);
  const span = patchable?.spans.frames.get(spanKey(diagramId, frameId));
  const line = canonicalFrameDeclaration(edited, diagramId, frameId);
  if (span !== undefined && line !== null) {
    return adopt(
      doc,
      edited,
      applyPatches(sourceText, [{ span, lines: [line] }]),
    );
  }
  return adopt(doc, edited, null);
}

/**
 * `doc` with EVERY node in `nodeIds` given one boundary — an existing frame,
 * none, or a frame this edit mints — or `null` when the edit cannot apply.
 * This is the marquee gesture's write: lasso several elements, name a
 * boundary, and the grouping lands as ONE text and therefore ONE undo entry.
 *
 * PART OF `"revise"`, NOT A FOURTH ABILITY. The ability doc above says a new
 * ability is owed only when a gesture gates on a fact the existing ones do
 * not ask about; this gesture gates on exactly the two facts every revise
 * gates on (an `.alab` C4 pane, the canvas unlocked) and writes exactly the
 * field the panel's boundary select already writes — `frameId`, on each
 * member's own declaration line — just for N members in one splice. The C4
 * revise cell's Mermaid refusal covers it for the same measured reason: the
 * Mermaid emitter never reads `C4Node.frameId`, so a membership written
 * against that pane would be lost on the round trip.
 *
 * ONE PATCH LIST, ONE UNDO ENTRY, and that is the contract the gesture exists
 * for: N declaration-line rewrites plus at most one minted `frame` line all
 * go through `applyPatches` once, so the page adopts one text and Cmd/Ctrl+Z
 * reverses the whole grouping. A grouping that took N undos to unwind would
 * strand the reader halfway through a boundary state they never asked to see.
 * `check:canvas-edit` pins both halves — the single edit here, the single
 * `applyCanvasEdit` call in the host.
 *
 * A SELECTION NAMING AN UNKNOWN ID REFUSES WHOLLY — `null`, nothing partial.
 * The only way the list can name a node the document lacks is the pane
 * lagging the canvas (the marquee reads the same diagram the canvas draws),
 * and grouping "what it legally can" would draw a boundary missing members
 * the reader plainly lassoed — a half-applied gesture that looks like a bug.
 * The caller announces the one cause the reader can act on.
 *
 * A `^ref` PLACEHOLDER IS A LEGAL MEMBER, and that is deliberately NOT
 * `revisedNodeEdit`'s refusal: that gesture rewrites the mirror's OWN fields,
 * which are derived from its target and would fork. Membership is not
 * derived — `in=` is a fact about where the mirror sits in THIS diagram, the
 * serializer writes it beside the `^` token, and a lasso that excluded
 * placeholders would refuse exactly the drawings placeholders exist for: a
 * boundary grouping local elements with the mirror of the system above them.
 *
 * EACH MEMBER'S PATCH IS ONE LINE — the declaration line, where `in=` lives —
 * never the block: a grouping has no business near anyone's `desc`
 * continuation lines, so they keep their bytes by never being spliced. A
 * member already in the chosen frame is left byte-untouched (no patch, no new
 * model object), and if EVERY member already has the chosen membership the
 * whole edit refuses (`null`) so an idle Apply costs no undo entry — the
 * contract every gesture in this module states.
 */
export function groupedNodesEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  nodeIds: readonly string[],
  frame: C4NodeFrameChoice,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "c4") {
    return null;
  }
  const file = doc.synced.file;
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;
  const wanted = new Set(nodeIds);
  if (wanted.size === 0) return null;
  const members = diagram.nodes.filter((node) => wanted.has(node.id));
  if (members.length !== wanted.size) return null;

  const resolved = resolvedFrameChoice(diagram.frames ?? [], frame);
  if (resolved === null) return null;
  const { frameId, mintedFrame } = resolved;

  const movers = members.filter((member) => member.frameId !== frameId);
  if (movers.length === 0 && mintedFrame === null) return null;
  const moving = new Set(movers.map((member) => member.id));

  const edited = mapDiagram(file, diagramId, (current) => ({
    ...current,
    // Spread-guarded for `revisedNodeEdit`'s reason: absence is how the
    // format spells "no boundaries".
    ...(mintedFrame === null
      ? {}
      : { frames: [...(current.frames ?? []), mintedFrame] }),
    // Only the movers get new objects: an untouched member keeps its
    // identity, so the projection cache keeps its node and React Flow
    // re-adopts nothing the gesture did not change.
    nodes: current.nodes.map((node) =>
      moving.has(node.id) ? { ...node, frameId } : node,
    ),
  }));

  const patchable = patchablePane(doc, sourceText);
  if (patchable !== null) {
    const rewrites = movers.map((member) => {
      const span = patchable.spans.nodes.get(spanKey(diagramId, member.id));
      const line = canonicalNodeLine(edited, diagramId, member.id);
      return span === undefined || line === null
        ? undefined
        : { span: { start: span.start, end: span.start }, lines: [line] };
    });
    // Every patch or none — the delete's rule, for the grouping's reason: a
    // partial splice would draw a boundary missing members the reader chose.
    if (rewrites.every((patch) => patch !== undefined)) {
      const patches = rewrites as LinePatch[];
      if (mintedFrame !== null) {
        const insert = frameMintPatch(
          patchable.spans,
          file,
          diagramId,
          mintedFrame,
        );
        if (insert === null) return null;
        // FIRST, for the tied-anchor rule `frameMintPatch` states.
        patches.unshift(insert);
      }
      return adopt(doc, edited, applyPatches(sourceText, patches));
    }
  }
  return adopt(doc, edited, null);
}

/**
 * The name a created node is born with — "New person", "New database" — from
 * the type's own `.alab` keyword, so the placeholder teaches the word the
 * source pane just gained. A placeholder the reader can SEE they have to
 * change beats an empty box they cannot tell from a rendering fault, and the
 * model requires a non-empty name anyway (`emitNode` refuses `""`), so there
 * is no "unnamed" option to choose instead — the same reasoning
 * `INSERTED_PARTICIPANT_NAME` documents for the sequence canvas. Exported so
 * the announcement can quote the exact name the reader should go rename.
 */
export function createdNodeName(type: C4NodeType): string {
  return `New ${KEYWORD_BY_NODE_TYPE[type]}`;
}

/**
 * The id a created node gets: the keyword-derived stem (`new-person`),
 * suffixed from 2 until nothing in the file holds it — node ids are unique
 * FILE-wide, not per diagram (`validate.ts`), so the whole file is scanned.
 * Deterministic on purpose: pressing the button twice must yield
 * `new-person`, `new-person-2`, never a random token in the author's text.
 * Not slugified from the display name, for the reason `INSERTED_PARTICIPANT_ID`
 * gives: an id is a grammar token, a name is prose, and deriving one from the
 * other puts a slugifier on the path of every create.
 */
function freshNodeId(file: ArchLabFile, type: C4NodeType): string {
  return uniqueId(`new-${KEYWORD_BY_NODE_TYPE[type]}`, takenNodeIds(file));
}

/**
 * `edit` carrying the id of the node a create gesture just minted, so the
 * canvas can centre on it and select it — see `CanvasEdit.createdNodeId` for
 * why the id rides the edit itself. `null` passes through untouched: a refused
 * create created nothing to name.
 */
function asCreated(edit: CanvasEdit | null, nodeId: string): CanvasEdit | null {
  return edit === null ? null : { ...edit, createdNodeId: nodeId };
}

/** Every node id in the file — the set a new node id de-collides against,
 *  because node ids are unique FILE-wide, not per diagram (`validate.ts`). */
function takenNodeIds(file: ArchLabFile): Set<string> {
  return new Set(
    file.diagrams.flatMap((diagram) => diagram.nodes.map((node) => node.id)),
  );
}

/**
 * The clear band between the diagram's lowest edge and a created node, px.
 * A multiple of `EDIT_GRID` (so the snap above cannot eat it) and roughly a
 * node's height: enough that the newcomer reads as "yours to place", not as a
 * new bottom row of the diagram — the default layout's own 120px row gutter
 * would claim exactly that.
 */
const CREATED_NODE_GAP = 80;

/**
 * Where a created node lands: on the format's grid, in a clear band BELOW
 * everything the diagram already draws.
 *
 * BELOW, not "the first free gap": every existing node — authored geometry or
 * default-laid — keeps its y, so a spot strictly under the lowest bottom edge
 * cannot overlap anything, and that stays true through the re-parse. That
 * last clause is the subtle half: inserting a node changes the DEFAULT layout
 * of the diagram (a new id joins row 0), so nodes whose geometry the text
 * omits may shift COLUMNS on the way back in — exactly as they would had the
 * line been typed into the pane — but never rows, because an edgeless node
 * adds no layer. A gap-seeking position computed against the pre-insert
 * layout could be stale by the time it is parsed; "below all of it" cannot.
 *
 * An EMPTY diagram takes the default layout's own answer for a lone node
 * rather than a hand-typed origin, so the one magic pair (40, 40) stays where
 * `defaults.ts` defines it — and the serializer then omits the geometry token
 * entirely, because the position IS the default.
 */
function vacantPosition(diagram: C4Diagram, nodeId: string): Point {
  if (diagram.nodes.length === 0) {
    return defaultPositions([nodeId], []).get(nodeId) ?? { x: 0, y: 0 };
  }
  const onGrid = (value: number): number =>
    Math.round(value / EDIT_GRID) * EDIT_GRID;
  const left = Math.min(...diagram.nodes.map((node) => node.position.x));
  const bottom = Math.max(
    ...diagram.nodes.map((node) => node.position.y + node.size.height),
  );
  return { x: onGrid(left), y: onGrid(bottom) + CREATED_NODE_GAP };
}

/**
 * `doc` with one new node of `type` added to `diagramId`, or `null` when the
 * edit cannot apply — a document that refuses `"create"`, a diagram that is
 * not in it, or a type that is not legal at the diagram's level.
 *
 * THE TYPE IS RE-CHECKED HERE, not trusted from the palette: the palette and
 * this guard read the same `creatableNodeTypes` derivation, so they cannot
 * disagree, and the check pins that derivation to the parser's own
 * `VALID_NODE_TYPES_BY_LEVEL` — a `container` written into a context diagram
 * would otherwise come back from the re-parse as an error the reader cannot
 * act on.
 *
 * A CREATE PATCHES EXACTLY ONE LINE — the new declaration, spliced directly
 * after the diagram's LAST node declaration, so the author's own ordering is
 * respected (nodes stay with nodes, ahead of the relationship lines) and the
 * diff a reviewer sees is one added line. The line is `canonicalNodeLine`'s
 * answer for the edited model, so it cannot be non-canonical; it carries a
 * geometry token exactly when the chosen spot differs from the default
 * layout's (see `vacantPosition`).
 *
 * A diagram with NO node lines to sit after falls back to the re-emit path,
 * stated by `path: "reemit"` as every fallback is: the spans map has node and
 * edge lines only, and inventing a "line after the diagram head" by scanning
 * the text here would be a second parser — the bug class `codebase.md` bans
 * outright. An empty diagram has no comments between its members to lose.
 *
 * NAME AND ID are placeholders derived from the type (`createdNodeName`,
 * `freshNodeId`); the details panel's existing edit form is the intended next
 * gesture, which is why creation does not ask for a name first — one press
 * adds a legal, visible node, and naming it is the same pencil every node
 * already has.
 */
export function createdNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  type: C4NodeType,
): CanvasEdit | null {
  if (!canvasEditability(doc, "create").editable || doc.kind !== "c4") {
    return null;
  }
  const diagram = doc.synced.file.diagrams.find(
    (candidate) => candidate.id === diagramId,
  );
  if (diagram === undefined) return null;
  if (!creatableNodeTypes(diagram.level).some((row) => row.type === type)) {
    return null;
  }

  const id = freshNodeId(doc.synced.file, type);
  const node: C4Node = {
    id,
    type,
    name: createdNodeName(type),
    position: vacantPosition(diagram, id),
    size: defaultSizeFor(type),
  };
  const edited = mapDiagram(doc.synced.file, diagramId, (current) => ({
    ...current,
    nodes: [...current.nodes, node],
  }));

  const patchable = patchablePane(doc, sourceText);
  const line = canonicalNodeLine(edited, diagramId, id);
  if (patchable !== null && line !== null) {
    const ends = diagram.nodes.flatMap((existing) => {
      const span = patchable.spans.nodes.get(spanKey(diagramId, existing.id));
      return span === undefined ? [] : [span.end];
    });
    if (ends.length > 0) {
      const after = Math.max(...ends);
      return asCreated(
        adopt(
          doc,
          edited,
          applyPatches(sourceText, [
            { span: { start: after + 1, end: after }, lines: [line] },
          ]),
        ),
        id,
      );
    }
  }
  return asCreated(adopt(doc, edited, null), id);
}

/**
 * `doc` with one `^ref` boundary placeholder added to `diagramId`, mirroring
 * `source` from an outer level, or `null` when the edit cannot apply — a
 * document that refuses `"create"`, a diagram that is not in it, or a source
 * the reference rules exclude.
 *
 * THE SOURCE IS RE-CHECKED AGAINST `referenceableNodes`, not trusted from the
 * picker — the same one-derivation contract `createdNodeEdit` has with
 * `creatableNodeTypes`: the picker offers exactly what this guard accepts
 * (ancestor diagrams only, level-legal types, no ref of a ref, one mirror per
 * original per diagram — the module states each filter's rationale), so the
 * UI can never offer a reference that comes back as a parse error.
 *
 * WHAT THE LINE CARRIES, and deliberately does not: the type keyword (the
 * grammar requires one) and the `^diagram/node` token — and NO name, because
 * the node is created with the source's own name and the serializer omits a
 * name the reference derives, which is the format's "same as the source"
 * (see `revisedNodeEdit`'s rename notes: renaming the original then reaches
 * this mirror through the re-parse). The editor's placeholders also COPY
 * technology, description and icon (`REF_MIRRORED_KEYS`), but the editor has
 * `syncRefPlaceholders` to keep the copies honest and this surface has
 * nothing that would — a copied field here would be a second answer that goes
 * quietly stale the first time the original is edited in the pane. The name
 * is safe to mirror precisely because it is spelled as OMISSION and derived
 * on every parse rather than stored twice.
 *
 * A REF CREATE IS THE SAME INSERT PATCH as `createdNodeEdit` — one line,
 * spliced after the diagram's last node declaration, placed by
 * `vacantPosition` in the clear band below everything drawn. The same empty-
 * diagram fallback applies, and for the same no-second-parser reason.
 */
export function createdRefEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  source: ExternalRef,
): CanvasEdit | null {
  if (!canvasEditability(doc, "create").editable || doc.kind !== "c4") {
    return null;
  }
  const file = doc.synced.file;
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;
  const chosen = referenceableNodes(file.diagrams, diagramId).find(
    (candidate) =>
      candidate.sourceDiagramId === source.diagramId &&
      candidate.node.id === source.nodeId,
  );
  if (chosen === undefined) return null;
  const origin = chosen.node;

  // The editor's id convention for a placeholder (`createRefNode`), so both
  // authoring surfaces mint the same id for the same original.
  const id = uniqueId(
    slugify(`${origin.name}-ref`, slugify(origin.type, "node")),
    takenNodeIds(file),
  );
  const node: C4Node = {
    id,
    type: origin.type,
    name: origin.name,
    position: vacantPosition(diagram, id),
    size: defaultSizeFor(origin.type),
    externalRef: { diagramId: source.diagramId, nodeId: source.nodeId },
  };
  const edited = mapDiagram(file, diagramId, (current) => ({
    ...current,
    nodes: [...current.nodes, node],
  }));

  const patchable = patchablePane(doc, sourceText);
  const lines = canonicalNodeBlock(edited, diagramId, id);
  if (patchable !== null && lines !== null) {
    const ends = diagram.nodes.flatMap((existing) => {
      const span = patchable.spans.nodes.get(spanKey(diagramId, existing.id));
      return span === undefined ? [] : [span.end];
    });
    if (ends.length > 0) {
      const after = Math.max(...ends);
      return asCreated(
        adopt(
          doc,
          edited,
          applyPatches(sourceText, [
            { span: { start: after + 1, end: after }, lines },
          ]),
        ),
        id,
      );
    }
  }
  return asCreated(adopt(doc, edited, null), id);
}

/** Every edge id in the file — the set a new edge id de-collides against.
 *  File-wide, matching the editor's `createEdge` (`collectEdgeIds`): edge ids
 *  follow the node-id uniqueness convention, and a duplicate pair's second
 *  edge needs a suffixed id the whole file agrees is free. */
function takenEdgeIds(file: ArchLabFile): Set<string> {
  return new Set(
    file.diagrams.flatMap((diagram) => diagram.edges.map((edge) => edge.id)),
  );
}

/**
 * The insert patch for one new relationship line, or `null` when the pane
 * cannot take the splice (a span the parser did not record) — the caller
 * falls back to the re-emit path exactly as the create gestures do.
 *
 * SPLICED AFTER THE DIAGRAM'S LAST RELATIONSHIP LINE, so edges stay with
 * edges — the create gesture's ordering argument, one section down. A diagram
 * with no edge lines yet takes the line after its LAST node declaration, with
 * the blank separator the serializer writes between the two sections
 * (`emitDiagram`), so the first connect leaves the diagram spelled exactly as
 * a full serialise would order it. That anchor can TIE with a node line
 * another patch inserts (create-then-connect): callers put the node patch
 * FIRST in their list, because `applyPatches` sorts stably, so the new node's
 * declaration lands above the blank-plus-edge rather than below it.
 */
function edgeInsertPatch(
  spans: ArchTextSpans,
  diagram: C4Diagram,
  edited: ArchLabFile,
  diagramId: string,
  edgeId: string,
): LinePatch | null {
  const lines = canonicalEdgeBlock(edited, diagramId, edgeId);
  if (lines === null) return null;
  const edgeEnds = diagram.edges.flatMap((edge) => {
    const span = spans.edges.get(spanKey(diagramId, edge.id));
    return span === undefined ? [] : [span.end];
  });
  if (edgeEnds.length < diagram.edges.length) return null;
  if (edgeEnds.length > 0) {
    const after = Math.max(...edgeEnds);
    return { span: { start: after + 1, end: after }, lines };
  }
  const nodeEnds = diagram.nodes.flatMap((node) => {
    const span = spans.nodes.get(spanKey(diagramId, node.id));
    return span === undefined ? [] : [span.end];
  });
  if (nodeEnds.length === 0) return null;
  const after = Math.max(...nodeEnds);
  return { span: { start: after + 1, end: after }, lines: ["", ...lines] };
}

/**
 * `doc` with one new relationship from `sourceId` to `targetId`, or `null`
 * when the edit cannot apply — a document that refuses `"connect"`, an
 * endpoint that is not in THIS diagram, or the same element twice.
 *
 * THE REFUSALS FOLLOW THE CONNECT-VERDICT MODEL (`editor/lib/
 * connect-verdict.ts`), which the drag's preview already paints from, so the
 * line under the cursor and this verdict cannot disagree:
 *
 *   - A SELF-EDGE REFUSES — the verdict model's `cancel`: returning to where
 *     a gesture started is the universal abort, and the editor's `createEdge`
 *     refuses the same pair for the same reason.
 *   - AN UNKNOWN OR CROSS-DIAGRAM TARGET REFUSES. `C4Edge.source`/`target`
 *     name nodes in the SAME diagram — an edge into another level is not in
 *     the grammar — so an id this diagram does not hold is refused whether it
 *     exists elsewhere in the file or nowhere at all. Only a pane lagging the
 *     canvas can ask for one.
 *   - A DUPLICATE PAIR IS ALLOWED, deliberately — the verdict model's
 *     `duplicate` is "a caution, never a refusal": parallel relationships are
 *     a real feature (`edge-geometry.ts` draws them as separate curves, A
 *     "reads" B beside A "writes" B), and refusing them here would remove it
 *     to paper over a discoverability problem. The id de-collides
 *     (`e-a-b-2`), and the caller announces the caution.
 *   - A `^ref` PLACEHOLDER IS A LEGAL ENDPOINT, either end — the grouping's
 *     argument, not the field editor's refusal: an edge is a fact about THIS
 *     diagram that the serializer writes beside the `^` token, and drawing
 *     the outer system's mirror talking to local elements is what
 *     placeholders exist for. Nothing derived is forked.
 *
 * WHAT THE LINE CARRIES, and deliberately no more: the pair and the format's
 * defaults — direction `forward` (the editor's `createEdge` default), no
 * label, no technology. The relationship's wording is the details panel's
 * job, exactly as a created node's name is; a gesture that stopped to ask for
 * a label would cost a form before the reader sees the line land.
 *
 * A CONNECT IS AN INSERT PATCH — one relationship line (plus the section's
 * blank separator when this is the diagram's first), spliced by
 * `edgeInsertPatch`; every other byte survives because nothing touched it.
 */
export function connectedNodesEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  sourceId: string,
  targetId: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "connect").editable || doc.kind !== "c4") {
    return null;
  }
  const file = doc.synced.file;
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;

  if (sourceId === targetId) return null;
  if (
    findNode(file, diagramId, sourceId) === null ||
    findNode(file, diagramId, targetId) === null
  ) {
    return null;
  }

  const edge: C4Edge = {
    id: uniqueId(defaultEdgeId(sourceId, targetId), takenEdgeIds(file)),
    source: sourceId,
    target: targetId,
    direction: "forward",
  };
  const edited = mapDiagram(file, diagramId, (current) => ({
    ...current,
    edges: [...current.edges, edge],
  }));

  const patchable = patchablePane(doc, sourceText);
  if (patchable !== null) {
    const insert = edgeInsertPatch(
      patchable.spans,
      diagram,
      edited,
      diagramId,
      edge.id,
    );
    if (insert !== null) {
      return adopt(doc, edited, applyPatches(sourceText, [insert]));
    }
  }
  return adopt(doc, edited, null);
}

/**
 * `doc` with one new node of `type` AND the relationship from `sourceId` to
 * it, or `null` when the edit cannot apply — the connect grip's "or a new
 * element" half: the reader asked for "a new thing this one talks to", and
 * this delivers both halves of that sentence.
 *
 * TWO ABILITIES ARE ASKED, because the gesture genuinely does both things:
 * `"connect"` (its own row — the edge is the point) and `"create"` (it also
 * places a node, so the placement ability's answer must hold too). For a C4
 * document the two refuse in exactly the same case (a Mermaid pane), but each
 * gate guards its own gesture the day the cells diverge — the rule every
 * entry point in this module follows.
 *
 * ONE TEXT, ONE UNDO ENTRY, deliberately: the node line and the relationship
 * line go through `applyPatches` together, so a single Cmd/Ctrl+Z takes both
 * back. Splitting it into create-then-connect as two edits was rejected
 * because the halfway state is one the reader never asked to see — undoing
 * once would leave a stray unnamed node they did not press for, connected to
 * nothing, and the announcement would have promised a relationship the undo
 * quietly kept half of.
 *
 * NODE PATCH FIRST in the list, for `edgeInsertPatch`'s tied-anchor rule: on
 * a diagram with no relationship lines yet, both inserts anchor after the
 * same last node declaration, and the stable sort keeps list order there.
 *
 * The node itself is `createdNodeEdit`'s in every decision — placeholder name
 * and deterministic id from the type, the clear band below everything drawn
 * (`vacantPosition`), the type re-checked against `creatableNodeTypes` — so
 * the two create gestures cannot drift on what a new element is born as.
 */
export function connectedNewNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  sourceId: string,
  type: C4NodeType,
): CanvasEdit | null {
  if (
    !canvasEditability(doc, "connect").editable ||
    !canvasEditability(doc, "create").editable ||
    doc.kind !== "c4"
  ) {
    return null;
  }
  const file = doc.synced.file;
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;
  if (findNode(file, diagramId, sourceId) === null) return null;
  if (!creatableNodeTypes(diagram.level).some((row) => row.type === type)) {
    return null;
  }

  const id = freshNodeId(file, type);
  const node: C4Node = {
    id,
    type,
    name: createdNodeName(type),
    position: vacantPosition(diagram, id),
    size: defaultSizeFor(type),
  };
  const edge: C4Edge = {
    id: uniqueId(defaultEdgeId(sourceId, id), takenEdgeIds(file)),
    source: sourceId,
    target: id,
    direction: "forward",
  };
  const edited = mapDiagram(file, diagramId, (current) => ({
    ...current,
    nodes: [...current.nodes, node],
    edges: [...current.edges, edge],
  }));

  const patchable = patchablePane(doc, sourceText);
  const line = canonicalNodeLine(edited, diagramId, id);
  if (patchable !== null && line !== null) {
    const nodeEnds = diagram.nodes.flatMap((existing) => {
      const span = patchable.spans.nodes.get(spanKey(diagramId, existing.id));
      return span === undefined ? [] : [span.end];
    });
    const insert = edgeInsertPatch(
      patchable.spans,
      diagram,
      edited,
      diagramId,
      edge.id,
    );
    if (nodeEnds.length > 0 && insert !== null) {
      const after = Math.max(...nodeEnds);
      return asCreated(
        adopt(
          doc,
          edited,
          applyPatches(sourceText, [
            // FIRST, for the tied-anchor rule the header states.
            { span: { start: after + 1, end: after }, lines: [line] },
            insert,
          ]),
        ),
        id,
      );
    }
  }
  return asCreated(adopt(doc, edited, null), id);
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

/**
 * `doc` with `nodeId` given a fresh, EMPTY child diagram one level down —
 * `>childId` on its declaration line, and an `@<level> … owner=` block
 * appended to the file — or `null` when the edit cannot apply.
 *
 * THE REFUSALS ARE THE EDITOR STORE'S (`createChildDiagram`), so the two
 * authoring surfaces draw one line: a `code`-level diagram has no level below
 * it; a node that already has a child, or a `childRef` into another file, is
 * not re-pointed (the existing child is somebody's work, and silently
 * replacing a pointer is how a level goes missing); a `^ref` placeholder
 * cannot own a level, because it only mirrors a node whose internals live
 * where the original does. An explicit `>null` IS overwritten — the author
 * spelled "deliberately a leaf", and this gesture is the author changing
 * that answer, exactly as the store treats it.
 *
 * WHAT THE MINTED BLOCK SAYS, and what it deliberately omits: the child's
 * title IS the node's name, so the serializer omits it and the title derives
 * on every parse — a later rename reaches the child's breadcrumb through the
 * text itself, the same omission contract the `^ref` name rides. `in=` is
 * omitted too (the parent is inferred from `owner=`). So the whole block is
 * one head line, `@<level> <id> owner=<nodeId>`, derived from the serializer
 * (`canonicalDiagramBlock`) rather than assembled here. The id follows the
 * store's convention (`d-<level>-<node>`), de-collided file-wide.
 *
 * APPENDED AT THE END OF THE FILE, after a blank separator, because that is
 * the one splice point that is always valid: a diagram block ends at the next
 * `@` head or at the end of input, so nothing can be split. The model appends
 * the diagram last for the same reason — stored order is text order.
 *
 * AN EMPTY CHILD IS NOT AN ORPHAN, and creating one is the point: it is
 * reachable (owner and parent both wired, which is what `describe_model`'s
 * orphan report checks), the details panel offers the drill into it, and the
 * palette on the empty canvas is how it gets filled. The way BACK OUT is
 * `unnestedNodeEdit` below, so an accidental nest never leaves the node
 * permanently undeletable behind `ownsChildDiagram`'s refusal.
 */
export function nestedNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  nodeId: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "c4") {
    return null;
  }
  const file = doc.synced.file;
  const diagram = file.diagrams.find((candidate) => candidate.id === diagramId);
  if (diagram === undefined) return null;
  const current = findNode(file, diagramId, nodeId);
  if (current === null) return null;
  const childLevel = childLevelOf(diagram.level);
  if (childLevel === null) return null;
  if (
    typeof current.childDiagramId === "string" &&
    current.childDiagramId !== ""
  ) {
    return null;
  }
  if (current.childRef !== undefined) return null;
  if (current.externalRef !== undefined) return null;

  const childId = uniqueId(
    `d-${childLevel}-${slugify(nodeId, "node")}`,
    new Set(file.diagrams.map((candidate) => candidate.id)),
  );
  const child: C4Diagram = {
    id: childId,
    level: childLevel,
    title: current.name,
    ownerNodeId: nodeId,
    parentDiagramId: diagramId,
    nodes: [],
    edges: [],
  };
  const pointed = mapDiagram(file, diagramId, (candidate) => ({
    ...candidate,
    nodes: candidate.nodes.map((node) =>
      node.id === nodeId ? { ...node, childDiagramId: childId } : node,
    ),
  }));
  const edited: ArchLabFile = {
    ...pointed,
    diagrams: [...pointed.diagrams, child],
  };

  const patchable = patchablePane(doc, sourceText);
  const span = patchable?.spans.nodes.get(spanKey(diagramId, nodeId));
  const line = canonicalNodeLine(edited, diagramId, nodeId);
  const block = canonicalDiagramBlock(edited, childId);
  if (
    patchable !== null &&
    span !== undefined &&
    line !== null &&
    block !== null
  ) {
    /* End-of-file arithmetic: a text ending in "\n" splits to a final empty
       element, and the block goes ABOVE it so the file keeps its final
       newline; a text the author left without one keeps that too. */
    const split = sourceText.split("\n");
    const anchor =
      split[split.length - 1] === "" ? split.length - 1 : split.length;
    return adopt(
      doc,
      edited,
      applyPatches(sourceText, [
        { span: { start: span.start, end: span.start }, lines: [line] },
        { span: { start: anchor + 1, end: anchor }, lines: ["", ...block] },
      ]),
    );
  }
  return adopt(doc, edited, null);
}

/**
 * The inverse of `nestedNodeEdit`, and deliberately no more: `doc` with
 * `nodeId`'s child pointer removed and the child's block deleted, or `null`
 * when the edit cannot apply — which includes ANY child that holds anything.
 *
 * ONLY AN EMPTY CHILD MAY BE REMOVED — no nodes, no edges, no frames, no
 * description, no saved camera, no forward-compatibility fields — because
 * this gesture exists to back out of a nest that was created and never
 * filled, not to delete a level of the model from a panel button. A filled
 * child is removed in the source text, where the reader can see every line
 * it takes with it; the same boundary `ownsChildDiagram` draws for Delete.
 * Emptiness is judged on the MODEL, so an escape-spelled field counts as
 * content; a `//` comment under the head is left in place, the node delete's
 * own comment policy.
 *
 * THE SAME EMPTINESS RULE GUARDS THE OTHER DIRECTION: a child that some OTHER
 * line still names — a second `>childId`, a `^childId/…` reference, another
 * diagram's `in=` — is refused, because removing the block would leave those
 * lines pointing at nothing the author can find.
 *
 * A DANGLING POINTER IS THE ONE EXCEPTION: `>childId` naming a diagram the
 * file does not hold blocks nothing and means nothing, so it is cleared with
 * no block to remove — otherwise a hand-written dangling pointer would leave
 * the node permanently refusing deletion with nothing on any canvas to fix it.
 *
 * The removal takes the head line AND the single blank line above it when
 * there is one — the separator the nest wrote — so nest-then-unnest restores
 * the author's bytes exactly. `check:canvas-edit` measures that round trip.
 */
export function unnestedNodeEdit(
  doc: ViewDocument,
  sourceText: string,
  diagramId: string,
  nodeId: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "c4") {
    return null;
  }
  const file = doc.synced.file;
  const current = findNode(file, diagramId, nodeId);
  if (current === null) return null;
  const childId = current.childDiagramId;
  if (typeof childId !== "string" || childId === "") return null;
  const child = file.diagrams.find((candidate) => candidate.id === childId);

  if (child !== undefined) {
    /* Emptiness from the KEY SET, not a field checklist: any key beyond the
       seven a bare diagram has — a description, a viewport, frames, an
       unknown field a newer version wrote — is content this gesture must not
       delete. A checklist would silently pass the field it has never heard
       of, the hardcoded-list failure `codebase.md` habit 4 names. */
    const BARE_DIAGRAM_KEYS = new Set([
      "id",
      "level",
      "title",
      "ownerNodeId",
      "parentDiagramId",
      "nodes",
      "edges",
    ]);
    const empty =
      child.nodes.length === 0 &&
      child.edges.length === 0 &&
      Object.keys(child).every((key) => BARE_DIAGRAM_KEYS.has(key));
    if (!empty) return null;
    const referenced = file.diagrams.some(
      (candidate) =>
        (candidate.id !== childId && candidate.parentDiagramId === childId) ||
        candidate.nodes.some(
          (node) =>
            node.externalRef?.diagramId === childId ||
            (node.childDiagramId === childId &&
              !(candidate.id === diagramId && node.id === nodeId)),
        ),
    );
    if (referenced) return null;
  }

  const cleared = mapDiagram(file, diagramId, (candidate) => ({
    ...candidate,
    nodes: candidate.nodes.map((node) =>
      node.id === nodeId ? { ...node, childDiagramId: undefined } : node,
    ),
  }));
  const edited: ArchLabFile = {
    ...cleared,
    diagrams: cleared.diagrams.filter((candidate) => candidate.id !== childId),
  };

  const patchable = patchablePane(doc, sourceText);
  const span = patchable?.spans.nodes.get(spanKey(diagramId, nodeId));
  const line = canonicalNodeLine(edited, diagramId, nodeId);
  const head =
    child === undefined
      ? null
      : (patchable?.spans.diagramHeads.get(childId) ?? undefined);
  if (
    patchable !== null &&
    span !== undefined &&
    line !== null &&
    head !== undefined
  ) {
    const patches: LinePatch[] = [
      { span: { start: span.start, end: span.start }, lines: [line] },
    ];
    if (head !== null) {
      const split = sourceText.split("\n");
      const blankAbove = head > 1 && split[head - 2].trim() === "";
      patches.push({
        span: { start: blankAbove ? head - 1 : head, end: head },
        lines: [],
      });
    }
    return adopt(doc, edited, applyPatches(sourceText, patches));
  }
  return adopt(doc, edited, null);
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
