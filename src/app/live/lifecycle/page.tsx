import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Lifecycle playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/lifecycle` — a forwarding alias for `/live?d=lifecycle`, the LONG
 * door of the pair the ninth document type ships with (`/live/lc` is the short
 * one, and the two are spelled the way `/live/sequence` and `/live/seq` are:
 * whichever a reader types from memory arrives at the same pane).
 *
 * Like every alias here it must carry a `#m=…` fragment across intact, because
 * share links opened here must keep opening forever. (New lifecycle share
 * links mint against bare `/live`, the same route as the other eight kinds:
 * the minted route must be the REAL page, not a trampoline —
 * `share-capacity-check.mjs` owns that lesson.)
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason it renders a
 * component instead of being three lines of config: a payload lives in the
 * URL fragment, the fragment never reaches the server, and a server redirect
 * would drop the document on the floor. Only a client can carry it across.
 *
 * `/live/lifecycle/[exampleId]` is unaffected — a nested segment resolves on
 * its own and never touches this page.
 */
export default function ViewLifecyclePage(): React.JSX.Element {
  return <AliasForward to="/live?d=lifecycle" label="the playground" />;
}
