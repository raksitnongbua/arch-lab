"use client";

/**
 * Crash-recovery prompt (T3-B, AF-E5-S4). Props-free per dev-handoff §4.4,
 * mounted by the frozen `editor-shell.tsx`, reads its own state.
 *
 * On boot — and again whenever the open document changes (T3-A's open flow
 * swaps `fileHandleName` / `metadata.createdAt`) — it looks for an IndexedDB
 * draft newer than what is open:
 *
 * 1. Exact D19 key match for the current document.
 * 2. Failing that, on a fresh untitled boot only, the newest draft of any
 *    document — a crashed session's key can never be recomputed because its
 *    `createdAt` died with it.
 *
 * "Newer" compares the draft's write time against the document's
 * `metadata.updatedAt` (the last time its content was actually saved). While
 * an offer is pending, draft autosave is suspended so the crash draft cannot
 * be overwritten before the user decides. Every branch is non-destructive to
 * the file on disk; only "Discard draft" deletes the snapshot, and only
 * explicitly. Also hosts `useAutosaveDraft`, the draft-writing side of the
 * same lifecycle.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import { useAutosaveDraft } from "../hooks/use-autosave-draft";
import {
  deleteDraft,
  draftKey,
  findNewestDraft,
  readDraft,
  setDraftAutosaveSuspended,
  type DraftRecord,
} from "../io/drafts";
import { useEditorStore } from "../state";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatEpoch(ms: number): string {
  return TIME_FORMAT.format(new Date(ms));
}

function formatSavedIso(iso: string | undefined): string {
  const ms = iso === undefined ? Number.NaN : Date.parse(iso);
  return Number.isNaN(ms) ? "never" : TIME_FORMAT.format(new Date(ms));
}

interface RecoveryOffer {
  draft: DraftRecord;
  /** Human-readable "file last saved" timestamp shown beside the draft's. */
  fileSavedAtLabel: string;
}

export function RecoveryPrompt(): React.JSX.Element | null {
  useAutosaveDraft();

  const fileHandleName = useEditorStore((s) => s.fileHandleName);
  const createdAt = useEditorStore((s) => s.model.metadata.createdAt);
  const [offer, setOffer] = useState<RecoveryOffer | null>(null);
  /** Keys already decided this session — never re-offered, never looped. */
  const decidedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // Gate up before the async lookup so autosave cannot overwrite the very
    // draft about to be offered. Handlers (or the no-offer path) lower it.
    setDraftAutosaveSuspended(true);

    const evaluate = async (): Promise<void> => {
      const state = useEditorStore.getState();
      const decided = decidedKeysRef.current;
      const currentKey = draftKey(
        state.fileHandleName,
        state.model.metadata.createdAt,
      );

      let draft = decided.has(currentKey) ? null : await readDraft(currentKey);
      let fileUpdatedAt: string | undefined = state.model.metadata.updatedAt;

      if (draft === null && state.fileHandleName === null && !state.isDirty) {
        const orphan = await findNewestDraft();
        if (
          orphan !== null &&
          orphan.key !== currentKey &&
          !decided.has(orphan.key)
        ) {
          draft = orphan;
          fileUpdatedAt = orphan.model.metadata.updatedAt;
        }
      }
      if (cancelled) return;

      const fileSavedMs =
        fileUpdatedAt === undefined ? Number.NaN : Date.parse(fileUpdatedAt);
      const isNewerThanFile =
        draft !== null &&
        (Number.isNaN(fileSavedMs) || draft.savedAt > fileSavedMs);

      if (draft !== null && isNewerThanFile) {
        setOffer({ draft, fileSavedAtLabel: formatSavedIso(fileUpdatedAt) });
      } else {
        setOffer(null);
        setDraftAutosaveSuspended(false);
      }
    };

    void evaluate();
    return () => {
      cancelled = true;
      setDraftAutosaveSuspended(false);
    };
  }, [fileHandleName, createdAt]);

  if (offer === null) return null;
  const { draft, fileSavedAtLabel } = offer;

  const settle = (): void => {
    decidedKeysRef.current.add(draft.key);
    setOffer(null);
    setDraftAutosaveSuspended(false);
  };

  const recover = (): void => {
    settle();
    // The draft itself stays in IndexedDB until the next successful save
    // clears it — recovery must be reversible, never destructive.
    useEditorStore.getState().replaceModel(draft.model, {
      markSaved: false,
      fileHandleName: draft.fileHandleName,
    });
    toast({
      message: `Recovered unsaved draft from ${formatEpoch(draft.savedAt)}. Save to keep it.`,
    });
  };

  const discard = (): void => {
    settle();
    void deleteDraft(draft.key);
    toast({ message: "Draft discarded. The last-saved version stays open." });
  };

  const decideLater = (): void => {
    settle();
    toast({
      message: "Draft kept. You'll be offered it again next session.",
    });
  };

  return (
    <Dialog
      open
      onClose={decideLater}
      title="Recover unsaved changes?"
      description="A local draft newer than this document's last save was found. Your file on disk has not been touched — recovering only changes what is open in the editor, until you save."
      footer={
        <>
          <Button variant="ghost" onClick={decideLater}>
            Decide later
          </Button>
          <Button variant="outline" onClick={discard}>
            Discard draft
          </Button>
          <Button onClick={recover}>Recover draft</Button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Document</dt>
        <dd className="text-foreground">{draft.model.metadata.title}</dd>
        <dt className="text-muted-foreground">File</dt>
        <dd className="text-foreground">
          {draft.fileHandleName ?? "Never saved to a file"}
        </dd>
        <dt className="text-muted-foreground">Draft saved</dt>
        <dd className="text-foreground">{formatEpoch(draft.savedAt)}</dd>
        <dt className="text-muted-foreground">File last saved</dt>
        <dd className="text-foreground">{fileSavedAtLabel}</dd>
      </dl>
    </Dialog>
  );
}
