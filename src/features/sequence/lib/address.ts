/**
 * Turning what the READER pointed at into an address in the MODEL.
 *
 * THE PROBLEM THIS SOLVES, and it is not obvious from either side alone. A
 * focused message is identified on screen by its layout STEP — `Message 4 of
 * 11` — and a step is a 1..n ordinal the layout assigns as it walks whatever it
 * is drawing. When a lifeline is folded, what it is drawing is the COLLAPSED
 * file (`lib/collapse.ts`), which renumbers: step 4 of the folded view and step
 * 4 of the file on disk are different messages. So a step number is not an
 * address into the document, and an edit fired against one would land on a
 * neighbouring message — silently, since both are plausible messages and the
 * pane would visibly change either way.
 *
 * THE ANSWER IS OBJECT IDENTITY, not arithmetic. `collapseSequence` filters the
 * item tree, and `filterItems` pushes the surviving MESSAGE OBJECT ITSELF
 * rather than a copy of it. A message on screen is therefore literally the same
 * object as the one in the parsed file, whatever the fold state, so the address
 * can be recovered by finding it. That is now a contract rather than a
 * coincidence: it is stated at `filterItems` and pinned by `check:sequence`.
 *
 * The two alternatives were both worse. Refusing every edit while anything is
 * folded punishes the reader for using the fold — and folding is how a large
 * diagram becomes editable in the first place. Clearing the fold on the first
 * edit throws away the reading state the reader arranged, to fix a problem they
 * cannot see.
 *
 * `null` IS A REAL ANSWER and callers must honour it: a stale step (the
 * document was re-parsed shorter), a message the collapse rebuilt rather than
 * kept, or a model not produced by `collapseSequence` at all. Refusing the
 * gesture with a reason beats editing an ambiguous address.
 */

import type { SequenceItemPath, SequenceLabFile } from "@/types";
import { sequenceItemAt, sequenceMessagePaths } from "@/types";

/**
 * The model address of the message drawn as `step`, or `null` when the step
 * does not resolve to exactly one message of `file`.
 *
 * `shown` is the file the layout that produced `step` was given — the same
 * object the viewer holds, which is `file` itself when nothing is folded
 * (`collapseSequence` returns its argument unchanged in that case, so the
 * common path costs one array walk and no identity search).
 */
export function messagePathForStep(
  file: SequenceLabFile,
  shown: SequenceLabFile,
  step: number,
): SequenceItemPath | null {
  const shownPath = sequenceMessagePaths(shown.items)[step - 1];
  if (shownPath === undefined) return null;
  if (shown === file) return shownPath;

  const target = sequenceItemAt(shown.items, shownPath);
  if (target === undefined) return null;
  const matches = sequenceMessagePaths(file.items).filter(
    (candidate) => sequenceItemAt(file.items, candidate) === target,
  );
  // Exactly one, never "the first": a model that reuses one message object in
  // two places is not something a parse can produce, but guessing between two
  // addresses is the failure this whole module exists to prevent.
  return matches.length === 1 ? matches[0] : null;
}
