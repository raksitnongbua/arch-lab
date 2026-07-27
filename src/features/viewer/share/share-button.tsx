"use client";

/**
 * The view-mode Share control — a button beside Export opening a small
 * non-modal dialog. What it offers depends on where the model came from:
 *
 *   - BUNDLED models (`/view/atlas-shop` …) already live at a URL, so the
 *     plain page address is the share link — short and clean, no payload —
 *     and the panel says so instead of needlessly embedding one.
 *   - PASTED / edited models are encoded into the link itself: canonical
 *     `.aft` text, deflate-raw-compressed, base64url, in the `#` fragment
 *     (see `codec.ts`). Nothing is uploaded; fragments never reach servers.
 *
 * Either way, the link carries the diagram being viewed (`d=…`) when it is
 * not the root, so the recipient opens on what the sharer was looking at.
 *
 * Honesty about limits: past `MAX_SHARE_URL_LENGTH` the panel refuses to
 * mint a link that chat apps and email clients would truncate, says exactly
 * why, and offers the `.aft` file download instead. Browsers without
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
import type { ArchFlowFile, C4Diagram } from "@/types";

import { fileStem } from "../export/download";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_PARAM_DIAGRAM,
} from "./codec";

/** Where the model being viewed came from — decides what a share link is. */
export type ShareSource =
  | { kind: "bundled"; modelId: string }
  | { kind: "payload"; file: ArchFlowFile };

type LinkState =
  | { status: "building" }
  | { status: "ready"; url: string }
  /** The encoded link would exceed the safe URL length — no link is offered. */
  | { status: "too-long"; length: number }
  /** This browser cannot build compressed links (no CompressionStream). */
  | { status: "unsupported" };

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

  const buildLink = useCallback(() => {
    buildTokenRef.current += 1;
    const token = buildTokenRef.current;

    if (share.kind === "bundled") {
      const suffix = includeDiagram
        ? `#${SHARE_PARAM_DIAGRAM}=${encodeURIComponent(diagram.id)}`
        : "";
      setLink({
        status: "ready",
        url: `${window.location.origin}/view/${share.modelId}${suffix}`,
      });
      return;
    }

    if (!canEncodeShare()) {
      setLink({ status: "unsupported" });
      return;
    }

    setLink({ status: "building" });
    void (async () => {
      const fragment = await encodeShareFragment(
        serializeArchText(share.file),
        includeDiagram ? diagram.id : null,
      );
      if (token !== buildTokenRef.current) return;
      const url = `${window.location.origin}/view/new#${fragment}`;
      setLink(
        url.length > MAX_SHARE_URL_LENGTH
          ? { status: "too-long", length: url.length }
          : { status: "ready", url },
      );
    })();
  }, [share, diagram.id, includeDiagram]);

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    setCopied(false);
    buildLink();
    setOpen(true);
  }, [open, buildLink]);

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
          className="absolute left-0 z-50 mt-1.5 w-[min(22rem,calc(100vw-4rem))] rounded-lg border border-border bg-card p-4 shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:right-0 sm:left-auto"
        >
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            Share this model
          </h2>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {share.kind === "bundled"
              ? "This model ships with arch-flow, so the plain page address is the whole link — short and clean, with nothing to embed and nothing about you in it."
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
