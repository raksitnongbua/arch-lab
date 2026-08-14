"use client";

/**
 * "Open this document over there" — a link that carries a whole `.alab`
 * document to another route inside a share-link fragment.
 *
 * Same codec as the viewer's Share button and the syntax reference, so no new
 * hand-off channel is invented: a page that has produced canonical text can
 * always put it on screen somewhere without a store, a query string or a
 * round trip. Nothing is uploaded — the fragment never leaves the browser.
 *
 * Renders NOTHING when the hand-off cannot be made: the platform has no
 * CompressionStream, or the document exceeds the codec's HANDOFF ceiling. That
 * ceiling, not the stricter share tiers, is the right test here — this is
 * same-origin navigation the reader clicks themselves, so the carrier
 * truncation the share tiers guard against cannot happen to it.
 *
 * Lives in `components/share` rather than in either caller because two pages
 * now do exactly this (`/validate` and `/convert`), and a second copy of an
 * encode-then-measure effect is precisely the kind of duplication that drifts
 * — one copy would keep the old ceiling after the other moved.
 */

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_HANDOFF_URL_LENGTH,
} from "@/features/viewer/share/codec";

export function HandoffLink({
  alabText,
  path,
  label,
}: {
  /** Canonical `.alab` text to carry. */
  alabText: string;
  /** Destination route, without a fragment (`/view/c4`). */
  path: string;
  label: string;
}): React.JSX.Element | null {
  // The fragment is stored WITH the text it was made from, so a stale link is
  // simply not matched on the next render — no reset-in-effect, and no window
  // where the button points at the previous document.
  const [encoded, setEncoded] = useState<{
    source: string;
    href: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!canEncodeShare()) return;
    void encodeShareFragment(alabText, null).then((fragment) => {
      if (cancelled) return;
      const target = `${path}#${fragment}`;
      if (
        `${window.location.origin}${target}`.length <= MAX_HANDOFF_URL_LENGTH
      ) {
        setEncoded({ source: alabText, href: target });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [alabText, path]);

  const href =
    encoded !== null && encoded.source === alabText ? encoded.href : null;
  if (href === null) return null;
  return (
    <Link
      href={href}
      className={buttonClasses({ variant: "outline", size: "sm" })}
    >
      <ArrowUpRight aria-hidden="true" />
      {label}
    </Link>
  );
}
