import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Use-case playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/uc` — a forwarding alias for `/live?d=uc`, minted alongside the
 * use-case document type so the fourth kind has the same short, memorable
 * door as `/live/seq` and `/live/flow` (`check:seo` and
 * `check:share-capacity` both treat it as one of the alias set now).
 *
 * Like `/live/flow` it never had a pre-merge life as a real page: it exists
 * for bookmarks and typed URLs, and — like every alias — it must carry a
 * `#m=…` fragment across intact, because share links opened here must keep
 * opening forever. (New use-case share links mint against bare `/live`, the
 * same route as the other three kinds: the minted route must be the REAL
 * page, not a trampoline — `share-capacity-check.mjs` owns that lesson.)
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason it renders a
 * component instead of being three lines of config: a payload lives in the
 * URL fragment, the fragment never reaches the server, and a server redirect
 * would drop the document on the floor. Only a client can carry it across.
 *
 * Its `opengraph-image` sits beside it so a link to this route previews as
 * the use-case playground, not as the product's landing page.
 */
export default function ViewUseCasePage(): React.JSX.Element {
  return <AliasForward to="/live?d=uc" label="the playground" />;
}
