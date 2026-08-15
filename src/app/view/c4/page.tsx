import type { Metadata } from "next";

import { ViewPlayground } from "@/features/playground";

export const metadata: Metadata = {
  title: "Write your own C4 model — live editor",
  description:
    "Edit .alab, arch-lab JSON or Mermaid C4 and watch the C4 diagram re-render live. Drill into any box, export as an image. Free, no account, runs in your browser.",
  alternates: { canonical: "/view/c4" },
};

/**
 * `/view/c4` — the merged playground (`features/playground`), seeded with the
 * C4 example. The component is the SAME one `/view` and `/view/sequence`
 * mount; the seed is the routes' only difference, kept so each route's share
 * links, sitemap entry and OG card keep describing what a visitor first sees.
 *
 * Share links land in two ways, both live:
 *   - links are minted against this path (`/view/c4#m=…`) by the C4 shell's
 *     Share panel;
 *   - legacy `/view#m=…` links open in place on `/view` itself now — the
 *     playground reads every payload kind, so nothing forwards here any more.
 *
 * A STATIC segment named `c4` shadows `/view/[modelId]` — Next resolves
 * static segments first — which makes `c4` a reserved model id; the
 * `[modelId]` page asserts that at build time.
 */
export default function ViewC4Page(): React.JSX.Element {
  return <ViewPlayground seed="c4" />;
}
