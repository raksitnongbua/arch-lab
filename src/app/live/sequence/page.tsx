import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Sequence diagram playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline itself out of
  // search results entirely.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/sequence` — the LONG alias, forwarding to `/live/seq` with the
 * fragment intact. The two swapped roles: the short route is where share
 * links are minted and therefore where people actually arrive, so it is the
 * real page now and this is the trampoline (the argument is on
 * `../seq/page.tsx`).
 *
 * IT CANNOT BE A `redirects()` RULE, and that is the whole reason this file
 * renders a component instead of being three lines of config: the payload
 * lives in the URL fragment, the fragment never reaches the server, and a
 * server redirect would drop the document on the floor. Only a client can
 * carry it across.
 *
 * WHY THE PAGE STAYS AT ALL: every sequence link minted before the alias
 * existed points here, and a share link is a URL someone else is holding —
 * deleting the route orphans a generation of them. `pnpm check:share-capacity`
 * asserts this file keeps existing for exactly that reason.
 *
 * `/live/sequence/[exampleId]` is unaffected — a nested segment resolves on
 * its own and never touches this page — which is also why the sequence social
 * card is re-exported from here: those example routes inherit the nearest
 * `opengraph-image`, and the card itself now lives beside the real page.
 */
export default function ViewSequencePage(): React.JSX.Element {
  return <AliasForward to="/live?d=seq" label="the playground" />;
}
