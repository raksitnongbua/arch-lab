"use client";

/**
 * A `.aft` code block for the syntax reference: `<pre><code>` semantics, a
 * copy button with announced feedback, and (optionally) an "Open in view
 * mode" link that carries the snippet to `/view/new` inside a share-link
 * fragment — the same codec the viewer's Share button uses, so the reference
 * doubles as a playground launcher.
 *
 * Long lines scroll INSIDE the block (`overflow-x-auto`), never the page.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
} from "@/features/viewer/share/codec";

export function CodeBlock({
  code,
  label,
  tryIt = false,
}: {
  /** The exact `.aft` source to display (and copy). */
  code: string;
  /** Names the snippet in the copy button's accessible name. */
  label: string;
  /** Adds an "Open in view mode" link carrying this snippet. */
  tryIt?: boolean;
}): React.JSX.Element {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
          <figcaption className="font-mono text-xs text-muted-foreground">
            .aft
          </figcaption>
          <div className="flex flex-wrap items-center gap-1.5">
            {tryIt ? <TryItLink code={code} label={label} /> : null}
            <CopyButton code={code} label={label} />
          </div>
        </div>
        <pre
          tabIndex={0}
          className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <code>{code}</code>
        </pre>
      </div>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

function CopyButton({
  code,
  label,
}: {
  code: string;
  label: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      })
      .catch(() => {
        /* Clipboard blocked — the text stays selectable in the block. */
      });
  }, [code]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : `Copy the ${label} example`}
      className={buttonClasses({ variant: "ghost", size: "sm" })}
    >
      {copied ? (
        <Check aria-hidden="true" className="text-primary" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard." : ""}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Try it in view mode                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Encodes the snippet with the real share codec on the client (it needs the
 * platform's CompressionStream). Renders nothing until the fragment is ready,
 * and nothing at all when the browser cannot encode or the resulting URL
 * would exceed the codec's honest length limit — a link that might arrive
 * truncated is worse than no link.
 */
function TryItLink({
  code,
  label,
}: {
  code: string;
  label: string;
}): React.JSX.Element | null {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!canEncodeShare()) return;
    void encodeShareFragment(code, null).then((fragment) => {
      if (cancelled) return;
      const target = `/view/new#${fragment}`;
      if (`${window.location.origin}${target}`.length <= MAX_SHARE_URL_LENGTH) {
        setHref(target);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (href === null) return null;
  return (
    <Link
      href={href}
      aria-label={`Open the ${label} example in view mode`}
      className={buttonClasses({ variant: "outline", size: "sm" })}
    >
      <ArrowUpRight aria-hidden="true" />
      Open in view mode
    </Link>
  );
}
