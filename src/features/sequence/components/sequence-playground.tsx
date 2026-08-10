"use client";

/**
 * `/view/sequence` — the sequence playground: the complete click-to-focus
 * diagram ON TOP at full width, the source pane UNDERNEATH, re-rendering as
 * you type. Mirrors the C4 playground's contract
 * (`viewer/components/viewer-playground.tsx`) at the pieces that matter, and
 * deliberately drops what does not apply:
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
 * WHY diagram-over-source rather than the C4 playground's side-by-side: a
 * sequence diagram's participants spread HORIZONTALLY, so width is the axis
 * the diagram actually consumes — halving it to seat a text column forces
 * either a shrunken diagram or sideways scrolling on every real flow. The
 * source pane is a full-width strip below, COLLAPSIBLE (a real button with
 * aria-expanded) so a reader can fold the text away without losing it; an
 * active parse error stays visible even while collapsed, because an error
 * hidden behind a fold is an error the user stops fixing.
 *
 * IMMERSIVE MODE — the same in-page pattern as `viewer-shell.tsx` (its
 * fullscreen-blocked fallback, promoted to the primary control here): the
 * diagram section fixes itself over the viewport — site chrome is simply
 * covered, never edited — and the source pane is additionally `hidden` so it
 * also leaves the tab order. The toolbar strip stays visible in immersive so
 * the exit is always one click away, not only one keystroke.
 *
 * ESCAPE precedence — one ladder, one step per press (the viewer-shell
 * discipline, restated for THIS page's rungs):
 *   1. native fullscreen active → the BROWSER exits it; every listener here
 *      stands down (guarded even though this page has no fullscreen button —
 *      an embedding context may have put us there);
 *   2. the diagram has a focused message or participant → the viewer clears
 *      it. SequenceViewer owns this rung with its own window listener, which
 *      calls preventDefault when it consumes the key — and it runs first
 *      because child effects register before parent effects;
 *   3. immersive mode on → leave immersive mode (here, the parent — it acts
 *      only when rung 2 left the event unconsumed).
 * Focus clears BEFORE immersive exits, deliberately: "un-focus what I zoomed
 * in on" is always the smaller retreat, and one press must never do two
 * things or skip a level.
 *
 * Everything runs in the browser; nothing typed here is uploaded or stored.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Expand,
  Info,
  Shrink,
} from "lucide-react";
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
import { SequenceViewer } from "./sequence-viewer";

/** Same rest-before-parse the C4 playground uses — one convention. */
const PARSE_DEBOUNCE_MS = 300;

