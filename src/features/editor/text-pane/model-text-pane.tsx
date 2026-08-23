"use client";

/**
 * The live model text pane: the canvas's model as editable `.alab` text,
 * beside the canvas. A props-free store-reading slot —
 * mount it anywhere inside the editor.
 *
 * Sync mechanics (the correctness story):
 *   - One direction is live at a time, decided by `resolveDraft` (see
 *     `./draft.ts`, which is where the echo-loop argument lives). Typing
 *     opens a draft; the draft owns the textarea until the canvas moves
 *     somewhere the draft did not put it. Nothing the pane writes to the
 *     store can come back and rewrite the textarea, because a write-back
 *     leaves `base === live` and a draft whose base matches is never
 *     replaced.
 *   - A 300 ms debounce parses the draft; the parse never runs per
 *     keystroke, and a new keystroke cancels the timer, so a stale parse
 *     cannot land after the user has moved on.
 *   - While the text does not parse, the store is left alone: the canvas
 *     keeps the last VALID model and the error shows inline with a caret
 *     under the offending column. Half-typed text never reaches the canvas
 *     and never clears it.
 *   - Canonicalising is explicit — the Format button. Nothing is reformatted
 *     while typing.
 *
 * Write-back uses `replaceModel`, the documented persistence seam, which
 * loads the text edit the way opening a file does: it RESETS undo history
 * and selection. That is honest for an edit that can restructure the whole
 * model, but it means a text edit is not undoable on the canvas — so an edit
 * that parses to the model already on screen is detected and skipped rather
 * than pushed, and the drill-down position is restored afterwards.
 *
 * The `.archlab.json` view is read-only: it is the same model through the
 * editor's file serializer, offered for copying and diffing, not as a second
 * editable surface (that pane exists at `/live`).
 */

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AlignLeft, CircleAlert, CircleCheck, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CaretQuote } from "@/components/ui/caret-quote";
import { buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ARCHTEXT_EXTENSION } from "@/features/archtext";
import { cn } from "@/lib/utils";

import { useEditorStore } from "../state";
import { resolveDraft, type TextDraft } from "./draft";
import {
  canonicalizeModelText,
  modelJsonText,
  parseModelText,
  renderModel,
  type ModelTextError,
} from "./sync";

/**
 * How long the text rests before it is parsed and pushed to the canvas.
 * 300 ms keeps typing smooth (no parse per keystroke) while the canvas still
 * feels live — the same figure the viewer's two-pane editor settled on.
 */
const PARSE_DEBOUNCE_MS = 300;

type ViewId = "text" | "json";

