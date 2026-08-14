"use client";

/**
 * `/convert` — paste Mermaid, WATCH it become a diagram, take the `.alab`.
 *
 * The first version of this page was a paste box beside a wall of text, and
 * that was the wrong shape for the job: someone arriving with Mermaid wants
 * to know it worked, and a block of unfamiliar syntax is not evidence of
 * that. A drawing is. So the diagram is now half the page and it renders
 * live — through the SAME components the two playgrounds use
 * (`ViewerShell`, `SequenceViewer`), so what you see here is what you get
 * there, not a preview that could disagree.
 *
 * THE TOGGLE IS THE PAGE'S IDEA. One pane, two faces: `Mermaid` is the
 * editable input, `.alab` is what it became. Switching is a segmented
 * control, so "what does this look like in the other format?" costs one
 * click and no scrolling, and the two are never on screen fighting for the
 * same column of a small window.
 *
 * WHY `.alab` IS READ-ONLY. Editing it would raise the question of what
 * happens to the Mermaid beside it, and the answer — regenerating Mermaid
 * from a model — is precisely what a one-way importer cannot do. The pane
 * copies and downloads instead, and the hand-off link opens the document in
 * the playground that CAN edit it.
 *
 * Same derive-don't-store contract as `/validate`: the result is a function
 * of the text (no Convert button, no stale output), `useDeferredValue` keeps
 * typing smooth, and nothing is uploaded.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Info } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { HandoffLink } from "@/components/share/handoff-link";
import { SequenceViewer } from "@/features/sequence";
/* Deep, like the sequence feature's export button next door: the viewer's
   barrel is the whole viewer, and this page needs two file-naming helpers,
   not a canvas. `sourceFileStem` rather than a local slug so an untitled
   document downloads as `model.alab` here too. */
import {
  downloadBlob,
  sourceFileStem,
} from "@/features/viewer/export/download";
import { ViewerShell } from "@/features/viewer";
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

/** Which face of the source pane is showing. */
type Face = "mermaid" | "alab";

