"use client";

/**
 * The paste-your-own view mode (`/view/new`): one text area, two input
 * languages, one viewer.
 *
 *   - Paste arch-flow JSON or Mermaid C4 code. The format is auto-detected
 *     from the first meaningful line and ALWAYS shown; a radio group
 *     overrides detection when the user knows better.
 *   - Render on submit: the parsed model mounts the exact same read-only
 *     `ViewerShell` the registry models use — drill-down, connector details,
 *     export button, everything.
 *   - Errors keep their native precision. JSON failures list the validator's
 *     JSON-path issues; Mermaid failures quote the offending line and point
 *     a caret at the exact column. Never a bare "invalid input".
 *   - The converted-code panel shows the OTHER representation of whatever is
 *     loaded (Mermaid in → canonical JSON out; JSON in → Mermaid out). A
 *     Mermaid document describes ONE diagram, so that direction follows the
 *     level being viewed and says so.
 *
 * Everything runs in the browser: pasted content is parsed in memory and is
 * never uploaded or persisted anywhere.
 */

import { useCallback, useId, useMemo, useState } from "react";
import { ArrowDownToLine, Check, Copy, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getDiagram } from "../lib/model";
import {
  detectFormat,
  FORMAT_LABEL,
  type FormatChoice,
  type PastedFormat,
} from "../input/detect";
import { JSON_EXAMPLE, MERMAID_EXAMPLE } from "../input/examples";
import {
  mermaidTextForDiagram,
  parsePastedText,
  type PastedErrorDetail,
  type PastedModel,
} from "../input/parse-input";
import { ViewerShell } from "./viewer-shell";

const LEVEL_LABEL = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
} as const;

interface RenderedState {
  pasted: PastedModel;
  /** Monotonic — keys the shell so a new paste never inherits old state. */
  submission: number;
}

