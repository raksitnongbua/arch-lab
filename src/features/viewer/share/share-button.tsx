"use client";

/**
 * The view-mode Share control — a button beside Export opening a small
 * non-modal dialog. What it offers depends on where the model came from:
 *
 *   - BUNDLED models (`/view/atlas-shop` …) already live at a URL, so the
 *     plain page address is the share link — short and clean, no payload —
 *     and the panel says so instead of needlessly embedding one.
 *   - PASTED / edited models are encoded into the link itself: canonical
 *     `.alab` text, deflate-raw-compressed, base64url, in the `#` fragment
 *     (see `codec.ts`). Nothing is uploaded; fragments never reach servers.
 *
 * Either way, the link carries the diagram being viewed (`d=…`) when it is
 * not the root, so the recipient opens on what the sharer was looking at.
 *
 * Honesty about limits: past `MAX_SHARE_URL_LENGTH` the panel refuses to
 * mint a link that chat apps and email clients would truncate, says exactly
 * why, and offers the `.alab` file download instead. Browsers without
 * `CompressionStream` get the same honest fallback.
 *
 * Keyboard/a11y: normal trigger button (`aria-expanded`/`aria-haspopup`),
 * panel is a labelled non-modal dialog that receives focus on open, Escape
 * closes it (capture phase — it never reaches the canvas's Escape ladder)
 * and returns focus to the trigger. Copy/share/download outcomes are
 * announced through the SHELL's existing live region via `onAnnounce`.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { ARCHTEXT_EXTENSION, serializeArchText } from "@/features/archtext";
import type { ArchLabFile, C4Diagram } from "@/types";

import { fileStem } from "../export/download";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_PARAM_DIAGRAM,
  shareDigestFor,
  type ShareExpiry,
} from "./codec";
import { mintExpiry } from "./mint-expiry";
import { parseDurationList } from "./duration";
import { canVerifyExpiry } from "./signature";

/** Where the model being viewed came from — decides what a share link is. */
export type ShareSource =
  { kind: "bundled"; modelId: string } | { kind: "payload"; file: ArchLabFile };

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
    }
  /** The encoded link would exceed the safe URL length — no link is offered. */
  | { status: "too-long"; length: number }
  /** This browser cannot build compressed links (no CompressionStream). */
  | { status: "unsupported" };

const DAY = 24 * 60 * 60;

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

export interface ViewerShareButtonProps {
  share: ShareSource;
  modelTitle: string;
  /** The diagram currently on screen — encoded into the link when not root. */
  diagram: C4Diagram;
  rootDiagramId: string;
  /** Announce through the shell's existing polite live region. */
  onAnnounce: (message: string) => void;
}

