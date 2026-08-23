/**
 * WHAT MAY BE REORDERED, and why not everything can be.
 *
 * A sequence document has no coordinates. `src/types/sequence.ts` carries no
 * `x`/`y` at all: a participant's column IS its index in `participants`, and a
 * message's time IS its index in `items`. So "move this" is not a geometry edit
 * here — it is an ARRAY REORDER, and the text form of an array reorder is two
 * blocks of the author's own lines trading places
 * (`playground/input/sequence-edit.ts` writes it; this module decides whether
 * it may be written at all).
 *
 * WHY THIS IS A MODULE OF ITS OWN, and not a pair of guards inside the edit.
 * Two callers need the same answer and they sit on opposite sides of the
 * repo's import layering (editor → viewer → sequence, playground consuming all
 * three):
 *
 *   - the EDIT needs the refusal, so a gesture that cannot be written says why;
 *   - the VIEWER needs the legal RANGE, so a drag can only ever be dropped
 *     somewhere the edit will accept. A drop indicator that leads to a refusal
 *     is a control that lies, and the reader reads it as a broken canvas.
 *
 * If those two were computed in different places they would be the "two halves,
 * each self-consistent, that disagree" failure `codebase.md` names — the drag
 * would offer a slot the edit declines. So the range is DERIVED from the same
 * step predicate the refusal reads, and `check:sequence` walks every slot of
 * every document asserting the two agree.
 *
 * A REORDER IS A CHAIN OF ADJACENT SWAPS, which is why the whole vocabulary
 * here is about one step. Bubbling an element to index `to` through single
 * swaps is exactly `splice`-move semantics, so the keyboard (one step) and a
 * drag (several) are the same operation at different lengths rather than two
 * implementations to keep in agreement.
 *
 * PURITY IS LOAD-BEARING: `check:sequence` and `check:canvas-edit` load this
 * through Node's type stripping, which cannot read `.tsx`. Keep new imports
 * pointed at pure modules — `@/types` is the only one it needs.
 */

import type {
  SequenceBox,
  SequenceItem,
  SequenceItemPath,
  SequenceLabFile,
} from "@/types";
import {
  sequenceActivationFlags,
  sequenceItemAt,
  sequenceItemKey,
  sequenceMessagePaths,
} from "@/types";

/**
 * How far a press must travel, in CSS pixels, before it counts as a drag rather
 * than a sloppy click.
 *
 * ONE NUMBER FOR THE WHOLE CANVAS, and the reason it lives in this pure module
 * rather than beside either gesture is that BOTH gestures need it and they are
 * in different components: `handlePointerDown` in the viewer uses it to decide
 * that a pan should swallow its trailing click, and `dragSurface` in the
 * diagram uses it to decide that a reorder should. Two thresholds would mean a
 * press of three pixels could pan without swallowing its click while a press of
 * five reordered — the same press reading as two different intents depending on
 * which surface it started on. `check:canvas-edit` asserts neither file retypes
 * the number.
 */
export const CANVAS_DRAG_THRESHOLD = 4;

/**
 * The slots an element may take, as indices among its own siblings.
 *
 * `min === max === at` means "nothing to reorder into" and is a real answer
 * rather than a refusal: a lone message in a fragment branch, or a lifeline
 * boxed on its own, is simply already where it can be. Callers render no
 * affordance for it, which is the honest reading — a drag handle that can only
 * put the element back where it started is a control that does nothing.
 */
export interface SequenceReorderRange {
  min: number;
  max: number;
  /** The element's current index among those siblings. */
  at: number;
}

/* -------------------------------------------------------------------------- */
/* Messages — reordering in TIME                                              */
/* -------------------------------------------------------------------------- */

/** The sibling list `path` addresses into, and the index it lands on. */
function messageSiblings(
  file: SequenceLabFile,
  path: SequenceItemPath,
): { siblings: readonly SequenceItem[]; index: number } | null {
  if (path.length === 0 || path.length % 2 === 0) return null;
  const parent = path.slice(0, -1);
  const index = path[path.length - 1];
  if (parent.length === 0) return { siblings: file.items, index };
  /* The parent is a `[…, fragmentIndex, branchIndex]` prefix, so the item it
     addresses is the FRAGMENT and the branch is the last segment. Resolved
     through `sequenceItemAt` rather than by a walk of its own — a second path
     walker is the duplication `sequenceItemAt`'s own comment refuses. */
  const fragment = sequenceItemAt(file.items, parent.slice(0, -1));
  if (fragment === undefined || fragment.step !== "fragment") return null;
  const branch = fragment.branches[parent[parent.length - 1]];
  if (branch === undefined) return null;
  return { siblings: branch.items, index };
}

