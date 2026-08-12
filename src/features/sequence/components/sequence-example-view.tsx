"use client";

/**
 * A registered sequence EXAMPLE, rendered read-only.
 *
 * Thin on purpose: the whole interactive story — focus, the details dock, the
 * fold controls, zoom, drag-to-pan, immersive mode — already lives in
 * `SequenceViewer`, and this adds only the two things a viewer cannot own. It
 * holds the single polite LIVE REGION (the viewer deliberately owns none, so
 * that two regions updated near each other can never race and swallow each
 * other's announcements — the playground makes the same arrangement), and it
 * gives the diagram the page's full remaining height.
 *
 * A client component because the live region is state, not because the example
 * is: the document arrives already parsed from the server registry, so nothing
 * here re-parses anything.
 */

import { useState } from "react";

import type { SequenceLabFile } from "@/types";

import { SequenceViewer } from "./sequence-viewer";

export function SequenceExampleView({
  file,
}: {
  file: SequenceLabFile;
}): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <SequenceViewer file={file} onAnnounce={setAnnouncement} />
    </div>
  );
}
