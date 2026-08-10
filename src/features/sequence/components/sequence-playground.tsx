"use client";

/**
 * `/view/sequence` — the sequence playground: text on the left, the animated
 * diagram on the right, re-rendering as you type. Mirrors the C4
 * playground's contract (`viewer/components/viewer-playground.tsx`) at the
 * pieces that matter, and deliberately drops what does not apply:
 *
 *   - Same 300 ms debounce, same "last good model keeps rendering" rule:
 *     while the pane fails to parse, the diagram shows the previous good
 *     model and the error sits inline under the pane — with the parser's
 *     line/column and the offending line quoted, caret at the column.
 *     A blank canvas never explains anything.
 *   - Both formats, auto-detected: `.alab` sequence text AND Mermaid
 *     `sequenceDiagram` (a lossy import — the caveat shows whenever the
 *     pane's content parsed as Mermaid). A C4 document is redirected to
 *     `/view/c4` by message, not mis-parsed.
 *   - NO Share button, and no second JSON pane: the share codec is
 *     C4-specific (`viewer/share/codec.ts` carries `.alab` C4 text), so
 *     offering — or faking — a Share here would mint links that cannot
 *     open. When the codec learns sequence payloads, the button belongs
 *     here too.
 *
 * Everything runs in the browser; nothing typed here is uploaded or stored.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowDownToLine, Info } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { MERMAID_SEQUENCE_EXAMPLE, SEQUENCE_EXAMPLE } from "../input/example";
import {
  MERMAID_SEQUENCE_CAVEAT,
  parseSequenceInput,
  SEQUENCE_FORMAT_LABEL,
  type ParsedSequence,
  type SequenceInputError,
} from "../input/parse";
import { SequencePlayer } from "./sequence-player";

/** Same rest-before-parse the C4 playground uses — one convention. */
const PARSE_DEBOUNCE_MS = 300;