/**
 * Whether a message may TRADE PLACES with a neighbour — the one step every
 * reorder is built from, and therefore the one place the rule lives.
 *
 * Three things disqualify a sibling, and each is a hazard this canvas already
 * refuses elsewhere rather than a new opinion:
 *
 *   - A FRAGMENT. `SequenceSpans` records no span for one (it ends at a dedent,
 *     which the line loop does not track), so there are no lines to trade with.
 *     That is not a limitation to work around: crossing a fragment boundary
 *     would also change the message's NESTING, which is a different edit from
 *     the one the reader asked for.
 *   - A NOTE. A note attaches to nothing — it has no id and no owner, it simply
 *     sits between two items (`parse.ts`) — so a message crossing one silently
 *     re-aims the author's prose at a different step. A DELETE keeps a
 *     neighbouring note for the opposite reason (refusing there would make most
 *     annotated documents undeletable); here the refusal costs one direction of
 *     one move, and the source pane is two feet away.
 *   - AN ACTIVATION FLAG, on either message. `+`/`-` is half of a pairing the
 *     parser neither pairs nor validates, so moving one end changes a bar
 *     several rows from the arrow the reader dragged. `activationRefusal` in
 *     `sequence-edit.ts` owns the SENTENCE for the dragged message's own flag;
 *     this predicate owns the FACT, read from `sequenceActivationFlags` so the
 *     two cannot come to different conclusions.
 */
function reorderableMessage(item: SequenceItem | undefined): boolean {
  return (
    item !== undefined &&
    item.step === "message" &&
    sequenceActivationFlags(item).length === 0
  );
}

/**
 * The slots the message at `path` may occupy, or `null` when it is not a
 * message this canvas can reorder at all.
 *
 * The range is the maximal RUN of reorderable siblings containing it, walked
 * outward in both directions. A run rather than "the whole branch" because the
 * blockers above are positional: a note three steps down does not stop a swap
 * with the step directly above, and a range that ignored it would offer slots
 * the edit refuses.
 */
export function messageReorderRange(
  file: SequenceLabFile,
  path: SequenceItemPath,
): SequenceReorderRange | null {
  const found = messageSiblings(file, path);
  if (found === null) return null;
  const { siblings, index } = found;
  if (!reorderableMessage(siblings[index])) return null;
  let min = index;
  let max = index;
  while (min > 0 && reorderableMessage(siblings[min - 1])) min -= 1;
  while (max < siblings.length - 1 && reorderableMessage(siblings[max + 1])) {
    max += 1;
  }
  return { min, max, at: index };
}

/**
 * Why the message at `path` cannot move to `toIndex`, or `null` when it can.
 *
 * NAMES WHAT IS IN THE WAY, with the step in it, because "cannot move there" is
 * a dead control: a reader told "a note sits between them" knows the fix and
 * knows it is in the source pane. Same contract as
 * `participantRemovalRefusal`'s counts.
 *
 * It deliberately says NOTHING about the dragged message's own activation flag
 * — that sentence belongs to `activationRefusal`, which every other gesture on
 * a message already speaks, and a second wording for one fact is how two
 * surfaces come to describe the same refusal differently.
 */
export function messageReorderRefusal(
  file: SequenceLabFile,
  path: SequenceItemPath,
  toIndex: number,
): string | null {
  const found = messageSiblings(file, path);
  if (found === null || found.siblings[found.index]?.step !== "message") {
    return "That step is not a message, so there is nothing to reorder.";
  }
  const { siblings, index } = found;
  if (toIndex === index) return null;
  if (toIndex < 0 || toIndex > siblings.length - 1) {
    return "That is not a place in this flow.";
  }
  /* EVERY SIBLING THE MESSAGE WOULD PASS, including the one it lands on: a
     swap chain touches each of them in turn, so one blocker anywhere in the
     run refuses the whole move rather than half of it. */
  const step = toIndex > index ? 1 : -1;
  for (let at = index + step; ; at += step) {
    const sibling = siblings[at];
    if (sibling !== undefined && !reorderableMessage(sibling)) {
      return blockedBy(sibling, at);
    }
    if (at === toIndex) break;
  }
  return null;
}

