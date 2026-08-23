import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";
import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgSequenceMini,
} from "@/features/marketing/og/card";

/**
 * The sequence playground's own social card — the one whose absence started
 * this: a shared sequence link previewed as "C4 architecture diagrams", which
 * described the other document kind entirely.
 *
 * It covers `/live/sequence/[exampleId]` too, since a nested route inherits
 * the nearest image. That is the right default: an example IS the sequence
 * playground with a document already in it, and a per-example card would have
 * to render a real diagram at 1200×630 — a different job, and one that cannot
 * work for a share link whose document lives in the URL fragment (the server
 * never sees it, so there is nothing to draw).
 *
 * Frame, palette and Satori rules: `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — the sequence diagram playground`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="SEQUENCE · .alab or Mermaid"
      headline="What happens"
      headlineTail="when …?"
      footer="Click a message · watch its flow draw"
      art={<OgSequenceMini />}
    />,
    size,
  );
}
