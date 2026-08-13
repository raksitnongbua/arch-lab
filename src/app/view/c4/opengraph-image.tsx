import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgC4Stack,
  OgCard,
} from "@/features/marketing/og/card";

/**
 * The C4 playground's own social card. A route with its own image wins over
 * the root one by file convention, which is the whole point: a link to this
 * route should preview as the C4 editor, not as the product's landing page.
 *
 * Frame, palette and Satori rules: `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — the C4 model playground`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="C4 MODEL · .alab and JSON"
      headline="What is this system"
      headlineTail="made of?"
      footer="Two panes in lossless sync · drill-down"
      art={<OgC4Stack />}
    />,
    size,
  );
}
