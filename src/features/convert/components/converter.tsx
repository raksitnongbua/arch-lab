"use client";

/**
 * `/convert` — paste Mermaid, get the `.alab` text arch-lab stores.
 *
 * The conversion was always available and never ADDRESSABLE: it happened as a
 * side effect of pasting into one of the two playgrounds, and you had to know
 * which playground your Mermaid belonged to before you could find out. Here
 * the dialect is detected and the answer is the whole page — one output, a
 * copy button, a download, and a link into the playground that renders it.
 *
 * Deliberately NOT a diagram page. What this answers is "what does my Mermaid
 * look like as `.alab`", and putting a canvas next to the text would make the
 * text the supporting act; the hand-off link is one click from the drawing for
 * anyone who wanted that instead.
 *
 * Same contract as `/validate`, whose shape this follows: the result is
 * derived from the text (no Convert button, no stale output), `useDeferredValue`
 * keeps typing smooth on a long paste, and everything runs locally.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Info } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { HandoffLink } from "@/components/share/handoff-link";
import { Textarea } from "@/components/ui/textarea";
/* Deep, like the sequence feature's export button next door: the viewer's
   barrel is the whole viewer, and this page needs two file-naming helpers, not
   a canvas. `sourceFileStem` rather than a local slug so an untitled document
   downloads as `model.alab` here too. */
import {
  downloadBlob,
  sourceFileStem,
} from "@/features/viewer/export/download";
import { cn } from "@/lib/utils";

import { CONVERT_SAMPLES } from "../content/samples";
import {
  CONVERT_KIND_LABEL,
  CONVERT_PLAYGROUND_PATH,
  convertMermaid,
  type ConvertFailed,
  type ConvertOk,
  type ConvertResult,
} from "../lib/convert";

