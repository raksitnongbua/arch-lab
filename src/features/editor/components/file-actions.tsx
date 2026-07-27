"use client";

/**
 * Save / Open toolbar chrome and the whole persistence orchestration
 * (T3-A, AF-E5-S1 / AF-E5-S2). Props-free, mounted by the frozen
 * `editor-shell.tsx` (dev-handoff §4.4); reads the store itself.
 *
 * Flow rules implemented here:
 * - File System Access API where available, download + `<input type="file">`
 *   where not — feature-detected at call time (D2, R3).
 * - A save while clean (same revision as the last save) SKIPS the write, so a
 *   no-op save leaves the file byte-identical, `updatedAt` untouched.
 * - `metadata.updatedAt` is bumped in the OUTPUT only when the model actually
 *   changed since the last save (`isDirty`).
 * - Opening over unsaved changes prompts save / discard / cancel; cancel
 *   truly cancels. A failed or cancelled save also cancels the open.
 * - Save failure (revoked handle, denied permission, disk error) shows a
 *   blocking dialog naming the cause and offering "Download a copy"; the
 *   in-memory model is never touched.
 * - Load failures (unreadable file, malformed JSON, schema hard errors, newer
 *   major version) surface the validator's message — with the JSON path — and
 *   leave the previous model intact.
 */

