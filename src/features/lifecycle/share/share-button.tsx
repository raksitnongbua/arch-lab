"use client";

/**
 * "Share" for a lifecycle — the SAME control every other kind mounts
 * (`viewer/share/share-button.tsx`), configured for this kind, never a copy of
 * it. The sequence pane once grew its own copy-a-link button and drifted
 * immediately; `scripts/share-parity-check.mjs` exists so that never happens
 * again, and this wrapper follows the arrangement it pins: state only what is
 * lifecycle-specific, pass everything else through.
 *
 * THE ROUTE IS BARE `/live`, NOT `/live/lifecycle`: the minted route must be
 * the real page — minting against a trampoline puts a client-side bounce on
 * the most common way anyone arrives, the lesson `share-capacity-check.mjs`
 * encodes — and a share link carries its own document, so it needs no seed.
 * Every character the route does not spend goes to the payload.
 *
 * IT HAS NO MERMAID BRANCH, like the gantt's and the dictionary's, and the
 * reason is the notation rather than an omission: Mermaid has no lifecycle.
 * `stateDiagram-v2` is a state machine — every transition that could happen —
 * so emitting one would turn an ordered history into a graph of
 * possibilities, which is the opposite claim. `input/parse.ts` argues it in
 * full.
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server.
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

const SHARE_ROUTE = "/live";

export function LifecycleShareButton({
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
      noun="lifecycle"
      /* Opening downward would leave the pane this toolbar sits under. */
      panelSide="up"
      downloadExtension={ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
