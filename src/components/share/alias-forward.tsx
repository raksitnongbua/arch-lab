"use client";

/**
 * A route that only knows the way somewhere else, carrying the URL FRAGMENT
 * with it.
 *
 * It exists because a share link's whole document travels in the fragment,
 * and the fragment never reaches the server — so a `redirects()` rule in
 * `next.config.ts` would strand the payload. Only a client can carry it
 * across, which is what this does and all it does.
 *
 * `router.replace`, not push: nobody ever meant to visit an alias, so Back
 * must return to wherever the link was opened from rather than to the
 * trampoline.
 *
 * ONE COMPONENT, taking its destination as a prop, because the direction has
 * already flipped once. `/view/seq` used to be the alias and `/view/sequence`
 * the page; the pair now runs the other way (see `app/view/seq/page.tsx` for
 * why), and a second hand-written forwarder would have been the moment the
 * two drifted on the fragment handling — which is the part that is easy to
 * get wrong and expensive when it is.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { normalizeShareFragment } from "@/features/viewer/share/codec";

export function AliasForward({
  to,
  label,
}: {
  /** Destination path, without a fragment (`/view/seq`). */
  to: string;
  /** What the holding line says, e.g. "the sequence playground". */
  label: string;
}): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    /* NORMALIZED rather than concatenated raw: forwarding a URL that already
       carries a fragment must not produce `#m=…#m=…`, whose `m` stops being
       base64url — the destination would then refuse the link it was handed.
       (`normalizeShareFragment` carries the full story; the doubling was a
       real bug on the route this replaced.)

       Forwarding unconditionally, payload or not, keeps the alias honest: it
       always means the same destination, never a second one. */
    const body = normalizeShareFragment(window.location.hash);
    router.replace(`${to}${body === "" ? "" : `#${body}`}`);
  }, [router, to]);

  return (
    // Screen-reader users hear where they are headed instead of meeting a
    // blank page; sighted users see it only if the replace is slow enough.
    <p role="status" className="px-5 py-10 text-sm text-muted-foreground">
      Opening {label}…
    </p>
  );
}
