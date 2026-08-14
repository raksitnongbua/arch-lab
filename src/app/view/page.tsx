import type { Metadata } from "next";

import { ViewPlayground } from "@/features/playground";

export const metadata: Metadata = {
  title: "Diagram playground — write it, see it rendered live",
  description:
    "One playground for every document arch-lab reads: write .alab (C4 or sequence), paste arch-lab JSON, or paste Mermaid — the format is auto-detected and the diagram renders as you type. Share links, image export, and a lossless JSON twin for C4 models. Everything runs in your browser.",
  alternates: { canonical: "/view" },
};

/**
 * `/view` — the playground, seeded with the C4 example. `/view/c4` and
 * `/view/sequence` mount the SAME component and differ only in their seed;
 * this route seeds C4 because `/view` WAS the C4 playground originally, so a
 * returning visitor's muscle memory still holds.
 *
 * That history also means share links minted then still point here
 * (`/view#m=…`). This page used to be a chooser that decoded the fragment and
 * FORWARDED it to whichever playground could read it; the merged playground
 * reads every payload kind, so those links now simply open in place — the
 * forwarding apparatus (and the chooser) is gone, not moved.
 *
 * ROUTE PRECEDENCE, asserted where it matters: `c4` and `sequence` are
 * static sibling segments of `[modelId]`, and Next.js resolves static
 * segments FIRST — so those two words are reserved model ids.
 * `[modelId]/page.tsx`'s generateStaticParams throws at build time if the
 * registry ever claims one.
 */
export default function ViewPage(): React.JSX.Element {
  return <ViewPlayground seed="c4" />;
}
