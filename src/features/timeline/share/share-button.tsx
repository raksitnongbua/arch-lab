"use client";

/**
 * "Share" for a timeline — the SAME control every other kind mounts
 * (`viewer/share/share-button.tsx`), configured for this kind, never a copy of
 * it. The sequence pane once grew its own copy-a-link button and drifted
 * immediately; `scripts/share-parity-check.mjs` exists so that never happens
 * again, and this wrapper follows the arrangement it pins: state only what is
 * timeline-specific, pass everything else through.
 *
 * THE ROUTE IS BARE `/live`, NOT `/live/timeline`: the minted route must be the
 * real page — minting against a trampoline puts a client-side bounce on the
 * most common way anyone arrives, the lesson `share-capacity-check.mjs`
 * encodes — and a share link carries its own document, so it needs no seed.
 * Every character the route does not spend goes to the payload.
 *
 * IT TAKES NO `format`, unlike the ER and gantt wrappers next door, and that
 * is the one thing to know before copying this file for a new kind. Those two
 * pass one so the DOWNLOAD FALLBACK can name the file for the dialect the
 * pane actually holds (`.mmd` rather than `.alab`); this wrapper does not,
 * which means a timeline pane holding Mermaid downloads under the `.alab`
 * name. That is a gap rather than a decision — it predates the gantt gaining
 * its emitter — and closing it is one prop.
 *
 * The Mermaid CONVERSION itself is the pane's format toggle, not a row in
 * this menu; no kind here offers one, so a reader looking for "Copy as
 * Mermaid" is looking for the toggle. What the emit drops is metadata around
 * the diagram (`MERMAID_TIMELINE_EXPORT_CAVEAT`).
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server.
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

const SHARE_ROUTE = "/live";

export function TimelineShareButton({
  text,
  title,
  onAnnounce,
}: {
  /** The document to pack — the pane's current text, verbatim. */
  text: string;
  /** Names the Web Share sheet and the downloaded file. */
  title: string;
  onAnnounce: (message: string) => void;
}): React.JSX.Element {
  return (
    <ShareButton
      share={{ kind: "payload", text }}
      documentTitle={title}
      route={SHARE_ROUTE}
      noun="timeline"
      /* Opening downward would leave the pane this toolbar sits under. */
      panelSide="up"
      downloadExtension={ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
