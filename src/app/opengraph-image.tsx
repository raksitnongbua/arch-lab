import { ImageResponse } from "next/og";

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgKindMix,
} from "@/features/marketing/og/card";
import { APP_NAME } from "@/lib/constants";

/**
 * The site-wide social card, generated at deploy time from JSX instead of
 * committed as a binary — there is no design tool in this repo's loop, so a
 * checked-in PNG would drift the first time the brand moved. Living beside the
 * root layout, it covers every route that does not ship its own image.
 *
 * SIX DOCUMENT KINDS, so the copy names no single one. This card used to read
 * "C4 architecture diagrams that survive code review", which stopped being the
 * whole product the day sequence diagrams shipped: a link to the sequence
 * playground previewed as an advert for the other half. The playground routes
 * now carry their own cards (`view/c4`, `view/seq`, `view/flow`, `view/uc`);
 * this one covers the product, and its illustration is the shared `OgKindMix`
 * for the reason argued there.
 *
 * THE FOOTER NAMES THE CAPABILITY, NOT FOUR OF THE SIX KINDS. It used to read
 * "C4 · sequence · flowchart · use case", which was a list two notations out of
 * date and could not be completed: six names at 28px overflow the 620px copy
 * column, and a card is not a place a list can grow. What replaced it is the
 * thing that IS true of the whole product and was said on no budgeted surface —
 * that a diagram here is written as text and two of the six canvases answer a
 * gesture. Naming the kinds bought nothing for search besides: this is a PNG,
 * so no crawler reads a word of it, and the notations are named in the page copy
 * and the structured data where a crawler does.
 *
 * THE HEADLINE IS THE HOME PAGE'S H1, deliberately the same sentence. It used
 * to read "that survive review", which is the line the H1 dropped for being
 * written at someone who already believed in diagrams-as-text — a newcomer's
 * question is "why not draw.io", and the answer is that this one is meant to be
 * PRESENTED (`.claude/rules/purpose.md`). A social card is the first surface a
 * stranger meets, so it is the last place that argument should be the old one.
 *
 * WHAT IT DELIBERATELY DOES NOT SAY is which notations, or that a sequence drag
 * is a REORDER rather than a position. That distinction needs a sentence
 * (`CANVAS_EDITING_PASSAGE`) and this frame has room for a phrase, so promising
 * it here would over-claim for the four notations that answer no gesture. The
 * card gets a reader to the page; the page draws the distinction.
 *
 * The frame, the palette and the Satori constraints live in
 * `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — architecture diagrams you can present`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow=".alab — plain text on disk"
      headline="Architecture diagrams"
      headlineTail="you can present."
      footer={`${APP_NAME} · six notations · text or canvas`}
      art={<OgKindMix />}
    />,
    size,
  );
}
