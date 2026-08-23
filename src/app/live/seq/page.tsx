import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Sequence diagram playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/seq` — a forwarding alias for `/live?d=seq`.
 *
 * The playground is one route now (the seed is a query param, `?d=`, not a path). This page
 * stays because a share link is a URL SOMEONE ELSE IS HOLDING: every link
 * minted against it before the merge must keep opening, and
 * `check:share-capacity` treats the routes as a compatibility surface.
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason it renders a
 * component instead of being three lines of config: the payload lives in the
 * URL fragment, the fragment never reaches the server, and a server redirect
 * would drop the document on the floor. Only a client can carry it across.
 *
 * Its `opengraph-image` stays beside it too, so a link already in circulation
 * keeps the preview card it was minted with.
 */
export default function ViewSeqPage(): React.JSX.Element {
  return <AliasForward to="/live?d=seq" label="the playground" />;
}
