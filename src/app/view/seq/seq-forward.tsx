"use client";

/**
 * `/view/seq` — the SHORT alias the sequence share codepaths mint against,
 * forwarding to `/view/sequence` with the fragment intact.
 *
 * Why the alias exists at all: a share link's whole document travels in the
 * URL fragment, so every character the prefix spends is a character the
 * payload cannot — and the payload competes against the codec's
 * `MAX_SHARE_URL_LENGTH` ceiling, not against infinity. `/view/seq` is five
 * characters shorter than `/view/sequence`; measured against deflate-raw's
 * observed ~0.5–0.7 payload-per-text ratio, that buys roughly 7–10 more
 * characters of document in every minted link. Small, but free.
 *
 * Why a FORWARD rather than a second mount of the playground: the fragment
 * never reaches the server, so only the client can carry it across; and
 * mounting the playground twice would create a duplicate page whose internal
 * links, canonical URL and decode behaviour would have to be kept in sync
 * forever. One page owns the playground; this one only knows the way there.
 * The same pattern already carries legacy `/view#m=…` links to `/view/c4`
 * (see `../view-chooser.tsx`).
 *
 * `router.replace`, not push: nobody ever meant to visit this route, so Back
 * must return to wherever the link was opened from, not to the trampoline.
 *
 * Unlike the chooser there is no server-rendered content to hide while
 * forwarding — this page IS the forward — so none of the chooser's pre-paint
 * `data-share-forward` machinery is needed here.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SeqForward(): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    // The fragment rides along verbatim — `router.replace` keeps it as part
    // of the href, and the playground reads it off `location.hash` on mount.
    // Forwarding unconditionally (payload or not) keeps the alias honest:
    // `/view/seq` always means `/view/sequence`, never a fourth destination.
    router.replace(`/view/sequence${window.location.hash}`);
  }, [router]);

  return (
    // Screen-reader users hear where they are headed instead of a blank page;
    // sighted users see it only if the replace is slow enough to notice.
    <p role="status" className="px-5 py-10 text-sm text-muted-foreground">
      Opening the sequence playground…
    </p>
  );
}
