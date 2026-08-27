"use client";

/**
 * "Share" for a sequence document — the SAME control the C4 viewer mounts
 * (`viewer/share/share-button.tsx`), configured for this route, not a copy of
 * it. This file used to hold a hand-rolled copy-a-link button, and it drifted
 * from the C4 panel the way every second copy does: no expiry choices, no
 * download fallback for an over-long flow, a different button face. The
 * wrapper now only states what is sequence-specific and passes everything
 * else through; `scripts/share-parity-check.mjs` pins this arrangement.
 *
 * NOTHING MAKES IT A SEQUENCE LINK, and nothing needs to. The shared codec
 * compresses arbitrary text and the playground detects the kind from what it
 * decodes, so both document kinds mint the same URL and there is no wrong
 * route to land on. That is what let the seeded routes collapse into one.
 *
 * The ONE C4 affordance genuinely absent here is the "opens on the diagram
 * you are viewing" pointer — a sequence document has no sub-diagrams to point
 * at, so the `diagram` props are simply not passed and the shared panel never
 * mentions diagrams. Expiry/TTL, the length tiers, Web Share, the download
 * fallback and the announcements all apply and all come through.
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server — the copy in the link is the only copy. Expiring
 * links send a SHA-256 digest to the signing endpoint, never the flow (see
 * `viewer/share/signature.ts`).
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

/**
 * Where a sequence share link lands: the SHORT alias, not the playground's
 * own address. The playground is ONE route now, so a link mints against bare
 * `/live`: the seed that used to be in the path is a query param, and a share
 * link needs no seed at all — it carries its own document, and the reader
 * detects C4 or sequence from the text. Every character the route does not
 * spend goes to the payload, which competes with the codec's ceiling.
 * URL, budgeted against the codec's hard length ceiling. Links minted
 * against the long route before this alias existed still open unchanged.
 */
const SHARE_ROUTE = "/live";

export function SequenceShareButton({
  /** The document to pack — the pane's current text, verbatim. */
  text,
  /** Names the Web Share sheet and the downloaded file. */
  title,
  /**
   * The pane's detected format. Only the download fallback cares: a Mermaid
   * flow downloads as `.mmd`, so the file is named for what it contains.
   */
  format,
  onAnnounce,
}: {
  text: string;
  title: string;
  format: "alab" | "mermaid" | null;
  onAnnounce: (message: string) => void;
}): React.JSX.Element {
  return (
    <ShareButton
      share={{ kind: "payload", text }}
      documentTitle={title}
      route={SHARE_ROUTE}
      noun="flow"
      /* This toolbar sits UNDER the canvas, so a downward panel would open
         off the bottom of the pane. It used to sit above the canvas and open
         downward for the mirror-image reason; the strip moved so the diagram
         gets the top of its pane, and the panel followed it. Same direction
         the C4 exporter has always used from its own footer. */
      panelSide="up"
      downloadExtension={format === "mermaid" ? ".mmd" : ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
