import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Decomposition tree playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/tree` — a forwarding alias for `/live?d=tree`, the LONG door of the
 * pair the tenth document type ships with (`/live/tr` is the short one, spelled
 * the way `/live/sequence` and `/live/seq` are: whichever a reader types from
 * memory arrives at the same pane).
 *
 * Like every alias here it must carry a `#m=…` fragment across intact, because
 * share links opened here must keep opening forever. (New tree share links mint
 * against bare `/live`, the same route as the other nine kinds: the minted
 * route must be the REAL page, not a trampoline — `share-capacity-check.mjs`
 * owns that lesson.)
 *
 * IT CANNOT BE A `redirects()` RULE: a payload lives in the URL fragment, the
 * fragment never reaches the server, and a server redirect would drop the
 * document on the floor. Only a client can carry it across.
 */
export default function ViewTreePage(): React.JSX.Element {
  return <AliasForward to="/live?d=tree" label="the playground" />;
}
