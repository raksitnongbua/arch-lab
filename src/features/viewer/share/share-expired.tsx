"use client";

/**
 * The whole page when a share link has expired.
 *
 * Full-screen rather than an inline notice above a working editor, because the
 * two states mean opposite things. An inline banner sits on top of *something* —
 * here the seed example — and a reader who half-reads it concludes the model
 * they were sent looks like a coffee shop. Taking over the screen removes that
 * ambiguity: there is nothing to look at, and the page says why.
 *
 * Deliberately not styled as an error. Nothing failed: the link worked, and the
 * person who sent it chose an end date. So no red, no "something went wrong" —
 * a clock, the date, and the one action that helps (ask for a new link), plus a
 * way to start your own model rather than a dead end.
 */

import Link from "next/link";
import { Clock } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export interface ShareExpiredProps {
  /** Epoch seconds the link lapsed at. */
  expiresAt: number;
  /** Drops the fragment and shows the editor, without a page load. */
  onStartFresh: () => void;
}

export function ShareExpired({
  expiresAt,
  onStartFresh,
}: ShareExpiredProps): React.JSX.Element {
  const when = new Date(expiresAt * 1000);
  // Date AND time: a link that lapsed today is confusing labelled with a bare
  // date, since "expired 31 July" reads as "expired at some point today".
  const stamp = when.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main
      // `role="status"`, not `alert`: informational, and an alert would
      // interrupt a screen reader for something that is not urgent.
      role="status"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground"
      >
        <Clock className="size-7" />
      </span>

      <div className="flex max-w-prose flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">
          This share link has expired
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          It was set to stop working on{" "}
          <span className="font-medium text-foreground">{stamp}</span>. The
          model it carried is not shown. Ask whoever sent it for a fresh link.
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
        Expiring links carry a signed end date, so the date above cannot be
        moved by editing the URL. It is not a secret, though — anyone who opened
        the link before now could already read and keep the model.
      </p>
    </main>
  );
}
