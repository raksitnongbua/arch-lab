"use client";

/**
 * "Share" for an ER document — the SAME control the C4 shell and the sequence,
 * flowchart and use-case wrappers mount (`viewer/share/share-button.tsx`),
 * configured for this kind, never a copy of it. The sequence pane once grew
 * its own copy-a-link button and drifted immediately;
 * `scripts/share-parity-check.mjs` exists so that never happens again, and
 * this wrapper follows the arrangement it pins: state only what is
 * ER-specific, pass everything else through.
 *
 * NOTHING MAKES IT AN ER LINK, and nothing needs to. The shared codec
 * compresses arbitrary text and the playground detects the kind from what it
 * decodes, so every document kind mints the same URL. That is also why the
 * route is bare `/view` and NOT `/view/er`: the minted route must be the real
 * page — minting against a trampoline puts a client-side bounce on the most
 * common way anyone arrives, the lesson `share-capacity-check.mjs` encodes —
 * and a share link carries its own document, so it needs no seed. Every
 * character the route does not spend goes to the payload. `/view/er` exists
 * for `?d=er` bookmarks and forwards any fragment across intact.
 *
 * An ER diagram has no sub-diagrams, so the `diagram` props are simply not
 * passed and the panel never mentions them.
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server.
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

const SHARE_ROUTE = "/view";

export function ErShareButton({
  text,
  title,
  format,
  onAnnounce,
}: {
  /** The document to pack — the pane's current text, verbatim. */
  text: string;
  /** Names the Web Share sheet and the downloaded file. */
  title: string;
  /** The pane's detected format; only the download fallback cares. */
  format: "alab" | "mermaid" | null;
  onAnnounce: (message: string) => void;
}): React.JSX.Element {
  return (
    <ShareButton
      share={{ kind: "payload", text }}
      documentTitle={title}
      route={SHARE_ROUTE}
      noun="ER diagram"
      /* Opening upward would cover the canvas this toolbar sits above. */
      panelSide="down"
      downloadExtension={format === "mermaid" ? ".mmd" : ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
