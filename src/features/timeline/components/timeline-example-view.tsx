/**
 * A registered TIMELINE EXAMPLE, rendered read-only.
 *
 * Thin on purpose, in the way `GanttExampleView` and `ErExampleView` are: the
 * whole interactive story — hover, the pin that outlives the pointer, Escape
 * to release — already lives in `TimelineViewer`, and this adds only what a
 * viewer cannot own, which here is the shared
 * `DiagramWell` — the page's full remaining height, on the ground every
 * notation's diagram shares.
 *
 * NO LIVE REGION, like the gantt's and unlike ER's, and it is the honest
 * situation rather than an omission: ER pushes an announcement out through an
 * `onAnnounce` callback because focusing a node opens a detail PANEL a screen
 * reader would otherwise never learn about. Focusing a timeline event opens
 * nothing — every event is already a focusable control carrying its own
 * `aria-label` ("2025: Series A"), and its description is drawn on the canvas
 * rather than revealed, so there is no state change to announce. A region
 * wired to nothing would be an empty `aria-live` node shipped on every example
 * page.
 *
 * A SERVER COMPONENT, for the same reason: with no announcement state there is
 * nothing here that needs a browser, and the document arrives already parsed
 * from the server registry. `TimelineViewer` carries its own `"use client"`
 * boundary, so the interactive canvas still mounts — and the SVG inside it is
 * server-rendered either way, which is what `check:seo` relies on.
 */

import type { TimelineLabFile } from "@/types";

import { DiagramWell } from "@/components/ui/diagram-well";

import { TimelineViewer } from "./timeline-viewer";

export function TimelineExampleView({
  file,
}: {
  file: TimelineLabFile;
}): React.JSX.Element {
  return (
    <DiagramWell>
      <TimelineViewer file={file} />
    </DiagramWell>
  );
}
