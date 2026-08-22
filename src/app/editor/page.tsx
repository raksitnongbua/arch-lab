import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "C4 editor — moved to the playground",
  description:
    "The canvas editor is now part of the playground: write .alab text or drag the diagram, in one page. This URL forwards there and carries your document with it.",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/view" },
  robots: { index: false },
};

/**
 * `/editor` — a forwarding alias for `/view`.
 *
 * THIS IS A BREAKING CHANGE and the entry in `CHANGELOG.md` says so: a route
 * links were minted against no longer serves its own page. It is retired
 * rather than kept because there is no longer a second thing for it to be. The
 * playground's C4 canvas is editable in place, so `/editor` and `/view` were
 * two pages for one job, and the one that survives is the one that can also
 * hold the text, every other notation, share links and the JSON twin.
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason it renders a
 * component instead of being three lines of config: `EditModeLink` minted
 * `/editor#m=…` URLs whose whole document lives in the fragment, the fragment
 * never reaches the server, and a server redirect would drop the document on
 * the floor. Only a client can carry it across — the same argument
 * `src/app/view/c4/page.tsx` makes, and `check:share-capacity` treats these
 * routes as a compatibility surface for exactly this reason.
 *
 * It gains an `opengraph-image` it never had, because it is now a URL people
 * SHARE rather than one they only bookmarked: an `/editor#m=…` link posted in
 * a review previewed as the product's landing page, which said nothing about
 * the diagram inside the link.
 */
export default function EditorPage(): React.JSX.Element {
  return <AliasForward to="/view" label="the playground" />;
}