export function SequencePlayground(): React.JSX.Element {
  const [text, setText] = useState(SEQUENCE_EXAMPLE);
  /** The last GOOD parse — what the player renders, error or not. */
  const [parsed, setParsed] = useState<ParsedSequence | null>(() => {
    const seeded = parseSequenceInput(SEQUENCE_EXAMPLE);
    return seeded.status === "ok" ? seeded.value : null;
  });
  const [error, setError] = useState<SequenceInputError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const textareaId = useId();
  const hintId = useId();

  const applyParse = useCallback((value: string) => {
    const result = parseSequenceInput(value);
    if (result.status === "ok") {
      setParsed(result.value);
      setError(null);
      setAnnouncement(
        `Parsed as ${SEQUENCE_FORMAT_LABEL[result.value.format]} — diagram updated.`,
      );
      return;
    }
    setError(result.error);
    setAnnouncement(
      `The text has a problem — ${result.error.message} The diagram shows the last good version.`,
    );
  }, []);

  // The debounce: one pending value, replaced (old timer cancelled) per
  // keystroke — a stale parse can never land after the user moved on.
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => {
      setPending(null);
      applyParse(pending);
    }, PARSE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [pending, applyParse]);

  const handleChange = useCallback((value: string) => {
    setText(value);
    setPending(value);
  }, []);

  const loadExample = useCallback(
    (source: string) => {
      setText(source);
      setPending(null);
      applyParse(source);
    },
    [applyParse],
  );

  // Tab indents (two spaces) with the same documented Escape hatch the C4
  // playground's panes have.
  const tabEscapeRef = useRef(false);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        tabEscapeRef.current = true;
        return;
      }
      if (event.key === "Tab" && !event.shiftKey && !tabEscapeRef.current) {
        event.preventDefault();
        const el = event.currentTarget;
        el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
        handleChange(el.value);
      }
      tabEscapeRef.current = false;
    },
    [handleChange],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Play a sequence diagram
        </h1>
        <Badge variant="accent">
          <span className="size-1.5 rounded-full bg-accent" />
          animated playback
        </Badge>
        <p className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
          Write <span className="font-mono text-foreground">.alab</span>{" "}
          sequence text or paste a Mermaid{" "}
          <span className="font-mono text-foreground">sequenceDiagram</span> —
          auto-detected, rendered live, played step by step. Nothing leaves your
          browser. Building a C4 model instead?{" "}
          <Link
            href="/view/c4"
            className="font-medium text-primary hover:underline"
          >
            C4 playground
          </Link>
        </p>
      </header>

      {/* One shared polite live region for parse state. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* The Mermaid import is honest about loss the moment it happens. */}
      {parsed?.format === "mermaid" && error === null ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
          <Info
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-accent"
          />
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold">Imported from Mermaid.</span>{" "}
            {MERMAID_SEQUENCE_CAVEAT}
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ---- the text pane ---- */}
        <section
          aria-label="Sequence source editor"
          className="flex min-w-0 flex-col gap-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={textareaId}
              className="text-sm font-medium text-foreground"
            >
              Sequence text{" "}
              <span className="font-mono text-xs text-muted-foreground">
                (.alab or Mermaid)
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => loadExample(SEQUENCE_EXAMPLE)}
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                <ArrowDownToLine aria-hidden="true" />
                .alab example
              </button>
              <button
                type="button"
                onClick={() => loadExample(MERMAID_SEQUENCE_EXAMPLE)}
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                <ArrowDownToLine aria-hidden="true" />
                Mermaid example
              </button>
            </div>
          </div>

          <textarea
            id={textareaId}
            value={text}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-describedby={hintId}
            aria-invalid={error !== null}
            spellCheck={false}
            rows={24}
            className={cn(
              "min-h-[24rem] w-full min-w-0 flex-1 resize-y rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              error !== null ? "border-destructive/60" : "border-border",
            )}
          />

          {error !== null ? <SequenceErrorBox error={error} /> : null}

          <p id={hintId} className="text-xs text-muted-foreground">
            Tab inserts two spaces — press Escape, then Tab, to move focus out.
            The diagram re-renders as you type; while the text fails to parse it
            keeps showing the last good version.
          </p>
        </section>

        {/* ---- the diagram pane ---- */}
        <section
          aria-label="Rendered sequence diagram"
          className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border shadow-sm lg:h-[calc(100svh-11rem)] lg:min-h-[24rem]"
        >
          {parsed !== null ? (
            <SequencePlayer file={parsed.file} />
          ) : (
            // Only reachable when the SEED itself failed to parse — a build
            // break, not a user state (the seed is parser-verified at module
            // load). Still: never a silently blank canvas.
            <p className="p-6 text-sm text-muted-foreground">
              Nothing to render yet — fix the error shown under the text pane.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Errors — parser precision, caret quote, work always preserved               */
/* -------------------------------------------------------------------------- */

function SequenceErrorBox({
  error,
}: {
  error: SequenceInputError;
}): React.JSX.Element {
  if (error.kind === "c4-detected") {
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3.5">
        <p className="text-sm leading-relaxed text-foreground">
          This looks like a <span className="font-mono">C4 model</span>, not a
          sequence diagram. The{" "}
          <Link
            href="/view/c4"
            className="font-medium text-primary hover:underline"
          >
            C4 playground
          </Link>{" "}
          renders those — paste it there.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3.5">
      <p className="text-sm font-medium text-foreground">
        The text doesn&apos;t parse —{" "}
        <span className="font-mono">{error.message}</span>
      </p>
      {/* The offending line, quoted verbatim, caret at the column — the same
          presentation the C4 playground's CaretQuote gives (that component is
          private to viewer-playground.tsx; the format is the shared thing). */}
      {error.kind === "parse" && error.lineText !== null ? (
        <pre className="mt-2 overflow-x-auto rounded-md bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
          {`${String(error.line).padStart(4)} | ${error.lineText}\n`}
          <span aria-hidden="true">
            {`${" ".repeat(4)} | ${" ".repeat(Math.max(0, error.column - 1))}`}
            <span className="font-bold text-destructive">^</span>
          </span>
        </pre>
      ) : null}
      <p className="mt-2.5 text-xs text-muted-foreground">
        Your work is safe — the diagram still shows the last good version and
        will catch up once this parses.
      </p>
    </div>
  );
}
