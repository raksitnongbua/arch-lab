import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";

export const metadata: Metadata = {
  title: "Diagram playground — moved to /live",
  description:
    "The playground moved to /live: write .alab text or edit the canvas, in one page. This URL forwards there and carries your document with it.",
  // An alias must not compete with the page it forwards to: canonical names
  // the real playground, and noindex keeps the trampoline out of results.
  alternates: { canonical: "/live" },
  robots: { index: false },
};

/**
 * `/view` — a forwarding alias for `/live`, and the head of the whole
 * `/view/*` family of them.
 *
 * WHY THE FAMILY EXISTS. This route family was called `/view` until the page
 * stopped being a viewer: the C4 and sequence canvases answer a drag and
 * rewrite the text under you, so a URL promising a view described the one
 * thing about the page that was no longer true. Renaming it is cheap; the
 * links are not. Every `/view#m=…` a reader has in a bookmark, a Slack
 * message or a pull request must keep opening, so each old path stays as a
 * trampoline to its `/live` equivalent.
 *
 * IT CANNOT BE A `redirects()` RULE, which is the whole reason this family
 * renders components instead of being nine lines of config: a share link's
 * whole document travels in the URL FRAGMENT, the fragment never reaches the
 * server, and a server redirect would hand `/live` a bare URL. Only a client
 * can carry it across — the same argument `/editor` and the `/live` aliases
 * make, and `check:share-capacity` treats all of them as one compatibility
 * surface.
 *
 * ONE HOP, NOT TWO. Each `/view/x` forwards to wherever `/live/x` forwards to
 * — `/view/seq` goes straight to `/live?d=seq`, not to `/live/seq` — because
 * bouncing a reader through two trampolines doubles the time the holding line
 * is on screen and doubles the chances of losing the fragment on the way.
 *
 * `noindex` PLUS a canonical on `/live` is the pair that consolidates search
 * on the new name without a 308: the canonical tells a crawler which URL owns
 * the content, and `noindex` keeps the trampoline itself from competing with
 * it. `check:seo` asserts both, per alias, derived from the filesystem.
 *
 * It keeps an `opengraph-image` (a re-export of `/live`'s, one card at two
 * mounting points) because a `/view#m=…` link is a URL people SHARE: without
 * one, Next serves the root card and a shared diagram previews as the
 * product's landing page — the exact bug `/editor` shipped once.
 */
export default function LegacyViewPage(): React.JSX.Element {
  return <AliasForward to="/live" label="the playground" />;
}