import { useCallback, useRef, useState } from "react";
import { FolderOpen, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import {
  deriveFileName,
  deserializeModel,
  downloadTextFile,
  FileValidationError,
  getCurrentFileHandle,
  getLastSavedText,
  pickFileViaInput,
  pickOpenHandle,
  pickSaveHandle,
  serializeModel,
  setCurrentFileHandle,
  setLastSavedText,
  supportsOpenPicker,
  supportsSavePicker,
  writeTextToHandle,
} from "../io";
import { useEditorStore, type EditorModel } from "../state";
import { useFileDrop, type DroppedFile } from "../hooks/use-file-drop";
import { useFileShortcuts } from "../hooks/use-file-shortcuts";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type PendingOpen = { kind: "picker" } | ({ kind: "file" } & DroppedFile);

interface SaveFailure {
  /** User-facing cause, e.g. a revoked handle or denied permission. */
  message: string;
  /** The exact bytes that failed to write — offered as "Download a copy". */
  text: string;
  fileName: string;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message;
  return String(error);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function FileActions(): React.JSX.Element {
  const isDirty = useEditorStore((state) => state.isDirty);
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  /** Serialises save/open flows — a second Cmd+S mid-picker is ignored. */
  const busyRef = useRef(false);

  /* ------------------------------- saving ------------------------------- */

  /** @returns true when the document is on disk afterwards. */
  const performSave = useCallback(async (): Promise<boolean> => {
    const state = useEditorStore.getState();

    // No-op save: nothing changed since the last successful save. Skipping
    // the write is what keeps the file byte-identical, updatedAt untouched.
    if (!state.isDirty && getLastSavedText() !== null) {
      toast({ message: "All changes are already saved." });
      return true;
    }

    // Determinism rule 6: bump updatedAt only when the model actually changed.
    const text = serializeModel(
      state.model,
      state.isDirty ? { updatedAt: new Date().toISOString() } : undefined,
    );
    const fileName =
      state.fileHandleName ?? deriveFileName(state.model.metadata.title);

    const existing = getCurrentFileHandle();
    if (existing !== null) {
      try {
        await writeTextToHandle(existing, text);
      } catch (error) {
        setSaveFailure({
          message: describeError(error),
          text,
          fileName: existing.name,
        });
        return false;
      }
      setLastSavedText(text);
      state.markSaved(Date.now(), existing.name);
      return true;
    }

    if (supportsSavePicker()) {
      let handle: FileSystemFileHandle | null;
      try {
        handle = await pickSaveHandle(fileName);
      } catch (error) {
        toast({
          message: `Could not open the save dialog — ${describeError(error)}`,
          tone: "error",
        });
        return false;
      }
      if (handle === null) return false; // user cancelled — not an error
      try {
        await writeTextToHandle(handle, text);
      } catch (error) {
        setSaveFailure({
          message: describeError(error),
          text,
          fileName: handle.name,
        });
        return false;
      }
      setCurrentFileHandle(handle);
      setLastSavedText(text);
      state.markSaved(Date.now(), handle.name);
      toast({ message: `Saved ${handle.name}.` });
      return true;
    }

    // Fallback (no File System Access API): download a copy. Honest
    // degradation — the browser cannot write back to the original file.
    try {
      downloadTextFile(fileName, text);
    } catch (error) {
      setSaveFailure({ message: describeError(error), text, fileName });
      return false;
    }
    setLastSavedText(text);
    state.markSaved(Date.now(), fileName);
    toast({
      message: `This browser can't write files in place, so ${fileName} was downloaded instead.`,
    });
    return true;
  }, []);

  /* ------------------------------- opening ------------------------------ */

  const installOpenedFile = useCallback(
    (text: string, name: string, handle: FileSystemFileHandle | null): void => {
      let model: EditorModel;
      try {
        model = deserializeModel(text);
      } catch (error) {
        // The previous model is untouched — deserialize never half-loads.
        const message =
          error instanceof FileValidationError
            ? `Could not open "${name}" — ${error.message}`
            : `Could not read "${name}" — ${describeError(error)}`;
        toast({ message, tone: "error", durationMs: 12_000 });
        return;
      }
      useEditorStore.getState().replaceModel(model, {
        markSaved: true,
        fileHandleName: name,
      });
      setCurrentFileHandle(handle);
      setLastSavedText(text);
      toast({ message: `Opened ${name}.` });
    },
    [],
  );

  const runOpen = useCallback(
    async (pending: PendingOpen): Promise<void> => {
      if (pending.kind === "file") {
        installOpenedFile(pending.text, pending.name, pending.handle);
        return;
      }
      if (supportsOpenPicker()) {
        let handle: FileSystemFileHandle | null;
        try {
          handle = await pickOpenHandle();
        } catch (error) {
          toast({
            message: `Could not open the file dialog — ${describeError(error)}`,
            tone: "error",
          });
          return;
        }
        if (handle === null) return; // user cancelled — not an error
        let text: string;
        let name: string;
        try {
          const file = await handle.getFile();
          name = file.name;
          text = await file.text();
        } catch (error) {
          toast({
            message: `Could not read the selected file — ${describeError(error)}`,
            tone: "error",
          });
          return;
        }
        installOpenedFile(text, name, handle);
        return;
      }
      // Fallback: <input type="file">. No writable handle comes back.
      const file = await pickFileViaInput(".json,application/json");
      if (file === null) return;
      let text: string;
      try {
        text = await file.text();
      } catch (error) {
        toast({
          message: `Could not read "${file.name}" — ${describeError(error)}`,
          tone: "error",
        });
        return;
      }
      installOpenedFile(text, file.name, null);
    },
    [installOpenedFile],
  );

  /** Entry point for every open source — guards dirty state with the prompt. */
  const requestOpen = useCallback(
    (pending: PendingOpen): void => {
      if (busyRef.current) return;
      if (useEditorStore.getState().isDirty) {
        setPendingOpen(pending);
        return;
      }
      busyRef.current = true;
      void runOpen(pending).finally(() => {
        busyRef.current = false;
      });
    },
    [runOpen],
  );

  /* ------------------------------ handlers ------------------------------ */

  const handleSaveClick = useCallback((): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    void performSave().finally(() => {
      busyRef.current = false;
    });
  }, [performSave]);

  const handleOpenClick = useCallback((): void => {
    requestOpen({ kind: "picker" });
  }, [requestOpen]);

  const handleDroppedFile = useCallback(
    (file: DroppedFile): void => {
      requestOpen({ kind: "file", ...file });
    },
    [requestOpen],
  );

  useFileShortcuts({ onSave: handleSaveClick, onOpen: handleOpenClick });
  useFileDrop(handleDroppedFile);

  /* --------------------- unsaved-changes prompt actions ------------------ */

  const cancelPendingOpen = useCallback((): void => {
    setPendingOpen(null);
  }, []);

  const discardAndOpen = useCallback((): void => {
    const pending = pendingOpen;
    setPendingOpen(null);
    if (pending === null || busyRef.current) return;
    busyRef.current = true;
    void runOpen(pending).finally(() => {
      busyRef.current = false;
    });
  }, [pendingOpen, runOpen]);

  const saveThenOpen = useCallback((): void => {
    const pending = pendingOpen;
    setPendingOpen(null);
    if (pending === null || busyRef.current) return;
    busyRef.current = true;
    void (async () => {
      // A cancelled or failed save cancels the open — nothing is lost.
      const saved = await performSave();
      if (saved) await runOpen(pending);
    })().finally(() => {
      busyRef.current = false;
    });
  }, [pendingOpen, performSave, runOpen]);

  const downloadFailedSave = useCallback((): void => {
    const failure = saveFailure;
    if (failure === null) return;
    downloadTextFile(failure.fileName, failure.text);
    setSaveFailure(null);
    toast({ message: `Downloaded ${failure.fileName}. Your work is safe.` });
  }, [saveFailure]);

  /* -------------------------------- render ------------------------------- */

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label="File actions"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpenClick}
        title="Open a diagram file (Ctrl/Cmd+O)"
      >
        <FolderOpen aria-hidden="true" />
        Open
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSaveClick}
        title="Save the diagram (Ctrl/Cmd+S)"
        aria-label={isDirty ? "Save — unsaved changes" : "Save"}
      >
        <Save aria-hidden="true" />
        Save
      </Button>

      <Dialog
        open={pendingOpen !== null}
        onClose={cancelPendingOpen}
        title="Unsaved changes"
        description="This diagram has changes that are not saved to disk. Opening another file will replace it."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={cancelPendingOpen}>
              Cancel
            </Button>
            <Button variant="ghost" size="sm" onClick={discardAndOpen}>
              Discard changes
            </Button>
            <Button variant="primary" size="sm" onClick={saveThenOpen}>
              Save, then open
            </Button>
          </>
        }
      />

      <Dialog
        open={saveFailure !== null}
        onClose={() => setSaveFailure(null)}
        title="Couldn't save your diagram"
        description={
          saveFailure === null
            ? undefined
            : `${saveFailure.message} Nothing in memory was lost — download a copy to keep your work safe.`
        }
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveFailure(null)}
            >
              Close
            </Button>
            <Button variant="primary" size="sm" onClick={downloadFailedSave}>
              Download a copy
            </Button>
          </>
        }
      />
    </div>
  );
}
