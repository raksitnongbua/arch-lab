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
 * IT HAS A MERMAID BRANCH, unlike the gantt's next door, and the asymmetry is
 * the notation rather than an inconsistency: the gantt refuses to emit Mermaid
 * because `at-risk` has no tag there and its critical path is computed, so an
 * emit would downgrade one and misrepresent the other. A timeline says
 * neither — a period is a label and an event is a label, and Mermaid
 * `timeline` holds both — so the conversion runs both ways and the menu offers
 * the row. What the emit drops is metadata around the diagram
 * (`MERMAID_TIMELINE_EXPORT_CAVEAT`), which the menu states at the moment of
 * conversion rather than leaving the reader to find out.
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
