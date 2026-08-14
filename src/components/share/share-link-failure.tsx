"use client";

/**
 * The whole page when a share link did not produce a diagram — ONE component
 * for every host that opens `#m=…` links, because failure states are exactly
 * where hosts drifted apart before: the C4 route gained full-page takeovers
 * (PR #19) while the sequence route kept announcing failures into a
 * screen-reader-only live region, leaving sighted readers staring at the seed
 * example and concluding it was the diagram they were sent. A single
 * component makes the next divergence a merge conflict instead of a bug
 * report; `check:share-error-pages` fails the build if the playground stops
 * mounting it, or if the codec grows a decode status it does not map.
 *
 * Two failure kinds, two different reader actions — deliberately NOT one
 * generic apology, because the reader's next move differs:
 *   - `expired`: nothing broke. The link worked and its author chose an end
 *     date, so no red, no error tone — a clock, the date, and "ask for a
 *     fresh link".
 *   - `broken`: the payload cannot be read. Error tone; the codec's own
 *     plain-language reason is shown verbatim (it already distinguishes a
 *     payload cut short from altered bytes from a link minted by a newer
 *     arch-lab from a browser that cannot decompress) — flattening those into
 *     "something went wrong" would send readers after the wrong fix. The
 *     footer names the most likely real-world culprit — a long URL clipped by
 *     the app that carried it — and points at the `.alab` file as the fix.
 *
 * There USED to be a third kind, `wrong-document` — an intact payload of the
 * other playground's kind, answered with a door to that playground. The
 * merged playground reads every payload kind, so the state is unreachable:
 * deleted rather than kept as a branch nothing can take.
 *
 * Full-screen (an early return in the host, never a banner): a banner sits on
 * top of *something* — the seed example — and a half-read banner leaves the
 * reader believing the example is what they were sent.
 *
 * No route strings live here beyond `/demo`, so a `/view/*` rename cannot
 * strand a hardcoded link inside this shared component.
 */

import { useEffect } from "react";
import Link from "next/link";
import { Clock, Link2Off } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

/** Every way a share link can fail to become a diagram on screen. */
export type ShareOpenFailure =
  /** A signed expiry that has passed — not a fault; the author meant it. */
  | { kind: "expired"; expiresAt: number }
  /**
   * The payload could not be read (or read but would not parse). `reason` is
   * a lower-case sentence fragment continuing "This share link could not be
   * opened — …", straight from the codec or the host's parse step — never a
   * raw exception.
   */
  | { kind: "broken"; reason: string };

export interface ShareLinkFailurePageProps {
  failure: ShareOpenFailure;
  /** What the link was carrying, in the reader's words: "model", "sequence diagram". */
  subject: string;
  /** Label for the button that dismisses the takeover and shows the editor. */
  startFreshLabel: string;
  /** Drops the dead fragment and shows the editor, without a page load. */
  onStartFresh: () => void;
}

export function ShareLinkFailurePage({
  failure,
  subject,
  startFreshLabel,
  onStartFresh,
}: ShareLinkFailurePageProps): React.JSX.Element {
  const heading =
    failure.kind === "expired"
      ? "This share link has expired"
      : "This share link could not be opened";

  useEffect(() => {
    // The route's metadata title still describes the editor, which is NOT on
    // screen — retitle the tab to the failure so history and tab-switching
    // read true. Restored on cleanup because "start fresh" swaps back to the
    // editor without a navigation, so nothing else would put it back.
    const previous = document.title;
    document.title = heading;
    return () => {
      document.title = previous;
    };
  }, [heading]);

  /* ---- expired --------------------------------------------------------- */

  if (failure.kind === "expired") {
    const when = new Date(failure.expiresAt * 1000);
    // Date AND time: a link that lapsed today is confusing labelled with a
    // bare date — "expired 31 July" reads as "expired at some point today".
    const stamp = when.toLocaleString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <FailureShell
        // `role="status"`, not `alert`: informational, and an alert would
        // interrupt a screen reader for something that is not urgent.
        role="status"
        icon={
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground"
          >
            <Clock className="size-7" />
          </span>
        }
        heading={heading}
        body={
          <>
            It was set to stop working on{" "}
            <span className="font-medium text-foreground">{stamp}</span>. The{" "}
            {subject} it carried is not shown. Ask whoever sent it for a fresh
            link.
          </>
        }
        actions={
          <>
            <StartFreshButton label={startFreshLabel} onClick={onStartFresh} />
            <BrowseExamplesLink />
          </>
        }
        footer={
          <>
            Expiring links carry a signed end date, so the date above cannot be
            moved by editing the URL. It is not a secret, though — anyone who
            opened the link before now could already read and keep the {subject}
            .
          </>
        }
      />
    );
  }

  /* ---- broken ---------------------------------------------------------- */

  if (failure.kind === "broken") {
    return (
      <FailureShell
        // `role="alert"`: this IS a failure, and the host's polite live
        // region is not rendered on this path — the takeover replaces it, so
        // this element is what a screen reader has to announce.
        role="alert"
        icon={
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
          >
            <Link2Off className="size-7" />
          </span>
        }
        heading={heading}
        body={
          <>
            {failure.reason}. The {subject} it was meant to carry is not shown.
          </>
        }
        actions={
          <>
            <StartFreshButton label={startFreshLabel} onClick={onStartFresh} />
            <BrowseExamplesLink />
          </>
        }
        footer={
          // Deliberately conditional ("if the link was cut short"): this page
          // also appears for a browser without DecompressionStream, where
          // re-sending the link changes nothing — advice phrased as a
          // certainty would send that reader after the wrong fix.
          <>
            If the link was cut short in transit — long URLs get wrapped or
            clipped by mail clients, terminals and some chat apps — ask whoever
            sent it to send it again, or to send the{" "}
            <span className="font-mono">.alab</span> file instead: the file
            cannot be truncated the way a URL can.
          </>
        }
      />
    );
  }

  // A NEW failure kind must not silently render as the wrong page: this
  // assignment fails `pnpm typecheck` until the kind gets its own branch.
  const _exhaustive: never = failure;
  return _exhaustive;
}

/* -------------------------------------------------------------------------- */
/* One scaffold for all three kinds                                            */
/* -------------------------------------------------------------------------- */

function FailureShell({
  role,
  icon,
  heading,
  body,
  actions,
  footer,
}: {
  role: "alert" | "status";
  icon: React.ReactNode;
  heading: string;
  body: React.ReactNode;
  actions: React.ReactNode;
  footer: React.ReactNode;
}): React.JSX.Element {
  return (
    <main
      role={role}
      // Plain static layout, no entrance motion: this page exists to be read
      // once by someone who just hit a wall — animating it buys nothing and
      // would need a reduced-motion branch to maintain.
      className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      {icon}
      <div className="flex max-w-prose flex-col gap-2">
        {/* The takeover replaces the host page entirely, so this h1 is the
            page's only heading — no order to get wrong, nothing focusable is
            removed from the tab order. */}
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {actions}
      </div>
      <p className="max-w-prose text-xs leading-relaxed text-muted-foreground/80">
        {footer}
      </p>
    </main>
  );
}

function StartFreshButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={buttonClasses({ size: "sm" })}
    >
      {label}
    </button>
  );
}

function BrowseExamplesLink(): React.JSX.Element {
  return (
    <Link
      href="/demo"
      className={buttonClasses({ variant: "outline", size: "sm" })}
    >
      Browse examples
    </Link>
  );
}
