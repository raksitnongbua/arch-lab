import { ImageResponse } from "next/og";

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgC4Stack,
  OgCard,
} from "@/features/marketing/og/card";
import { APP_NAME } from "@/lib/constants";

/**
 * The playground's social card — and now the card EVERY share link previews
 * with, because every link mints against this route.
 *
 * THAT IS A REAL LOSS, recorded rather than glossed. `/view/c4` and
 * `/view/seq` each had a card naming their document kind, and a sequence link
 * used to preview as a sequence diagram. One route can carry one image, so
 * this card has to speak for both kinds: it says what the page IS — paste a
 * diagram, see it rendered — rather than which kind you are about to open.
 *
 * The two seeded cards stay beside their aliases, so links minted before the
 * merge keep the preview they were made with. If per-kind previews matter more
 * than one URL later, the way back is to mint against the aliases again — not
 * to add a query param, which no crawler will vary an image on.
 *
 * Frame, palette and Satori rules: `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — the diagram playground`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="C4 · SEQUENCE · .alab, JSON and Mermaid"
      headline="Write the diagram"
      headlineTail="as text."
      footer="Detected as you type · nothing leaves the browser"
      art={<OgC4Stack />}
    />,
    size,
  );
}