export function ModelTextPane(): React.JSX.Element {
  const model = useEditorStore((state) => state.model);
  const rendered = useMemo(() => renderModel(model), [model]);
  /** The canvas's model as text — the pane's baseline for every comparison. */
  const live = rendered.status === "ok" ? rendered.text : "";

  const [view, setView] = useState<ViewId>("text");
  const [draft, setDraft] = useState<TextDraft | null>(null);
  /** The edit waiting for the debounce. A fresh object per keystroke, so an
   *  identical re-typed value still restarts the timer. */
  const [pending, setPending] = useState<{ text: string } | null>(null);
  const [error, setError] = useState<ModelTextError | null>(null);

  const textareaId = useId();
  const statusId = useId();
  const hintId = useId();

  const effective = resolveDraft(draft, live);
  // A draft the canvas has superseded takes its error off screen with it.
  const visibleError = effective.following ? null : error;

  /* ---- parsing and write-back ------------------------------------------ */

  // Reads the store imperatively: the write-back must act on the model as it
  // is at the moment the timer fires, not on a value captured a keystroke
  // ago, and subscribing here would rebuild the timer on every canvas change.
  const applyEdit = useCallback((text: string) => {
    const result = parseModelText(text);
    if (result.status === "error") {
      setError(result.error);
      return;
    }
    setError(null);

    const store = useEditorStore.getState();
    const current = renderModel(store.model);
    if (current.status === "ok" && current.text === result.value.text) {
      // The text describes exactly the model already on the canvas (a
      // comment, a reordering, different spacing). Pushing it would reset
      // history and selection for no model change at all.
      setDraft({ text, base: result.value.text, synced: true });
      return;
    }

    const previousDiagramId = store.activeDiagramId;
    store.replaceModel(result.value.model, { markSaved: false });

    // `replaceModel` reopens the model at its root. Put the user back where
    // they were looking when that diagram survived the edit —
    // `setActiveDiagram` is view state and never a history entry.
    const next = useEditorStore.getState();
    if (
      previousDiagramId !== next.activeDiagramId &&
      next.model.diagrams[previousDiagramId] !== undefined
    ) {
      next.setActiveDiagram(previousDiagramId);
    }
    setDraft({ text, base: result.value.text, synced: true });
  }, []);

  // The debounce: one timer for the single pending edit, replaced (and the
  // old timer cancelled) on every keystroke.
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => {
      setPending(null);
      applyEdit(pending.text);
    }, PARSE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [pending, applyEdit]);

  /* ---- interactions ------------------------------------------------------ */

  const handleChange = useCallback(
    (text: string) => {
      setDraft({ text, base: effective.base, synced: false });
      setPending({ text });
    },
    [effective.base],
  );

  const handleFormat = useCallback(() => {
    const canonical = canonicalizeModelText(effective.value);
    setPending(null);
    if (canonical === null) {
      // Doesn't parse — show why, now, instead of formatting.
      applyEdit(effective.value);
      return;
    }
    setDraft({ text: canonical, base: effective.base, synced: false });
    applyEdit(canonical);
  }, [effective.base, effective.value, applyEdit]);

  /** Abandons the draft; the pane goes back to mirroring the canvas. */
  const handleReload = useCallback(() => {
    setPending(null);
    setError(null);
    setDraft(null);
  }, []);

  /* ---- render ------------------------------------------------------------ */

  if (rendered.status === "error") {
    return (
      <section
        aria-label="Model text"
        className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 bg-background p-3"
      >
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-destructive"
        >
          This model cannot be shown as {ARCHTEXT_EXTENSION} text —{" "}
          <span className="font-mono text-xs">{rendered.message}</span>. The
          canvas is unaffected; save the model as{" "}
          <span className="font-mono text-xs">.archlab.json</span> to keep your
          work.
        </p>
      </section>
    );
  }

  const isJson = view === "json";
  // A model that renders as text always serializes as JSON too; the null
  // branch is a guard, not a state the user is expected to reach.
  const jsonText = isJson ? (modelJsonText(model) ?? "") : "";
  const value = isJson ? jsonText : effective.value;

  return (
    <section
      aria-label="Model text"
      className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 bg-background p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={textareaId}
          className="text-sm font-medium text-foreground"
        >
          Model text
        </label>
        <div className="flex items-center gap-1.5">
          <Select
            aria-label="Text format shown in the pane"
            value={view}
            onChange={(event) => setView(event.target.value as ViewId)}
            className="w-40"
          >
            <option value="text">{ARCHTEXT_EXTENSION} — editable</option>
            <option value="json">.archlab.json — read-only</option>
          </Select>
          {isJson ? null : (
            <button
              type="button"
              onClick={handleFormat}
              aria-label="Rewrite the text in its canonical form"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              <AlignLeft aria-hidden="true" />
              Format
            </button>
          )}
        </div>
      </div>

      <StatusLine
        id={statusId}
        summary={rendered.summary}
        error={visibleError}
        pending={pending !== null}
        readOnly={isJson}
      />

      {effective.stale && !isJson ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5">
          <p className="text-xs leading-relaxed text-foreground">
            The canvas changed while these edits were unfinished, so the text
            below no longer describes what is on screen. Keep editing to
            overwrite the canvas, or reload the model text.
          </p>
          <button
            type="button"
            onClick={handleReload}
            className={buttonClasses({
              variant: "outline",
              size: "sm",
              className: "shrink-0",
            })}
          >
            <RotateCcw aria-hidden="true" />
            Reload
          </button>
        </div>
      ) : null}

      <textarea
        id={textareaId}
        value={value}
        readOnly={isJson}
        onChange={(event) => handleChange(event.target.value)}
        aria-describedby={`${statusId} ${hintId}`}
        aria-invalid={visibleError !== null && !isJson}
        spellCheck={false}
        className={cn(
          "min-h-40 w-full min-w-0 flex-1 resize-none rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          visibleError !== null && !isJson
            ? "border-destructive/60"
            : "border-border",
        )}
      />

      {visibleError !== null && !isJson ? (
        <ErrorBox error={visibleError} />
      ) : null}

      <p id={hintId} className="text-xs text-muted-foreground">
        {isJson
          ? "Read-only: the canvas is the source of truth for this view."
          : "Edits reach the canvas once they parse; nothing is reformatted while you type."}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Status — one polite live region for the pane's whole state                  */
/* -------------------------------------------------------------------------- */

function StatusLine({
  id,
  summary,
  error,
  pending,
  readOnly,
}: {
  id: string;
  summary: string;
  error: ModelTextError | null;
  pending: boolean;
  readOnly: boolean;
}): React.JSX.Element {
  const problems = error === null ? 0 : Math.max(1, error.issues.length);

  return (
    <p
      id={id}
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
    >
      {error !== null && !readOnly ? (
        <>
          <Badge className="border-destructive/40 bg-destructive/10 text-destructive">
            <CircleAlert aria-hidden="true" className="size-3" />
            {problems} {problems === 1 ? "problem" : "problems"}
          </Badge>
          <span>The canvas still shows the last valid model.</span>
        </>
      ) : (
        <>
          <Badge variant="accent">
            <CircleCheck aria-hidden="true" className="size-3" />
            {pending && !readOnly ? "Checking…" : "Valid"}
          </Badge>
          <span>{summary}</span>
        </>
      )}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Errors — the parser's own precision, work always preserved                  */
/* -------------------------------------------------------------------------- */

function ErrorBox({ error }: { error: ModelTextError }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">
        This text doesn&apos;t parse —{" "}
        <span className="font-mono break-words">{error.message}</span>
      </p>

      {error.kind === "syntax" ? (
        <>
          <CaretQuote
            line={error.line}
            column={error.column}
            lineText={error.lineText}
          />
          {error.issues.length > 1 ? (
            <ul className="mt-2 space-y-1">
              {error.issues.slice(1).map((issue) => (
                <li
                  key={`${issue.line}:${issue.column}:${issue.message}`}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {`line ${issue.line}, column ${issue.column}: ${issue.message}`}
                </li>
              ))}
            </ul>
          ) : null}
        </>
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

      <p className="mt-2 text-xs text-muted-foreground">
        Your text is kept exactly as typed — the canvas catches up as soon as it
        parses.
      </p>
    </div>
  );
}
