"use client";

/**
 * THE Share control — one component, mounted by BOTH viewers (the C4 shell and
 * the sequence playground). It used to be C4-only, with the sequence pane
 * carrying a hand-rolled copy-a-link button; the two drifted immediately (no
 * expiry, no download fallback, a different button face), which is exactly how
 * duplicated UI always ends. What varies between the viewers is now three
 * PROPS — the route the link opens on, the noun the copy uses ("model"/"flow")
 * and which way the panel opens — and `scripts/share-parity-check.mjs` pins
 * that both viewers mount this file rather than a fork of it.
 *
 * A button beside Export opening a small non-modal dialog. What it offers
 * depends on where the document came from:
 *
 *   - BUNDLED models (`/live/atlas-shop` …) already live at a URL, so the
 *     plain page address is the share link — short and clean, no payload —
 *     and the panel says so instead of needlessly embedding one.
 *   - PASTED / edited documents are encoded into the link itself: canonical
 *     text, deflate-raw-compressed, base64url, in the `#` fragment (see
 *     `codec.ts`). Nothing is uploaded; fragments never reach servers.
 *
 * For C4 the link also carries the diagram being viewed (`d=…`) when it is
 * not the root, so the recipient opens on what the sharer was looking at.
 * A sequence document has no sub-diagrams, so its viewer simply omits the
 * `diagram` props and the whole affordance disappears — nothing is faked.
 *
 * TWO THINGS THE SHARER PICKS, and both are minted into the URL rather than
 * stored anywhere: an expiry (payload links only — a bundled model has no
 * payload to expire) and whether the link OPENS IMMERSIVE (`?i=1`, the one
 * query parameter a share link carries — see `immersive-param.ts`). Both are
 * off by default, and both follow the same contract: the value is passed into
 * `buildLink` as an argument, never read from state inside it, because a
 * choice that does not rebuild the URL leaves Copy handing over a link that
 * disagrees with the panel. That bug shipped once, for the expiry.
 *
 * Honesty about limits, in the codec's tiers (see the reasoning on the
 * constants in `codec.ts`): under `SHARE_URL_SAFE_LENGTH` the link is handed
 * out clean; up to `MAX_SHARE_URL_LENGTH` it is handed out WITH a caveat
 * that plain-text email may break it; past the ceiling the panel refuses,
 * says exactly why, and offers the text-file download instead. Browsers
 * without `CompressionStream` get the same honest fallback.
 *
 * Keyboard/a11y: normal trigger button (`aria-expanded`/`aria-haspopup`),
 * panel is a labelled non-modal dialog that receives focus on open, Escape
 * closes it (capture phase — it never reaches the canvas's Escape ladder)
 * and returns focus to the trigger. Copy/share/download outcomes are
 * announced through the HOST PAGE's existing live region via `onAnnounce`.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { cn } from "@/lib/utils";
import type { C4Diagram } from "@/types";

import { downloadBlob, sourceFileStem } from "../export/download";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_URL_SAFE_LENGTH,
  SHARE_PARAM_DIAGRAM,
  shareDigestFor,
  type ShareExpiry,
} from "./codec";
import { immersiveQuery } from "./immersive-param";
import { mintExpiry } from "./mint-expiry";
import { parseDurationList } from "./duration";
import { canVerifyExpiry } from "./signature";

/**
 * Where the document being viewed came from — decides what a share link is.
 * The payload is the document's canonical TEXT, not a parsed structure: text
 * is what the codec compresses, and taking it here (rather than an
 * `ArchLabFile`) is what lets the sequence viewer — whose pane holds raw
 * `.alab`-or-Mermaid text — use the same control.
 */
export type ShareSource =
  { kind: "bundled"; modelId: string } | { kind: "payload"; text: string };

type LinkState =
  | { status: "building" }
  /**
   * `expiresAt` is epoch seconds when the sharer asked for an expiry and the
   * server signed one, else null. `expiryNote` explains a requested expiry that
   * could NOT be minted — the link is still handed over, permanently, and the
   * note says so rather than pretending the choice took effect.
   */
  | {
      status: "ready";
      url: string;
      expiresAt: number | null;
      expiryNote?: string;
      /**
       * The middle tier: past `SHARE_URL_SAFE_LENGTH` but under the hard
       * ceiling. The link is still handed out — every modern browser and chat
       * app carries it — with an honest caveat that plain-text email may not.
       */
      overSafeLength: boolean;
    }
  /** The encoded link would exceed the hard ceiling — no link is offered. */
  | { status: "too-long"; length: number }
  /** This browser cannot build compressed links (no CompressionStream). */
  | { status: "unsupported" };