/** What a blocker is, in the reader's words. */
function blockedBy(sibling: SequenceItem, at: number): string {
  if (sibling.step === "note") {
    return `A note sits at position ${at + 1} of this flow, and a note is anchored by where it sits rather than to any step — moving a message past it would re-aim the note at something else. Move the note in the source text first.`;
  }
  if (sibling.step === "fragment") {
    // `alt` and `opt` take "an": the kinds are the grammar's own keywords, so
    // the article is derived rather than tabled — a seventh kind needs no edit.
    const article = /^[aeiou]/.test(sibling.kind) ? "An" : "A";
    return `${article} ${sibling.kind} fragment sits at position ${at + 1} of this flow. Moving a message past it would change which branch the message is inside, which is an edit for the source text.`;
  }
  const flags = sequenceActivationFlags(sibling);
  return `The message at position ${at + 1} carries an activation flag (${flags.join(" and ")}), which opens or closes a bar on another row. Remove it in the source text first, then reorder.`;
}

/**
 * `messageReorderRange`, expressed in the 1..n STEP numbers the canvas draws
 * and the reader sees.
 *
 * The conversion is only sound while nothing is folded, and that is exactly
 * when reordering is offered: `collapseSequence` renumbers 1..n over the
 * VISIBLE subset, so a step drawn while a lifeline is folded does not name the
 * same message in the file. Both callers gate on the unfolded case (the viewer
 * by `shown === file`, the edit by refusing) rather than trusting this to
 * notice — `check:sequence` pins the gate.
 */
export function messageReorderStepRange(
  file: SequenceLabFile,
  path: SequenceItemPath,
): SequenceReorderRange | null {
  const range = messageReorderRange(file, path);
  if (range === null) return null;
  const steps = sequenceMessagePaths(file.items);
  const stepOf = (index: number): number | null => {
    const key = sequenceItemKey([...path.slice(0, -1), index]);
    const at = steps.findIndex(
      (candidate) => sequenceItemKey(candidate) === key,
    );
    return at === -1 ? null : at + 1;
  };
  const min = stepOf(range.min);
  const max = stepOf(range.max);
  const at = stepOf(range.at);
  if (min === null || max === null || at === null) return null;
  return { min, max, at };
}

/**
 * The sibling index a drop on `toStep` means, or `null` when that step is not a
 * slot this message can take.
 *
 * The viewer resolves a drop through this rather than by arithmetic on step
 * numbers, because a step is a DEPTH-FIRST ordinal over the whole tree while a
 * slot is an index in one branch: the two only run in lockstep inside a run
 * with no fragment in it, which is precisely what the range already guarantees.
 */
export function messageSlotForStep(
  file: SequenceLabFile,
  path: SequenceItemPath,
  toStep: number,
): number | null {
  const range = messageReorderRange(file, path);
  const steps = messageReorderStepRange(file, path);
  if (range === null || steps === null) return null;
  if (toStep < steps.min || toStep > steps.max) return null;
  return range.at + (toStep - steps.at);
}

/* -------------------------------------------------------------------------- */
/* Participants — reordering COLUMNS                                          */
/* -------------------------------------------------------------------------- */

/**
 * The `box` that brackets `participantId`, or `null`. Identity, not the label:
 * two boxes may legally share a label, and "the same box" is the question.
 */
function boxOf(
  file: SequenceLabFile,
  participantId: string,
): SequenceBox | null {
  return (
    (file.boxes ?? []).find((box) =>
      box.participants.includes(participantId),
    ) ?? null
  );
}

/**
 * The columns `participantId` may take, or `null` when it is not a declared
 * participant.
 *
 * THE RULE IS BOX MEMBERSHIP, and it is one rule doing two jobs. A `box` is a
 * bracket around a CONTIGUOUS RUN of `participants` — `serialize.ts` refuses a
 * document whose box is not one — and in the text it is a block whose members
 * sit two spaces deeper. So a swap between two lifelines with the same
 * membership is always safe on both counts: the run keeps its members, and the
 * two lines are already at the same indent, so trading them verbatim cannot
 * change whose bracket either sits inside.
 *
 * A swap ACROSS a boundary is refused, and both halves of that matter:
 *
 *   - for a box of two or more it would break the run, which the serializer
 *     refuses outright — so allowing it would produce a document that cannot be
 *     written back;
 *   - for a box of ONE the run stays trivially contiguous and the serializer is
 *     happy, but the patch would leave the bracket wrapped around nothing. That
 *     is the case a serializer-only guard misses, which is why the rule is
 *     stated here rather than delegated. `check:sequence` asserts the
 *     relationship in both directions.
 */
export function participantReorderRange(
  file: SequenceLabFile,
  participantId: string,
): SequenceReorderRange | null {
  const order = file.participants;
  const index = order.findIndex((p) => p.id === participantId);
  if (index === -1) return null;
  const home = boxOf(file, participantId);
  const sameBox = (at: number): boolean => {
    const other = order[at];
    return other !== undefined && boxOf(file, other.id) === home;
  };
  let min = index;
  let max = index;
  while (min > 0 && sameBox(min - 1)) min -= 1;
  while (max < order.length - 1 && sameBox(max + 1)) max += 1;
  return { min, max, at: index };
}

