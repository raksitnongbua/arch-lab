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
 * FOUR DOCUMENT KINDS, so the copy names no single one. This card used to read
 * "C4 architecture diagrams that survive code review", which stopped being the
 * whole product the day sequence diagrams shipped: a link to the sequence
 * playground previewed as an advert for the other half. The playground routes
 * now carry their own cards (`view/c4`, `view/seq`, `view/flow`, `view/uc`);
 * this one covers the product, and its illustration is the shared `OgKindMix`
 * for the reason argued there.
 *
 * The frame, the palette and the Satori constraints live in
 * `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — architecture diagrams as plain text`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow=".alab — plain text on disk"
      headline="Architecture diagrams"
      headlineTail="that survive review."
      footer={`${APP_NAME} · C4 · sequence · flowchart · use case`}
      art={<OgKindMix />}
    />,
    size,
  );
}
