import type { Metadata } from "next";

import { ViewChooser } from "./view-chooser";

export const metadata: Metadata = {
  title: "View a model — C4 or sequence diagram",
  description:
    "Choose your playground: the two-pane C4 model editor (.alab text and JSON in lossless sync) or the sequence diagram viewer (click-to-focus animation, Mermaid import). Everything runs in your browser.",
  alternates: { canonical: "/view" },
};

/**
 * `/view` — the chooser between the C4 playground (`/view/c4`) and the
 * sequence playground (`/view/sequence`).
 *
 * This page USED to be the C4 playground itself, and share links minted then
 * still point here (`/view#m=…`). The fragment is invisible to the server, so
 * the client component below detects a payload and forwards to `/view/c4` with
 * the fragment intact — see `view-chooser.tsx` for the mechanics.
 *
 * The chooser's copy is deliberately SERVER-rendered (this route is in
 * `sitemap.ts`, and a route that ships an empty body to a crawler does not
 * exist as far as search is concerned), so hiding it from a forwarding visitor
 * has to happen before the first paint. That is the root layout's
 * `data-share-forward` flag, which is where the inline script for it lives —
 * see the comment there for why it cannot live in this file.
 *
 * ROUTE PRECEDENCE, asserted where it matters: `c4` and `sequence` are
 * static sibling segments of `[modelId]`, and Next.js resolves static
 * segments FIRST — so those two words are now reserved model ids.
 * `[modelId]/page.tsx`'s generateStaticParams throws at build time if the
 * registry ever claims one.
 */
export default function ViewPage(): React.JSX.Element {
  return <ViewChooser />;
}
