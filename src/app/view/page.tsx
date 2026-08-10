import type { Metadata } from "next";

import { SHARE_PARAM_MODEL } from "@/features/viewer/share/codec";

import { ViewChooser } from "./view-chooser";

export const metadata: Metadata = {
  title: "View a model — C4 or sequence diagram",
  description:
    "Choose your playground: the two-pane C4 model editor (.alab text and JSON in lossless sync) or the sequence diagram viewer (click-to-focus animation, Mermaid import). Everything runs in your browser.",
  alternates: { canonical: "/view" },
};

/**
 * `/view` — the chooser between the C4 playground (`/view/c4`) and the
 * sequence playground (`/view/sequence`).
 *
 * This page USED to be the C4 playground itself, and share links minted then
 * still point here (`/view#m=…`). The fragment is invisible to the server,
 * so the client component below detects a payload and forwards to
 * `/view/c4` with the fragment intact — see `view-chooser.tsx` for the
 * mechanics and the mounted-guard that stops the chooser flashing first.
 *
 * ROUTE PRECEDENCE, asserted where it matters: `c4` and `sequence` are
 * static sibling segments of `[modelId]`, and Next.js resolves static
 * segments FIRST — so those two words are now reserved model ids.
 * `[modelId]/page.tsx`'s generateStaticParams throws at build time if the
 * registry ever claims one.
 */
export default function ViewPage(): React.JSX.Element {
  return (
    <>
      <ShareForwardFlag />
      <ViewChooser />
    </>
  );
}

/**
 * Hides the chooser before the first paint when the URL carries a share
 * payload, so a share-link user never sees a page they did not ask for.
 *
 * Why an inline script rather than a React guard: the chooser's copy has to be
 * in the SERVER-rendered HTML. `/view` is listed in `sitemap.ts` and is a real
 * landing page, and a route that ships an empty body to a crawler is a route
 * that does not exist as far as search is concerned. But the share payload
 * lives in the URL fragment, which the server never receives — so a React-only
 * solution has to choose between indexable copy and a visible flash.
 *
 * A script in the document body runs during HTML parse, BEFORE first paint, so
 * it can resolve that: the markup is server-rendered (indexable), and the
 * attribute it stamps hides it via CSS in the same frame (no flash). This is
 * the same pre-paint technique a theme toggle uses to avoid a light-mode
 * flash, and it is the only mechanism with access to the fragment that early.
 *
 * Deliberately does NOT redirect — navigation stays React's job, in the
 * chooser's effect. This script's whole responsibility is one attribute, so
 * there is no routing logic living outside the router.
 */
function ShareForwardFlag(): React.JSX.Element {
  // Built from the codec's own constant: the param name is defined once.
  const script =
    `try{var h=location.hash.slice(1);` +
    `if(h&&new URLSearchParams(h).has(${JSON.stringify(SHARE_PARAM_MODEL)}))` +
    `document.documentElement.setAttribute("data-share-forward","")}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
