"use client";

/**
 * `/view/new` — the live two-pane editor: arch-lab text (`.alab`) and
 * arch-lab JSON side by side over the rendered diagram. Two views, one
 * model — edit either pane and the other follows.
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
  Check,
  Copy,
  Download,
  Import,
  X,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { cn } from "@/lib/utils";

import { MERMAID_EXAMPLE } from "../input/examples";
import {
  canonicalizePane,
  downloadStem,
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
import { decodeShareFragment } from "../share/codec";
import { ViewerShell } from "./viewer-shell";

/**
 * How long a pane rests before its content is parsed and the other pane is
 * regenerated. 300 ms keeps typing smooth (no parse per keystroke) while
 * the mirror still feels live.
 */
const SYNC_DEBOUNCE_MS = 300;

const JSON_EXTENSION = ".archlab.json";

interface PendingEdit {
  pane: PaneId;
  value: string;
}

interface PaneErrorState {
  pane: PaneId;
  error: PaneErrorDetail;
}

/** Outcome of trying to open a `#m=…` share link on this page. */
type SharedLinkNotice = { kind: "opened" } | { kind: "error"; message: string };

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

  // Share links (`/view/new#m=…`): the model arrives inside the fragment.
  const [sharedNotice, setSharedNotice] = useState<SharedLinkNotice | null>(
    null,
  );
  const [sharedInitialDiagram, setSharedInitialDiagram] = useState<
    string | null
  >(null);

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
  // does, and a corrupt or truncated payload becomes a visible error — the
  // seed model keeps rendering underneath.

  useEffect(() => {
    let cancelled = false;

    const openFromHash = async () => {
      const decoded = await decodeShareFragment(window.location.hash);
      if (cancelled || decoded.status === "none") return;

      if (decoded.status === "error") {
        setSharedNotice({ kind: "error", message: decoded.message });
        setAnnouncement(
          `This share link could not be opened — ${decoded.message}.`,
        );
        return;
      }

      const result = parsePane("aft", decoded.aftText);
      if (result.status !== "ok") {
        const message =
          "the model inside it does not parse — the link was probably truncated or altered by the app that carried it";
        setSharedNotice({ kind: "error", message });
        setAnnouncement(`This share link could not be opened — ${message}.`);
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
      setSharedNotice({ kind: "opened" });
      setAnnouncement(
        "Opened a model from a share link — nothing was uploaded; both panes hold its source.",
      );
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

  const stem = downloadStem(synced.model.title);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8">
      {/* Deliberately compact. Every line here pushes the diagram down, and
          the detail below is reference material people need once, not on
          every visit — so it collapses instead of occupying the fold. */}
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Write your own model
        </h1>
        <Badge variant="accent">
          <span className="size-1.5 rounded-full bg-accent" />
          live two-pane editor
        </Badge>
        <p className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
          <span className="font-mono text-foreground">.alab</span> and{" "}
          <span className="font-mono text-foreground">.archlab.json</span>, in
          sync — edit either, nothing leaves your browser.{" "}
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
          How the two panes work
        </summary>
        <p className="mt-2 max-w-3xl leading-relaxed">
          The same model in two languages. Edit either pane and the other
          regenerates as you type — both are lossless, so nothing is dropped in
          either direction. Mermaid C4 can be imported (one-way). Everything
          stays in your browser: nothing you type is uploaded or stored.
        </p>
      </details>

      {/* One shared live region for sync state and errors. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ---- share-link outcome --------------------------------------------- */}
      {sharedNotice !== null ? (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg border px-4 py-3",
            sharedNotice.kind === "opened"
              ? "border-accent/40 bg-accent/10"
              : "border-destructive/40 bg-destructive/5",
          )}
        >
          <p className="text-sm leading-relaxed text-foreground">
            {sharedNotice.kind === "opened" ? (
              <>
                <span className="font-semibold">Opened from a share link.</span>{" "}
                The model below travelled inside the link itself — nothing was
                uploaded, and nothing is stored. Both panes hold its source; any
                edits stay in your browser.
              </>
            ) : (
              <>
                <span className="font-semibold">
                  This share link could not be opened
                </span>{" "}
                — {sharedNotice.message}. Ask the sender to re-copy the link, or
                to send the <span className="font-mono text-xs">.alab</span>{" "}
                file instead. The example model is shown below.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setSharedNotice(null)}
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

      {/* ---- the rendered model ----------------------------------------------

           FIRST, before the editors. This page is a diagram tool: the diagram
           is the answer and the panes are the input, so the answer must be
           what you see on arrival. It used to sit below two full-height
           textareas under a hero block, which put it off-screen entirely —
           you had to scroll to find out whether what you pasted had worked.

           Height is clamped rather than a flat 75vh: on a short laptop the
           old value left no hint that anything followed, and on a tall
           monitor it grew past what the diagram needs. The lower bound keeps
           it usable, the upper stops it from becoming the whole page. */}
      <section
        aria-label="Rendered diagram"
        className="flex h-[clamp(28rem,68vh,54rem)] flex-col overflow-hidden rounded-xl border border-border shadow-sm"
      >
        <ViewerShell
          key={shellEpoch}
          model={synced.model}
          initialDiagramId={sharedInitialDiagram ?? undefined}
          share={{ kind: "payload", file: synced.file }}
          onDiagramChange={handleDiagramChange}
        />
      </section>

      {/* ---- the two panes -------------------------------------------------- */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
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
      </div>
      <p id={editingHintId} className="text-xs text-muted-foreground">
        Tab inserts two spaces inside the editors — press Escape, then Tab, to
        move focus out. Format rewrites a pane to its canonical form; nothing is
        reformatted while you type.
      </p>
    </div>
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
            onClick={() => downloadTextFile(filename, value, mime)}
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
        <CaretQuote
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

/** The offending line, quoted verbatim, caret at the column. */
function CaretQuote({
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
      {lineText !== null ? (
        <pre className="mt-2 overflow-x-auto rounded-md bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
          {`${String(line).padStart(4)} | ${lineText}\n`}
          <span aria-hidden="true">
            {`${" ".repeat(4)} | ${" ".repeat(Math.max(0, column - 1))}`}
            <span className="font-bold text-destructive">^</span>
          </span>
        </pre>
      ) : null}
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
          <CaretQuote
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

function downloadTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CopyButton({
  text,
  label,
}: {
  text: string;
  label: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      })
      .catch(() => {
        /* Clipboard blocked — the text stays selectable in the pane. */
      });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : label}
      className={buttonClasses({ variant: "outline", size: "sm" })}
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
