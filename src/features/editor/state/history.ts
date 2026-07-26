/**
 * Snapshot-based undo/redo (D7) — a 100-deep ring buffer of `EditorModel`
 * snapshots, plus coalescing and `transact()` grouping.
 *
 * How it fits together with the store:
 *
 * - Every model object the store holds is treated as IMMUTABLE once set.
 *   Mutations always run on a fresh `structuredClone`, then swap it in. That
 *   makes the *previous* model object itself a valid snapshot: pushing it
 *   onto the ring buffer is equivalent to cloning, with half the copies.
 * - Each history entry stores the model as it was BEFORE the mutation, plus
 *   the monotonically increasing `revision` of that state. `isDirty` is
 *   `currentRevision !== savedRevision`, which is what makes AF-E1-S7's
 *   "undo back to the last-saved snapshot clears the dirty flag" fall out for
 *   free — undo restores the revision alongside the model.
 * - Coalescing (`coalesceKey`): a mutation whose key equals the key of the
 *   immediately preceding mutation pushes NO new entry — the existing entry's
 *   "before" snapshot already predates the whole run. Rapid label typing is
 *   one undo step, not thirty. Any differently-keyed (or key-less) mutation,
 *   an undo/redo, a transaction, or `markSaved` breaks the chain.
 * - `transact()`: the outermost call captures one "before" snapshot; inner
 *   mutations skip the buffer entirely; commit pushes the single snapshot.
 *   Nested calls join the outer transaction. If the callback throws, the
 *   transaction rolls the model back to the captured snapshot and rethrows.
 *
 * This module is store-agnostic on purpose: it never imports zustand and is
 * driven entirely by the store in `store.ts`.
 */

import type { EditorModel } from "./store";

/** AF-E1-S7: history depth ≥100. Entry 101 evicts entry 1. */
export const HISTORY_LIMIT = 100;

interface HistoryEntry {
  /** The model as it was before the mutation(s) this entry undoes. */
  model: EditorModel;
  /** The revision counter value of that model state. */
  revision: number;
}

export interface HistoryManager {
  /** Revision of the model currently held by the store. */
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly inTransaction: boolean;

  /**
   * Record a mutation about to be applied. `before` is the store's current
   * (immutable) model; returns the new revision the store should adopt.
   */
  recordMutation(before: EditorModel, coalesceKey?: string): number;

  /**
   * Run `fn` as one grouped entry. Returns `fn`'s result. On throw, returns
   * the model to roll back to via the `rollback` callback and rethrows.
   */
  transact<T>(
    current: () => EditorModel,
    rollback: (model: EditorModel, revision: number) => void,
    fn: () => T,
  ): T;

  /** Undo: returns the entry to restore, or null. `current` re-enters the buffer as redo. */
  undo(current: EditorModel): HistoryEntry | null;

  /** Redo: inverse of {@link undo}. */
  redo(current: EditorModel): HistoryEntry | null;

  /** `isDirty` for the current revision. */
  isDirty(): boolean;

  /** Mark the current revision as the saved one and break coalescing. */
  markSaved(): void;

  /** Forget everything (used by `replaceModel`). `saved` seeds the dirty flag. */
  reset(saved: boolean): void;
}

export function createHistory(): HistoryManager {
  let past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  let revision = 0;
  let savedRevision = 0;
  let lastCoalesceKey: string | null = null;

  let transactionDepth = 0;
  let transactionBefore: HistoryEntry | null = null;
  let transactionMutated = false;

  function pushPast(entry: HistoryEntry): void {
    past.push(entry);
    if (past.length > HISTORY_LIMIT) past.shift();
  }

  return {
    get revision() {
      return revision;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get inTransaction() {
      return transactionDepth > 0;
    },

    recordMutation(before, coalesceKey) {
      future = [];
      if (transactionDepth > 0) {
        transactionMutated = true;
        revision += 1;
        return revision;
      }
      const coalesces =
        coalesceKey !== undefined && coalesceKey === lastCoalesceKey;
      if (!coalesces) {
        pushPast({ model: before, revision });
      }
      lastCoalesceKey = coalesceKey ?? null;
      revision += 1;
      return revision;
    },

    transact(current, rollback, fn) {
      if (transactionDepth === 0) {
        transactionBefore = { model: current(), revision };
        transactionMutated = false;
      }
      transactionDepth += 1;
      try {
        const result = fn();
        transactionDepth -= 1;
        if (transactionDepth === 0) {
          const before = transactionBefore;
          transactionBefore = null;
          if (transactionMutated && before !== null) {
            future = [];
            pushPast(before);
            lastCoalesceKey = null;
          }
        }
        return result;
      } catch (error) {
        transactionDepth -= 1;
        if (transactionDepth === 0) {
          const before = transactionBefore;
          transactionBefore = null;
          if (transactionMutated && before !== null) {
            revision = before.revision;
            rollback(before.model, before.revision);
          }
        }
        throw error;
      }
    },

    undo(current) {
      if (transactionDepth > 0 || past.length === 0) return null;
      const entry = past.pop();
      if (entry === undefined) return null;
      future.push({ model: current, revision });
      revision = entry.revision;
      lastCoalesceKey = null;
      return entry;
    },

    redo(current) {
      if (transactionDepth > 0 || future.length === 0) return null;
      const entry = future.pop();
      if (entry === undefined) return null;
      pushPast({ model: current, revision });
      revision = entry.revision;
      lastCoalesceKey = null;
      return entry;
    },

    isDirty() {
      return revision !== savedRevision;
    },

    markSaved() {
      savedRevision = revision;
      lastCoalesceKey = null;
    },

    reset(saved) {
      past = [];
      future = [];
      lastCoalesceKey = null;
      transactionDepth = 0;
      transactionBefore = null;
      transactionMutated = false;
      revision += 1;
      savedRevision = saved ? revision : revision - 1;
    },
  };
}
