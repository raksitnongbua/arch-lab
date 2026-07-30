"use client";

/**
 * `/validate` — paste a model, find out whether it parses and, when it does
 * not, exactly which line and column is wrong.
 *
 * Checking is pure, synchronous and local (see `../lib/check.ts`), so the
 * result is derived from the text rather than stored: no Validate button, no
 * stale verdict, nothing sent anywhere. `useDeferredValue` keeps typing
 * smooth on large documents by letting React render the verdict a beat
 * behind the keystrokes.
 *
 * The verdict is announced politely (`role="status"`) so a screen-reader user
 * hears "Valid …" / "1 problem …" without having to hunt for the panel.
 */

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
} from "@/features/viewer/share/codec";
import { cn } from "@/lib/utils";

import {
  CHECK_CHOICES,
  CHECK_FORMAT_LABEL,
  MERMAID_CAVEAT,
  checkSource,
  type CheckChoice,
  type CheckFailed,
  type CheckIssue,
  type CheckOk,
  type CheckResult,
} from "../lib/check";
import { SAMPLES } from "../content/samples";

export function Validator(): React.JSX.Element {
  const [source, setSource] = useState("");
  const [choice, setChoice] = useState<CheckChoice>("auto");

  // The verdict trails the keystrokes rather than blocking them.
  const deferredSource = useDeferredValue(source);
  const result = useMemo(
    () => checkSource(deferredSource, choice),
    [deferredSource, choice],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      <Badge variant="accent" className="mb-6">
        <span className="size-1.5 rounded-full bg-accent" />
        Tools · model checker
      </Badge>

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        Validate a model
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-pretty text-muted-foreground">
        Paste <span className="font-mono text-base text-foreground">.alab</span>{" "}
        text, arch-lab JSON, or Mermaid C4. It is checked by the same parsers
        the editor and view mode use, so anything that passes here will open
        anywhere in the app. Everything runs in your browser — nothing is
        uploaded.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SourcePane
          source={source}
          onSourceChange={setSource}
          choice={choice}
          onChoiceChange={setChoice}
        />
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
  choice,
  onChoiceChange,
}: {
  source: string;
  onSourceChange: (value: string) => void;
  choice: CheckChoice;
  onChoiceChange: (value: CheckChoice) => void;
}): React.JSX.Element {
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label
            htmlFor="validate-source"
            className="text-sm font-medium text-foreground"
          >
            Model source
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {source === ""
              ? "Paste here, or load a sample below."
              : `${source.split(/\r?\n/).length} lines`}
          </p>
        </div>
        <div className="w-44">
          <label
            htmlFor="validate-format"
            className="mb-1 block text-xs text-muted-foreground"
          >
            Format
          </label>
          <Select
            id="validate-format"
            value={choice}
            onChange={(event) =>
              onChoiceChange(event.target.value as CheckChoice)
            }
          >
            {CHECK_CHOICES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Textarea
        id="validate-source"
        value={source}
        onChange={(event) => onSourceChange(event.target.value)}
        spellCheck={false}
        placeholder={
          'archlab 1.0\ntitle "My System"\n\n@context d-ctx "Context"\n  me:person "Customer"'
        }
        className="mt-3 h-[26rem] resize-y font-mono text-xs leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Load a sample:</span>
        {SAMPLES.map((sample) => (
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
/* Verdict                                                                     */
/* -------------------------------------------------------------------------- */

function ResultPane({ result }: { result: CheckResult }): React.JSX.Element {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Validation result"
      className="min-w-0"
    >
      <ResultCard result={result} />
    </section>
  );
}

function ResultCard({ result }: { result: CheckResult }): React.JSX.Element {
  switch (result.status) {
    case "empty":
      return <IdleCard message={result.message} tone="muted" />;
    case "unknown-format":
      return <IdleCard message={result.message} tone="warn" />;
    case "ok":
      return <ValidCard result={result} />;
    case "error":
      return <InvalidCard result={result} />;
  }
}

function IdleCard({
  message,
  tone,
}: {
  message: string;
  tone: "muted" | "warn";
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        tone === "warn"
          ? "border-accent/30 bg-accent/8 text-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

function ValidCard({ result }: { result: CheckOk }): React.JSX.Element {
  const { summary } = result;
  return (
    <div className="overflow-hidden rounded-lg border border-primary/30 bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-primary/8 px-4 py-3">
        <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
        <p className="text-sm font-medium text-foreground">
          Valid {CHECK_FORMAT_LABEL[result.format]}
        </p>
        {result.autoDetected ? (
          <Badge variant="outline">auto-detected</Badge>
        ) : null}
      </header>

      <dl className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60 text-center">
        <Stat label="Diagrams" value={summary.diagrams.length} />
        <Stat label="Nodes" value={summary.nodeCount} />
        <Stat label="Edges" value={summary.edgeCount} />
      </dl>

      <div className="space-y-3 px-4 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">{summary.title}</p>
          {summary.description === null ? null : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {summary.description}
            </p>
          )}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            schema {summary.version}
          </p>
        </div>

        <ul className="divide-y divide-border/60 overflow-hidden rounded-md border border-border/60">
          {summary.diagrams.map((diagram) => (
            <li
              key={diagram.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="min-w-0 text-sm text-foreground">
                {diagram.title}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {diagram.id}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{diagram.level}</Badge>
                {diagram.nodeCount} nodes · {diagram.edgeCount} edges
              </span>
            </li>
          ))}
        </ul>

        {result.format === "mermaid" ? (
          <p className="rounded-md border border-accent/30 bg-accent/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {MERMAID_CAVEAT}
          </p>
        ) : null}

        <OpenInViewMode aftText={result.aftText} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.JSX.Element {
  return (
    <div className="px-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function InvalidCard({ result }: { result: CheckFailed }): React.JSX.Element {
  const count = result.issues.length;
  return (
    <div className="overflow-hidden rounded-lg border border-destructive/40 bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-destructive/8 px-4 py-3">
        <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
        <p className="text-sm font-medium text-foreground">
          {count === 1 ? "1 problem" : `${count} problems`} in{" "}
          {CHECK_FORMAT_LABEL[result.format]}
        </p>
        {result.autoDetected ? (
          <Badge variant="outline">auto-detected</Badge>
        ) : null}
      </header>
      <ul className="divide-y divide-border/60">
        {result.issues.map((issue, index) => (
          <IssueRow key={`${issue.line ?? 0}-${index}`} issue={issue} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One issue. Text-grammar issues get the offending line quoted with a caret
 * under the exact column — the whole point of the page is not having to
 * count characters yourself.
 */
function IssueRow({ issue }: { issue: CheckIssue }): React.JSX.Element {
  return (
    <li className="px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground">
        {issue.line === undefined ? null : (
          <span className="font-mono text-xs text-destructive">
            line {issue.line}
            {issue.column === undefined ? "" : `:${issue.column}`}
          </span>
        )}
        {issue.path === undefined ? null : (
          <span className="font-mono text-xs text-destructive">
            {issue.path}
          </span>
        )}
        <span className="leading-relaxed">{issue.message}</span>
      </p>
      {issue.lineText === undefined ? null : (
        <pre
          tabIndex={0}
          aria-label={`Source line ${issue.line ?? ""}`}
          className="mt-2 overflow-x-auto rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <code>
            {issue.lineText}
            {issue.column === undefined
              ? null
              : `\n${" ".repeat(Math.max(0, issue.column - 1))}^`}
          </code>
        </pre>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Hand-off                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A valid model should be one click from being seen. The canonical `.alab`
 * text is carried to `/view` inside a share-link fragment — the same
 * codec the viewer's Share button and the syntax reference use, so no new
 * hand-off channel is invented here.
 *
 * Encoding needs the platform's CompressionStream, so it happens on the
 * client and the link renders only once the fragment exists. When the
 * browser cannot encode, or the model is large enough that the URL would
 * exceed the codec's honest limit, nothing is rendered: a link that might
 * arrive truncated is worse than no link.
 */
function OpenInViewMode({
  aftText,
}: {
  aftText: string;
}): React.JSX.Element | null {
  // The encoded fragment is stored WITH the text it was made from, so a stale
  // link is simply not matched on the next render — no reset-in-effect, and
  // no window where the button points at the previous model.
  const [encoded, setEncoded] = useState<{
    source: string;
    href: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!canEncodeShare()) return;
    void encodeShareFragment(aftText, null).then((fragment) => {
      if (cancelled) return;
      const target = `/view#${fragment}`;
      if (`${window.location.origin}${target}`.length <= MAX_SHARE_URL_LENGTH) {
        setEncoded({ source: aftText, href: target });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [aftText]);

  const href =
    encoded !== null && encoded.source === aftText ? encoded.href : null;
  if (href === null) return null;
  return (
    <Link
      href={href}
      className={buttonClasses({ variant: "outline", size: "sm" })}
    >
      <ArrowUpRight aria-hidden="true" />
      Open in view mode
    </Link>
  );
}
