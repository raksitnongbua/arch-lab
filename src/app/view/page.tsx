import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ViewPlayground } from "@/features/playground";
import {
  isCollapsedCookie,
  SOURCE_FOLD_COOKIE,
} from "@/features/playground/lib/source-fold";
import {
  exampleTextFor,
  VIEW_EXAMPLE_PARAM,
} from "@/features/playground/lib/example-param";
import { seedFromParam, VIEW_SEED_PARAM } from "@/features/playground/lib/seed";

export const metadata: Metadata = {
  title: "Diagram playground — write it, see it rendered live",
  description:
    "Write .alab, arch-lab JSON or Mermaid — C4, sequence, flowchart, use case or ER; the format is detected and the diagram renders live. Runs in your browser.",
  // Self-canonical now. `/view/c4` and `/view/seq` used to be the real pages
  // and this one canonicalised INTO them; they are forwarding aliases now, so
  // the arrow points the other way and only one URL claims the content.
  alternates: { canonical: "/view" },
};

/**
 * `/view` — THE playground, and now the only one.
 *
 * It was three routes: `/view`, `/view/c4` and `/view/seq` mounted the same
 * component with a different seed, which is duplication by any reading — the
 * sitemap comment had already noticed, excluding `/view` because it "renders
 * the same page as `/view/c4`". The seed is a QUERY PARAM here, because that
 * is what it always was: a choice of starting text, not a different page.
 *
 * WHY THE SEED DOES NOT NEED TO BE IN THE PATH AT ALL. It only applies when
 * no share payload does — a link carrying `#m=…` supplies its own document,
 * and the reader detects C4 or sequence from the text itself. So a share link
 * needs no kind anywhere in its URL, which is why minting moved to bare
 * `/view`: five characters shorter than `/view/seq`, and every one of them
 * goes to the payload competing against `MAX_SHARE_URL_LENGTH`.
 *
 * The old routes stay as forwarding aliases. A share link is a bookmark
 * someone else is holding, and `check:share-capacity` treats the routes as a
 * compatibility surface for exactly that reason.
 *
 * Reading `searchParams` opts this route out of static rendering, which the
 * source-fold cookie already did.
 */
export default async function ViewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const [store, params] = await Promise.all([cookies(), searchParams]);
  /* `?e=` names a bundled example and wins over `?d=`, which only chooses
     which built-in seed to fall back to — an example already implies its
     kind. A share payload beats both: the playground reads `#m=` on mount and
     replaces whatever was seeded, because a link carries its own document. */
  const example = exampleTextFor(params[VIEW_EXAMPLE_PARAM]);
  return (
    <ViewPlayground
      seed={seedFromParam(params[VIEW_SEED_PARAM])}
      initialText={example ?? undefined}
      initialSourceCollapsed={isCollapsedCookie(
        store.get(SOURCE_FOLD_COOKIE)?.value,
      )}
    />
  );
}
