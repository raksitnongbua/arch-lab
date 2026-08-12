import type { Metadata } from "next";

import { ViewerPlayground } from "@/features/viewer";

export const metadata: Metadata = {
  title: "Write your own C4 model — live two-pane editor",
  description:
    "Edit arch-lab text (.alab) and arch-lab JSON side by side — each pane regenerates the other as you type and the diagram re-renders live. Import Mermaid C4 one-way, copy or download either format, and export the diagram as an image. Everything stays in your browser.",
  alternates: { canonical: "/view/c4" },
};

/**
 * `/view/c4` — the C4 two-pane playground, moved here VERBATIM from `/view`
 * when `/view` became the chooser. Behaviour is unchanged; only the address
 * moved, and `ViewerPlayground` derives its URL writes from
 * `location.pathname`, so share-link decoding and the address-bar sync work
 * here without modification.
 *
 * Share links land in two ways, both live:
 *   - new links are minted against this path (`/view/c4#m=…`);
 *   - legacy `/view#m=…` links are forwarded here by the chooser with the
 *     fragment intact.
 *
 * A STATIC segment named `c4` shadows `/view/[modelId]` — Next resolves
 * static segments first — which makes `c4` a reserved model id; the
 * `[modelId]` page asserts that at build time.
 */
export default function ViewC4Page(): React.JSX.Element {
  return <ViewerPlayground />;
}
