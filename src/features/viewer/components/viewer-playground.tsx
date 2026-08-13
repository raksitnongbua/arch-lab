"use client";

/**
 * `/view` — the live two-pane editor: the rendered diagram on top, with
 * arch-lab text (`.alab`) and arch-lab JSON side by side beneath it. Two
 * views, one model — edit either pane and the other follows.
 *
 * Sync mechanics (the correctness story):
 *   - There is ONE pending edit slot `{pane, value}`. Typing in a pane
 *     stores the edit there; a 300 ms debounce then parses it and, on
 *     success, rewrites ONLY the opposite pane and re-renders the diagram.
 *     The pane being typed in is never rewritten by the sync — that is what
 *     structurally rules out echo loops and mid-edit reformatting. A new
 *     keystroke in either pane replaces the slot and cancels the timer, so
 *     a stale parse can never land after the user has moved on.
 *   - Canonicalising your OWN pane is explicit: the per-pane Format button.
 *     Nothing reformats under the caret.
 *   - While a pane fails to parse, the last good model keeps rendering and
 *     the other pane keeps its content; the error shows inline under the
 *     offending pane. `.alab` errors quote the line with a caret at the
 *     column; JSON errors list the validator's JSON-path issues. One shared
 *     polite live region announces sync state and errors.
 *   - Mermaid C4 is an explicit, one-way, LOSSY import — never a third
 *     pane. Pasting Mermaid into either pane is auto-detected and offered
 *     as an import (with the lossy notice) instead of a misleading parse
 *     error.
 *
 * Everything runs in the browser: nothing typed here is uploaded or stored.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowDownToLine,
  Braces,
  Download,
  Import,
  X,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { CaretQuote } from "@/components/ui/caret-quote";
import { CopyButton } from "@/components/ui/copy-button";
import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { cn } from "@/lib/utils";

import { downloadBlob, sourceFileStem } from "../export/download";
import { MERMAID_EXAMPLE } from "../input/examples";
import {
  canonicalizePane,
  importMermaid,
  MERMAID_LOSSY_NOTICE,
  PANE_LABEL,
  parsePane,
  SEED_MODEL,
  type MermaidImportError,
  type PaneErrorDetail,
  type PaneId,
  type SyncedModel,
} from "../input/sync";
import {
  ShareLinkFailurePage,
  type ShareOpenFailure,
} from "@/components/share/share-link-failure";
import {
  SHARE_PENDING_CLASS,
  ShareOpening,
} from "@/components/share/share-opening";

import {
  canEncodeShare,
  decodeShareFragment,
  dropUrlFragment,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_FORWARD_ATTRIBUTE,
} from "../share/codec";
import { ViewerShell } from "./viewer-shell";

/**
 * How long a pane rests before its content is parsed and the other pane is
 * regenerated. 300 ms keeps typing smooth (no parse per keystroke) while
 * the mirror still feels live.
 */
const SYNC_DEBOUNCE_MS = 300;

/**
 * How long the model rests before the URL is rewritten. Longer than the pane
 * sync: rewriting costs a compress, and the address bar is not something anyone
 * watches keystroke by keystroke.
 */
const URL_SYNC_DEBOUNCE_MS = 800;

const JSON_EXTENSION = ".archlab.json";

interface PendingEdit {
  pane: PaneId;
  value: string;
}

interface PaneErrorState {
  pane: PaneId;
  error: PaneErrorDetail;
}

// A share link used to have two inline outcomes here, success and failure.
// Failure now takes over the page (`@/components/share/share-link-failure`,
// shared with the sequence playground so the two routes cannot drift), so the
// only thing left to say in place is that the model below arrived inside the
// URL — which is a flag, not a union.

