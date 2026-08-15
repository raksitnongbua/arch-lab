import type { Metadata } from "next";

import { cookies } from "next/headers";

import { ViewPlayground } from "@/features/playground";
import {
  isCollapsedCookie,
  SOURCE_FOLD_COOKIE,
} from "@/features/playground/lib/source-fold";

export const metadata: Metadata = {
  title: "Write your own C4 model — live editor",
  description:
    "Edit .alab, arch-lab JSON or Mermaid C4 and watch the C4 diagram re-render live. Drill into any box, export as an image. Free, no account, runs in your browser.",
  alternates: { canonical: "/view/c4" },
};

/**
 * `/view/c4` — the merged playground (`features/playground`), seeded with the
 * C4 example. The component is the SAME one `/view` and `/view/sequence`
 * mount; the seed is the routes' only difference, kept so each route's share
 * links, sitemap entry and OG card keep describing what a visitor first sees.
 *
 * Share links land in two ways, both live:
 *   - links are minted against this path (`/view/c4#m=…`) by the C4 shell's
 *     Share panel;
 *   - legacy `/view#m=…` links open in place on `/view` itself now — the
 *     playground reads every payload kind, so nothing forwards here any more.
 *
 * A STATIC segment named `c4` shadows `/view/[modelId]` — Next resolves
 * static segments first — which makes `c4` a reserved model id; the
 * `[modelId]` page asserts that at build time.
 *

 * The rail fold is read from the request cookie and rendered SERVER-SIDE, so
 * the pane is already in the right state in the first byte — see
 * `playground/lib/source-fold.ts` for why the client-only versions of this
 * all flashed. Reading a cookie opts this route out of static rendering,
 * which is the honest price of server-rendering a per-reader preference.
 */
export default async function ViewC4Page(): Promise<React.JSX.Element> {
  const store = await cookies();
  return (
    <ViewPlayground
      seed="c4"
      initialSourceCollapsed={isCollapsedCookie(
        store.get(SOURCE_FOLD_COOKIE)?.value,
      )}
    />
  );
}
