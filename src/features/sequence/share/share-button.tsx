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
 * WHAT MAKES IT A SEQUENCE LINK is the ROUTE, not the payload: the shared
 * codec compresses arbitrary text, `/view/sequence` hands what it decodes to
 * the sequence parser, `/view/c4` to the C4 one. The
 * playground detects the document kind anyway (a C4 document pasted into the
 * sequence pane is told where to go), so a link that lands on the wrong route
 * explains itself instead of failing.
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

/** Where a sequence share link lands. */
const SHARE_ROUTE = "/view/sequence";

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
      /* This toolbar sits ABOVE the source pane mid-page — opening upward
         would cover the diagram the sharer is looking at. */
      panelSide="down"
      downloadExtension={format === "mermaid" ? ".mmd" : ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
