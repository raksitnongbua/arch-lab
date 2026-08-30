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
 * IT TAKES A `format`, as the ER and sequence wrappers do, and the reason is
 * the download fallback rather than the link: a share link carries the pane's
 * text verbatim in either dialect, but the file handed out when Web Share is
 * unavailable must be NAMED for what it actually contains. A pane holding
 * Mermaid `gantt` downloads as `.mmd`.
 *
 * The Mermaid CONVERSION lives on the pane's format toggle, not in this menu —
 * the arrangement every kind here uses, and the reason there is no "Copy as
 * Mermaid" row to look for. What the toggle refuses, and the only document of
 * this kind it does refuse, is a plan with no `starts` line: Mermaid `gantt`
 * has no relative axis, so there is no date to write and none is invented
 * (`MERMAID_GANTT_ORIGIN_REFUSAL`).
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
      noun="gantt"
      /* Opening downward would leave the pane this toolbar sits under. */
      panelSide="up"
      downloadExtension={format === "mermaid" ? ".mmd" : ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
