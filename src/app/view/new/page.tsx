import type { Metadata } from "next";

import { ViewerPlayground } from "@/features/viewer";

export const metadata: Metadata = {
  title: "Render your own model — view mode",
  description:
    "Paste an arch-flow JSON document or Mermaid C4 code and render it read-only, convert between the two formats, and export the diagram as an image. Everything stays in your browser.",
};

/**
 * `/view/new` — the paste-your-own entry into view mode. A static segment,
 * so it always wins over the `[modelId]` dynamic sibling; a registry model
 * can never be shadowed because ids come from the service, not this path.
 */
export default function ViewNewPage(): React.JSX.Element {
  return <ViewerPlayground />;
}