export function ViewerShareButton({
  share,
  modelTitle,
  diagram,
  rootDiagramId,
  onAnnounce,
}: ViewerShareButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<LinkState>({ status: "building" });
  /** Seconds; null = never expires, which stays the default (opt-in). */
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();

  const includeDiagram = diagram.id !== rootDiagramId;

  /* ---- building the link (kicked off by the trigger click) ---------------- */

  // Guards a slow encode against a close-and-reopen: only the newest build
  // may land its result.
  const buildTokenRef = useRef(0);

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
    (ttl: number | null) => {
      buildTokenRef.current += 1;
      const token = buildTokenRef.current;

      if (share.kind === "bundled") {
        const suffix = includeDiagram
          ? `#${SHARE_PARAM_DIAGRAM}=${encodeURIComponent(diagram.id)}`
          : "";
        // A bundled link points at a model that ships with the app; there is no
        // payload to expire, so the TTL control is not offered for these.
        setLink({
          status: "ready",
          url: `${window.location.origin}/view/${share.modelId}${suffix}`,
          expiresAt: null,
        });
        return;
      }

      if (!canEncodeShare()) {
        setLink({ status: "unsupported" });
        return;
      }

      setLink({ status: "building" });
      void (async () => {
        const alabText = serializeArchText(share.file);

        // Mint the expiry FIRST: it is the only step that can fail, and failing
        // after building a link would mean discarding a good one.
        let expiry: ShareExpiry | undefined;
        let expiryNote: string | undefined;
        if (ttl !== null) {
          const minted = await mintExpiry(await shareDigestFor(alabText), ttl);
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
          alabText,
          includeDiagram ? diagram.id : null,
          expiry,
        );
        if (token !== buildTokenRef.current) return;
        const url = `${window.location.origin}/view/new#${fragment}`;
        setLink(
          url.length > MAX_SHARE_URL_LENGTH
            ? { status: "too-long", length: url.length }
            : {
                status: "ready",
                url,
                expiresAt: expiry?.expiresAt ?? null,
                expiryNote,
              },
        );
      })();
    },
    // `ttlSeconds` is deliberately NOT a dependency: the value arrives as an
    // argument, so this callback is stable across dropdown changes.
    [share, diagram.id, includeDiagram],
  );

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    setCopied(false);
    buildLink(ttlSeconds);
    setOpen(true);
  }, [open, buildLink, ttlSeconds]);

  /** Change the expiry and rebuild at once — the fix for the stale-link bug. */
  const handleTtlChange = useCallback(
    (next: number | null) => {
      setTtlSeconds(next);
      buildLink(next);
    },
    [buildLink],
  );

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
      navigator.share({ title: modelTitle, url }).catch(() => {
        // Cancelled or blocked — the copy button remains the fallback.
      });
    },
    [modelTitle],
  );

  const handleDownload = useCallback(() => {
    if (share.kind !== "payload") return;
    const filename = `${fileStem(modelTitle)}${ARCHTEXT_EXTENSION}`;
    const blob = new Blob([serializeArchText(share.file)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    onAnnounce(`Downloaded ${filename}.`);
  }, [share, modelTitle, onAnnounce]);

  /* ---- render ------------------------------------------------------------------ */

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Share this model"
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
          /* Opens UPWARD — see the note on the Export menu: this strip is at
             the bottom of the shell, and in immersive mode there is nothing
             below the fold to scroll to. */
          className="absolute bottom-full left-0 z-50 mb-1.5 w-[min(22rem,calc(100vw-4rem))] rounded-lg border border-border bg-card p-4 shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:right-0 sm:left-auto"
        >
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            Share this model
          </h2>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {share.kind === "bundled"
              ? "This model ships with arch-lab, so the plain page address is the whole link — short and clean, with nothing to embed and nothing about you in it."
              : "Nothing is uploaded: the model travels inside the link itself, compressed into the part after # — which browsers never send to any server."}
          </p>

          {includeDiagram ? (
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
                onFocus={(event) => event.currentTarget.select()}
                className="mt-3 w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              {share.kind === "payload" ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {link.url.length.toLocaleString("en-US")} characters — within
                  the ~{MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character
                  limit that keeps links intact in chat apps and email.
                </p>
              ) : null}

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
                      . It is not a secret — anyone with the link can read the
                      model until then.
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
                  className={buttonClasses({ size: "sm" })}
                >
                  {copied ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                  {copied ? "Copied" : "Copy link"}
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
                    Download {ARCHTEXT_EXTENSION}
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
                  This model encodes to {link.length.toLocaleString("en-US")}{" "}
                  characters, and links beyond ~
                  {MAX_SHARE_URL_LENGTH.toLocaleString("en-US")} characters get
                  truncated by many chat apps, email clients and tools — the
                  recipient would open a broken diagram. Download the{" "}
                  {ARCHTEXT_EXTENSION} file and send that instead.
                </p>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className={buttonClasses({ size: "sm" })}
                >
                  <Download aria-hidden="true" />
                  Download {ARCHTEXT_EXTENSION}
                </button>
              </div>
            </>
          ) : null}

          {link.status === "unsupported" ? (
            <>
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-foreground">
                  This browser cannot build compressed share links (it lacks
                  CompressionStream). Download the {ARCHTEXT_EXTENSION} file and
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
                  Download {ARCHTEXT_EXTENSION}
                </button>
              </div>
            </>
          ) : null}

          <p className="mt-3 border-t border-border/60 pt-2.5 text-xs leading-relaxed text-muted-foreground">
            Anyone with the link can view the model — a link is not a secret,
            and sending it through a chat or email service shares the model with
            that service too.
          </p>
        </div>
      ) : null}
    </div>
  );
}