export function Converter(): React.JSX.Element {
  const [source, setSource] = useState<string>(CONVERT_SAMPLES[0].source);
  const [face, setFace] = useState<Face>("mermaid");
  const deferredSource = useDeferredValue(source);
  const result = useMemo(
    () => convertMermaid(deferredSource),
    [deferredSource],
  );

  /**
   * The LAST GOOD conversion, which is what the diagram shows. Same rule both
   * playgrounds follow while a pane is mid-edit: a half-typed line should not
   * blank the drawing, because a blank canvas explains nothing and the error
   * is already stated under the pane.
   */
  const [lastGood, setLastGood] = useState<ConvertOk | null>(null);
  if (result.status === "ok" && result !== lastGood) {
    /* Derived during render rather than in an effect — the repo's rule (see
       `viewer-playground`): storing it in an effect would paint one frame of
       the previous diagram beside the new text. */
    setLastGood(result);
  }
  const shown = result.status === "ok" ? result : lastGood;

  /* An empty pane means "start over", not "keep the last diagram on screen":
     the two would disagree about what the page is showing. */
  const preview = source.trim() === "" ? null : shown;

  const loadSample = (text: string): void => {
    setSource(text);
    setFace("mermaid");
  };

  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-4 px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Mermaid → <span className="font-mono">.alab</span>
        </h1>
        <Badge variant="accent">
          <span className="size-1.5 rounded-full bg-accent" />
          one-way
        </Badge>
        <p className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
          Paste a Mermaid C4 diagram or a{" "}
          <span className="font-mono text-foreground">sequenceDiagram</span> —
          whichever it is is detected, drawn on the right, and available as{" "}
          <span className="font-mono text-foreground">.alab</span> from the
          toggle. Nothing leaves your browser.
        </p>
      </header>

      <div className="grid min-h-0 gap-4 lg:grid-cols-2">
        <SourcePane
          source={source}
          onSourceChange={setSource}
          face={face}
          onFaceChange={setFace}
          result={result}
          converted={shown}
          onLoadSample={loadSample}
        />
        <PreviewPane result={result} preview={preview} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The one pane with two faces                                                 */
/* -------------------------------------------------------------------------- */

function SourcePane({
  source,
  onSourceChange,
  face,
  onFaceChange,
  result,
  converted,
  onLoadSample,
}: {
  source: string;
  onSourceChange: (value: string) => void;
  face: Face;
  onFaceChange: (face: Face) => void;
  result: ConvertResult;
  /** The last good conversion — what the `.alab` face shows. */
  converted: ConvertOk | null;
  onLoadSample: (text: string) => void;
}): React.JSX.Element {
  const alabText = converted?.alabText ?? "";
  const filename =
    converted === null
      ? "model.alab"
      : `${sourceFileStem(converted.title)}.alab`;

  return (
    <section
      aria-label="Source"
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-2.5 py-1.5">
        {/* A radiogroup, not two buttons: they are one choice with two
            values, and a screen reader should hear it that way — "Mermaid,
            selected, 1 of 2" rather than two unrelated toggles. */}
        <div
          role="radiogroup"
          aria-label="Which format to show"
          className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
        >
          <FaceTab
            face="mermaid"
            current={face}
            onSelect={onFaceChange}
            label="Mermaid"
            hint="The source you paste"
          />
          <FaceTab
            face="alab"
            current={face}
            onSelect={onFaceChange}
            label=".alab"
            hint="What it converts to"
            /* Nothing to show until something converts, and a tab that opens
               an empty pane is worse than one you cannot press yet. */
            disabled={converted === null}
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {face === "alab" && converted !== null ? (
            <>
              <CopyButton text={alabText} label="Copy the .alab text" />
              <button
                type="button"
                onClick={() =>
                  downloadBlob(
                    new Blob([alabText], { type: "text/plain;charset=utf-8" }),
                    filename,
                  )
                }
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                <ArrowDownToLine aria-hidden="true" />
                <span className="hidden sm:inline">{filename}</span>
              </button>
            </>
          ) : (
            CONVERT_SAMPLES.map((sample) => (
              <Button
                key={sample.label}
                variant="ghost"
                size="sm"
                onClick={() => onLoadSample(sample.source)}
              >
                {sample.label}
              </Button>
            ))
          )}
        </div>
      </div>

      {/* Both faces are MOUNTED, one hidden: unmounting the textarea would
          throw away the browser's undo stack and the caret position every
          time someone glanced at the other format. */}
      <div className="min-h-0 flex-1">
        <textarea
          value={source}
          onChange={(event) => onSourceChange(event.target.value)}
          spellCheck={false}
          aria-label="Mermaid source"
          aria-invalid={result.status === "error"}
          placeholder={
            "sequenceDiagram\n  Alice->>Bob: Hello Bob\n  Bob-->>Alice: Hi Alice"
          }
          className={cn(
            "h-full min-h-[22rem] w-full resize-none bg-transparent px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none",
            face === "mermaid" ? "block" : "hidden",
          )}
        />
        {face === "alab" ? (
          <pre
            tabIndex={0}
            aria-label="Converted .alab text"
            className="h-full min-h-[22rem] overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <code>{alabText}</code>
          </pre>
        ) : null}
      </div>

      <Verdict result={result} converted={converted} />
    </section>
  );
}

function FaceTab({
  face,
  current,
  onSelect,
  label,
  hint,
  disabled = false,
}: {
  face: Face;
  current: Face;
  onSelect: (face: Face) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}): React.JSX.Element {
  const selected = current === face;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      title={hint}
      onClick={() => onSelect(face)}
      className={cn(
        "rounded-md px-2.5 py-1 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* The verdict strip under the pane                                            */
/* -------------------------------------------------------------------------- */

/**
 * One row, always present, saying what the text currently is. It replaced a
 * card the size of the output because the answer is a sentence — and on the
 * happy path the DIAGRAM is the answer, so the words should get out of its
 * way.
 */
function Verdict({
  result,
  converted,
}: {
  result: ConvertResult;
  converted: ConvertOk | null;
}): React.JSX.Element {
  if (result.status === "error") {
    return <FailedRow result={result} />;
  }

  if (result.status === "ok") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-primary/5 px-3 py-2 text-xs">
        <span className="font-medium text-foreground">
          Converted to a {CONVERT_KIND_LABEL[result.kind]}
        </span>
        <details className="min-w-0 text-muted-foreground">
          <summary className="cursor-pointer marker:content-none">
            what the import dropped
          </summary>
          <p className="mt-1 leading-relaxed">{result.caveat}</p>
        </details>
        <span className="ml-auto">
          <HandoffLink
            alabText={result.alabText}
            path={CONVERT_PLAYGROUND_PATH[result.kind]}
            label={`Open in the ${CONVERT_KIND_LABEL[result.kind]} playground`}
          />
        </span>
      </div>
    );
  }

  /* The three non-answers, each with the route that does what the reader
     meant — a parse error would hide all three behind "this is not Mermaid". */
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <Info aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0">{result.message}</span>
      {result.status === "already-alab" ? (
        <Link
          href="/validate"
          className="font-medium text-primary hover:underline"
        >
          Validate it
        </Link>
      ) : null}
      {result.status === "not-mermaid" ? (
        <Link
          href="/view/c4"
          className="font-medium text-primary hover:underline"
        >
          Open the C4 playground
        </Link>
      ) : null}
      {converted !== null ? (
        <span className="ml-auto">
          the diagram still shows the last good version
        </span>
      ) : null}
    </div>
  );
}

/**
 * A failure keeps the importer's own precision — line, column and the
 * offending line quoted with a caret, the format `/validate` and both
 * playgrounds use, so the same mistake reads the same way wherever it is met.
 */
function FailedRow({ result }: { result: ConvertFailed }): React.JSX.Element {
  return (
    <div className="border-t border-destructive/40 bg-destructive/5 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-foreground">
        <AlertTriangle
          aria-hidden="true"
          className="size-3.5 shrink-0 self-center text-destructive"
        />
        <span className="font-medium">
          This {CONVERT_KIND_LABEL[result.kind]} does not parse
        </span>
        <span className="min-w-0 text-muted-foreground">{result.message}</span>
      </p>
      {result.lineText === null ? null : (
        <pre
          tabIndex={0}
          aria-label={`Source line ${result.line ?? ""}`}
          className="mt-1.5 overflow-x-auto rounded-md bg-secondary/60 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
  );
}

/* -------------------------------------------------------------------------- */
/* The diagram                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The converted document, drawn by the SAME component its playground uses.
 * Not a bespoke preview: a second renderer would be free to disagree with the
 * one the hand-off link opens, and "it looked different on the convert page"
 * is a bug nobody could act on.
 *
 * `key` on the shell is the document title plus its length — a cheap identity
 * for "this is a different document". Without it the viewer keeps the
 * previous model's drill-down state and can sit on a diagram id the new
 * document does not have.
 */
function PreviewPane({
  result,
  preview,
}: {
  result: ConvertResult;
  preview: ConvertOk | null;
}): React.JSX.Element {
  return (
    <section
      aria-label="Rendered diagram"
      className="flex h-[calc(100svh-13rem)] min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm"
    >
      {preview === null ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {result.status === "error"
              ? "Nothing to draw yet — the error under the source pane says where the Mermaid breaks."
              : "Paste Mermaid on the left, or load one of the samples, and the diagram appears here."}
          </p>
        </div>
      ) : preview.kind === "sequence" ? (
        <SequenceViewer
          key={`${preview.title}:${preview.alabText.length}`}
          file={preview.file}
          /* The convert page runs no live region of its own: the diagram here
             is a preview of a conversion, and its focus commentary would
             compete with the verdict strip for the same attention. Focus
             still works; it just does not narrate. */
          onAnnounce={() => {}}
        />
      ) : (
        <ViewerShell
          key={`${preview.title}:${preview.alabText.length}`}
          model={preview.model}
        />
      )}
    </section>
  );
}
