"use client";

/**
 * THE FALLBACK half of the trampoline — the one that runs only if the inline
 * script in `alias-forward.tsx` did not.
 *
 * It used to be the whole thing, and that was the defect: a client component
 * cannot forward until React has hydrated, so the server sent "Opening the
 * playground…", the browser PAINTED it, and the reader watched that line for
 * the entire hydration window before the address changed. On a share link
 * that is the first thing they ever see of this product. The forward now
 * happens during HTML parse; this effect stays as the belt to that braces —
 * if the script is blocked or fails, the page still leaves.
 *
 * Carries the URL FRAGMENT with it, which is the whole reason a trampoline
 * exists at all.
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
 * already flipped once. `/live/seq` used to be the alias and `/live/sequence`
 * the page; the pair now runs the other way (see `app/live/seq/page.tsx` for
 * why), and a second hand-written forwarder would have been the moment the
 * two drifted on the fragment handling — which is the part that is easy to
 * get wrong and expensive when it is. That prop is now carrying sixteen
 * routes, since the whole family was renamed from `/view` and each old path
 * stayed behind as a trampoline (`app/live/page.tsx` records the rename and
 * the naming convention these comments follow).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { normalizeShareFragment } from "@/features/viewer/share/codec";

export function AliasForwardFallback({
  to,
  label,
}: {
  /** Destination path, without a fragment (`/live/seq`). */
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
    /* THE QUERY IS CARRIED TOO, and forgetting it dropped real links. The
       forward used to be `to` plus the fragment, so `/view?e=atlas-shop`
       arrived at `/live` with the example id gone — and `?e=` is how every
       demo card and every crawlable example page addresses a document, so the
       reader landed on the seed instead of the diagram they asked for. The
       fragment was carried because the SHARE payload lives there; `?e=` and
       `?d=` are the other half of the same compatibility promise.

       MERGED, not concatenated, because nearly every destination carries a
       `?d=` of its own (`/live?d=seq`) — appending a second query string
       would produce `?d=seq?e=x`, whose `d` then reads as `seq?e=x` and
       matches no kind. The DESTINATION wins a collision: the alias's `d`
       comes from the path the reader actually asked for, so `/view/seq?d=er`
       is a contradiction the route already settled. */
    const here = new URL(window.location.href);
    const target = new URL(to, window.location.origin);
    for (const [key, value] of here.searchParams) {
      if (!target.searchParams.has(key)) target.searchParams.set(key, value);
    }
    const body = normalizeShareFragment(window.location.hash);
    router.replace(
      `${target.pathname}${target.search}${body === "" ? "" : `#${body}`}`,
    );
  }, [router, to]);

  return (
    // Screen-reader users hear where they are headed instead of meeting a
    // blank page; sighted users see it only if the replace is slow enough.
    <p role="status" className="px-5 py-10 text-sm text-muted-foreground">
      Opening {label}…
    </p>
  );
}
