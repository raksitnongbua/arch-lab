"use client";

/**
 * "Share" for a data dictionary — the SAME control every other kind mounts
 * (`viewer/share/share-button.tsx`), configured for this kind, never a copy.
 * See `features/er/share/share-button.tsx` for the full argument; the only
 * thing that differs here is the noun and the extension.
 *
 * NO MERMAID BRANCH, unlike every sibling: Mermaid has no dictionary
 * notation, so the pane has one format and the download fallback always
 * writes `.alab`. A `format` prop would be a parameter with one value.
 */

import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { ShareButton } from "@/features/viewer/share/share-button";

const SHARE_ROUTE = "/live";

export function DictShareButton({
  text,
  title,
  onAnnounce,
}: {
  text: string;
  title: string;
  onAnnounce: (message: string) => void;
}): React.JSX.Element {
  return (
    <ShareButton
      share={{ kind: "payload", text }}
      documentTitle={title}
      route={SHARE_ROUTE}
      noun="data dictionary"
      panelSide="down"
      downloadExtension={ARCHTEXT_EXTENSION}
      onAnnounce={onAnnounce}
    />
  );
}
