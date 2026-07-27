import type { Metadata } from "next";

import { ViewerPlayground } from "@/features/viewer";

export const metadata: Metadata = {
  title: "Write your own model — live two-pane editor",
  description:
    "Edit arch-lab text (.alab) and arch-lab JSON side by side — each pane regenerates the other as you type and the diagram re-renders live. Import Mermaid C4 one-way, copy or download either format, and export the diagram as an image. Everything stays in your browser.",
};

/**
 * `/view/new` — the paste-your-own entry into view mode. A static segment,
 * so it always wins over the `[modelId]` dynamic sibling; a registry model
 * can never be shadowed because ids come from the service, not this path.
 */
export default function ViewNewPage(): React.JSX.Element {
  return <ViewerPlayground />;
}
