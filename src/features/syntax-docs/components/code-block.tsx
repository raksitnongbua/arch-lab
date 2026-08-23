"use client";

/**
 * A `.alab` code block for the syntax reference: `<pre><code>` semantics, a
 * copy button with announced feedback, and (optionally) an "Open in view
 * mode" link that carries the snippet to `/live` inside a share-link
 * fragment — the same codec the viewer's Share button uses, so the reference
 * doubles as a playground launcher.
 *
 * Long lines scroll INSIDE the block (`overflow-x-auto`), never the page.
 */

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { lineCount } from "@/lib/source-text";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_HANDOFF_URL_LENGTH,
} from "@/features/viewer/share/codec";

export function CodeBlock({
  code,
  label,
  tryIt = false,
  caption = ".alab",
}: {
  /** The exact `.alab` source to display (and copy). */
  code: string;
  /** Names the snippet in the copy button's accessible name. */
  label: string;
  /** Adds an "Open in view mode" link carrying this snippet. */
  tryIt?: boolean;
  /**
   * The format label in the block's header. Defaults to `.alab` — override it
   * for the few blocks that are not model source (e.g. `sh` install commands),
   * so the caption never claims a shell snippet is a model.
   */
  caption?: string;
}): React.JSX.Element {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
          <figcaption className="font-mono text-xs text-muted-foreground">
            {caption}
          </figcaption>
          <div className="flex flex-wrap items-center gap-1.5">
            {tryIt ? <TryItLink code={code} label={label} /> : null}
            <CopyButton text={code} label={`Copy the ${label} example`} />
          </div>
        </div>
        {/* LINE NUMBERS, as a grid rather than as text in the copyable flow.
            The gutter is a separate column of <span>s, `aria-hidden` and
            `select-none`, so "1 2 3" can never end up in a paste — the whole
            point of the Copy button beside it is that what you paste parses.
            (A CSS ::before counter would do the same, and would also be
            unselectable, but it cannot be scrolled independently of the code,
            which is what keeps the numbers put when a long line scrolls
            sideways.)

            THE COUNT COMES FROM `lineCount`, shared with the editable gutter
            in `ui/numbered-textarea.tsx`. Both had their own copy of the same
            expression, and this one had drifted: it dropped the trailing newline
            but not the floor of 1, so it was one keystroke away from the empty
            snippet that renders no number at all. Two surfaces, two copies, one
            of them already wrong — which is the case `lib/source-text.ts` exists
            for.
            What is deliberately NOT shared is the type scale and the muted step:
            the rows only have to line up WITHIN a surface, so an editable pane
            and a read-only snippet agreeing on `text-xs` is coincidence, not
            coupling, and unifying it would invent a constraint. */}
        <pre
          tabIndex={0}
          className="grid grid-cols-[auto_1fr] gap-x-3 overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="grid shrink-0 justify-items-end text-muted-foreground/50 tabular-nums select-none"
          >
            {Array.from({ length: lineCount(code) }, (_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </span>
          <code className="min-w-0">{code}</code>
        </pre>
      </div>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Try it in view mode                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Encodes the snippet with the real share codec on the client (it needs the
 * platform's CompressionStream). Renders nothing until the fragment is ready,
 * and nothing at all when the browser cannot encode or the resulting URL
 * would exceed the codec's HANDOFF ceiling — this is same-origin navigation
 * the reader clicks themselves, so the share tiers' carrier-truncation worry
 * does not apply; only the runaway guard does.
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
      const target = `/live#${fragment}`;
      if (
        `${window.location.origin}${target}`.length <= MAX_HANDOFF_URL_LENGTH
      ) {
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