export function Converter(): React.JSX.Element {
  const [source, setSource] = useState("");
  const deferredSource = useDeferredValue(source);
  const result = useMemo(
    () => convertMermaid(deferredSource),
    [deferredSource],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      <Badge variant="accent" className="mb-6">
        <span className="size-1.5 rounded-full bg-accent" />
        Tools · Mermaid import
      </Badge>

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        Convert Mermaid to .alab
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-pretty text-muted-foreground">
        Paste a Mermaid C4 diagram or a{" "}
        <span className="font-mono text-base text-foreground">
          sequenceDiagram
        </span>{" "}
        — whichever it is is detected, and the{" "}
        <span className="font-mono text-base text-foreground">.alab</span> text
        arch-lab stores appears beside it. Import is one-way and lossy; what it
        drops is named under the result. Everything runs in your browser —
        nothing is uploaded.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SourcePane source={source} onSourceChange={setSource} />
        <ResultPane result={result} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

function SourcePane({
  source,
  onSourceChange,
}: {
  source: string;
  onSourceChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <section className="min-w-0">
      <label
        htmlFor="convert-source"
        className="text-sm font-medium text-foreground"
      >
        Mermaid source
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        {source === ""
          ? "Paste here, or load a sample below."
          : `${source.split(/\r?\n/).length} lines`}
      </p>

      <Textarea
        id="convert-source"
        value={source}
        onChange={(event) => onSourceChange(event.target.value)}
        spellCheck={false}
        placeholder={
          "sequenceDiagram\n  Alice->>Bob: Hello Bob\n  Bob-->>Alice: Hi Alice"
        }
        className="mt-3 h-[26rem] resize-y font-mono text-xs leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Load a sample:</span>
        {CONVERT_SAMPLES.map((sample) => (
          <Button
            key={sample.label}
            variant="outline"
            size="sm"
            onClick={() => onSourceChange(sample.source)}
          >
            {sample.label}
          </Button>
        ))}
        {source === "" ? null : (
          <Button variant="ghost" size="sm" onClick={() => onSourceChange("")}>
            Clear
          </Button>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

function ResultPane({ result }: { result: ConvertResult }): React.JSX.Element {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Conversion result"
      className="min-w-0"
    >
      {result.status === "ok" ? (
        <ConvertedCard result={result} />
      ) : result.status === "error" ? (
        <FailedCard result={result} />
      ) : (
        <IdleCard result={result} />
      )}
    </section>
  );
}

/**
 * The three non-result states, told apart by tone: "nothing yet" is quiet,
 * while "this is already .alab" and "this is JSON" are answers to a real
 * question and each carry the route that does what the reader meant.
 */
function IdleCard({
  result,
}: {
  result: Extract<ConvertResult, { status: "empty" }> | ConvertResult;
}): React.JSX.Element {
  const message = "message" in result ? result.message : "";
  const empty = result.status === "empty";
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        empty
          ? "border-border bg-card text-muted-foreground"
          : "border-accent/30 bg-accent/8 text-foreground",
      )}
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="leading-relaxed">
        <p>{message}</p>
        {result.status === "already-alab" ? (
          <p className="mt-2 flex flex-wrap gap-x-3">
            <Link
              href="/validate"
              className="font-medium text-primary hover:underline"
            >
              Validate it
            </Link>
            <Link
              href="/syntax"
              className="font-medium text-primary hover:underline"
            >
              Read the syntax
            </Link>
          </p>
        ) : null}
        {result.status === "not-mermaid" ? (
          <p className="mt-2">
            <Link
              href="/view/c4"
              className="font-medium text-primary hover:underline"
            >
              Open the C4 playground
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ConvertedCard({ result }: { result: ConvertOk }): React.JSX.Element {
  const filename = `${sourceFileStem(result.title)}.alab`;

  return (
    <div className="overflow-hidden rounded-lg border border-primary/30 bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-primary/8 px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          Converted to .alab
        </p>
        <Badge variant="outline">{CONVERT_KIND_LABEL[result.kind]}</Badge>
        <span className="ml-auto flex items-center gap-1.5">
          <CopyButton text={result.alabText} label="Copy the .alab text" />
          <button
            type="button"
            onClick={() =>
              downloadBlob(
                new Blob([result.alabText], {
                  type: "text/plain;charset=utf-8",
                }),
                filename,
              )
            }
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            <ArrowDownToLine aria-hidden="true" />
            {filename}
          </button>
        </span>
      </header>

      {/* The output is a READ-ONLY block, not a second editable pane: editing
          it would raise the question of what happens to the Mermaid beside it,
          and the answer — round-tripping back to Mermaid — is exactly what the
          importer cannot do. Copy it out and edit it where it will be
          rendered. */}
      <pre
        tabIndex={0}
        aria-label="Converted .alab text"
        className="max-h-[26rem] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <code>{result.alabText}</code>
      </pre>

      <div className="space-y-3 border-t border-border/60 px-4 py-4">
        <p className="rounded-md border border-accent/30 bg-accent/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {result.caveat}
        </p>
        <HandoffLink
          alabText={result.alabText}
          path={CONVERT_PLAYGROUND_PATH[result.kind]}
          label={`Open in the ${CONVERT_KIND_LABEL[result.kind]} playground`}
        />
      </div>
    </div>
  );
}

/**
 * A failure keeps the importer's own precision — line, column and the offending
 * line quoted with a caret, the format `/validate` and both playgrounds use, so
 * the same mistake reads the same way wherever it is met.
 */
function FailedCard({ result }: { result: ConvertFailed }): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-destructive/40 bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-destructive/8 px-4 py-3">
        <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
        <p className="text-sm font-medium text-foreground">
          This Mermaid does not parse
        </p>
        <Badge variant="outline">{CONVERT_KIND_LABEL[result.kind]}</Badge>
      </header>
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground">
          {result.message}
        </p>
        {result.lineText === null ? null : (
          <pre
            tabIndex={0}
            aria-label={`Source line ${result.line ?? ""}`}
            className="mt-2 overflow-x-auto rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <code>
              {result.lineText}
              {result.column === null
                ? null
                : `\n${" ".repeat(Math.max(0, result.column - 1))}^`}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
