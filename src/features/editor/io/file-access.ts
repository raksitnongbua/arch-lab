/**
 * The File System Access API layer with its graceful fallback (T3-A, D2).
 *
 * Persistence approach is settled by the handoff: `showSaveFilePicker` /
 * `showOpenFilePicker` where available; download-blob + `<input type="file">`
 * where not (Firefox, Safari, insecure contexts). Everything here
 * FEATURE-DETECTS AT CALL TIME — `typeof window.showSaveFilePicker ===
 * "function"` — and never branches on user-agent (integration risk R3).
 *
 * Also holds the module-level save session: the live `FileSystemFileHandle`
 * (which cannot live in the Zustand store — the frozen contract only carries
 * `fileHandleName`) and the exact bytes of the last successful save, which is
 * how a no-op save is detected and skipped so the file on disk stays
 * byte-identical, `updatedAt` untouched.
 */

/* -------------------------------------------------------------------------- */
/* Minimal typings for the WICG File System Access API                        */
/* (not yet in lib.dom — declared locally, no `any`)                          */
/* -------------------------------------------------------------------------- */

export interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  id?: string;
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
  id?: string;
}

interface FileSystemAccessWindow {
  showSaveFilePicker?: (
    options?: SaveFilePickerOptions,
  ) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (
    options?: OpenFilePickerOptions,
  ) => Promise<FileSystemFileHandle[]>;
}

interface PermissionCapableHandle {
  queryPermission?: (descriptor: {
    mode: "read" | "readwrite";
  }) => Promise<PermissionState>;
  requestPermission?: (descriptor: {
    mode: "read" | "readwrite";
  }) => Promise<PermissionState>;
}

function fsaWindow(): FileSystemAccessWindow {
  return typeof window === "undefined"
    ? {}
    : (window as unknown as FileSystemAccessWindow);
}

/**
 * Compound extensions (".archlab.json") are rejected by the picker spec, so
 * the JSON filter is plain ".json"; the ".archlab.json" convention lives in
 * the suggested/derived file name instead.
 *
 * Both readable formats are offered, `.alab` first — it is what the app now
 * writes by default, and the first entry is what the picker preselects. The
 * open dialog uses the same list, so a `.alab` file is selectable there too;
 * before this it was not, which made a text model impossible to open at all.
 */
const PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "arch-lab model (text)",
    accept: { "text/plain": [ARCHTEXT_EXTENSION] },
  },
  {
    description: "arch-lab model (JSON)",
    accept: { "application/json": [".json"] },
  },
];
import { slugify } from "@/lib/slug";

import { ARCHTEXT_EXTENSION } from "@/features/archtext";

/* -------------------------------------------------------------------------- */
/* Feature detection — at call time, never by user-agent (R3)                 */
/* -------------------------------------------------------------------------- */

export function supportsSavePicker(): boolean {
  return typeof fsaWindow().showSaveFilePicker === "function";
}

export function supportsOpenPicker(): boolean {
  return typeof fsaWindow().showOpenFilePicker === "function";
}

/* -------------------------------------------------------------------------- */
/* Save session (module state)                                                */
/* -------------------------------------------------------------------------- */

let currentHandle: FileSystemFileHandle | null = null;
let lastSavedText: string | null = null;

/** The live handle of the current document, or null (fallback mode / unsaved). */
export function getCurrentFileHandle(): FileSystemFileHandle | null {
  return currentHandle;
}

export function setCurrentFileHandle(
  handle: FileSystemFileHandle | null,
): void {
  currentHandle = handle;
}

/** The exact bytes last written to (or read from) disk, or null. */
export function getLastSavedText(): string | null {
  return lastSavedText;
}

export function setLastSavedText(text: string | null): void {
  lastSavedText = text;
}

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

function isPickerCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Opens the OS save dialog. Resolves `null` when the user cancels (not an
 * error); throws when the picker itself is unavailable or fails.
 */
export async function pickSaveHandle(
  suggestedName: string,
): Promise<FileSystemFileHandle | null> {
  const picker = fsaWindow().showSaveFilePicker;
  if (typeof picker !== "function") {
    throw new Error("This browser does not support the save-file picker.");
  }
  try {
    return await picker({
      suggestedName,
      types: PICKER_TYPES,
      id: "arch-lab",
    });
  } catch (error) {
    if (isPickerCancellation(error)) return null;
    throw error;
  }
}

/**
 * Opens the OS open dialog. Resolves `null` when the user cancels; throws
 * when the picker itself is unavailable or fails.
 */
export async function pickOpenHandle(): Promise<FileSystemFileHandle | null> {
  const picker = fsaWindow().showOpenFilePicker;
  if (typeof picker !== "function") {
    throw new Error("This browser does not support the open-file picker.");
  }
  try {
    const [handle] = await picker({
      types: PICKER_TYPES,
      multiple: false,
      id: "arch-lab",
    });
    return handle ?? null;
  } catch (error) {
    if (isPickerCancellation(error)) return null;
    throw error;
  }
}

/**
 * Fallback open path: a transient `<input type="file">`. Resolves `null`
 * when the user dismisses the dialog.
 */
export function pickFileViaInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    const finish = (file: File | null): void => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), {
      once: true,
    });
    input.addEventListener("cancel", () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Writes `text` to `handle`, re-requesting write permission first when the
 * browser exposes the permission API (handles get revoked after navigations —
 * R3). Throws a descriptive Error on denial or write failure; the caller
 * surfaces it as the blocking save-error dialog.
 */
export async function writeTextToHandle(
  handle: FileSystemFileHandle,
  text: string,
): Promise<void> {
  const permissioned = handle as FileSystemFileHandle & PermissionCapableHandle;
  if (typeof permissioned.requestPermission === "function") {
    const status = await permissioned.requestPermission({ mode: "readwrite" });
    if (status !== "granted") {
      throw new Error(
        `Permission to write to "${handle.name}" was denied. Grant access when the browser asks, or download a copy instead.`,
      );
    }
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // The stream is already broken; the original error is the one to surface.
    }
    throw error;
  }
}

/**
 * MIME type for a saved model, from its file name.
 *
 * `.alab` is plain UTF-8 text; anything else on this path is the JSON format.
 */
function mimeForFileName(fileName: string): string {
  return fileName.endsWith(ARCHTEXT_EXTENSION)
    ? "text/plain;charset=utf-8"
    : "application/json";
}

/**
 * Fallback save path: download the text as a file via a transient anchor.
 *
 * The MIME type follows the NAME, because this path saves both formats — a
 * `.alab` document is plain text, and labelling it `application/json` (as this
 * did unconditionally) tells the OS to hand it to a JSON viewer that will
 * report it as malformed.
 */
export function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: mimeForFileName(fileName) });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `"ShopFlow Platform"` → `"shopflow-platform.archlab.json"`.
 *
 * Kept for callers that specifically want the JSON name (the export action).
 * Anything choosing a name for a SAVE should use `deriveFileNameFor` in
 * `./format`, which honours the model's own format.
 */
export function deriveFileName(title: string): string {
  return `${slugify(title, "untitled-model")}.archlab.json`;
}
