/**
 * A registered GANTT EXAMPLE, rendered read-only.
 *
 * Thin on purpose, in the way `ErExampleView` and `DictExampleView` are: the
 * whole interactive story — hover, the pin that outlives the pointer, Escape
 * to release — already lives in `GanttViewer`, and this adds only what a
 * viewer cannot own, which here is the shared
 * `DiagramWell` — the page's full remaining height, on the ground every
 * notation's diagram shares.
 *
 * NO LIVE REGION, unlike its siblings, and that is the honest situation rather
 * than an omission: their viewers push an announcement out through an
 * `onAnnounce` callback because focusing a node opens a detail PANEL a screen
 * reader would otherwise never learn about. Focusing a gantt row opens
 * nothing — every row is already a focusable control carrying its own
 * `aria-label` ("Verify parity, on the critical chain"), so the assistive
 * announcement is the control itself. A region wired to nothing would be an
 * empty `aria-live` node shipped on every example page.
 *
 * A SERVER COMPONENT, for the same reason: with no announcement state there is
 * nothing here that needs a browser, and the document arrives already parsed
 * from the server registry. `GanttViewer` carries its own `"use client"`
 * boundary, so the interactive canvas still mounts — and the SVG inside it is
 * server-rendered either way, which is what `check:seo` relies on.
 */

import type { GanttLabFile } from "@/types";

import { DiagramWell } from "@/components/ui/diagram-well";

import { GanttViewer } from "./gantt-viewer";

export function GanttExampleView({
  file,
}: {
  file: GanttLabFile;
}): React.JSX.Element {
  return (
    <DiagramWell>
      <GanttViewer file={file} />
    </DiagramWell>
  );
}
