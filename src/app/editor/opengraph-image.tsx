import { ImageResponse } from "next/og";

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgC4Stack,
  OgCard,
} from "@/features/marketing/og/card";
import { APP_NAME } from "@/lib/constants";

/**
 * `/editor`'s social card — new, for a route that is now an alias.
 *
 * IT NEVER HAD ONE, and that was a shipped defect rather than an omission with
 * a reason: `EditModeLink` minted `/editor#m=…` links carrying a whole model in
 * the fragment, and those links are pasted into reviews and chat. With no card
 * of its own the route fell back to the root image, so a link to somebody's
 * architecture diagram previewed as the product's landing page — the same bug
 * `src/app/view/opengraph-image.tsx` records for the merged playground.
 *
 * ADDED WHILE THE ROUTE IS BEING RETIRED, which is not a contradiction: a
 * forwarding alias is exactly when the card matters most. The URL keeps
 * circulating long after the page stops being a destination, and the reader
 * seeing the preview has no way to know the route moved.
 *
 * The C4 stack, not `OgKindMix`: every link minted against this route came from
 * the C4 viewer's edit link, so this card can honestly say which kind is
 * inside it where `/view`'s cannot.
 *
 * Frame, palette and Satori rules: `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — edit a C4 model in the playground`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="C4 MODEL · NOW IN THE PLAYGROUND"
      headline="Write it as text,"
      headlineTail="or drag it."
      footer="One page · never uploaded"
      art={<OgC4Stack />}
    />,
    size,
  );
}