export function SequencePlayground(): React.JSX.Element {
  const [text, setText] = useState(SEQUENCE_EXAMPLE);
  /** The last GOOD parse — what the viewer renders, error or not. */
  const [parsed, setParsed] = useState<ParsedSequence | null>(() => {
    const seeded = parseSequenceInput(SEQUENCE_EXAMPLE);
    return seeded.status === "ok" ? seeded.value : null;
  });
  const [error, setError] = useState<SequenceInputError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  /** Source pane fold. Open by default: the pane is how the page teaches. */
  const [sourceOpen, setSourceOpen] = useState(true);

  const textareaId = useId();
  const hintId = useId();
  const sourceBodyId = useId();

  /* ---- immersive mode -------------------------------------------------------
   * State + ref pair, exactly as viewer-shell.tsx keeps them: the ref exists
   * so the once-registered Escape listener below can read the CURRENT value
   * without re-registering — a re-registered window listener moves to the
   * back of the listener order, BEHIND the viewer's rung-2 listener, and the
   * ladder would run bottom-up (see the header comment). */

  const [isImmersive, setIsImmersive] = useState(false);
  const immersiveRef = useRef(false);

  const setImmersive = useCallback((next: boolean) => {
    immersiveRef.current = next;
    setIsImmersive(next);
    // The page's ONE polite live region carries this too — same channel as
    // parse results, and the two never race (parsing is debounced, this is
    // a click).
    setAnnouncement(
      next
        ? "Immersive mode on — the diagram fills the window and the source pane is hidden. Press Escape to exit (a focused message clears first)."
        : "Immersive mode off — the source pane is back.",
    );
  }, []);

  useEffect(() => {
    if (!isImmersive) return;
    // The fixed section covers the page; stop the page behind it scrolling.
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [isImmersive]);

  // Escape rung 3 — leave immersive mode, only once the viewer has passed on
  // the event (its rung-2 listener preventDefaults when it clears a focus,
  // and it registered first — child effects run before parent effects — so
  // it always runs first). Registered once: `setImmersive` is stable and the
  // current mode is read through the ref.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.fullscreenElement !== null) return; // rung 1 — browser's turn
      if (!immersiveRef.current) return;
      event.preventDefault();
      setImmersive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setImmersive]);

  /* ---- parsing --------------------------------------------------------------- */

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
  // playground's panes have. (This textarea-local Escape sits OUTSIDE the
  // page's Escape ladder on purpose: the viewer's rung-2 listener exempts
  // form fields, so pressing Escape here only arms the Tab hatch — it never
  // clears a diagram focus the user was not looking at.)
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
          Explore a sequence diagram
        </h1>
        <Badge variant="accent">
          <span className="size-1.5 rounded-full bg-accent" />
          click to focus
        </Badge>
        <p className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
          Write <span className="font-mono text-foreground">.alab</span>{" "}
          sequence text or paste a Mermaid{" "}
          <span className="font-mono text-foreground">sequenceDiagram</span> —
          auto-detected, rendered live and complete; click any message or
          participant to spotlight it. Nothing leaves your browser. Building a
          C4 model instead?{" "}
          <Link
            href="/view/c4"
            className="font-medium text-primary hover:underline"
          >
            C4 playground
          </Link>
        </p>
      </header>

      {/* THE one polite live region on this page: parse state, immersive
          toggles AND the viewer's focus announcements (plumbed up through
          its onAnnounce prop). One region, deliberately — two polite regions
          updated near each other race, and the loser's announcement is
          swallowed; this page owns it because it renders unconditionally
          while the viewer can be replaced by the seed-failure fallback. */}
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

      {/* ---- the diagram pane — TOP, full width ----
          Height is viewport-derived (not flex-grown) because the SVG inside
          scales to its box: an unbounded box would let a tall diagram set
          the page's height instead of scrolling within its pane. Folding
          the source pane hands its rows to the diagram — the taller clamp —
          so collapsing visibly buys diagram, never blank page. */}
      <section
        aria-label="Rendered sequence diagram"
        className={cn(
          "flex min-w-0 flex-col overflow-hidden bg-background",
          isImmersive
            ? // Immersive: cover the viewport. Site chrome and the source
              // pane are BEHIND the fixed section, untouched — the same
              // "cover, never edit" rule as viewer-shell.tsx.
              "fixed inset-0 z-50"
            : cn(
                "rounded-xl border border-border shadow-sm",
                sourceOpen
                  ? "h-[56svh] min-h-[24rem]"
                  : "h-[calc(100svh-16rem)] min-h-[24rem]",
              ),
        )}
      >
        {/* The toolbar strip stays visible in immersive mode too — the exit
            must always be one click away, not only one keystroke. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-1">
          <span className="truncate text-xs text-muted-foreground">
            {isImmersive
              ? "Immersive — Escape exits (a focused message clears first)"
              : "Diagram"}
          </span>
          <button
            type="button"
            onClick={() => setImmersive(!isImmersive)}
            aria-pressed={isImmersive}
            aria-label={
              isImmersive
                ? "Exit immersive mode (Escape at the top level)"
                : "Enter immersive mode — hide the site chrome and the source pane"
            }
            title={isImmersive ? "Exit immersive mode" : "Immersive mode"}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            {isImmersive ? (
              <Shrink aria-hidden="true" />
            ) : (
              <Expand aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {isImmersive ? "Exit immersive" : "Immersive"}
            </span>
          </button>
        </div>
        {parsed !== null ? (
          <SequenceViewer file={parsed.file} onAnnounce={setAnnouncement} />
        ) : (
          // Only reachable when the SEED itself failed to parse — a build
          // break, not a user state (the seed is parser-verified at module
          // load). Still: never a silently blank canvas.
          <p className="p-6 text-sm text-muted-foreground">
            Nothing to render yet — fix the error shown under the text pane.
          </p>
        )}
      </section>

      {/* ---- the source pane — BOTTOM, full width, collapsible ----
          `hidden` (never unmounted) in BOTH the folded and the immersive
          case: the textarea keeps its DOM — and with it the browser's undo
          stack — so hiding the pane can never cost the user their editing
          history. In immersive the fixed section already covers this
          visually; `hidden` additionally removes it from the tab order. */}
      <section
        aria-label="Sequence source editor"
        className={cn("flex min-w-0 flex-col gap-2", isImmersive && "hidden")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSourceOpen((open) => !open)}
              aria-expanded={sourceOpen}
              aria-controls={sourceBodyId}
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              {sourceOpen ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronDown aria-hidden="true" />
              )}
              {sourceOpen ? "Hide source" : "Show source"}
            </button>
            <label
              htmlFor={textareaId}
              className="text-sm font-medium text-foreground"
            >
              Sequence text{" "}
              <span className="font-mono text-xs text-muted-foreground">
                (.alab or Mermaid)
              </span>
            </label>
          </div>
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

        <div
          id={sourceBodyId}
          className={cn("flex flex-col gap-2", !sourceOpen && "hidden")}
        >
          <textarea
            id={textareaId}
            value={text}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-describedby={hintId}
            aria-invalid={error !== null}
            spellCheck={false}
            rows={12}
            className={cn(
              "min-h-[14rem] w-full min-w-0 resize-y rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              error !== null ? "border-destructive/60" : "border-border",
            )}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            Tab inserts two spaces — press Escape, then Tab, to move focus out.
            The diagram re-renders as you type; while the text fails to parse it
            keeps showing the last good version.
          </p>
        </div>

        {/* OUTSIDE the fold on purpose: an active parse error stays visible
            even while the source is collapsed. */}
        {error !== null ? <SequenceErrorBox error={error} /> : null}
      </section>
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
