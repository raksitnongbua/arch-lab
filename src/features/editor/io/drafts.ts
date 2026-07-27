/**
 * Crash-safe draft storage (T3-B, AF-E5-S4) — IndexedDB via `idb-keyval`.
 *
 * A draft is a snapshot of the in-memory `EditorModel`, structured-cloned by
 * IndexedDB on write. It is deliberately NOT the canonical file serialization
 * and never imports T3-A's `io/serialize` — a draft is not a file, needs no
 * deterministic formatting, and this module never touches the user's file on
 * disk. Explicit save (T3-A) is the only path that writes a file.
 *
 * Keys follow D19: `${fileHandleName ?? "untitled"}:${metadata.createdAt}` —
 * stable across reloads, distinct per document, so two files edited in
 * sequence can never cross-recover.
 *
 * Every function is best-effort: IndexedDB being unavailable (private
 * browsing, storage pressure, SSR) degrades to "no drafts", never to a crash.
 */

import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";

import type { EditorModel } from "../state";

export interface DraftRecord {
  /** The D19 key this draft is stored under. */
  key: string;
  /** Snapshot of the in-memory model, exactly as the store held it. */
  model: EditorModel;
  /** File the draft belonged to, or null for a never-saved document. */
  fileHandleName: string | null;
  /** Epoch ms when this snapshot was written to IndexedDB. */
  savedAt: number;
}

/** D19 draft key. `createdAt` is the model's `metadata.createdAt`. */
export function draftKey(
  fileHandleName: string | null,
  createdAt: string,
): string {
  return `${fileHandleName ?? "untitled"}:${createdAt}`;
}

/* -------------------------------------------------------------------------- */
/* IndexedDB access                                                           */
/* -------------------------------------------------------------------------- */

let store: UseStore | null = null;

function getStore(): UseStore | null {
  if (typeof indexedDB === "undefined") return null;
  store ??= createStore("arch-flow", "drafts");
  return store;
}

function isDraftRecord(value: unknown): value is DraftRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<DraftRecord>;
  return (
    typeof record.key === "string" &&
    typeof record.savedAt === "number" &&
    (record.fileHandleName === null ||
      typeof record.fileHandleName === "string") &&
    typeof record.model === "object" &&
    record.model !== null &&
    typeof record.model.metadata === "object" &&
    typeof record.model.diagrams === "object" &&
    typeof record.model.rootDiagramId === "string"
  );
}

function warn(operation: string, error: unknown): void {
  console.warn(`arch-flow draft ${operation} failed`, error);
}

/* -------------------------------------------------------------------------- */
/* Autosave suspension gate                                                   */
/* -------------------------------------------------------------------------- */

/**
 * While the recovery prompt is evaluating or awaiting a decision, autosave
 * must not overwrite the very draft being offered. `RecoveryPrompt` raises
 * this gate; `useAutosaveDraft` checks it before every write.
 */
let autosaveSuspended = false;

export function setDraftAutosaveSuspended(suspended: boolean): void {
  autosaveSuspended = suspended;
}

export function isDraftAutosaveSuspended(): boolean {
  return autosaveSuspended;
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The last key a draft was written under this session. A save can rename the
 * document ("Save as" gives an untitled model a file name, changing its D19
 * key), so clearing after a save must remove the pre-rename draft too.
 */
let lastWrittenKey: string | null = null;

/** Write a snapshot of the in-memory model. Called only while dirty. */
export async function writeDraft(
  model: EditorModel,
  fileHandleName: string | null,
): Promise<void> {
  const db = getStore();
  if (db === null) return;
  const key = draftKey(fileHandleName, model.metadata.createdAt);
  const record: DraftRecord = {
    key,
    model,
    fileHandleName,
    savedAt: Date.now(),
  };
  try {
    await set(key, record, db);
    lastWrittenKey = key;
  } catch (error) {
    warn("write", error);
  }
}

/** Read the draft stored under `key`, or null. Corrupt records read as null. */
export async function readDraft(key: string): Promise<DraftRecord | null> {
  const db = getStore();
  if (db === null) return null;
  try {
    const record = await get<unknown>(key, db);
    return isDraftRecord(record) ? record : null;
  } catch (error) {
    warn("read", error);
    return null;
  }
}

/** Explicitly delete one draft (the recovery prompt's "Discard" branch). */
export async function deleteDraft(key: string): Promise<void> {
  const db = getStore();
  if (db === null) return;
  try {
    await del(key, db);
    if (lastWrittenKey === key) lastWrittenKey = null;
  } catch (error) {
    warn("delete", error);
  }
}

/**
 * Clear the drafts made obsolete by a successful save to disk: the saved
 * document's current key plus the pre-rename key when "Save as" changed it.
 */
export async function clearDraftsAfterSave(currentKey: string): Promise<void> {
  const previousKey = lastWrittenKey;
  await deleteDraft(currentKey);
  if (previousKey !== null && previousKey !== currentKey) {
    await deleteDraft(previousKey);
  }
  lastWrittenKey = null;
}

/**
 * Newest draft across all documents. Used on a fresh untitled boot, where a
 * crashed session's draft key can never be recomputed (its `createdAt`
 * belonged to the dead session). Other drafts are left untouched.
 */
export async function findNewestDraft(): Promise<DraftRecord | null> {
  const db = getStore();
  if (db === null) return null;
  try {
    const all = await entries<string, unknown>(db);
    let newest: DraftRecord | null = null;
    for (const [, value] of all) {
      if (
        isDraftRecord(value) &&
        (newest === null || value.savedAt > newest.savedAt)
      ) {
        newest = value;
      }
    }
    return newest;
  } catch (error) {
    warn("scan", error);
    return null;
  }
}
