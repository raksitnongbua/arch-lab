import type { Metadata } from "next";

import { ViewPlayground } from "@/features/playground";

export const metadata: Metadata = {
  title: "Sequence diagram playground — write it, then explore it",
  description:
    "Write .alab sequence text or paste a Mermaid sequenceDiagram and see the whole flow at once: activation bars, notes and nested fragments. Click any message or participant to animate and inspect it. Everything stays in your browser.",
  alternates: { canonical: "/view/sequence" },
};

/**
 * `/view/sequence` — the merged playground (`features/playground`), seeded
 * with the sequence example. The component is the SAME one `/view` and
 * `/view/c4` mount; the seed is the routes' only difference. Like its `c4`
 * sibling this is a STATIC segment shadowing `/view/[modelId]`, so `sequence`
 * is a reserved model id (asserted at build time in the `[modelId]` page).
 *
 * Share links DO land here: the playground decodes `#m=…` fragments off
 * `location.hash` on mount, and new sequence links are minted against the
 * shorter `/view/seq` alias (see `../seq/`), which forwards to this page
 * with the fragment intact. Links minted against this long route before the
 * alias existed keep working — and a C4 payload landing here now simply
 * renders, since the playground reads every kind.
 */
export default function ViewSequencePage(): React.JSX.Element {
  return <ViewPlayground seed="sequence" />;
}
