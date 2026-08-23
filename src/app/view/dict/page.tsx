import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Data dictionary playground",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/view/dict` — a forwarding alias for `/live?d=dict`, kept when the route family
 * was renamed `/live`. A bookmark and typed-URL door for data dictionaries; nothing was ever minted
 * against it.
 *
 * The family's reasoning — why this cannot be a `redirects()` rule, why it
 * skips `/live/dict` and lands in one hop, and why it is `noindex` with a
 * canonical on `/live` — is on `../page.tsx`.
 */
export default function LegacyViewDictPage(): React.JSX.Element {
  return <AliasForward to="/live?d=dict" label="the playground" />;
}
