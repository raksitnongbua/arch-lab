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
 * `/view/sequence` — a forwarding alias for `/live?d=seq`, kept when the route family
 * was renamed `/live`. The oldest sequence links of all point here — this was the real page before
 * `/view/seq` was, and an alias ever since.
 *
 * The family's reasoning — why this cannot be a `redirects()` rule, why it
 * skips `/live/sequence` and lands in one hop, and why it is `noindex` with a
 * canonical on `/live` — is on `../page.tsx`.
 */
export default function LegacyViewSequencePage(): React.JSX.Element {
  return <AliasForward to="/live?d=seq" label="the playground" />;
}
