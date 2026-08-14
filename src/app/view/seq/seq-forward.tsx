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
 * mounting a fourth copy of the playground would create a duplicate page
 * whose canonical URL and metadata would have to be kept in sync forever.
 * The three real routes own the playground; this one only knows the way
 * there. (A forward is all that is left of this pattern — the `/view`
 * chooser that once forwarded legacy links by kind is gone, because the
 * merged playground reads every payload kind in place.)
 *
 * `router.replace`, not push: nobody ever meant to visit this route, so Back
 * must return to wherever the link was opened from, not to the trampoline.
 *
 * There is no server-rendered content to hide while forwarding — this page
 * IS the forward — so none of the playground's pre-paint
 * `data-share-forward` machinery is needed here.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { normalizeShareFragment } from "@/features/viewer/share/codec";

export function SeqForward(): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    /* The fragment rides along as part of the href — the playground reads it
       off `location.hash` on mount — NORMALIZED rather than concatenated raw,
       so forwarding a URL that already carries a fragment cannot produce
       `#m=…#m=…` (see `normalizeShareFragment`: that value stops being
       base64url, and the playground then refuses the link).
       Forwarding unconditionally (payload or not) keeps the alias honest:
       `/view/seq` always means `/view/sequence`, never a fourth destination. */
    const body = normalizeShareFragment(window.location.hash);
    router.replace(`/view/sequence${body === "" ? "" : `#${body}`}`);
  }, [router]);

  return (
    // Screen-reader users hear where they are headed instead of a blank page;
    // sighted users see it only if the replace is slow enough to notice.
    <p role="status" className="px-5 py-10 text-sm text-muted-foreground">
      Opening the sequence playground…
    </p>
  );
}
