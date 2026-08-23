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
 * `/view/flow` — a forwarding alias for `/live?d=flow`, kept when the route family
 * was renamed `/live`. A bookmark and typed-URL door for flowcharts; nothing was ever minted
 * against it.
 *
 * The family's reasoning — why this cannot be a `redirects()` rule, why it
 * skips `/live/flow` and lands in one hop, and why it is `noindex` with a
 * canonical on `/live` — is on `../page.tsx`.
 */
export default function LegacyViewFlowPage(): React.JSX.Element {
  return <AliasForward to="/live?d=flow" label="the playground" />;
}
