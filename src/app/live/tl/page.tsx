import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Timeline playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/tl` — a forwarding alias for `/live?d=timeline`, the SHORT door,
 * following `/live/seq`, `/live/flow`, `/live/uc`, `/live/er`, `/live/dict`
 * and `/live/gt`. `tl` rather than `timeline`: the short door of every pair
 * here is an abbreviation, never the spelled-out word, and the spelled-out
 * word is already taken by the long door next to it (`/live/timeline`). Two
 * characters, like `uc`, `er` and `gt`.
 *
 * It exists for bookmarks and typed URLs, and — like every alias — it must
 * carry a `#m=…` fragment across intact, because share links opened here must
 * keep opening forever. (New timeline share links mint against bare `/live`,
 * the same route as the other seven kinds: the minted route must be the REAL
 * page, not a trampoline — `share-capacity-check.mjs` owns that lesson.)
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason it renders a
 * component instead of being three lines of config: a payload lives in the
 * URL fragment, the fragment never reaches the server, and a server redirect
 * would drop the document on the floor. Only a client can carry it across.
 */
export default function ViewTlPage(): React.JSX.Element {
  return <AliasForward to="/live?d=timeline" label="the playground" />;
}