export function ViewerPlayground(): React.JSX.Element {
  const [text, setText] = useState(MERMAID_EXAMPLE);
  const [choice, setChoice] = useState<FormatChoice>("auto");
  const [rendered, setRendered] = useState<RenderedState | null>(null);
  const [error, setError] = useState<PastedErrorDetail | null>(null);
  const [currentDiagramId, setCurrentDiagramId] = useState<string | null>(null);

  const textareaId = useId();
  const detected = useMemo(() => detectFormat(text), [text]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const result = parsePastedText(text, choice);
      if (result.status === "ok") {
        setError(null);
        setCurrentDiagramId(result.value.model.rootDiagramId);
        setRendered((previous) => ({
          pasted: result.value,
          submission: (previous?.submission ?? 0) + 1,
        }));
      } else {
        setError(result.error);
        setRendered(null);
        setCurrentDiagramId(null);
      }
    },
    [text, choice],
  );

  const detectionSentence =
    choice !== "auto"
      ? `Format forced to ${FORMAT_LABEL[choice]} — auto-detection is off.`
      : detected !== null
        ? `Auto-detected format: ${FORMAT_LABEL[detected]}.`
        : text.trim() === ""
          ? "Paste a document to auto-detect its format."
          : "Format not recognised — pick JSON or Mermaid explicitly.";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8">
      <header className="max-w-3xl">
        <Badge variant="accent" className="mb-4">
          <span className="size-1.5 rounded-full bg-accent" />
          View mode · paste your own
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Render your own model
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Paste an{" "}
          <span className="font-mono text-sm text-foreground">
            .archflow.json
          </span>{" "}
          document or Mermaid C4 code (
          <span className="font-mono text-sm text-foreground">C4Context</span>,{" "}
          <span className="font-mono text-sm text-foreground">C4Container</span>
          , …) and render it in the same read-only viewer the demos use — then
          copy it back out in the other format, or export the diagram as an
          image. Everything stays in your browser: nothing you paste is uploaded
          or stored.
        </p>
      </header>

      {/* ---- input form ---------------------------------------------------- */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-foreground"
          >
            Model source — arch-flow JSON or Mermaid C4
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setText(MERMAID_EXAMPLE)}
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              <ArrowDownToLine aria-hidden="true" />
              Mermaid example
            </button>
            <button
              type="button"
              onClick={() => setText(JSON_EXAMPLE)}
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              <ArrowDownToLine aria-hidden="true" />
              JSON example
            </button>
          </div>
        </div>

        <textarea
          id={textareaId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          rows={14}
          className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex flex-wrap items-center gap-1.5">
            <legend className="sr-only">Input format</legend>
            {(["auto", "json", "mermaid"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  choice === option
                    ? "border-primary/50 bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="format"
                  value={option}
                  checked={choice === option}
                  onChange={() => setChoice(option)}
                  className="sr-only"
                />
                {option === "auto" ? "Auto-detect" : FORMAT_LABEL[option]}
              </label>
            ))}
          </fieldset>
          <button type="submit" className={buttonClasses({ size: "md" })}>
            <Play aria-hidden="true" />
            Render diagram
          </button>
        </div>

        {/* Detection is a convenience, never a trap: always say what it saw. */}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {detectionSentence}
        </p>
      </form>

      {/* ---- errors --------------------------------------------------------- */}
      {error !== null ? <PasteError error={error} /> : null}

      {/* ---- the rendered model --------------------------------------------- */}
      {rendered !== null ? (
        <>
          <section
            aria-label="Rendered diagram"
            className="flex h-[75vh] min-h-96 flex-col overflow-hidden rounded-xl border border-border shadow-sm"
          >
            <ViewerShell
              key={rendered.submission}
              model={rendered.pasted.model}
              onDiagramChange={setCurrentDiagramId}
            />
          </section>
          <ConvertedCode
            pasted={rendered.pasted}
            currentDiagramId={
              currentDiagramId ?? rendered.pasted.model.rootDiagramId
            }
          />
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Error presentation — precise, located, never a bare "invalid input"        */
/* -------------------------------------------------------------------------- */

function PasteError({
  error,
}: {
  error: PastedErrorDetail;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3.5"
    >
      {error.kind === "unknown-format" ? (
        <p className="text-sm leading-relaxed text-foreground">
          {error.message}
        </p>
      ) : null}

      {error.kind === "json" ? (
        <>
          <p className="text-sm font-medium text-foreground">
            This is not a valid{" "}
            <span className="font-mono">.archflow.json</span> document:
          </p>
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
        </>
      ) : null}

      {error.kind === "mermaid" ? (
        <>
          <p className="text-sm font-medium text-foreground">
            This is not valid Mermaid C4 code —{" "}
            <span className="font-mono">{error.message}</span>
          </p>
          {error.lineText !== null ? (
            // The offending line, quoted verbatim, caret at the column.
            <pre className="mt-2 overflow-x-auto rounded-md bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
              {`${String(error.line).padStart(4)} | ${error.lineText}\n`}
              <span aria-hidden="true">
                {`${" ".repeat(4)} | ${" ".repeat(Math.max(0, error.column - 1))}`}
                <span className="font-bold text-destructive">^</span>
              </span>
            </pre>
          ) : null}
          {error.issues.length > 1 ? (
            <ul className="mt-2 space-y-1">
              {error.issues.slice(1).map((issue) => (
                <li
                  key={`${issue.line}:${issue.column}:${issue.message}`}
                  className="font-mono text-xs text-muted-foreground"
                >
                  line {issue.line}, column {issue.column}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The converted-code panel: the OTHER representation of what is loaded       */
/* -------------------------------------------------------------------------- */

function ConvertedCode({
  pasted,
  currentDiagramId,
}: {
  pasted: PastedModel;
  currentDiagramId: string;
}): React.JSX.Element {
  const target: PastedFormat = pasted.format === "mermaid" ? "json" : "mermaid";
  const diagram = getDiagram(pasted.model, currentDiagramId);

  const code =
    target === "json"
      ? pasted.jsonText
      : mermaidTextForDiagram(pasted.file, currentDiagramId);

  const scopeSentence =
    target === "json"
      ? "The complete model — every level — as the same canonical JSON the editor saves."
      : `A Mermaid document describes one diagram at a time. This is the diagram you are viewing — ${diagram.title} (${LEVEL_LABEL[diagram.level]} view) — and it follows along as you drill up and down.`;

  return (
    <section
      aria-label={`Converted code — ${FORMAT_LABEL[target]}`}
      className="rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Converted to {FORMAT_LABEL[target]}
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {scopeSentence}
          </p>
        </div>
        <CopyButton text={code} label={`Copy the ${FORMAT_LABEL[target]}`} />
      </div>
      <pre className="max-h-96 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
        {code}
      </pre>
    </section>
  );
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
        /* Clipboard blocked — the code stays selectable below. */
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
