import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";
import {
  OG,
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgConnector,
  OgMessage,
  OgNode,
} from "@/features/marketing/og/card";

/**
 * The site-wide social card, generated at deploy time from JSX instead of
 * committed as a binary — there is no design tool in this repo's loop, so a
 * checked-in PNG would drift the first time the brand moved. Living beside the
 * root layout, it covers every route that does not ship its own image.
 *
 * TWO DOCUMENT KINDS, so the copy names neither. This card used to read "C4
 * architecture diagrams that survive code review", which stopped being the
 * whole product the day sequence diagrams shipped: a link to the sequence
 * playground previewed as an advert for the other half. The playground routes
 * now carry their own cards (`view/c4/opengraph-image.tsx`,
 * `view/sequence/opengraph-image.tsx`); this one covers the product.
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
      art={
        /* One node from each kind's illustration, stacked: the card has to
             say "more than one document kind" without becoming a collage, so it
             shows a C4 container over a message exchange rather than four full
             miniatures competing for the same 400px. The FOOTER names all four
             instead — a strip of text scales to a fourth entry where artwork
             does not, and at OG size a fourth miniature would be unreadable
             anyway. */
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <OgNode name="Web App" tech="Next.js · SSR" />
            <OgConnector height={24} />
            <OgNode name="Orders DB" tech="PostgreSQL" />
          </div>

          {/* A two-message exchange — the sequence half, at a glance. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <OgMessage label="Place the order" colour={OG.lanes[2]} />
            <OgMessage label="charge.succeeded" colour={OG.lanes[0]} />
          </div>
        </div>
      }
    />,
    size,
  );
}
