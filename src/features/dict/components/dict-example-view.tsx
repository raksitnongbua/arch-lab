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
 * playground makes the same arrangement), and it hands the diagram to the shared
 * `DiagramWell`, which gives it the page's full remaining height on the ground
 * every notation's diagram shares.
 *
 * A client component because the live region is state, not because the example
 * is: the document arrives already parsed from the server registry, so nothing
 * here re-parses anything.
 */

import { useState } from "react";

import type { DictLabFile } from "@/types";

import { DiagramWell } from "@/components/ui/diagram-well";

import { DictViewer } from "./dict-viewer";

export function DictExampleView({
  file,
}: {
  file: DictLabFile;
}): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");

  return (
    <DiagramWell>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <DictViewer file={file} onAnnounce={setAnnouncement} />
    </DiagramWell>
  );
}
