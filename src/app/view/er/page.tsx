import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "ER diagram playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/view" },
  robots: { index: false },
};

/**
 * `/view/er` — a forwarding alias for `/view?d=er`, minted alongside the ER
 * document type so the fifth kind has the same short, memorable door as
 * `/view/seq`, `/view/flow` and `/view/uc` (`check:seo` and
 * `check:share-capacity` both treat it as one of the alias set now).
 *
 * Like `/view/flow` and `/view/uc` it never had a pre-merge life as a real
 * page: it exists for bookmarks and typed URLs, and — like every alias — it
 * must carry a `#m=…` fragment across intact, because share links opened here
 * must keep opening forever. (New ER share links mint against bare `/view`,
 * the same route as the other four kinds: the minted route must be the REAL
 * page, not a trampoline — `share-capacity-check.mjs` owns that lesson.)
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason it renders a
 * component instead of being three lines of config: a payload lives in the
 * URL fragment, the fragment never reaches the server, and a server redirect
 * would drop the document on the floor. Only a client can carry it across.
 */
export default function ViewErPage(): React.JSX.Element {
  return <AliasForward to="/view?d=er" label="the playground" />;
}
