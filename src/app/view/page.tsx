import type { Metadata } from "next";

import { ViewPlayground } from "@/features/playground";

export const metadata: Metadata = {
  title: "Diagram playground — write it, see it rendered live",
  description:
    "Write .alab, arch-lab JSON or Mermaid — the format is detected and the diagram renders as you type. Runs entirely in your browser.",
  /**
   * CANONICAL TO `/view/c4`, not to itself, because this page and that one
   * are the SAME page: the merged playground with the same C4 seed. Two URLs
   * serving identical content compete, and a search engine picks a winner on
   * signals nobody chose. `/view/c4` is the one to keep — it carries the
   * intent-specific title, description and social card, and `/view/seq` holds
   * the other kind, so between them the two document kinds are covered and
   * this route has no distinct intent left of its own.
   *
   * The page stays, and stays rendering: `/view#m=…` share links minted
   * before the split still land here and must open in place. A canonical is a
   * consolidation signal, not a redirect.
   */
  alternates: { canonical: "/view/c4" },
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
