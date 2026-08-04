"use client";

/**
 * The whole page when a share link carried a model that could not be read.
 *
 * Full-screen for the same reason as `share-expired.tsx`: an inline banner sits
 * on top of *something* — here the seed example — and a reader who half-reads it
 * concludes the model they were sent is about a coffee shop. The old banner even
 * said so out loud ("The example model is shown below"), which is an admission
 * that the layout was fighting the message. Taking over the screen removes the
 * ambiguity.
 *
 * Unlike expiry, this one IS styled as an error, and the difference is not
 * decorative. An expired link did its job and stopped on a date its author
 * chose; nothing failed, so red would be a lie. Here something genuinely broke
 * in transit, and the reader's next move depends on knowing that.
 *
 * `reason` is the codec's own sentence fragment — it distinguishes a payload cut
 * short from one whose bytes were altered from a browser that cannot decompress
 * at all. Those have different culprits, so the page shows the fragment verbatim
 * rather than flattening every failure into "something went wrong".
 *
 * The recovery advice is deliberately conditional ("if the link was cut short").
 * One of the reasons this page can appear is a browser without
 * `DecompressionStream`, where re-sending the link changes nothing — phrasing
 * the advice as a certainty would send that reader after the wrong fix.
 */

import Link from "next/link";
import { Link2Off } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export interface ShareBrokenProps {
  /**
   * Why it could not be opened — a lower-case fragment continuing
   * "This share link could not be opened — …", straight from the codec.
   */
  reason: string;
  /** Drops the fragment and shows the editor, without a page load. */
  onStartFresh: () => void;
}

export function ShareBroken({
  reason,
  onStartFresh,
}: ShareBrokenProps): React.JSX.Element {
  return (
    <main
      // `role="alert"`, not `status`: this is a failure, and the page's own
      // polite live region is not rendered on this path — the takeover replaces
      // it, so this element is what a screen reader has to announce.
      role="alert"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
      >
        <Link2Off className="size-7" />
      </span>

      <div className="flex max-w-prose flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">
          This share link could not be opened
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {reason}. The model it was meant to carry is not shown.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onStartFresh}
          className={buttonClasses({ size: "sm" })}
        >
          Start your own model
        </button>
        <Link
          href="/demo"
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          Browse examples
        </Link>
      </div>

      <p className="max-w-prose text-xs leading-relaxed text-muted-foreground/80">
        If the link was cut short in transit — long URLs get wrapped or clipped
        by mail clients, terminals and some chat apps — ask whoever sent it to
        send it again, or to send the <span className="font-mono">.alab</span>{" "}
        file instead. This page accepts one by paste or drop once you start your
        own model.
      </p>
    </main>
  );
}