/**
 * Why `participantId` cannot move to `toIndex`, or `null` when it can. Names
 * the box and the lifeline in the way, for the same reason
 * `participantRemovalRefusal` quotes a count.
 */
export function participantReorderRefusal(
  file: SequenceLabFile,
  participantId: string,
  toIndex: number,
): string | null {
  const order = file.participants;
  const index = order.findIndex((p) => p.id === participantId);
  if (index === -1) {
    return `There is no lifeline called ${participantId} to move.`;
  }
  if (toIndex === index) return null;
  if (toIndex < 0 || toIndex > order.length - 1) {
    return "That is not a column in this diagram.";
  }
  const home = boxOf(file, participantId);
  const step = toIndex > index ? 1 : -1;
  for (let at = index + step; ; at += step) {
    const other = order[at];
    if (other !== undefined) {
      const theirs = boxOf(file, other.id);
      if (theirs !== home) {
        const named = home ?? theirs;
        return `${order[index].name} and ${other.name} are not in the same box, and a box brackets a run of neighbouring lifelines — swapping them would move one in or out of “${named?.label ?? ""}”. Reorder them in the source text.`;
      }
    }
    if (at === toIndex) break;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The move itself, on the MODEL                                              */
/* -------------------------------------------------------------------------- */

/**
 * `list` with the element at `from` moved to `to`.
 *
 * Exported because it is the only description of what a reorder MEANS, and the
 * check compares the serializer's output for this model against the bytes the
 * line patch produced. A patch that agreed with nothing but itself is how a
 * reorder could silently write a document that means something else.
 */
export function movedWithin<T>(
  list: readonly T[],
  from: number,
  to: number,
): T[] {
  const out = [...list];
  const [element] = out.splice(from, 1);
  out.splice(to, 0, element);
  return out;
}

/**
 * `file` with the message at `path` moved to `toIndex` among its siblings.
 * The model half of the reorder — `sequence-edit.ts` writes the text half and
 * then re-parses, so this exists to be COMPARED with rather than adopted.
 */
export function fileWithMessageMoved(
  file: SequenceLabFile,
  path: SequenceItemPath,
  toIndex: number,
): SequenceLabFile | null {
  const found = messageSiblings(file, path);
  if (found === null) return null;
  const moved = movedWithin(found.siblings, found.index, toIndex);
  const parent = path.slice(0, -1);
  if (parent.length === 0) return { ...file, items: moved };
  const fragmentPath = parent.slice(0, -1);
  const branchIndex = parent[parent.length - 1];
  const fragment = sequenceItemAt(file.items, fragmentPath);
  if (fragment === undefined || fragment.step !== "fragment") return null;
  /* Only the branches on the path are rebuilt; every other item stays the SAME
     object, which is the identity contract `lib/address.ts` resolves a fold
     against. */
  const rebuilt: SequenceItem = {
    ...fragment,
    branches: fragment.branches.map((branch, at) =>
      at === branchIndex
        ? { ...branch, items: moved as SequenceItem[] }
        : branch,
    ),
  };
  return replaceOnPath(file, fragmentPath, rebuilt);
}

/** `file` with the item at `path` replaced, rebuilding only that spine. */
function replaceOnPath(
  file: SequenceLabFile,
  path: SequenceItemPath,
  next: SequenceItem,
): SequenceLabFile | null {
  if (path.length === 1) {
    return {
      ...file,
      items: file.items.map((item, at) => (at === path[0] ? next : item)),
    };
  }
  const fragment = sequenceItemAt(file.items, path.slice(0, -2));
  if (fragment === undefined || fragment.step !== "fragment") return null;
  const branchIndex = path[path.length - 2];
  const inner = fragment.branches[branchIndex];
  if (inner === undefined) return null;
  return replaceOnPath(file, path.slice(0, -2), {
    ...fragment,
    branches: fragment.branches.map((branch, at) =>
      at === branchIndex
        ? {
            ...branch,
            items: branch.items.map((item, index) =>
              index === path[path.length - 1] ? next : item,
            ),
          }
        : branch,
    ),
  });
}

/** `file` with `participantId` moved to column `toIndex`. */
export function fileWithParticipantMoved(
  file: SequenceLabFile,
  participantId: string,
  toIndex: number,
): SequenceLabFile | null {
  const index = file.participants.findIndex((p) => p.id === participantId);
  if (index === -1) return null;
  return {
    ...file,
    participants: movedWithin(file.participants, index, toIndex),
  };
}
