"use client";

/**
 * "Share" for a use-case document — the SAME control the C4 shell, the
 * sequence wrapper and the flowchart wrapper mount
 * (`viewer/share/share-button.tsx`), configured for this document kind,
 * never a copy of it. The sequence pane once grew its own copy-a-link button
 * and drifted immediately; `scripts/share-parity-check.mjs` exists so that
 * never happens again, and this wrapper follows the arrangement it pins:
 * state only what is use-case-specific, pass everything else through.
 *
 * NOTHING MAKES IT A USE-CASE LINK, and nothing needs to. The shared codec
 * compresses arbitrary text and the playground detects the kind from what it
 * decodes, so all four document kinds mint the same URL. That is also why
 * the route is bare `/live` and NOT `/live/uc`: the minted route must be the
 * real page (minting against a trampoline puts a client-side bounce on the
 * most common way anyone arrives — the lesson `share-capacity-check.mjs`
 * encodes), and a share link carries its own document, so it needs no seed —
 * every character the route does not spend goes to the payload competing
 * against the codec's ceiling. `/live/uc` exists for `?d=uc` bookmarks and
 * forwards any fragment across intact.
 *
 * Like a sequence document or a flowchart, a use-case diagram has no
 * sub-diagrams, so the `diagram` props are simply not passed and the panel
 * never mentions them. Expiry/TTL, the length tiers, Web Share, the download
 * fallback and the announcements all apply and all come through.
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server — the copy in the link is the only copy. Expiring
 * links send a SHA-256 digest to the signing endpoint, never the diagram
 * (see `viewer/share/signature.ts`).
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

/** Bare `/live` — the one route share links mint against (see the header). */
const SHARE_ROUTE = "/live";

export function UseCaseShareButton({
  /** The document to pack — the pane's current text, verbatim. */
  text,
  /** Names the Web Share sheet and the downloaded file. */
  title,
  /**
   * The pane's detected format. Only the download fallback cares: a Mermaid
   * pane downloads as `.mmd`, so the file is named for what it contains.
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
      noun="use-case diagram"
      /* Same reason as the other wrappers: this toolbar sits under the
         canvas, so a downward panel would open off the bottom of the pane. */
      panelSide="up"
      downloadExtension={format === "mermaid" ? ".mmd" : ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