const DAY = 24 * 60 * 60;

/**
 * How long the document rests before an OPEN panel rebuilds its link.
 *
 * Longer than the playground's own 300ms parse debounce, so a burst of edits
 * settles into one rebuild rather than one per successful parse — each costs a
 * compress and, with an expiry chosen, a request to mint the signature.
 */
const REBUILD_DEBOUNCE_MS = 600;

/** Used when the env var is unset — a sane spread, no sub-day options. */
const DEFAULT_TTL_OPTIONS = "1d,7d,30d";

/**
 * Offered expiries, from `NEXT_PUBLIC_ARCHLAB_SHARE_TTL_OPTIONS` — a
 * comma-separated list of duration tokens (`10s,30m,1d,7d,1M,1Y`). See
 * `duration.ts` for the grammar.
 *
 * Env-driven rather than hard-coded because the useful set is a property of the
 * deployment, not of this component: seconds for testing the refusal path, hours
 * for review links, days for a public demo. The previous `NODE_ENV` special case
 * for a 10-second option is gone — the list itself now decides, so a developer
 * adds `10s` locally instead of the component guessing who is running it.
 *
 * "Never" is always first and always present: expiry is opt-in, and a
 * misconfigured env must never remove the ability to share at all.
 */
const TTL_CHOICES: ReadonlyArray<{ label: string; seconds: number | null }> = [
  { label: "Never", seconds: null },
  ...parseDurationList(
    process.env.NEXT_PUBLIC_ARCHLAB_SHARE_TTL_OPTIONS ?? DEFAULT_TTL_OPTIONS,
  ),
];

/**
 * Date alone for a distant expiry; a clock time when it is under a day away.
 * "Stops working on 31 July 2026" tells you nothing about a link that dies in
 * ten seconds.
 */
