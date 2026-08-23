import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Flowchart playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/flow` — a forwarding alias for `/live?d=flow`, minted alongside the
 * flowchart document type so the third kind has the same short, memorable
 * door as `/live/seq` (`check:seo` and `check:share-capacity` both treat it
 * as one of the alias set now).
 *
 * Unlike `/live/seq` it never had a pre-merge life as a real page: it exists
 * for bookmarks and typed URLs, and — like every alias — it must carry a
 * `#m=…` fragment across intact, because share links opened here must keep
 * opening forever. (New flowchart share links mint against bare `/live`, the
 * same route as the other two kinds: the minted route must be the REAL page,
 * not a trampoline — `share-capacity-check.mjs` owns that lesson.)
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason it renders a
 * component instead of being three lines of config: a payload lives in the
 * URL fragment, the fragment never reaches the server, and a server redirect
 * would drop the document on the floor. Only a client can carry it across.
 *
 * Its `opengraph-image` sits beside it so a link to this route previews as
 * the flowchart playground, not as the product's landing page.
 */
export default function ViewFlowPage(): React.JSX.Element {
  return <AliasForward to="/live?d=flow" label="the playground" />;
}
