import type { Metadata } from "next";

import { ViewerPlayground } from "@/features/viewer";

export const metadata: Metadata = {
  title: "Write your own model — live two-pane editor",
  description:
    "Edit arch-lab text (.alab) and arch-lab JSON side by side — each pane regenerates the other as you type and the diagram re-renders live. Import Mermaid C4 one-way, copy or download either format, and export the diagram as an image. Everything stays in your browser.",
};

/**
 * `/view` — view mode's entry point, and where share links land.
 *
 * The INDEX of the `/view` segment, so it cannot collide with its `[modelId]`
 * sibling: `/view` is this page, `/view/shopflow` is that one. This was
 * `/view/new` until the `new` segment was dropped — that path is gone rather
 * than redirected, so links minted before the change no longer resolve.
 *
 * With no `#` fragment it opens on a seeded example, which doubles as the thing
 * to edit: an empty canvas teaches nobody the format.
 */
export default function ViewPage(): React.JSX.Element {
  return <ViewerPlayground />;
}