function formatExpiry(expiresAt: number): string {
  const secondsAway = expiresAt - Math.floor(Date.now() / 1000);
  const when = new Date(expiresAt * 1000);
  return secondsAway < DAY
    ? when.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : when.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

export interface ShareButtonProps {
  share: ShareSource;
  /** Used for the Web Share sheet's title and the download's file name. */
  documentTitle: string;
  /**
   * The route a payload link opens on — `/live/c4` or `/live/sequence`. The
   * payload format is shared (one codec); the ROUTE is what decides which
   * parser receives the decoded text, so each viewer names its own.
   */
  route: string;
  /**
   * What the copy calls the document — "model" for C4, "flow" for a sequence.
   * A sequence sharer who reads "anyone with the link can view the model"
   * rightly wonders whether they pressed the wrong button.
   */
  noun: string;
  /**
   * The diagram currently on screen — encoded into the link when not the
   * root, so the recipient opens on it. C4-only: a sequence document has no
   * sub-diagrams, so its viewer omits both props and the panel never mentions
   * diagrams at all.
   */
  diagram?: C4Diagram;
  rootDiagramId?: string;
  /**
   * Which way the panel opens. The C4 shell's toolbar sits at the BOTTOM of
   * the screen (panel opens up, or it would fall below the fold); the
   * sequence playground's toolbar sits mid-page above its source pane (panel
   * opens down, or it would cover the diagram the sharer is looking at).
   */
  panelSide?: "up" | "down";
  /**
   * Extension for the download fallback. Defaults to `.alab`; the sequence
   * viewer passes `.mmd` when its pane holds a Mermaid document, so the file
   * handed out is named for what it actually contains.
   */
  downloadExtension?: string;
  /** Announce through the host page's existing polite live region. */
  onAnnounce: (message: string) => void;
}

export function ShareButton({
  share,
  documentTitle,
  route,
  noun,
  diagram,
  rootDiagramId,
  panelSide = "up",
  downloadExtension = ARCHTEXT_EXTENSION,
  onAnnounce,
}: ShareButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<LinkState>({ status: "building" });
  /** Seconds; null = never expires, which stays the default (opt-in). */
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  /**
   * Mint a link that opens immersive — the diagram filling the window, no site
   * chrome. Off by default: a link that swallows the rest of the app is a
   * choice the sharer makes for a presentation, never one they inherit.
   */
  const [openImmersive, setOpenImmersive] = useState(false);
  /**
   * A link is on screen and a newer one is being built. Distinct from the
   * `building` status: that one has nothing to show, this one has something
   * STALE to show, and the difference decides whether the panel may be torn
   * down and whether Copy is safe to press.
   */
  const [rebuilding, setRebuilding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  const includeDiagram =
    diagram !== undefined &&
    rootDiagramId !== undefined &&
    diagram.id !== rootDiagramId;
  const diagramId = diagram?.id ?? null;

  /* ---- building the link -------------------------------------------------- */

  // Guards a slow encode against a close-and-reopen: only the newest build
  // may land its result.
  const buildTokenRef = useRef(0);
  /**
   * The payload the newest build started from.
   *
   * A STRING, compared by value, and that is the whole point: the host
   * playground passes `share={{ kind: "payload", text }}` as a fresh object
   * literal every render, so `share` — and therefore `buildLink` — has a new
   * identity on every render. An effect keyed on either would rebuild forever,
   * each round paying for a compress and possibly an expiry mint.
   */
  const builtPayloadRef = useRef<string | null>(null);
  /**
   * The chosen expiry, readable from the rebuild effect below without being one
   * of its dependencies — the effect must fire for a CHANGED DOCUMENT only, and
   * `handleTtlChange` already rebuilds on its own.
   */
  const ttlRef = useRef<number | null>(null);
  /** The immersive choice, readable from the rebuild effect for the same
   * reason as `ttlRef`: that effect fires for a CHANGED DOCUMENT only. */
  const immersiveRef = useRef(false);
  /**
   * Whether a link is already on screen. A ref, not the `link` state, so
   * `buildLink` can branch on it without taking `link` as a dependency — that
   * would recreate the callback on every build and defeat its own stability.
   */
  const hasLinkRef = useRef(false);

  /**
   * `ttl` is a PARAMETER, not read from state. It used to close over
   * `ttlSeconds`, and because `buildLink` was only ever called when the panel
   * opened, changing the dropdown recreated the callback but never ran it: the
   * panel kept showing — and the Copy button kept handing over — the link built
   * with the PREVIOUS choice. Silently wrong, which is worse than visibly
   * broken. Passing the value in means the select's own handler can rebuild
   * immediately with the value it just set, without waiting for a re-render.
   */
  const buildLink = useCallback(
    (ttl: number | null, immersive: boolean) => {
      buildTokenRef.current += 1;
      const token = buildTokenRef.current;

      if (share.kind === "bundled") {
        const suffix =
          includeDiagram && diagramId !== null
            ? `#${SHARE_PARAM_DIAGRAM}=${encodeURIComponent(diagramId)}`
            : "";
        // A bundled link points at a model that ships with the app; there is no
        // payload to expire, so the TTL control is not offered for these.
        // Immersive IS offered: it describes how the page opens, which has
        // nothing to do with where the document came from.
        setLink({
          status: "ready",
          url:
            `${window.location.origin}/live/${share.modelId}` +
            `${immersiveQuery(immersive)}${suffix}`,
          expiresAt: null,
          overSafeLength: false,
        });
        return;
      }

      if (!canEncodeShare()) {
        setLink({ status: "unsupported" });
        return;
      }

      // Rebuilding an existing link keeps the panel MOUNTED and just marks it
      // stale. Dropping to `building` tore down the whole ready state —
      // including the very dropdown that triggered the rebuild — so the control
      // vanished and reappeared under the cursor on every change. Only the first
      // build, with nothing to show yet, gets the "building" state.
      if (hasLinkRef.current) {
        setRebuilding(true);
      } else {
        setLink({ status: "building" });
      }
      void (async () => {
        const payloadText = share.text;
        // Claimed BEFORE the first await, so the rebuild effect below sees this
        // payload as handled and does not queue a second build for it.
        builtPayloadRef.current = payloadText;

        // Mint the expiry FIRST: it is the only step that can fail, and failing
        // after building a link would mean discarding a good one.
        let expiry: ShareExpiry | undefined;
        let expiryNote: string | undefined;
        if (ttl !== null) {
          const minted = await mintExpiry(
            await shareDigestFor(payloadText),
            ttl,
          );
          if (token !== buildTokenRef.current) return;
          if (minted.status === "ok") {
            expiry = {
              expiresAt: minted.expiresAt,
              signature: minted.signature,
            };
          } else {
            expiryNote = `This link will not expire — ${minted.message}.`;
          }
        }

        const fragment = await encodeShareFragment(
          payloadText,
          includeDiagram ? diagramId : null,
          expiry,
        );
        if (token !== buildTokenRef.current) return;
        // Minted against the viewer's own route (`/live/c4`, `/live/sequence`)
        // rather than the legacy `/live#m=` — the chooser still forwards old
        // links, but new links skip that hop and land on their parser directly.
        // The query sits BEFORE the fragment, which is the only order a URL
        // has: everything after the first `#` is the fragment, so `?i=1`
        // appended to the end would become part of the payload and the
        // version check would refuse the link.
        const url = `${window.location.origin}${route}${immersiveQuery(immersive)}#${fragment}`;
        const tooLong = url.length > MAX_SHARE_URL_LENGTH;
        hasLinkRef.current = !tooLong;
        setLink(
          tooLong
            ? { status: "too-long", length: url.length }
            : {
                status: "ready",
                url,
                expiresAt: expiry?.expiresAt ?? null,
                expiryNote,
                overSafeLength: url.length > SHARE_URL_SAFE_LENGTH,
              },
        );
        setRebuilding(false);
      })();
    },
    // Neither choice is a dependency: both arrive as arguments, so this
    // callback stays stable across a dropdown change and a checkbox press.
    [share, route, diagramId, includeDiagram],
  );

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    setCopied(false);
    buildLink(ttlSeconds, openImmersive);
    setOpen(true);
  }, [open, buildLink, ttlSeconds, openImmersive]);

  /** Change the expiry and rebuild at once — the fix for the stale-link bug. */
  const handleTtlChange = useCallback(
    (next: number | null) => {
      setTtlSeconds(next);
      ttlRef.current = next;
      buildLink(next, immersiveRef.current);
    },
    [buildLink],
  );

  /** Same contract as the expiry: set it and rebuild in one go, with the value
   * passed in rather than read from state. A checkbox that left the URL on
   * screen — and the one Copy hands over — describing the PREVIOUS choice is
   * the exact bug the `ttl` parameter above was added to kill. */
  const handleImmersiveChange = useCallback(
    (next: boolean) => {
      setOpenImmersive(next);
      immersiveRef.current = next;
      buildLink(ttlRef.current, next);
    },
    [buildLink],
  );

  /**
   * Rebuild while the panel is OPEN and the document changes underneath it.
   *
   * The same bug the `ttl` parameter above fixed, reached by the other input:
   * `buildLink` ran on open and on expiry change only, so editing the text with
   * the panel open left the URL on screen — and the one Copy handed over —
   * encoding the PREVIOUS document. Silently wrong, and it forced a
   * close-and-reopen to get a link matching what was on screen.
   *
   * Keyed on the payload TEXT, never on `share`/`buildLink` (see
   * `builtPayloadRef`). The ref check is what makes including `buildLink` in the
   * dependencies safe: this effect runs on every render, and all but the ones
   * carrying a genuinely new document return immediately.
   *
   * Debounced, and the state writes happen inside the timer rather than in the
   * effect body — a rebuild costs a compress plus a round trip to mint an
   * expiry, which is not something to spend per parse, and `react-hooks/
   * set-state-in-effect` rightly refuses the synchronous version.
   */
  useEffect(() => {
    if (!open) return;
    // Bundled links point at a model that ships with the app; nothing to track.
    if (share.kind !== "payload") return;
    const payloadText = share.text;
    if (payloadText === builtPayloadRef.current) return;
    const timer = window.setTimeout(() => {
      buildLink(ttlRef.current, immersiveRef.current);
    }, REBUILD_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, share, buildLink]);

  /* ---- open/close mechanics (same contract as the export menu) ------------ */

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root !== null &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    // Capture phase: this Escape must never reach the canvas's climb ladder.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  /* ---- actions -------------------------------------------------------------- */

  const handleCopy = useCallback(
    (url: string) => {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          onAnnounce("Share link copied to clipboard.");
          window.setTimeout(() => setCopied(false), 2_000);
        })
        .catch(() => {
          onAnnounce(
            "Copying was blocked by the browser — select the link text in the share panel and copy it manually.",
          );
        });
    },
    [onAnnounce],
  );

  const canWebShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleWebShare = useCallback(
    (url: string) => {
      navigator.share({ title: documentTitle, url }).catch(() => {
        // Cancelled or blocked — the copy button remains the fallback.
      });
    },
    [documentTitle],
  );

  const handleDownload = useCallback(() => {
    if (share.kind !== "payload") return;
    const filename = `${sourceFileStem(documentTitle)}${downloadExtension}`;
    downloadBlob(
      new Blob([share.text], { type: "text/plain;charset=utf-8" }),
      filename,
    );
    onAnnounce(`Downloaded ${filename}.`);
  }, [share, documentTitle, downloadExtension, onAnnounce]);

  /* ---- render ------------------------------------------------------------------ */

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Share this ${noun}`}
        title="Share"
        onClick={handleToggle}
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        <Share2 aria-hidden="true" />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-labelledby={headingId}
          tabIndex={-1}
          className={cn(
            "absolute left-0 z-50 w-[min(22rem,calc(100vw-4rem))] rounded-lg border border-border bg-card p-4 shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:right-0 sm:left-auto",
            /* Which way it opens is the host's call — see `panelSide`. */
            panelSide === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            Share this {noun}
          </h2>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {share.kind === "bundled"
              ? `This ${noun} ships with arch-lab, so the plain page address is the whole link — short and clean, with nothing to embed and nothing about you in it.`
              : `Nothing is uploaded: the ${noun} travels inside the link itself, compressed into the part after # — which browsers never send to any server.`}
          </p>

          {includeDiagram && diagram !== undefined ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              The link opens on the diagram you are viewing:{" "}
              <span className="font-medium text-foreground">
                {diagram.title}
              </span>
              .
            </p>
          ) : null}

          {link.status === "building" ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Building the link…
            </p>
          ) : null}

          {link.status === "ready" ? (
            <>
              <input
                type="text"
                readOnly
                value={link.url}
                aria-label="Share link"
                // While rebuilding, this URL is the PREVIOUS one. Marked
                // busy and dimmed so it does not read as the current answer,
                // and the actions below are disabled so it cannot be copied.
                aria-busy={rebuilding}
                onFocus={(event) => event.currentTarget.select()}
                className={cn(
                  "mt-3 w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  rebuilding && "opacity-50",
                )}
              />
              {share.kind === "payload" ? (
                link.overSafeLength ? (
                  /* The middle tier: a working link with an honest caveat,
                     not a refusal — browsers and chat apps carry links this
                     long without trouble; plain-text email is the one carrier
                     that reliably cannot (RFC 5322 wraps lines at 998 octets,
                     so no document-carrying link is truly email-proof). */
                  <p className="mt-1.5 text-xs leading-relaxed text-warning">
                    {link.url.length.toLocaleString("en-US")} characters — fine
                    in browsers and chat apps, but plain-text email can wrap and
                    break a link this long. For email, download the{" "}
                    {downloadExtension} file below and send that instead.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {link.url.length.toLocaleString("en-US")} characters — short
                    enough to stay intact in essentially any app.
                  </p>
                )
              ) : null}

              {/* HOW THE LINK OPENS, offered for both share kinds: immersive
                  describes the arrival, not the payload, so a bundled model's
                  plain page address takes it too (`?i=1` — five characters).
                  A NATIVE checkbox in a label, matching the native select
                  below rather than inventing a switch beside it.
                  Off by default. A link that hides the rest of the site is a
                  decision the sharer makes for a presentation; inheriting it
                  is how `/live/[modelId]` used to strand readers with no
                  visible way back, which is why that default was removed. */}
              <div className="mt-3 flex flex-col gap-1.5">
                <label
                  htmlFor={`${panelId}-immersive`}
                  className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                >
                  <span>Open immersive</span>
                  <input
                    id={`${panelId}-immersive`}
                    type="checkbox"
                    checked={openImmersive}
                    onChange={(event) => {
                      handleImmersiveChange(event.target.checked);
                    }}
                    className="size-3.5 accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  />
                </label>
                {openImmersive ? (
                  <p className="text-xs text-muted-foreground">
                    The {noun} fills the recipient&rsquo;s window with the site
                    chrome hidden. Escape brings it back — they are not stuck
                    there.
                  </p>
                ) : null}
              </div>

              {/* Offered only for payload links (a bundled link has no payload
                  to expire) and only where the deployment can verify — without
                  a public key the RECIPIENT could not check the expiry, so
                  minting one would produce a link nobody can open. */}
              {share.kind === "payload" && canVerifyExpiry() ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  <label
                    htmlFor={`${panelId}-ttl`}
                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span>Expires</span>
                    <select
                      id={`${panelId}-ttl`}
                      value={ttlSeconds === null ? "never" : String(ttlSeconds)}
                      onChange={(event) => {
                        const raw = event.target.value;
                        handleTtlChange(raw === "never" ? null : Number(raw));
                      }}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {TTL_CHOICES.map((choice) => (
                        <option
                          key={choice.label}
                          value={
                            choice.seconds === null ? "never" : choice.seconds
                          }
                        >
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {link.expiresAt !== null ? (
                    <p className="text-xs text-muted-foreground">
                      This link stops working on{" "}
                      <span className="font-medium text-foreground">
                        {formatExpiry(link.expiresAt)}
                      </span>
                      . It is not a secret — anyone with the link can read the{" "}
                      {noun} until then.
                    </p>
                  ) : null}
                  {link.expiryNote !== undefined ? (
                    <p className="text-xs text-warning">{link.expiryNote}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(link.url)}
                  // Disabled mid-rebuild: the URL above is still the previous
                  // one, and handing over a link that does not match the
                  // expiry on screen is the exact bug this panel just had.
                  disabled={rebuilding}
                  className={cn(
                    buttonClasses({ size: "sm" }),
                    rebuilding && "cursor-not-allowed opacity-60",
                  )}
                >
                  {copied ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                  {rebuilding ? "Updating…" : copied ? "Copied" : "Copy link"}
                </button>
                {canWebShare ? (
                  <button
                    type="button"
                    onClick={() => handleWebShare(link.url)}
                    className={buttonClasses({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    <Share2 aria-hidden="true" />
                    Share…
                  </button>
                ) : null}
                {share.kind === "payload" ? (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className={buttonClasses({ variant: "ghost", size: "sm" })}
                  >
                    <Download aria-hidden="true" />
                    Download {downloadExtension}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {link.status === "too-long" ? (
            <>
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-foreground">
                  <span className="font-semibold">
                    Too large to share as a link.
                  </span>{" "}
                  This {noun} encodes to {link.length.toLocaleString("en-US")}{" "}
                  characters, past the{" "}
                  {MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character
                  ceiling where enough apps truncate links that the recipient
                  would open a broken diagram. Download the {downloadExtension}{" "}
                  file and send that instead.
                </p>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className={buttonClasses({ size: "sm" })}
                >
                  <Download aria-hidden="true" />
                  Download {downloadExtension}
                </button>
              </div>
            </>
          ) : null}

          {link.status === "unsupported" ? (
            <>
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-foreground">
                  This browser cannot build compressed share links (it lacks
                  CompressionStream). Download the {downloadExtension} file and
                  send that instead.
                </p>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className={buttonClasses({ size: "sm" })}
                >
                  <Download aria-hidden="true" />
                  Download {downloadExtension}
                </button>
              </div>
            </>
          ) : null}

          <p className="mt-3 border-t border-border/60 pt-2.5 text-xs leading-relaxed text-muted-foreground">
            Anyone with the link can view the {noun} — a link is not a secret,
            and sending it through a chat or email service shares the {noun}{" "}
            with that service too.
          </p>
        </div>
      ) : null}
    </div>
  );
}
