import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Tree playground",
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/live/tr` — the SHORT door to `/live?d=tree`, beside the long `/live/tree`.
 * See that file for why an alias renders a component rather than being a
 * `redirects()` rule: the document rides in the URL fragment, which never
 * reaches the server.
 */
export default function ViewTreeShortPage(): React.JSX.Element {
  return <AliasForward to="/live?d=tree" label="the playground" />;
}
