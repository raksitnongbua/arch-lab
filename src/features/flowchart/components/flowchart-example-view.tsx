"use client";

/**
 * A registered flowchart EXAMPLE, rendered read-only.
 *
 * Thin on purpose, and thin in exactly the way `SequenceExampleView` is: the
 * whole interactive story — focus, the details dock, zoom, drag-to-pan,
 * keyboard walking, the idle-motion toggle — already lives in
 * `FlowchartViewer`, and this adds only the two things a viewer cannot own. It
 * holds the single polite LIVE REGION (the viewer deliberately owns none, so
 * two regions updated near each other can never race and swallow each other's
 * announcements — the playground makes the same arrangement), and it gives the
 * diagram the page's full remaining height.
 *
 * A client component because the live region is state, not because the example
 * is: the document arrives already parsed from the server registry, so nothing
 * here re-parses anything.
 */

import { useState } from "react";

import type { FlowchartLabFile } from "@/types";

import { FlowchartViewer } from "./flowchart-viewer";

export function FlowchartExampleView({
  file,
}: {
  file: FlowchartLabFile;
}): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <FlowchartViewer file={file} onAnnounce={setAnnouncement} />
    </div>
  );
}
