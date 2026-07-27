"use client";

/**
 * Window-level drag-and-drop of a `.archlab.json` file (T3-A, AF-E5-S2).
 *
 * Reads the dropped file's text and — where the browser supports
 * `DataTransferItem.getAsFileSystemHandle` (feature-detected, D2/R3) — also
 * captures a writable handle so subsequent `Cmd+S` saves go back to the
 * dropped file without a picker. The caller (`FileActions`) owns what happens
 * next, including the unsaved-changes prompt.
 */

import { useEffect } from "react";

import { toast } from "@/components/ui/toast";

export interface DroppedFile {
  text: string;
  name: string;
  /** Writable handle when the browser can provide one; null in fallback mode. */
  handle: FileSystemFileHandle | null;
}

interface DataTransferItemWithHandle extends DataTransferItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}

function dragHasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

export function useFileDrop(onFile: (file: DroppedFile) => void): void {
  useEffect(() => {
    function handleDragOver(event: DragEvent): void {
      if (dragHasFiles(event)) event.preventDefault();
    }

    function handleDrop(event: DragEvent): void {
      if (!dragHasFiles(event)) return;
      event.preventDefault();

      // Everything on the DataTransfer must be read synchronously, inside the
      // drop event — items are neutered once the handler returns.
      const items = Array.from(event.dataTransfer?.items ?? []);
      let file: File | null = null;
      let handlePromise: Promise<FileSystemHandle | null> | null = null;
      let sawAnyFile = false;
      for (const item of items) {
        if (item.kind !== "file") continue;
        sawAnyFile = true;
        const candidate = item.getAsFile();
        if (candidate === null) continue;
        if (!candidate.name.toLowerCase().endsWith(".json")) continue;
        file = candidate;
        const withHandle = item as DataTransferItemWithHandle;
        if (typeof withHandle.getAsFileSystemHandle === "function") {
          handlePromise = withHandle.getAsFileSystemHandle();
        }
        break;
      }

      if (file === null) {
        if (sawAnyFile) {
          toast({
            message: "Drop a .archlab.json file to open it here.",
            tone: "warning",
          });
        }
        return;
      }

      const dropped = file;
      void (async () => {
        let text: string;
        try {
          text = await dropped.text();
        } catch {
          toast({
            message: `Could not read "${dropped.name}" — the file may have moved or be unreadable.`,
            tone: "error",
          });
          return;
        }
        let handle: FileSystemFileHandle | null = null;
        if (handlePromise !== null) {
          const resolved = await handlePromise.catch(() => null);
          if (resolved !== null && resolved.kind === "file") {
            handle = resolved as FileSystemFileHandle;
          }
        }
        onFile({ text, name: dropped.name, handle });
      })();
    }

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFile]);
}
