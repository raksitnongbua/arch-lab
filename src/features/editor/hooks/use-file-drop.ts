"use client";

/**
 * Window-level drag-and-drop of a `.alab` or `.archlab.json` file
 *.
 *
 * Reads the dropped file's text and — where the browser supports
 * `DataTransferItem.getAsFileSystemHandle` (feature-detected) — also
 * captures a writable handle so subsequent `Cmd+S` saves go back to the
 * dropped file without a picker. The caller (`FileActions`) owns what happens
 * next, including the unsaved-changes prompt.
 */

import { useEffect } from "react";

import { toast } from "@/components/ui/toast";
import { isOpenableFileName } from "../io/format";

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

/**
 * How long to wait for the dropped item's file handle before opening without
 * it. Generous — a real OS drag resolves this in microseconds, so anything
 * approaching this bound means it is never going to settle.
 */
const HANDLE_TIMEOUT_MS = 1_000;

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
        // Both readable formats, not just JSON — dropping the `.alab` the
        // app now writes by default has to work.
        if (!isOpenableFileName(candidate.name)) continue;
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
            message: "Drop a .alab or .archlab.json file to open it here.",
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
        // The handle is an upgrade, never a requirement: with it, Save can
        // write back to the dropped file; without it, the open still works
        // and Save falls back to a download. So the wait for it is bounded.
        // `getAsFileSystemHandle()` is not guaranteed to settle — a
        // synthetic DataTransfer leaves it pending forever, and an
        // unsettled promise here used to mean the file silently never
        // opened at all. Losing write-back is a far smaller failure than
        // losing the open.
        let handle: FileSystemFileHandle | null = null;
        if (handlePromise !== null) {
          const resolved = await Promise.race([
            handlePromise.catch(() => null),
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), HANDLE_TIMEOUT_MS);
            }),
          ]);
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
