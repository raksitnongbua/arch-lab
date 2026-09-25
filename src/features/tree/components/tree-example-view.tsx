/**
 * The read-only wrapper for `/live/tree/[exampleId]` — a server component that
 * draws a bundled tree with no pane, no starter row and nothing to edit.
 *
 * It renders `TreeViewer` rather than `TreeDiagram` for the reason the example
 * pages of the other kinds render their viewers: an example page is narrower
 * than the playground, so the drawing needs the same camera or it overflows on
 * exactly the surface a search engine reaches first.
 */

import type { TreeLabFile } from "@/types";

import { DiagramWell } from "@/components/ui/diagram-well";

import { TreeViewer } from "./tree-viewer";

export function TreeExampleView({ file }: { file: TreeLabFile }) {
  /* THE SHARED WELL, not a bare div: the ground under a diagram is one colour
     across all ten notations, and a page that wraps its own would drift the
     moment that colour changes. */
  return (
    <DiagramWell>
      <TreeViewer file={file} />
    </DiagramWell>
  );
}
