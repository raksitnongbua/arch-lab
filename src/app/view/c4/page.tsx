import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "C4 diagram playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/view/c4` — a forwarding alias for `/live`, kept when the route family
 * was renamed `/live`. Every `/view/c4#m=…` link minted before the rename lands here.
 *
 * The family's reasoning — why this cannot be a `redirects()` rule, why it
 * skips `/live/c4` and lands in one hop, and why it is `noindex` with a
 * canonical on `/live` — is on `../page.tsx`.
 */
export default function LegacyViewC4Page(): React.JSX.Element {
  return <AliasForward to="/live" label="the playground" />;
}
