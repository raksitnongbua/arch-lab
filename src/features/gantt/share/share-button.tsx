"use client";

/**
 * "Share" for a gantt — the SAME control every other kind mounts
 * (`viewer/share/share-button.tsx`), configured for this kind, never a copy of
 * it. The sequence pane once grew its own copy-a-link button and drifted
 * immediately; `scripts/share-parity-check.mjs` exists so that never happens
 * again, and this wrapper follows the arrangement it pins: state only what is
 * gantt-specific, pass everything else through. See
 * `features/er/share/share-button.tsx` for the full argument.
 *
 * THE ROUTE IS BARE `/live`, NOT `/live/gantt`: the minted route must be the
 * real page — minting against a trampoline puts a client-side bounce on the
 * most common way anyone arrives, the lesson `share-capacity-check.mjs`
 * encodes — and a share link carries its own document, so it needs no seed.
 * Every character the route does not spend goes to the payload.
 *
 * NO MERMAID BRANCH, and NOT because Mermaid lacks the notation — it has
 * `gantt`. The converter is deliberately IMPORT-ONLY: a gantt's `at-risk`
 * state has no Mermaid spelling and would silently emit as `active`, and its
 * critical path is COMPUTED here while Mermaid's `crit` is a decoration the
 * author types, so an emitted chain could contradict the arithmetic that drew
 * the one on screen. Reading a `gantt` in loses nothing; writing one out loses
 * two things and tells nobody. So the menu offers no Mermaid row, the download
 * fallback always writes `.alab`, and there is no `format` prop to pass.
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server.
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

const SHARE_ROUTE = "/live";

export function GanttShareButton({
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
      noun="gantt"
      /* Opening downward would leave the pane this toolbar sits under. */
      panelSide="up"
      downloadExtension={ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
