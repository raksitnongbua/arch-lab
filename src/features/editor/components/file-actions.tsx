"use client";

/**
 * Save / Open toolbar chrome and the whole persistence orchestration
 *. Props-free, mounted by the frozen
 * `editor-shell.tsx`; reads the store itself.
 *
 * Flow rules implemented here:
 * - File System Access API where available, download + `<input type="file">`
 *   where not — feature-detected at call time.
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
import { Braces, FilePlus2, FolderOpen, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import { ArchTextParseError } from "@/features/archtext";
import { describeError } from "@/lib/errors";

import {
  deriveFileName,
  downloadTextFile,
  FileValidationError,
  getCurrentFileHandle,
  getLastSavedText,
  pickFileViaInput,
  pickOpenHandle,
  pickSaveHandle,
  setCurrentFileHandle,
  setLastSavedText,
  supportsOpenPicker,
  supportsSavePicker,
  writeTextToHandle,
} from "../io";
import {
  DEFAULT_SAVE_FORMAT,
  deriveFileNameFor,
  deserializeModelFrom,
  formatForFileName,
  OPEN_ACCEPT,
  serializeModelAs,
} from "../io/format";
import { createEmptyModel, useEditorStore, type EditorModel } from "../state";
import { useFileDrop, type DroppedFile } from "../hooks/use-file-drop";
import { useFileShortcuts } from "../hooks/use-file-shortcuts";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything that replaces the current model, and therefore has to pass the
 * unsaved-changes guard first. "new" joins the two open paths deliberately:
 * starting a blank document discards work exactly as thoroughly as opening
 * another file does, and must not be the one door that skips the prompt.
 */
type PendingOpen =
  { kind: "picker" } | { kind: "new" } | ({ kind: "file" } & DroppedFile);

interface SaveFailure {
  /** User-facing cause, e.g. a revoked handle or denied permission. */
  message: string;
  /** The exact bytes that failed to write — offered as "Download a copy". */
  text: string;
  fileName: string;
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

    // Format-stickiness: a model that came from a file goes back in that
    // file's format. Only a model that has never been written picks the
    // default — silently rewriting somebody's .archlab.json as .alab because
    // we prefer .alab is not ours to do.
    const format =
      state.fileHandleName === null
        ? DEFAULT_SAVE_FORMAT
        : formatForFileName(state.fileHandleName);

    // Determinism rule 6: bump updatedAt only when the model actually changed.
    const text = serializeModelAs(
      state.model,
      format,
      state.isDirty ? { updatedAt: new Date().toISOString() } : undefined,
    );
    const fileName =
      state.fileHandleName ??
      deriveFileNameFor(state.model.metadata.title, format);

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

  /**
   * A JSON copy, on demand. Save writes the model's own format; this is the
   * escape hatch to the interchange one — for a tool that wants JSON, or a
   * pipeline that will not learn a grammar. Always a download, never the
   * save handle: exporting must not silently re-point Save at a .json file
   * and quietly convert the document from then on.
   */
  const handleExportJson = useCallback(() => {
    const state = useEditorStore.getState();
    const fileName = deriveFileName(state.model.metadata.title);
    try {
      downloadTextFile(fileName, serializeModelAs(state.model, "json"));
      toast({ message: `Exported ${fileName}.` });
    } catch (error) {
      toast({
        message: `Could not export — ${describeError(error)}`,
        tone: "error",
      });
    }
  }, []);

  /* ------------------------------- opening ------------------------------ */

  const installOpenedFile = useCallback(
    (text: string, name: string, handle: FileSystemFileHandle | null): void => {
      let model: EditorModel;
      try {
        model = deserializeModelFrom(text, formatForFileName(name));
      } catch (error) {
        // The previous model is untouched — deserialize never half-loads.
        const message =
          error instanceof FileValidationError ||
          error instanceof ArchTextParseError
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
      if (pending.kind === "new") {
        // A blank document is a document with no file behind it: the handle
        // and the last-saved text must go too, or Save would write this new
        // model over whatever was open before.
        setCurrentFileHandle(null);
        setLastSavedText(null);
        useEditorStore.getState().replaceModel(createEmptyModel(), {
          markSaved: true,
          fileHandleName: null,
        });
        toast({ message: "Started a new model." });
        return;
      }
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
      const file = await pickFileViaInput(OPEN_ACCEPT);
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
      /* `shrink-0`: these are the row's terminal controls. Letting flexbox
         take width out of them squeezes Save under whatever panel just
         opened, so the header's slack has to come from the breadcrumb (which
         truncates) and the spacer, never from here. */
      className="flex shrink-0 items-center gap-2"
      role="group"
      aria-label="File actions"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => requestOpen({ kind: "new" })}
        title="Start a new, empty model"
      >
        <FilePlus2 aria-hidden="true" />
        <span className="hidden @[38rem]:inline">New</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpenClick}
        title="Open a diagram file (Ctrl/Cmd+O)"
      >
        <FolderOpen aria-hidden="true" />
        <span className="hidden @[38rem]:inline">Open</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExportJson}
        title="Download a .archlab.json copy — the interchange format"
      >
        <Braces aria-hidden="true" />
        <span className="hidden @[52rem]:inline">Export JSON</span>
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
        description={
          pendingOpen?.kind === "new"
            ? "This diagram has changes that are not saved to disk. Starting a new model will replace it."
            : "This diagram has changes that are not saved to disk. Opening another file will replace it."
        }
        footer={
          <>
            <Button variant="outline" size="sm" onClick={cancelPendingOpen}>
              Cancel
            </Button>
            <Button variant="ghost" size="sm" onClick={discardAndOpen}>
              Discard changes
            </Button>
            <Button variant="primary" size="sm" onClick={saveThenOpen}>
              {pendingOpen?.kind === "new"
                ? "Save, then start new"
                : "Save, then open"}
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
