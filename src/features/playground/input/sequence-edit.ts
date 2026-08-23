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
 *      and a message's time is its index in `items`. So the gesture set is not
 *      "move" and "delete" but: REVISE (rewrite one element's own wording),
 *      REPOINT (send a message between two other lifelines), INSERT (a message
 *      or a participant), REMOVE (a message or a participant) and TOGGLE the
 *      diagram's one drawing flag, `autonumber`.
 *      `canvasEditability(doc, "revise")` answers for all seven — deliberately
 *      one ability rather than one per gesture, because they gate on the same
 *      two facts (an `.alab` sequence pane, and the canvas unlocked) and a
 *      second ability would be a second thing for `check:canvas-edit` to
 *      derive the lock from. The same function defaulting to `"move"` still
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
 * FOUR HAZARDS NO GESTURE HERE MAY MAKE WORSE, all of them pre-existing and
 * none of them any one gesture's to fix. Activation `+`/`-` is unpaired and
 * unvalidated; `autonumber` renumbers positionally; a note attaches by text
 * position rather than by id; and `updated`, `:participant` and
 * `autonumber false` are omitted at their defaults.
 *
 * The INSERTS are safe for one reason: each adds EXACTLY ONE LINE and
 * renormalises nothing. A whole-document re-emit would have disturbed all four.
 * The NUMBERING TOGGLE is the one gesture that touches a hazard on this list
 * head-on — `autonumber` is one of the three fields omitted at its default —
 * and `toggledAutonumberEdit` is where the three states are argued out.
 *
 * The REMOVALS are the ones that had to answer for themselves, because taking
 * a line out is not symmetrical with putting one in — the document left behind
 * can be one the parser refuses, or one that draws something the reader did not
 * ask for a screen away from where they pressed. Each verdict is written at the
 * gesture, and they are: activation refuses (`activationRefusal`), a referenced
 * participant refuses with a count (`participantRemovalRefusal`), a neighbouring
 * note is carried rather than eaten, an emptied fragment branch is left empty
 * because the grammar permits one, and renumbering is correct behaviour rather
 * than damage. None of those is a guess; `check:sequence` measures each.
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

/**
 * The display name a new participant is created with, on the same reasoning as
 * `INSERTED_MESSAGE_LABEL`: a placeholder you can see you have to change beats
 * an empty lifeline header the reader cannot tell from a rendering fault. The
 * model requires a non-empty name anyway (`emitParticipant` refuses `""`), so
 * there is no "unnamed" option to choose instead.
 */
export const INSERTED_PARTICIPANT_NAME = "New participant";

/**
 * The id stem a new participant gets. An id is a TOKEN in the grammar and the
 * name every message refers to, so it is deliberately not derived from the
 * display name — a name is prose ("New participant" has a space in it) and
 * deriving one from the other would put a slugifier on the path of every
 * insert.
 */
export const INSERTED_PARTICIPANT_ID = "NewParticipant";

/**
 * `INSERTED_PARTICIPANT_ID`, suffixed until nothing already holds it.
 *
 * A COLLISION IS NOT HYPOTHETICAL — pressing the button twice reaches it — and
 * a duplicate id is not a soft failure: the second declaration would silently
 * become a second lifeline the parser cannot tell from the first, or be refused
 * outright. Counting from 2 so the first one is unsuffixed, which is what the
 * reader sees in the common case.
 */
function freshParticipantId(
  participants: readonly SequenceParticipant[],
): string {
  const taken = new Set(participants.map((p) => p.id));
  if (!taken.has(INSERTED_PARTICIPANT_ID)) return INSERTED_PARTICIPANT_ID;
  let suffix = 2;
  while (taken.has(`${INSERTED_PARTICIPANT_ID}${suffix}`)) suffix += 1;
  return `${INSERTED_PARTICIPANT_ID}${suffix}`;
}

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

/**
 * `doc` with one message's ENDPOINTS rewritten, or `null` when the edit cannot
 * apply.
 *
 * The gesture `SequenceMessageRevision` says is "a different gesture" — this
 * one. It is separate from `revisedMessageEdit` rather than four more fields on
 * it because an endpoint is POINTED AT on the canvas, not typed into a form:
 * the caller arms the same two-click lifeline picker an insert uses, so the
 * reader names a lifeline by clicking the lifeline.
 *
 * A WHOLE-BLOCK REWRITE, like both revise gestures and for the same reason —
 * `from` and `to` live on the declaration line, but the block is the unit
 * `canonicalMessageBlock` deals in, and splitting the rule "declaration line
 * only for endpoints, whole block for wording" across two gestures would be
 * two answers to one question. The block's `desc` and `!` lines come back
 * byte-identical, so the wider unit costs nothing here.
 *
 * REFUSES A MESSAGE CARRYING AN ACTIVATION FLAG; `activationRefusal` argues
 * why, and it is the same reason a delete refuses one.
 */
export function repointedMessageEdit(
  doc: ViewDocument,
  sourceText: string,
  path: SequenceItemPath,
  from: string,
  to: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  const current = sequenceItemAt(doc.file.items, path);
  if (current === undefined || current.step !== "message") return null;
  // Same guard, same sentence, as the insert's: an endpoint that is not a
  // declared participant makes a document the parser refuses.
  const byId = new Set(doc.file.participants.map((p) => p.id));
  if (!byId.has(from) || !byId.has(to)) return null;
  if (activationRefusal(doc, path) !== null) return null;

  const edited = replaceItem(doc.file, path, { ...current, from, to });
  /* `patchBlock` refuses an edit that changes no bytes, so repointing a
     message to the endpoints it already had costs no undo entry — the same
     contract a form submitted unchanged gets. */
  return patchBlock(doc, sourceText, edited, (spans, pad) => ({
    span: spans.items.get(sequenceItemKey(path)),
    lines: canonicalMessageBlock(edited, path, pad),
  }));
}

/**
 * `doc` with one message REMOVED — its declaration line and every continuation
 * line it owns — or `null` when the edit cannot apply.
 *
 * EXACTLY ITS OWN BLOCK AND NOTHING ELSE. The span the parser recorded reaches
 * to the message's last continuation line (`endLine`, and `parse.ts` says why
 * it exists), so removing the range removes the `desc` and the `!` escapes with
 * it. Removing only the declaration line would leave an orphan `desc` at
 * indent + 2 with nothing above it to attach to.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT DO, each of them a hazard named in
 * this file's header:
 *
 *   - A NOTE BESIDE THE DELETED MESSAGE IS CARRIED, not deleted with it and not
 *     a reason to refuse. A note is a sibling item with its own span (it is not
 *     attached to a message by any id — `parse.ts`), so it stays valid, stays
 *     on screen and re-anchors to whatever now precedes it. Deleting it too
 *     would be eating the author's prose because it sat next to the thing they
 *     pointed at, which is the whole failure this module exists to prevent;
 *     refusing over it would make most annotated documents undeletable. The
 *     cost is honest and visible: a note may end up describing a step that is
 *     gone, in front of a reader who can see it and say so.
 *   - AN EMPTY FRAGMENT BRANCH IS LEFT EMPTY. Deleting the only message inside
 *     an `alt` lane leaves the lane with no items, which the grammar permits
 *     outright (`SequenceBranch.items` — "may be empty"), so there is nothing
 *     to guard. Measured in `check:sequence`, not assumed.
 *   - AUTONUMBER RENUMBERS. Every later step's number drops by one, which is
 *     what positional numbering means and is the correct answer rather than a
 *     bug to work around.
 */
export function deletedMessageEdit(
  doc: ViewDocument,
  sourceText: string,
  path: SequenceItemPath,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  const current = sequenceItemAt(doc.file.items, path);
  if (current === undefined || current.step !== "message") return null;
  if (activationRefusal(doc, path) !== null) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const span = patchable.spans.items.get(sequenceItemKey(path));
  if (span === undefined) return null;

  /* No `edited` model is built, unlike `deletedNodeEdit` on the C4 side. That
     one needs one because a `^ref` elsewhere has to be REWRITTEN from the
     post-delete model; nothing here refers to a message, so the text patch is
     the whole edit and `adopt`'s re-parse is the only reading of it. */
  return adopt(doc, applyPatches(sourceText, [{ span, lines: [] }]));
}

/**
 * `doc` with one participant REMOVED — its declaration line and continuations —
 * or `null` when the edit cannot apply, which includes every case
 * `participantRemovalRefusal` names.
 *
 * REFUSED, NEVER CASCADED, and this is the one place the sequence canvas
 * deliberately parts company with its C4 sibling. `deletedNodeEdit` takes the
 * edges with the node, and that is right there: an edge is one line, it is
 * drawn touching the node, and a reader deleting a box can see what goes with
 * it. A lifeline's messages are not like that — they are spread down the whole
 * flow, most of them off screen from the header card the reader pressed, and
 * taking them would silently delete steps in fragments they never opened and
 * renumber everything after each one. So this refuses, and says how many
 * messages are in the way. The composition is the point: the reader can now
 * delete those messages on the canvas one at a time, watching each one go, and
 * then delete the lifeline.
 */
export function deletedParticipantEdit(
  doc: ViewDocument,
  sourceText: string,
  participantId: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  /* THIS GUARD IS NOT WHAT KEEPS THE DOCUMENT VALID — `adopt`'s re-parse
     already does, and removing this line was tried: every removal still
     refused, because the text it produces does not parse. What the guard buys
     is the REASON. Without it the caller gets a bare `null`, which it reports
     as "the pane and the diagram do not match yet" — a sentence that is false
     and sends the reader to wait for a parse that already happened. The
     predicate is the same one the dock reads, so the refusal the reader hears
     and the refusal that happens are one answer. */
  if (participantRemovalRefusal(doc, participantId) !== null) return null;

  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;
  const span = patchable.spans.participants.get(participantId);
  if (span === undefined) return null;

  return adopt(doc, applyPatches(sourceText, [{ span, lines: [] }]));
}

/**
 * `doc` with one participant ADDED at the end of the lifeline order, or `null`
 * when the edit cannot apply.
 *
 * EXACTLY ONE LINE, for the same reason the message insert is one line: the new
 * participant carries no `desc`, no `[technology]` and no explicit kind, so its
 * canonical block is one line by construction rather than by a rule this
 * function has to remember. The caller opens the dock on it, so naming it is
 * the next keystroke.
 *
 * WHY IT ALWAYS LANDS AT THE ROOT BODY INDENT, never at the last
 * participant's own. A participant nested in a `box` sits two spaces deeper,
 * and copying that indent would put the new lifeline INSIDE the box — a
 * bracket the reader never asked to widen. Writing at the root indent directly
 * after the last participant closes the box by dedent and leaves its run
 * contiguous, which is the rule `serialize.ts` refuses a document for
 * breaking. (`check:sequence` proves both halves: the line lands outside the
 * box, and the box still round-trips.)
 *
 * WHY THERE IS AN ANCHOR FALLBACK. A document with a title and a bare
 * `@sequence` parses to zero participants, so there is no span to sit after —
 * and that empty document is exactly where "add a lifeline" is most wanted.
 * `spans.bodyLine` is the `@sequence` opener, added to `SequenceSpans` for
 * this gesture under the licence its own comment gives.
 */
export function insertedParticipantEdit(
  doc: ViewDocument,
  sourceText: string,
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;

  const id = freshParticipantId(doc.file.participants);
  const edited: SequenceLabFile = {
    ...doc.file,
    participants: [
      ...doc.file.participants,
      { id, name: INSERTED_PARTICIPANT_NAME },
    ],
  };
  const lines = canonicalParticipantBlock(edited, id, ROOT_ITEM_INDENT);
  if (lines === null || lines.length !== 1) return null;

  /* AFTER THE LAST PARTICIPANT THE PARSER SAW — derived from the span map, so
     it cannot disagree with the parse, and never after the last LINE of the
     section (a trailing comment there is the author's and belongs where they
     put it). A participant declaration may legally precede `autonumber`, so
     the line straight after the opener is a legal home in the empty case. */
  const ends = [...patchable.spans.participants.values()].map((s) => s.end);
  const afterLine =
    ends.length === 0 ? patchable.spans.bodyLine : Math.max(...ends);

  return adopt(
    doc,
    applyPatches(sourceText, [
      { span: { start: afterLine + 1, end: afterLine }, lines },
    ]),
  );
}

/**
 * `doc` with step numbering turned on or off, or `null` when the edit cannot
 * apply.
 *
 * WHAT "ON" AND "OFF" ARE IN THE TEXT, which is the whole of this gesture. The
 * serializer writes three different things (`serialize.ts`): nothing at all for
 * an absent field, `autonumber` for `true`, `autonumber false` for `false`. Two
 * of those three DRAW THE SAME DIAGRAM, so the toggle's own state is
 * `autonumber === true` and the interesting question is only ever which bytes
 * the other state is spelled with.
 *
 *   - absent → on: one line inserted at the head of the body's content, past any
 *     comment or blank line the author opened the block with —
 *     `autonumberAnchor` argues why that and not the opener itself.
 *   - `autonumber false` → on: that line REPLACED, at its own indent. Inserting
 *     a second flag line instead would be a document the parser refuses
 *     outright ("duplicate autonumber line").
 *   - `autonumber` → off: that line rewritten to `restore`, which is what the
 *     document said before the toggle turned numbering on.
 *
 * WHY OFF TAKES A `restore` ARGUMENT INSTEAD OF ALWAYS REMOVING THE LINE.
 * A toggle has two positions and this field has THREE states: absent,
 * `autonumber false`, and `autonumber`. The first two render identically, so
 * one off position has to stand for both — and a rule that always removed the
 * line silently deleted `autonumber false` from the file of an author who had
 * written it by hand. Nothing looked wrong, because the diagram numbers
 * nothing either way; their line was simply gone.
 *
 * Always writing `false` instead trades that for the mirror-image defect: a
 * reader who presses the control twice out of curiosity is left with a line
 * they never authored. Neither rule can be lossless on its own, because the
 * information the off direction needs — which of the two off states this
 * document was in — is not in the text once the flag reads `autonumber`.
 *
 * So the caller supplies it. The host captures the spelling at the moment it
 * turns numbering ON, which is the one moment the answer is still in the file,
 * and hands it back on the way off. Capturing per turn-on rather than per
 * document is what makes it correct with nothing to invalidate: switching
 * document, undoing, or editing the pane cannot leave a stale answer behind,
 * because the next turn-on reads the file again.
 *
 * `"absent"` is the default, so a caller that has nothing remembered — a file
 * that arrived with `autonumber` already on — removes the line, which is the
 * right reading of "the toggle removes what turns it on".
 */
export function toggledAutonumberEdit(
  doc: ViewDocument,
  sourceText: string,
  /** What the off position writes: the spelling this document used before the
   * toggle turned numbering on. */
  restore: "absent" | "false" = "absent",
): CanvasEdit | null {
  if (!canvasEditability(doc, "revise").editable || doc.kind !== "sequence") {
    return null;
  }
  const patchable = patchablePane(doc, sourceText);
  if (patchable === null) return null;

  const lines = sourceText.split("\n");
  const at = patchable.spans.autonumberLine;
  const turningOn = doc.file.autonumber !== true;

  const patch: LinePatch =
    at === null
      ? {
          /* An empty span at the head of the body's CONTENT — the same
             insertion arithmetic `insertedMessageEdit` uses. Always the ON
             flag: no line means the field is absent, and absent already reads
             as off, so this branch cannot be a turn-off. */
          span: {
            start: autonumberAnchor(patchable.spans.bodyLine, lines) + 1,
            end: autonumberAnchor(patchable.spans.bodyLine, lines),
          },
          lines: [`${ROOT_ITEM_INDENT}autonumber`],
        }
      : {
          span: { start: at, end: at },
          /* Both directions rewrite the flag at the indent the author's own
             line carries, on the same rule `patchBlock` follows. Off is a
             removal only when there is nothing to restore — see the header for
             why that answer comes from the caller and not from this text. */
          lines: turningOn
            ? [`${indentOf(lines[at - 1])}autonumber`]
            : restore === "false"
              ? [`${indentOf(lines[at - 1])}autonumber false`]
              : [],
        };

  return adopt(doc, applyPatches(sourceText, [patch]));
}

/**
 * The 1-based line a newly written `autonumber` flag goes AFTER: the last of
 * the author's own leading blank and `//` lines inside the body, or the
 * `@sequence` opener itself when the body has no content.
 *
 * WHY NOT SIMPLY THE OPENER, which is what `insertedParticipantEdit` uses.
 * Because this gesture is the only one a reader can run in both directions on
 * the same line, and the pair has to be lossless: writing the flag straight
 * after the opener would push a comment the author had put at the head of the
 * block down one row, so pressing the control twice out of curiosity would
 * REORDER their prose rather than leave the file where it started.
 * `check:sequence` measures that on-off-on is byte-identical, which is the
 * assertion this function exists to satisfy.
 *
 * SCANNED, not read off the span map, and that is forced rather than chosen:
 * the parser drops comment and blank lines with no capture, so there is no span
 * that can say where the author's leading prose ends. Blank lines are skipped
 * only when real content follows — a body that is nothing but comments and
 * blanks anchors on the opener, because appending past the file's last line
 * would drop the trailing newline the splice otherwise preserves.
 */
function autonumberAnchor(bodyLine: number, lines: readonly string[]): number {
  for (let index = bodyLine; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    // `index` is 0-based, so it is already the line BEFORE the content line.
    return index;
  }
  return bodyLine;
}

/* -------------------------------------------------------------------------- */
/* Refusals, said rather than swallowed                                        */
/* -------------------------------------------------------------------------- */

/*
 * These two are the sequence canvas's `ownsChildDiagram`: a refusal the UI can
 * READ OUT, so a destructive control that declines explains itself instead of
 * looking like a dead key. Both are pure and both are the same predicate the
 * gestures above guard with — one answer to "can this happen", not a check in
 * the module and a different one in the dock.
 */

/**
 * Why the message at `path` cannot be deleted or repointed, or `null` when it
 * can.
 *
 * ONE REASON: it carries an activation flag. `+`/`-` on a message is half of an
 * open/close pairing the parser neither pairs nor validates, so removing or
 * moving one end changes a BAR SEVERAL ROWS AWAY from the arrow the reader
 * pressed — and the layout does not complain, which is what makes it bad. It
 * was measured rather than assumed: an unmatched close is silently dropped and
 * an unmatched open runs to the bottom of the lifeline. Either way the reader
 * presses one thing and something else moves, off screen.
 *
 * So the flag has to come off in the source pane first, where every `+` and `-`
 * in the file is visible at once. That is the same verdict
 * `SequenceMessageRevision` reached for not offering an activation checkbox,
 * and it is deliberately a refusal rather than a rebalance: rebalancing would
 * mean this module deciding which `-` closes which `+`, a pairing the format
 * does not define, and a second authority on it is exactly the "two halves that
 * disagree" failure `codebase.md` names.
 */
export function activationRefusal(
  doc: ViewDocument,
  path: SequenceItemPath,
): string | null {
  if (doc.kind !== "sequence") return null;
  const item = sequenceItemAt(doc.file.items, path);
  if (item === undefined || item.step !== "message") return null;
  const flags = [
    item.activate === true ? "+" : null,
    item.deactivate === true ? "-" : null,
  ].filter((flag) => flag !== null);
  if (flags.length === 0) return null;
  return `This message carries an activation flag (${flags.join(" and ")}), which opens or closes a bar on another row. Remove it in the source text first, then delete or repoint the message.`;
}

/**
 * Why `participantId` cannot be removed, or `null` when it can. Three ways a
 * removal makes a document the PARSER REFUSES, all three measured:
 *
 *   - a message names it as source or target ("does not resolve to a
 *     participant");
 *   - a note names it (the same refusal, from the note's own check);
 *   - it is the only member of a `box`, which then "holds no participants".
 *
 * The counts are in the sentence because "cannot delete" without a number is a
 * dead control: a reader told "4 messages still use it" knows what to do next,
 * and knows when they are done.
 */
export function participantRemovalRefusal(
  doc: ViewDocument,
  participantId: string,
): string | null {
  if (doc.kind !== "sequence") return null;
  const participant = doc.file.participants.find((p) => p.id === participantId);
  if (participant === undefined) {
    return `There is no lifeline called ${participantId} to remove.`;
  }

  const referrers = { messages: 0, notes: 0 };
  const walk = (items: readonly SequenceLabFile["items"][number][]): void => {
    for (const item of items) {
      if (item.step === "message") {
        if (item.from === participantId || item.to === participantId) {
          referrers.messages += 1;
        }
      } else if (item.step === "note") {
        if (item.participants.includes(participantId)) referrers.notes += 1;
      } else {
        for (const branch of item.branches) walk(branch.items);
      }
    }
  };
  walk(doc.file.items);

  if (referrers.messages > 0 || referrers.notes > 0) {
    const parts = [
      referrers.messages > 0
        ? `${referrers.messages} message${referrers.messages === 1 ? "" : "s"}`
        : null,
      referrers.notes > 0
        ? `${referrers.notes} note${referrers.notes === 1 ? "" : "s"}`
        : null,
    ].filter((part) => part !== null);
    return `${participant.name} still has ${parts.join(" and ")} pointing at it. Delete those first — the lifeline goes when nothing refers to it.`;
  }

  /* The box guard is LAST because it is the rarest and the least obvious: a
     one-member box is a bracket around a single lifeline, and taking the
     lifeline out leaves a bracket around nothing, which the grammar cannot
     spell and the parser refuses outright. */
  const soleBox = (doc.file.boxes ?? []).find(
    (box) =>
      box.participants.length === 1 && box.participants[0] === participantId,
  );
  if (soleBox !== undefined) {
    return `${participant.name} is the only lifeline in the “${soleBox.label}” box, and a box cannot be empty. Remove the box in the source text first.`;
  }
  return null;
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
