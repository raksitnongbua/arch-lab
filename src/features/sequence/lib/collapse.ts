/**
 * Collapsing a participant's DEPENDENCIES — the downstream services that exist
 * in the flow only because this one calls them.
 *
 * The question this answers, using the bundled Checkout example: collapse Order
 * API and Payments and Orders DB should go, while Storefront and Customer stay.
 * That outcome is not a special case; it falls out of one rule.
 *
 * In one sentence: a participant is a private dependency of `P` when the flow
 * reaches it only THROUGH `P` and it talks to nobody else. `dependenciesOf`
 * carries the precise three-step form, and the two shorter rules that both look
 * right and are both wrong — that comment is the useful part of this file.
 *
 * WHY FILTER THE MODEL rather than hide with CSS. Everything downstream —
 * columns, rows, fragment boxes, activation bars, note spans, the text listing
 * — is derived from the file by `layoutSequence`. Feeding it a filtered file
 * means every one of those recomputes consistently and the diagram COMPACTS,
 * which is the point of collapsing. Hiding with opacity would leave a
 * participant-shaped hole and a lifeline going nowhere.
 *
 * The one visible consequence: step numbers are assigned by the layout as it
 * walks, so a collapsed view numbers what it shows, 1..n with no gaps. A step
 * number therefore means "the nth message in this view", not "the nth line of
 * the source". For a collapsed reading that is the more useful of the two, and
 * `autonumber` would look broken with holes in it.
 */

import type {
  SequenceBranch,
  SequenceItem,
  SequenceLabFile,
  SequenceMessage,
} from "@/types/sequence";

/** Every message in the tree, fragments included, in document order. */
export function eachMessage(items: readonly SequenceItem[]): SequenceMessage[] {
  const out: SequenceMessage[] = [];
  const walk = (list: readonly SequenceItem[]): void => {
    for (const item of list) {
      if (item.step === "message") out.push(item);
      else if (item.step === "fragment") {
        for (const branch of item.branches) walk(branch.items);
      }
    }
  };
  walk(items);
  return out;
}

/**
 * The participants `P` would hide. Empty when `P` has no private dependencies —
 * which is how the renderer decides whether to offer a collapse control at all,
 * since a control that hides nothing is worse than no control.
 *
 * THREE STEPS, and the two obvious one-step versions are both wrong. Growing a
 * set from nothing ("hide a callee once everything else it talks to is already
 * hidden") never starts on a chain A→B→C: B is blocked by C, and C never
 * becomes a candidate because only B calls it. Shrinking from everything
 * downstream is worse — in the Checkout example the Customer and Storefront
 * only ever talk to each other and to Order API, so they qualify as "private"
 * and collapsing Order API would hide the entire diagram. Both failures were
 * caught by `check:sequence-collapse`, which is why the assertions there are
 * worth keeping even though they look obvious now.
 *
 *   1. REACH downstream from P over CALL edges, which are sync and async
 *      messages. Replies are excluded on purpose: `pay ..> api` means Payments
 *      was called, not that it calls Order API, and treating a return as a call
 *      makes every callee look like a caller.
 *   2. DROP anything that can reach P over those same call edges. That is the
 *      caller test, and it is what saves the actor: the Customer is emailed by
 *      Order API, so it is downstream, but it also clicks in Storefront which
 *      calls Order API — so it is upstream too, and a participant the flow
 *      arrives through is never a dependency.
 *   3. SHRINK to a fixpoint, dropping anything with a message (of any kind,
 *      replies included) whose other end is outside the set. This is what
 *      protects shared services, and it cascades correctly: lose a shared
 *      database and whatever privately fed it goes too, because its remaining
 *      message would have nowhere to land.
 */
export function dependenciesOf(
  file: SequenceLabFile,
  participantId: string,
): Set<string> {
  const messages = eachMessage(file.items);
  const calls = messages.filter((m) => m.kind !== "reply" && m.from !== m.to);

  /** Everything reachable from `start` over call edges, `start` excluded. */
  const reachable = (start: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const call of calls) {
        if (call.from !== current || seen.has(call.to)) continue;
        seen.add(call.to);
        queue.push(call.to);
      }
    }
    seen.delete(start);
    return seen;
  };

  // 1 + 2: downstream, minus anyone who can get back to P.
  const candidates = new Set<string>();
  for (const id of reachable(participantId)) {
    if (!reachable(id).has(participantId)) candidates.add(id);
  }

  // 3: drop anything talking to the outside, until nothing more drops.
  let shrank = true;
  while (shrank) {
    shrank = false;
    for (const id of [...candidates]) {
      const talksOutside = messages.some((m) => {
        if (m.from !== id && m.to !== id) return false;
        const other = m.from === id ? m.to : m.from;
        return (
          other !== id && other !== participantId && !candidates.has(other)
        );
      });
      if (talksOutside) {
        candidates.delete(id);
        shrank = true;
      }
    }
  }

  return candidates;
}

