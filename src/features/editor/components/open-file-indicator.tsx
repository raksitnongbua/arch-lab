"use client";

/**
 * Which file this model came from, and where Save will put it back.
 *
 * The store already knew (`fileHandleName`) but never showed it, so once a
 * model was open there was nothing on screen tying it to a file on disk — you
 * could not tell an opened document from a new one, nor which of two similar
 * models you were editing.
 *
 * What it can and cannot say
 * --------------------------
 * It shows the file NAME, not a path. Browsers do not expose a file's
 * location to a web page: the File System Access API hands over a
 * `FileSystemFileHandle` whose only public identity is `.name`, and the
 * `<input type="file">` fallback gives a `File` whose `webkitRelativePath` is
 * empty unless a whole directory was picked. There is no API that returns
 * `/Users/you/work/payments.alab`, by design — knowing where a user keeps
 * their files is exactly the sort of thing the sandbox exists to prevent.
 * Claiming otherwise in the UI would be a lie, so the tooltip says so plainly
 * instead of implying we know more than we do.
 *
 * The distinction that DOES matter, and which the tooltip leads with, is
 * whether Save writes back to that file in place or produces a download. That
 * depends on the File System Access API being available, and it changes what
 * pressing ⌘S actually does to the user's disk.
 */

import { FileText } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";

import { getCurrentFileHandle } from "../io";
import { formatForFileName, FORMAT_LABEL } from "../io/format";
import { useEditorStore } from "../state";

export function OpenFileIndicator(): React.JSX.Element | null {
  const fileName = useEditorStore((s) => s.fileHandleName);
  // Nothing to point at until the model has been opened from — or saved to —
  // a file. A new, never-saved model deliberately shows nothing rather than a
  // placeholder implying a file exists.
  if (fileName === null) return null;

  // Read at render rather than subscribed: the handle is module state that
  // only ever changes alongside `fileHandleName`, which IS subscribed, so
  // this cannot go stale without a re-render.
  const writesInPlace = getCurrentFileHandle() !== null;
  const format = FORMAT_LABEL[formatForFileName(fileName)];

  return (
    <Tooltip
      side="bottom"
      content={
        writesInPlace
          ? `${format} · Save writes back to this file. Browsers don't reveal a file's folder to a web page, so only its name can be shown.`
          : `${format} · This browser can't write files in place, so Save downloads a new copy instead of updating this one.`
      }
    >
      <span
        className="inline-flex min-w-0 shrink items-center gap-1.5 text-xs text-muted-foreground"
        /* The name is the useful part when it truncates, and the end of a
           name is where the version and extension live — but `direction: rtl`
           on the text would reorder punctuation, so this truncates normally
           and the tooltip carries the whole thing. */
        title={fileName}
      >
        <FileText aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="hidden max-w-40 truncate font-mono @[34rem]:inline">
          {fileName}
        </span>
        {writesInPlace ? null : (
          <span className="sr-only">(saves as a downloaded copy)</span>
        )}
      </span>
    </Tooltip>
  );
}
