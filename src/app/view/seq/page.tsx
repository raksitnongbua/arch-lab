import type { Metadata } from "next";

import { SeqForward } from "./seq-forward";

export const metadata: Metadata = {
  title: "Sequence diagram playground",
  // A forwarding alias must not compete with the page it forwards to:
  // canonical names the real playground, and noindex keeps the trampoline
  // itself out of search results entirely.
  alternates: { canonical: "/view/sequence" },
  robots: { index: false },
};

/**
 * `/view/seq` — the short route sequence SHARE LINKS are minted against
 * (see `features/sequence/share/share-button.tsx` and the MCP
 * `create_share_link`), existing purely to spend fewer URL characters on the
 * route so more remain for the payload. It renders nothing but a client
 * forward to `/view/sequence`, fragment intact — the reasoning lives on
 * `SeqForward`.
 *
 * Like `c4` and `sequence`, `seq` is a STATIC segment shadowing
 * `/view/[modelId]`, so it is a reserved model id — asserted at build time in
 * the `[modelId]` page. Links minted against the LONG route before this alias
 * existed keep working unchanged: `/view/sequence` is still the real page.
 */
export default function ViewSeqPage(): React.JSX.Element {
  return <SeqForward />;
}