export function ViewerPlayground(): React.JSX.Element {
  /* ---- state ---------------------------------------------------------- */

  const [aftText, setAftText] = useState(SEED_MODEL.aftText);
  const [jsonText, setJsonText] = useState(SEED_MODEL.jsonText);
  /** The last GOOD model — what the diagram renders, error or not. */
  const [synced, setSynced] = useState<SyncedModel>(SEED_MODEL);
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [paneError, setPaneError] = useState<PaneErrorState | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Remount the shell only when the diagram being viewed no longer exists
  // in the new model — otherwise drill-down position survives every edit.
  const [shellEpoch, setShellEpoch] = useState(0);
  const currentDiagramRef = useRef(SEED_MODEL.model.rootDiagramId);

  // Share links (`/view#m=…`): the model arrives inside the fragment.
  const [openedFromShare, setOpenedFromShare] = useState(false);
  const [sharedInitialDiagram, setSharedInitialDiagram] = useState<
    string | null
  >(null);
  /** A link that would not open; non-null takes over the whole page. */
  const [shareFailure, setShareFailure] = useState<ShareOpenFailure | null>(
    null,
  );

  // JSON is opt-in. `.alab` is the format this product asks people to write —
  // it is what the syntax reference documents, what share links carry, and
  // what reads in a diff. Showing both side by side gave them equal billing
  // and made the page look like it had two answers; the JSON is the on-disk
  // form, not a second thing to learn. Revealed by an explicit click, and
  // never hidden while it is the pane reporting an error.
  const [jsonVisible, setJsonVisible] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<MermaidImportError | null>(
    null,
  );
  const [lossyNoticeVisible, setLossyNoticeVisible] = useState(false);

  const aftPaneId = useId();
  const jsonPaneId = useId();
  const importTextareaId = useId();
  const editingHintId = useId();
  const sourceSectionId = useId();

  // Forced open when the JSON pane is the one that failed: an error nobody
  // can see is worse than an extra pane.
  const showJson = jsonVisible || paneError?.pane === "json";

  /* ---- adopting a successfully parsed model --------------------------- */

  const adoptSynced = useCallback(
    (next: SyncedModel, sourcePane: PaneId | null) => {
      setSynced(next);
      // Only ever rewrite the OTHER pane(s) — never the one being edited.
      if (sourcePane !== "aft") setAftText(next.aftText);
      if (sourcePane !== "json") setJsonText(next.jsonText);
      setPaneError(null);
      if (next.model.diagrams[currentDiagramRef.current] === undefined) {
        currentDiagramRef.current = next.model.rootDiagramId;
        setShellEpoch((epoch) => epoch + 1);
      }
    },
    [],
  );

  const applySync = useCallback(
    (pane: PaneId, value: string) => {
      const result = parsePane(pane, value);
      if (result.status === "ok") {
        adoptSynced(result.value, pane);
        setAnnouncement(
          pane === "aft"
            ? "Panes in sync — JSON regenerated and diagram updated."
            : "Panes in sync — text regenerated and diagram updated.",
        );
        return;
      }
      setPaneError({ pane, error: result.error });
      setAnnouncement(
        result.error.kind === "mermaid-detected"
          ? `The ${PANE_LABEL[pane]} pane looks like Mermaid C4 — use the import action to convert it.`
          : `${PANE_LABEL[pane]} has a problem — ${result.error.message}. The other pane and the diagram show the last good version.`,
      );
    },
    [adoptSynced],
  );

  // The debounce: one timer for the single pending edit; replaced (and the
  // old timer cancelled) on every keystroke in either pane.
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => {
      setPending(null);
      applySync(pending.pane, pending.value);
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [pending, applySync]);

  /* ---- opening a share link (`#m=…`) ------------------------------------ */
  // The fragment never reaches the server, so only the client can read it.
  // Read on mount (and again on hashchange, for a second link clicked in the
  // same tab); a decoded model replaces both panes exactly as an import
  // does, while a corrupt, truncated or lapsed payload takes over the page
  // instead of annotating the seed model with someone else's failure.

  useEffect(() => {
    let cancelled = false;

    const openFromHash = async () => {
      const decoded = await decodeShareFragment(window.location.hash);
      if (cancelled) return;

      /* HAND BACK THE PRE-PAINT FLAG — see the identical note in the sequence
         playground and `components/share/share-opening.tsx`. `data-share-forward`
         is stamped on <html> before first paint so the holding state stands in
         for the seeded model; the script cannot clear itself, so the page that
         resolved the payload does it, for every outcome including "no payload".
         Left standing it would blank this route for the rest of the session. */
      document.documentElement.removeAttribute(SHARE_FORWARD_ATTRIBUTE);

      // Clear every previous outcome before recording this one. `hashchange`
      // fires for a second link opened in the same tab, and a takeover left
      // standing would describe a link that is no longer in the address bar —
      // worse, a GOOD link would adopt its model invisibly behind the stale
      // error page. Reset covers "none" too: a fragment with no payload is not
      // a share link, so nothing about one should still be on screen.
      setShareFailure(null);
      setOpenedFromShare(false);

      switch (decoded.status) {
        case "none":
          return;

        case "error":
          // Takes over the page. No `setAnnouncement`: the polite live region
          // lives in the editor JSX below, which this path never renders —
          // the failure page carries its own `role="alert"` instead.
          setShareFailure({ kind: "broken", reason: decoded.message });
          return;

        case "expired":
          // Takes over the whole page rather than showing a banner above the
          // seed model — see `@/components/share/share-link-failure` for why a
          // notice over a working editor actively misleads. No announcement
          // for the same reason as "error": the page's `role="status"` is the
          // thing assistive tech hears.
          setShareFailure({ kind: "expired", expiresAt: decoded.expiresAt });
          return;

        case "ok": {
          const result = parsePane("aft", decoded.aftText);
          if (result.status !== "ok") {
            // Decoding succeeded and the text still will not parse, which in
            // practice means characters went missing from the MIDDLE of the
            // URL: a payload cut short at the end fails earlier, in
            // `decodeShareFragment`.
            setShareFailure({
              kind: "broken",
              reason:
                "the model inside it does not parse — characters appear to be " +
                "missing from the middle of the link, which happens when a long " +
                "URL is copied across a line wrap",
            });
            return;
          }

          setPending(null);
          adoptSynced(result.value, null);
          const target =
            decoded.diagramId !== null &&
            result.value.model.diagrams[decoded.diagramId] !== undefined
              ? decoded.diagramId
              : result.value.model.rootDiagramId;
          currentDiagramRef.current = target;
          setSharedInitialDiagram(target);
          setShellEpoch((epoch) => epoch + 1);
          setOpenedFromShare(true);
          setAnnouncement(
            "Opened a model from a share link — nothing was uploaded; both panes hold its source.",
          );
          return;
        }

        default: {
          // A NEW codec status must never fall through to a silently blank or
          // half-working page: this assignment fails `pnpm typecheck` the
          // moment `DecodedShare` grows a case this switch does not map to a
          // full-page outcome. `check:share-error-pages` asserts the guard
          // stays here.
          const _exhaustive: never = decoded;
          return _exhaustive;
        }
      }
    };

    void openFromHash();
    const onHashChange = () => {
      void openFromHash();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [adoptSynced]);

  /* ---- keeping the URL shareable as you edit ---------------------------- */
  /**
   * Rewrites `#m=…` to match the model on screen, so the address bar is always
   * a link you can paste — no Share click required.
   *
   * `history.replaceState`, for two reasons that both matter:
   *   - It does NOT fire `hashchange`. The effect above listens for that and
   *     re-decodes the fragment into both panes; if writing the URL triggered
   *     it, every keystroke would round-trip through a decode and stamp on the
   *     caret. `replaceState` is what makes this safe rather than a loop.
   *   - It does not push history. `pushState` per edit would bury the Back
   *     button under dozens of entries and make leaving the page a chore.
   *
   * Skipped while the model is still the untouched seed: landing on `/view` and
   * having the URL instantly grow a payload looks like something happened when
   * nothing did.
   *
   * Any `exp`/`sig` from an incoming link is deliberately dropped once the model
   * changes — that signature covers the ORIGINAL payload's digest and cannot be
   * valid for edited content. Keeping it would produce a link that refuses to
   * open; minting a fresh expiry belongs to the Share panel.
   */
  useEffect(() => {
    if (synced === SEED_MODEL) return;
    if (!canEncodeShare()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const fragment = await encodeShareFragment(
          synced.aftText,
          currentDiagramRef.current === synced.model.rootDiagramId
            ? null
            : currentDiagramRef.current,
        );
        if (cancelled) return;
        const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
        // Past the share HARD ceiling — not the handoff guard — because the
        // address bar's whole point here is to be copyable as a link: it must
        // track what the Share panel would hand over, and clear rather than
        // leave a stale fragment when the panel would refuse.
        window.history.replaceState(
          null,
          "",
          url.length > MAX_SHARE_URL_LENGTH
            ? window.location.pathname
            : `#${fragment}`,
        );
      })();
    }, URL_SYNC_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [synced]);

  /* ---- pane interactions ----------------------------------------------- */

  const handlePaneChange = useCallback((pane: PaneId, value: string) => {
    if (pane === "aft") setAftText(value);
    else setJsonText(value);
    setPending({ pane, value });
  }, []);

  const handleFormat = useCallback(
    (pane: PaneId) => {
      const value = pane === "aft" ? aftText : jsonText;
      setPending(null);
      const canonical = canonicalizePane(pane, value);
      if (canonical === null) {
        // Doesn't parse — surface the error now instead of formatting.
        applySync(pane, value);
        return;
      }
      if (pane === "aft") setAftText(canonical);
      else setJsonText(canonical);
      applySync(pane, canonical);
      setAnnouncement(`${PANE_LABEL[pane]} formatted to its canonical form.`);
    },
    [aftText, jsonText, applySync],
  );

  const handleImport = useCallback(
    (source: string) => {
      const result = importMermaid(source);
      if (result.status === "error") {
        setImportError(result.error);
        setImportOpen(true);
        setAnnouncement(
          `The Mermaid code has a problem — ${result.error.message}.`,
        );
        return;
      }
      setPending(null);
      adoptSynced(result.value, null);
      currentDiagramRef.current = result.value.model.rootDiagramId;
      setShellEpoch((epoch) => epoch + 1);
      setImportError(null);
      setImportOpen(false);
      setImportText("");
      setLossyNoticeVisible(true);
      setAnnouncement(
        "Imported from Mermaid — both panes replaced. Note: the conversion is lossy; details above the panes.",
      );
    },
    [adoptSynced],
  );

  // Reports which diagram is on screen so edits keep the drill-down place.
  // Also retires the share link's one-shot starting diagram: once the shell
  // is up, later remounts (edits that delete the current diagram) go back to
  // the model root, not to a stale deep link.
  const handleDiagramChange = useCallback((diagramId: string) => {
    currentDiagramRef.current = diagramId;
    setSharedInitialDiagram((current) => (current === null ? current : null));
  }, []);

  /* ---- Tab handling — indent, with a documented escape ------------------ */

  // After Escape, the next Tab moves focus instead of indenting.
  const tabEscapeRef = useRef(false);

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>, pane: PaneId) => {
      if (event.key === "Escape") {
        tabEscapeRef.current = true;
        return;
      }
      if (event.key === "Tab" && !event.shiftKey && !tabEscapeRef.current) {
        event.preventDefault();
        const el = event.currentTarget;
        el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
        handlePaneChange(pane, el.value);
      }
      tabEscapeRef.current = false;
    },
    [handlePaneChange],
  );

  /* ---- render ------------------------------------------------------------ */

  const stem = sourceFileStem(synced.model.title);

  // A link that did not open takes over the page. Returned BEFORE the editor so
  // the seed model is never on screen next to the message — the whole point is
  // that there is nothing here to mistake for what was shared.
  //
  const startFresh = () => {
    dropUrlFragment();
    setShareFailure(null);
  };

  if (shareFailure !== null) {
    return (
      <ShareLinkFailurePage
        failure={shareFailure}
        subject="model"
        startFreshLabel="Start your own model"
        onStartFresh={startFresh}
      />
    );
  }

  return (
    <>
      {/* Swapped in for the block below, pre-paint, while a share link is being
          opened — so the seeded model is never mistaken for the shared one.
          `display: none` unless the flag is set, so a normal visit pays
          nothing. */}
      <ShareOpening subject="model" />

      <div
        className={cn(
          SHARE_PENDING_CLASS,
          "mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8",
        )}
      >
        {/* ---- the rendered model ----------------------------------------------

           FIRST — above the heading, the notices and the panes alike. This
           page is a diagram tool: the diagram is the answer and everything
           else is either input or reference, so the answer is what you see on
           arrival with nothing to scroll past. (It used to sit below the hero
           block and the import row, which cost most of a phone screen before
           the canvas began.)

           Height is clamped rather than a flat 75vh: on a short laptop the
           old value left no hint that anything followed, and on a tall
           monitor it grew past what the diagram needs. The lower bound keeps
           it usable, the upper stops it from becoming the whole page. On a
           phone svh tracks the retracting browser chrome, where vh does not. */}
        {/* Fills the screen rather than 70% of it. The diagram is the reason the
          page exists; leaving a slice of the .alab pane peeking below the fold
          bought nothing and cost the canvas a third of its height on a laptop.

          `100svh` minus the sticky `h-16` header (4rem) and this container's
          `py-5` (1.25rem top and bottom) — `svh` so a phone's retracting browser
          chrome is tracked, which `vh` does not do. The `min-h` keeps it usable
          on a short window, where filling the viewport would leave a canvas too
          small to read. */}
        {/* The viewport-height budget lives on this WRAPPER, not on the canvas,
          and the two children split it: canvas `flex-1 min-h-0`, hint
          `shrink-0`. That is what keeps the hint on screen.

          Sizing the canvas itself to `100svh - 6.5rem` and appending the hint
          after it pushed their combined height past the viewport, so the one
          element whose job was to say "there is more below" was itself below the
          fold. Subtracting the hint's height instead would have worked until
          someone changed its padding. */}
        <div className="flex h-[calc(100svh-6.5rem)] min-h-[24rem] flex-col gap-2">
          <section
            aria-label="Rendered diagram"
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border shadow-sm"
          >
            <ViewerShell
              key={shellEpoch}
              model={synced.model}
              initialDiagramId={sharedInitialDiagram ?? undefined}
              share={{ kind: "payload", text: synced.aftText }}
              onDiagramChange={handleDiagramChange}
            />
          </section>

          {/* A button, not a decorative chevron: it performs the scroll, and it is
            reachable by keyboard — "scroll down" as prose is not. */}
          <button
            type="button"
            onClick={() => {
              document
                .getElementById(sourceSectionId)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="mx-auto flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowDownToLine aria-hidden="true" className="size-3.5" />
            Scroll for the <span className="font-mono">.alab</span> source
          </button>
        </div>

        {/* Deliberately compact: it is reference material people need once, not
          on every visit, so the detail collapses instead of occupying space. */}
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Write your own model
          </h1>
          <Badge variant="accent">
            <span className="size-1.5 rounded-full bg-accent" />
            live .alab editor
          </Badge>
          <p className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
            Write it in <span className="font-mono text-foreground">.alab</span>{" "}
            — readable, diffable, and lossless. Nothing leaves your browser.{" "}
            <Link
              href="/syntax"
              className="font-medium text-primary hover:underline"
            >
              Syntax reference
            </Link>
          </p>
        </header>

        <details className="group -mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer text-xs text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline">
            How .alab and JSON relate
          </summary>
          <p className="mt-2 max-w-3xl leading-relaxed">
            <span className="font-mono text-foreground">.alab</span> is the
            format to write: it is what the syntax reference documents, what
            share links carry, and what reads cleanly in a code review.{" "}
            <span className="font-mono text-foreground">.archlab.json</span> is
            the same model on disk — the interchange form any other tool can
            read without implementing a grammar. The two are lossless twins in
            both directions (proved on every build), so you never have to write
            the JSON by hand; show it when you want to see or paste it. Mermaid
            C4 can be imported, one-way. Nothing you type is uploaded or stored.
          </p>
        </details>

        {/* One shared live region for sync state and errors. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {/* ---- share-link outcome --------------------------------------------- */}
        {/* Success only. Failure never reaches here — it took over the page. */}
        {openedFromShare ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-semibold">Opened from a share link.</span>{" "}
              The model below travelled inside the link itself — nothing was
              uploaded, and nothing is stored. Both panes hold its source; any
              edits stay in your browser.
            </p>
            <button
              type="button"
              onClick={() => setOpenedFromShare(false)}
              aria-label="Dismiss the share link notice"
              className={buttonClasses({
                variant: "ghost",
                size: "sm",
                className: "shrink-0",
              })}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {/* ---- Mermaid import ------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen((open) => !open)}
            aria-expanded={importOpen}
            className={buttonClasses({ variant: "outline", size: "sm" })}
          >
            <Import aria-hidden="true" />
            Import from Mermaid
          </button>
          <p className="text-xs text-muted-foreground">
            One-way and lossy — converts Mermaid C4 into both panes.
          </p>
        </div>

        {importOpen ? (
          <MermaidImportPanel
            textareaId={importTextareaId}
            value={importText}
            onChange={setImportText}
            onImport={() => handleImport(importText)}
            error={importError}
          />
        ) : null}

        {lossyNoticeVisible ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-semibold">Imported from Mermaid.</span>{" "}
              {MERMAID_LOSSY_NOTICE}
            </p>
            <button
              type="button"
              onClick={() => setLossyNoticeVisible(false)}
              aria-label="Dismiss the Mermaid import notice"
              className={buttonClasses({
                variant: "ghost",
                size: "sm",
                className: "shrink-0",
              })}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {/* ---- the editor ------------------------------------------------------ */}
        <div
          // The scroll-hint button's target. `scroll-mt` clears the sticky header,
          // which would otherwise sit over the top of the pane we just scrolled to.
          id={sourceSectionId}
          className={cn(
            "grid min-w-0 scroll-mt-20 gap-4",
            showJson ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
          )}
        >
          <EditorPane
            pane="aft"
            textareaId={aftPaneId}
            hintId={editingHintId}
            heading="arch-lab text"
            extension={ARCHTEXT_EXTENSION}
            filename={`${stem}${ARCHTEXT_EXTENSION}`}
            mime="text/plain"
            value={aftText}
            error={paneError?.pane === "aft" ? paneError.error : null}
            onChange={handlePaneChange}
            onKeyDown={handleEditorKeyDown}
            onFormat={handleFormat}
            onImportMermaid={handleImport}
          />
          {showJson ? (
            <EditorPane
              pane="json"
              textareaId={jsonPaneId}
              hintId={editingHintId}
              heading="arch-lab JSON"
              extension={JSON_EXTENSION}
              filename={`${stem}${JSON_EXTENSION}`}
              mime="application/json"
              value={jsonText}
              error={paneError?.pane === "json" ? paneError.error : null}
              onChange={handlePaneChange}
              onKeyDown={handleEditorKeyDown}
              onFormat={handleFormat}
              onImportMermaid={handleImport}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            variant="outline"
            size="sm"
            aria-expanded={showJson}
            onClick={() => setJsonVisible((open) => !open)}
          >
            <Braces aria-hidden="true" />
            {showJson ? "Hide JSON" : "Show JSON"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {showJson
              ? "Both panes stay in sync — edit either one."
              : "The same model as .archlab.json, the format it saves to. You never have to write it by hand."}
          </p>
        </div>

        <p id={editingHintId} className="text-xs text-muted-foreground">
          Tab inserts two spaces inside the editor — press Escape, then Tab, to
          move focus out. Format rewrites a pane to its canonical form; nothing
          is reformatted while you type.
        </p>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* One editor pane: label, actions, textarea, inline error                     */
/* -------------------------------------------------------------------------- */

function EditorPane({
  pane,
  textareaId,
  hintId,
  heading,
  extension,
  filename,
  mime,
  value,
  error,
  onChange,
  onKeyDown,
  onFormat,
  onImportMermaid,
}: {
  pane: PaneId;
  textareaId: string;
  hintId: string;
  heading: string;
  extension: string;
  filename: string;
  mime: string;
  value: string;
  error: PaneErrorDetail | null;
  onChange: (pane: PaneId, value: string) => void;
  onKeyDown: (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    pane: PaneId,
  ) => void;
  onFormat: (pane: PaneId) => void;
  onImportMermaid: (source: string) => void;
}): React.JSX.Element {
  return (
    <section
      aria-label={`${heading} editor`}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={textareaId}
          className="text-sm font-medium text-foreground"
        >
          {heading}{" "}
          <span className="font-mono text-xs text-muted-foreground">
            ({extension})
          </span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onFormat(pane)}
            aria-label={`Format the ${heading} pane to its canonical form`}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            <AlignLeft aria-hidden="true" />
            Format
          </button>
          <CopyButton text={value} label={`Copy the ${heading}`} />
          <button
            type="button"
            onClick={() =>
              downloadBlob(new Blob([value], { type: mime }), filename)
            }
            aria-label={`Download the ${heading} as ${filename}`}
            className={buttonClasses({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden="true" />
            Download
          </button>
        </div>
      </div>

      <textarea
        id={textareaId}
        value={value}
        onChange={(event) => onChange(pane, event.target.value)}
        onKeyDown={(event) => onKeyDown(event, pane)}
        aria-describedby={hintId}
        aria-invalid={error !== null && error.kind !== "mermaid-detected"}
        spellCheck={false}
        rows={18}
        className={cn(
          "w-full min-w-0 resize-y rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          error !== null && error.kind !== "mermaid-detected"
            ? "border-destructive/60"
            : "border-border",
        )}
      />

      {error !== null ? (
        <PaneErrorBox
          heading={heading}
          error={error}
          onImportMermaid={onImportMermaid}
        />
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Errors — one shape, native precision, work always preserved                 */
/* -------------------------------------------------------------------------- */

function PaneErrorBox({
  heading,
  error,
  onImportMermaid,
}: {
  heading: string;
  error: PaneErrorDetail;
  onImportMermaid: (source: string) => void;
}): React.JSX.Element {
  if (error.kind === "mermaid-detected") {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3.5">
        <p className="text-sm leading-relaxed text-foreground">
          This looks like <span className="font-mono">Mermaid C4</span> code.
          Mermaid is a one-way import here, not a sync format — convert it into
          both panes instead. {MERMAID_LOSSY_NOTICE}
        </p>
        <button
          type="button"
          onClick={() => onImportMermaid(error.source)}
          className={buttonClasses({
            variant: "outline",
            size: "sm",
            className: "mt-2.5",
          })}
        >
          <Import aria-hidden="true" />
          Import this Mermaid code
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3.5">
      <p className="text-sm font-medium text-foreground">
        The {heading} doesn&apos;t parse —{" "}
        <span className="font-mono">{error.message}</span>
      </p>

      {error.kind === "aft" ? (
        <CaretQuoteWithIssues
          line={error.line}
          column={error.column}
          lineText={error.lineText}
          extraIssues={error.issues.slice(1).map((issue) => ({
            key: `${issue.line}:${issue.column}:${issue.message}`,
            text: `line ${issue.line}, column ${issue.column}: ${issue.message}`,
          }))}
        />
      ) : (
        <ul className="mt-2 space-y-1.5">
          {error.issues.map((issue) => (
            <li
              key={`${issue.path}:${issue.message}`}
              className="font-mono text-xs leading-relaxed break-words text-foreground"
            >
              <span className="font-semibold">{issue.path}</span>:{" "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-xs text-muted-foreground">
        Your work is safe — the other pane and the rendered diagram still show
        the last good version and will catch up once this parses.
      </p>
    </div>
  );
}

/** The offending line with its caret, plus any issues after the first. */
function CaretQuoteWithIssues({
  line,
  column,
  lineText,
  extraIssues,
}: {
  line: number;
  column: number;
  lineText: string | null;
  extraIssues: readonly { key: string; text: string }[];
}): React.JSX.Element {
  return (
    <>
      <CaretQuote line={line} column={column} lineText={lineText} />
      {extraIssues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {extraIssues.map((issue) => (
            <li
              key={issue.key}
              className="font-mono text-xs text-muted-foreground"
            >
              {issue.text}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Mermaid import panel                                                        */
/* -------------------------------------------------------------------------- */

function MermaidImportPanel({
  textareaId,
  value,
  onChange,
  onImport,
  error,
}: {
  textareaId: string;
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
  error: MermaidImportError | null;
}): React.JSX.Element {
  return (
    <section
      aria-label="Import from Mermaid"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={textareaId}
          className="text-sm font-medium text-foreground"
        >
          Mermaid C4 code
        </label>
        <button
          type="button"
          onClick={() => onChange(MERMAID_EXAMPLE)}
          className={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          <ArrowDownToLine aria-hidden="true" />
          Insert example
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {MERMAID_LOSSY_NOTICE} The converted model replaces both panes.
      </p>
      <textarea
        id={textareaId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        rows={8}
        className="w-full min-w-0 resize-y rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      {error !== null ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3.5">
          <p className="text-sm font-medium text-foreground">
            This is not valid Mermaid C4 code —{" "}
            <span className="font-mono">{error.message}</span>
          </p>
          <CaretQuoteWithIssues
            line={error.line}
            column={error.column}
            lineText={error.lineText}
            extraIssues={error.issues.slice(1).map((issue) => ({
              key: `${issue.line}:${issue.column}:${issue.message}`,
              text: `line ${issue.line}, column ${issue.column}: ${issue.message}`,
            }))}
          />
        </div>
      ) : null}
      <div>
        <button
          type="button"
          onClick={onImport}
          className={buttonClasses({ size: "md" })}
        >
          <Import aria-hidden="true" />
          Import — replaces both panes
        </button>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Copy & download                                                             */
/* -------------------------------------------------------------------------- */
