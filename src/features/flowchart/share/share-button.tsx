"use client";

/**
 * "Share" for a flowchart document — the SAME control the C4 shell and the
 * sequence wrapper mount (`viewer/share/share-button.tsx`), configured for
 * this document kind, never a copy of it. The sequence pane once grew its
 * own copy-a-link button and drifted immediately (no expiry, no download
 * fallback, a different face); `scripts/share-parity-check.mjs` exists so
 * that never happens again, and this wrapper follows the arrangement it
 * pins: state only what is flowchart-specific, pass everything else through.
 *
 * NOTHING MAKES IT A FLOWCHART LINK, and nothing needs to. The shared codec
 * compresses arbitrary text and the playground detects the kind from what it
 * decodes, so all three document kinds mint the same URL. That is also why
 * the route is bare `/view` and NOT `/view/flow`: the minted route must be
 * the real page (minting against a trampoline puts a client-side bounce on
 * the most common way anyone arrives — the lesson `share-capacity-check.mjs`
 * encodes), and a share link carries its own document, so it needs no seed —
 * every character the route does not spend goes to the payload competing
 * against the codec's ceiling. `/view/flow` exists for `?d=flow` bookmarks
 * and forwards any fragment across intact.
 *
 * Like a sequence document, a flowchart has no sub-diagrams, so the
 * `diagram` props are simply not passed and the panel never mentions them.
 * Expiry/TTL, the length tiers, Web Share, the download fallback and the
 * announcements all apply and all come through.
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server — the copy in the link is the only copy. Expiring
 * links send a SHA-256 digest to the signing endpoint, never the chart (see
 * `viewer/share/signature.ts`).
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

/** Bare `/view` — the one route share links mint against (see the header). */
const SHARE_ROUTE = "/view";

export function FlowchartShareButton({
  /** The document to pack — the pane's current text, verbatim. */
  text,
  /** Names the Web Share sheet and the downloaded file. */
  title,
  /**
   * The pane's detected format. Only the download fallback cares: a Mermaid
   * chart downloads as `.mmd`, so the file is named for what it contains.
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
      noun="flowchart"
      /* Same reason as the sequence wrapper: this toolbar sits above the
         canvas mid-page — opening upward would cover the chart. */
      panelSide="down"
      downloadExtension={format === "mermaid" ? ".mmd" : ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
