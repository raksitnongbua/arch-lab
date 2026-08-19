"use client";

/**
 * A registered ER EXAMPLE, rendered read-only.
 *
 * Thin on purpose, and thin in exactly the way `UseCaseExampleView` and
 * `FlowchartExampleView` are: the whole interactive story — focus, the detail
 * panel, the backdrop that clears it — already lives in `DictViewer`, and this
 * adds only the two things a viewer cannot own. It holds the single polite
 * LIVE REGION (the viewer deliberately owns none, so two regions updated near
 * each other can never race and swallow each other's announcements — the
 * playground makes the same arrangement), and it gives the diagram the page's
 * full remaining height.
 *
 * A client component because the live region is state, not because the example
 * is: the document arrives already parsed from the server registry, so nothing
 * here re-parses anything.
 */

import { useState } from "react";

import type { DictLabFile } from "@/types";

import { DictViewer } from "./dict-viewer";

export function DictExampleView({
  file,
}: {
  file: DictLabFile;
}): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <DictViewer file={file} onAnnounce={setAnnouncement} />
    </div>
  );
}
