/**
 * A registered LIFECYCLE EXAMPLE, rendered read-only.
 *
 * Thin on purpose, in the way `TimelineExampleView` and `GanttExampleView`
 * are: the whole interactive story — hover, the pin that outlives the
 * pointer, Escape to release — already lives in `LifecycleViewer`, and this
 * adds only what a viewer cannot own, which here is the shared
 * `DiagramWell` — the page's full remaining height, on the ground every
 * notation's diagram shares.
 *
 * NO LIVE REGION, like the timeline's and unlike ER's, and it is the honest
 * situation rather than an omission: ER pushes an announcement out through an
 * `onAnnounce` callback because focusing a node opens a detail PANEL a screen
 * reader would otherwise never learn about. Focusing a lifecycle row opens
 * nothing — every row is already a focusable control carrying its own
 * `aria-label` naming the state, whether it ends, and every way out with its
 * condition, and all of that is drawn on the canvas rather than revealed. A
 * region wired to nothing would be an empty `aria-live` node shipped on every
 * example page.
 *
 * A SERVER COMPONENT, for the same reason: with no announcement state there
 * is nothing here that needs a browser, and the document arrives already
 * parsed from the server registry. `LifecycleViewer` carries its own
 * `"use client"` boundary, so the interactive canvas still mounts — and the
 * SVG inside it is server-rendered either way, which is what `check:seo`
 * relies on.
 */

import type { LifecycleLabFile } from "@/types";

import { DiagramWell } from "@/components/ui/diagram-well";

import { LifecycleViewer } from "./lifecycle-viewer";

export function LifecycleExampleView({
  file,
}: {
  file: LifecycleLabFile;
}): React.JSX.Element {
  return (
    <DiagramWell>
      <LifecycleViewer file={file} />
    </DiagramWell>
  );
}
