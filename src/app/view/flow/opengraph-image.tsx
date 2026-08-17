import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgFlowMini,
} from "@/features/marketing/og/card";

/**
 * The flowchart playground's own social card, created WITH the route rather
 * than after the first mis-preview — the sequence card's absence is the bug
 * this convention exists to prevent (a shared link previewing as "C4
 * architecture diagrams", the wrong document kind entirely).
 *
 * Frame, palette and Satori rules: `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — the flowchart playground`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="FLOWCHART · .alab or Mermaid"
      headline="What runs"
      headlineTail="in what order?"
      footer="Decisions, loops and lanes · laid out for you"
      art={<OgFlowMini />}
    />,
    size,
  );
}
