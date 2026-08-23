import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ViewPlayground } from "@/features/playground";
import {
  isCollapsedCookie,
  SOURCE_FOLD_COOKIE,
} from "@/features/playground/lib/source-fold";
import { CANVAS_EDITABLE_SUMMARY } from "@/features/playground/input/canvas-edit";
import {
  CANVAS_LOCK_COOKIE,
  isLockedCookie,
} from "@/features/playground/lib/canvas-lock";
import {
  exampleTextFor,
  VIEW_EXAMPLE_PARAM,
} from "@/features/playground/lib/example-param";
import { seedFromParam, VIEW_SEED_PARAM } from "@/features/playground/lib/seed";

export const metadata: Metadata = {
  /* THE TITLE NAMES BOTH WAYS IN, because this is the page they are both on and
     it said neither. "write it, see it rendered live" described a viewer, and a
     reader deciding whether to click had no way to learn from a result that the
     canvas answers a drag at all. 54 characters against the ~60 a result
     shows. */
  title: "Diagram playground — write the text or edit the canvas",
  /* DERIVED TAIL. `CANVAS_EDITABLE_SUMMARY` is built from the capability grid,
     so the two notations named here are the two the page actually lets you
     edit — a hand-typed "C4 and sequence" is the shape that went stale five
     times on this branch. The head keeps all six notation names because this is
     the route that ranks for them; "arch-lab JSON" lost its qualifier and
     "detected automatically" went, to buy the tail its 53 characters inside the
     160. Measured at 152. */
  description: `C4, sequence, flowchart, use case, ER or data dictionary in .alab, JSON or Mermaid, rendered live. ${CANVAS_EDITABLE_SUMMARY}`,
  // Self-canonical now. `/live/c4` and `/live/seq` used to be the real pages
  // and this one canonicalised INTO them; they are forwarding aliases now, so
  // the arrow points the other way and only one URL claims the content.
  alternates: { canonical: "/live" },
};

/**
 * `/live` — THE playground, and now the only one.
 *
 * THIS FAMILY WAS CALLED `/view`, and the rename is recorded here because it
 * is the one fact the rest of the comments in it assume. The page had not only
 * viewed for two releases — the C4 and sequence canvases answer a drag and
 * rewrite the source text under you — so a path promising a viewer taught a
 * reader the one thing about it that was no longer true. Every retired path
 * still answers: they live in `src/app/view/*` as client trampolines, because
 * a share link's document travels in the fragment and only a client can carry
 * that across (`src/app/view/page.tsx` has the full argument).
 *
 * A CONVENTION THAT FOLLOWS FROM THAT: comments in this family name routes by
 * their CURRENT path, including when they describe a decision taken under the
 * old one — "`/live/seq` used to be the alias" means the route now served at
 * `/live/seq`. Rewriting each history sentence to say which name it held at
 * the time would put the rename in thirty places and make thirty chances for
 * one of them to go stale, which is the failure this note replaces.
 *
 * It was three routes: `/live`, `/live/c4` and `/live/seq` mounted the same
 * component with a different seed, which is duplication by any reading — the
 * sitemap comment had already noticed, excluding `/live` because it "renders
 * the same page as `/live/c4`". The seed is a QUERY PARAM here, because that
 * is what it always was: a choice of starting text, not a different page.
 *
 * WHY THE SEED DOES NOT NEED TO BE IN THE PATH AT ALL. It only applies when
 * no share payload does — a link carrying `#m=…` supplies its own document,
 * and the reader detects C4 or sequence from the text itself. So a share link
 * needs no kind anywhere in its URL, which is why minting moved to bare
 * `/live`: five characters shorter than `/live/seq`, and every one of them
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
      /* Read on the SERVER for the same reason as the fold: a lock applied
         after paint would let one frame of an editable canvas through, which
         is one frame in which a drag lands. */
      initialCanvasLocked={isLockedCookie(store.get(CANVAS_LOCK_COOKIE)?.value)}
    />
  );
}
