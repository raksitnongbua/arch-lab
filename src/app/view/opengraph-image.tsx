import { ImageResponse } from "next/og";

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgKindMix,
} from "@/features/marketing/og/card";
import { APP_NAME } from "@/lib/constants";

/**
 * The playground's social card — and now the card EVERY share link previews
 * with, because every link mints against this route.
 *
 * THAT IS A REAL LOSS, recorded rather than glossed. `/view/c4` and
 * `/view/seq` each had a card naming their document kind, and a sequence link
 * used to preview as a sequence diagram. One route can carry one image, so
 * this card has to speak for every kind: it says what the page IS — paste a
 * diagram, see it rendered — rather than which kind you are about to open.
 *
 * The two seeded cards stay beside their aliases, so links minted before the
 * merge keep the preview they were made with. If per-kind previews matter more
 * than one URL later, the way back is to mint against the aliases again — not
 * to add a query param, which no crawler will vary an image on.
 *
 * WHAT THAT LOSS COST, AND THE HALF OF IT THAT WAS FIXABLE. The copy admitted
 * the card cannot know the kind; the ARTWORK did not — it drew a three-node C4
 * stack, and the eyebrow named two kinds of four. So a shared flowchart or
 * use-case diagram previewed as an advert for C4, which is precisely the bug
 * the per-kind cards were built to end, arriving back through the one route
 * that inherited all of them. It now draws `OgKindMix`: "more than one kind of
 * diagram lives here" is a claim one image CAN make truthfully, where "this is
 * a C4 model" cannot.
 *
 * THE EYEBROW STOPPED LISTING KINDS, for the reason argued at length on the
 * root card: it read "C4 · SEQUENCE · FLOWCHART · USE CASE" long after ER and
 * the data dictionary shipped, and six names do not fit an eyebrow. It names the
 * two ways IN instead, which is what this page of all pages is for — the
 * headline below already says "as text" and said nothing at all about the
 * canvas, on the one route where a canvas gesture is available.
 *
 * Frame, palette and Satori rules: `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — the diagram playground`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="SIX NOTATIONS · TEXT OR CANVAS"
      headline="Write the diagram"
      headlineTail="as text."
      footer=".alab, JSON or Mermaid · never uploaded"
      art={<OgKindMix />}
    />,
    size,
  );
}