/**
 * Everything hidden by a SET of collapsed participants — the union of each one's
 * dependencies, minus the collapsed participants that are still their own
 * handle.
 *
 * A collapsed participant normally STAYS VISIBLE: it is the control you folded
 * by, and hiding it would leave no way to expand again. But that exemption only
 * applies while nothing else folds it. Collapse a service and then collapse
 * something upstream of it, and the inner one IS one of the outer one's
 * dependencies — exempting it there made the outer collapse fold nothing new, so
 * clicking it appeared to do nothing at all (`check:sequence-collapse` now pins
 * that case). Nesting reads the way a reader expects instead: folding the caller
 * folds the whole branch, and expanding it brings the inner one back still
 * folded.
 *
 * At least one handle always survives, so a collapsed set can never strand
 * itself: `X ∈ dependenciesOf(Y)` requires Y to reach X while X cannot reach Y
 * (step 2 of `dependenciesOf`), which makes "folds" a strict partial order — and
 * the outermost collapsed participant is in nobody else's dependencies.
 */
export function hiddenParticipants(
  file: SequenceLabFile,
  collapsed: ReadonlySet<string>,
): Set<string> {
  // Once per collapsed id: `dependenciesOf` walks the whole message list per
  // call, and the exemption test below needs to consult every set.
  const foldedBy = new Map<string, Set<string>>();
  for (const id of collapsed) foldedBy.set(id, dependenciesOf(file, id));

  const hidden = new Set<string>();
  for (const dependencies of foldedBy.values()) {
    for (const dependency of dependencies) hidden.add(dependency);
  }

  for (const id of collapsed) {
    const foldedByAnother = [...foldedBy].some(
      ([other, dependencies]) => other !== id && dependencies.has(id),
    );
    if (!foldedByAnother) hidden.delete(id);
  }
  return hidden;
}

function filterItems(
  items: readonly SequenceItem[],
  hidden: ReadonlySet<string>,
): SequenceItem[] {
  const out: SequenceItem[] = [];
  for (const item of items) {
    if (item.step === "message") {
      // A message with either end hidden has nothing to draw between.
      if (hidden.has(item.from) || hidden.has(item.to)) continue;
      out.push(item);
      continue;
    }
    if (item.step === "note") {
      const kept = item.participants.filter((id) => !hidden.has(id));
      if (kept.length === 0) continue;
      // A two-id `over` note whose second lifeline went away becomes a note
      // over the one that remains, rather than disappearing: the prose is
      // still true of the visible participant, and it is often the summary
      // that explains why the collapsed branch existed.
      out.push(
        kept.length === item.participants.length
          ? item
          : { ...item, participants: kept },
      );
      continue;
    }
    const branches: SequenceBranch[] = [];
    for (const branch of item.branches) {
      const kept = filterItems(branch.items, hidden);
      if (kept.length > 0) branches.push({ ...branch, items: kept });
    }
    // A fragment with nothing left in any branch is a labelled empty box.
    if (branches.length > 0) out.push({ ...item, branches });
  }
  return out;
}

/**
 * The file as the collapsed view should render it. Returns the SAME object when
 * nothing is hidden, so the common case costs nothing and `useMemo` consumers
 * keep referential stability.
 */
export function collapseSequence(
  file: SequenceLabFile,
  hidden: ReadonlySet<string>,
): SequenceLabFile {
  if (hidden.size === 0) return file;
  /* A box keeps only its visible members, and a box that lost all of them is
     dropped rather than drawn empty — a bracket over nothing is a label
     pointing at a gap. Boxes stay CONTIGUOUS through this by construction:
     removing members from a run leaves a run. */
  const boxes = file.boxes
    ?.map((box) => ({
      ...box,
      participants: box.participants.filter((id) => !hidden.has(id)),
    }))
    .filter((box) => box.participants.length > 0);
  const collapsed: SequenceLabFile = {
    ...file,
    participants: file.participants.filter((p) => !hidden.has(p.id)),
    items: filterItems(file.items, hidden),
  };
  /* Assigned rather than spread: `boxes: undefined` inside an object literal
     is a PRESENT key holding undefined, which is a different document from
     one that never had boxes — and `JSON.stringify` would agree with us while
     `Object.keys` would not. */
  if (boxes === undefined || boxes.length === 0) delete collapsed.boxes;
  else collapsed.boxes = boxes;
  return collapsed;
}
