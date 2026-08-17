import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgUseCaseMini,
} from "@/features/marketing/og/card";

/**
 * The use-case playground's own social card, created WITH the route rather
 * than after the first mis-preview — the sequence card's absence is the bug
 * this convention exists to prevent (a shared link previewing as "C4
 * architecture diagrams", the wrong document kind entirely).
 *
 * Frame, palette and Satori rules: `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — the use-case playground`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="USE CASE · .alab or Mermaid"
      headline="Who can do"
      headlineTail="what, exactly?"
      footer="Actors, boundaries and «include» · laid out for you"
      art={<OgUseCaseMini />}
    />,
    size,
  );
}
