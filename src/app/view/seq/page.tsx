import type { Metadata } from "next";

import { ViewPlayground } from "@/features/playground";

export const metadata: Metadata = {
  title: "Sequence diagram playground — write it, then explore it",
  description:
    "Write .alab sequence text or paste a Mermaid sequenceDiagram and click through the flow message by message. Free, no account, runs in your browser.",
  alternates: { canonical: "/view/seq" },
};

/**
 * `/view/seq` — the merged playground (`features/playground`), seeded with
 * the sequence example. THE REAL PAGE, and it used to be the trampoline.
 *
 * WHY THE PAIR FLIPPED. Every sequence share link is minted against this
 * short route, and for a good reason: the document travels in the URL
 * fragment and competes with `MAX_SHARE_URL_LENGTH`, so the five characters
 * `/view/seq` does not spend on the path buy roughly 7–10 more characters of
 * document in every link (deflate-raw's observed ~0.5–0.7 payload ratio).
 * That part was right. What was wrong was making the route people ACTUALLY
 * ARRIVE ON a forward: opening any shared flow meant landing here, reading a
 * holding line, and being replaced into `/view/sequence` — a bounce on the
 * single most common way anyone reaches this app from outside it.
 *
 * It also quietly undid the sequence social card. A link preview is fetched
 * for the URL as SHARED, and this route had no `opengraph-image`, so every
 * minted sequence link previewed with the root card — "C4 architecture
 * diagrams", the other document kind entirely, which is the exact bug that
 * card was added to fix. The card now lives here, beside the page it
 * describes, and `/view/sequence` re-exports it so the example routes nested
 * under that path keep inheriting a sequence-shaped preview.
 *
 * `/view/sequence` is the alias now and forwards here, so links minted
 * against the long route — every one made before the alias existed — keep
 * working. Like `c4` and `sequence`, `seq` is a STATIC segment shadowing
 * `/view/[modelId]`, so it is a reserved model id, asserted at build time in
 * the `[modelId]` page.
 */
export default function ViewSeqPage(): React.JSX.Element {
  return <ViewPlayground seed="sequence" />;
}
