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
 *   - The SAME Share control as the C4 viewer (`viewer/share/share-button`,
 *     wrapped by `../share/share-button.tsx`): one codec, one panel, one
 *     expiry system — only the route, the noun and the panel's opening
 *     direction differ. No second JSON pane, though: a sequence document
 *     has one canonical text form and nothing to sync it against.
 *
 * WHY diagram-over-source rather than the C4 playground's side-by-side: a
 * sequence diagram's participants spread HORIZONTALLY, so width is the axis
 * the diagram actually consumes — halving it to seat a text column forces
 * either a shrunken diagram or sideways scrolling on every real flow. The
 * diagram section OWNS the first screenful (viewport-height pane; the
 * viewer fits the whole flow inside it, C4-fitView style, with zoom
 * controls for detail) and the source is a full-width strip BELOW THE
 * FOLD — scrolling the page is how you reach the text. The collapse toggle
 * this pane once had is gone: it existed to hand the source's rows to the
 * diagram, and the diagram no longer needs them.
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
  Expand,
  FileText,
  Info,
  Repeat2,
  Shrink,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { CaretQuote } from "@/components/ui/caret-quote";
import { buttonClasses } from "@/components/ui/button";
import type { TourStep } from "@/components/ui/tour";
import { cn } from "@/lib/utils";

import {
  ShareLinkFailurePage,
  type ShareOpenFailure,
} from "@/components/share/share-link-failure";
import {
  SHARE_PENDING_CLASS,
  ShareOpening,
} from "@/components/share/share-opening";
import {
  decodeShareFragment,
  dropUrlFragment,
  SHARE_FORWARD_ATTRIBUTE,
} from "@/features/viewer/share/codec";

import {
  MERMAID_SEQUENCE_EXPORT_CAVEAT,
  serializeMermaidSequence,
} from "@/features/mermaid";
import { serializeSequenceText } from "@/features/archtext";

import { MERMAID_SEQUENCE_EXAMPLE, SEQUENCE_EXAMPLE } from "../input/example";
import { SequenceExportButton } from "../export/export-button";
import { SequenceShareButton } from "../share/share-button";
import {
  MERMAID_SEQUENCE_CAVEAT,
  parseSequenceInput,
  SEQUENCE_FORMAT_LABEL,
  type ParsedSequence,
  type SequenceInputError,
  type SequenceSourceFormat,
} from "../input/parse";
import { SequenceViewer } from "./sequence-viewer";

/** Same rest-before-parse the C4 playground uses — one convention. */
const PARSE_DEBOUNCE_MS = 300;

/*
 * This page's additions to the viewer's tour (see the `extraTourSteps` prop):
 * immersive mode and the below-the-fold source pane are THIS page's controls,
 * so their steps live here rather than in a viewer that renders neither. The
 * wording restates the layout decisions above — "scroll down to the text" is
 * the design, so it is what the tour must say.
 */
const PLAYGROUND_TOUR_STEPS: readonly TourStep[] = [
  {
    title: "Go immersive",
    body:
      "Immersive, at the top right of this pane, hides everything but the " +
      "diagram. Escape brings it back — a focused message clears first.",
    icon: Expand,
  },
  {
    title: "The text behind it",
    body:
      "The source that draws this diagram sits below it — scroll the page " +
      "down to edit; the diagram re-renders as you type.",
    icon: FileText,
  },
];

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
  /** A share link that would not open; non-null takes over the whole page. */
  const [shareFailure, setShareFailure] = useState<ShareOpenFailure | null>(
    null,
  );

  /** Scopes the export button's lookup for the live <svg>. */
  const diagramPaneRef = useRef<HTMLElement>(null);

  const textareaId = useId();
  const hintId = useId();

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

  /**
   * THE FORMAT TOGGLE: rewrite the pane in the other format, in place.
   *
   * Not a second pane and not a read-only preview. This box has always held
   * EITHER format — it auto-detects on every keystroke — so "switch format"
   * can honestly mean "convert what is in the box", which is the thing people
   * ask for: write in `.alab`, flip to Mermaid, paste it into a README.
   *
   * IT ONLY EVER RUNS ON A DOCUMENT THAT PARSES, from the LAST GOOD parse
   * rather than the raw text: converting half a line has no meaning, and
   * silently converting a stale model would replace the reader's work with
   * something they cannot see the source of.
   *
   * Going to Mermaid is LOSSY (`MERMAID_SEQUENCE_EXPORT_CAVEAT` — desc,
   * technology, and the header beyond the title), and the notice under the
   * pane says so the moment it happens. It is not guarded behind a
   * confirmation: the conversion is visible in the box, one Undo away in the
   * textarea's own history, and a dialog in front of a formatting button
   * teaches people to dismiss dialogs.
   */
  const convertPane = useCallback(
    (to: SequenceSourceFormat) => {
      if (parsed === null || parsed.format === to) return;
      const converted =
        to === "mermaid"
          ? serializeMermaidSequence(parsed.file)
          : serializeSequenceText(parsed.file);
      setText(converted);
      setPending(null);
      applyParse(converted);
      setAnnouncement(
        to === "mermaid"
          ? `Converted the pane to Mermaid. ${MERMAID_SEQUENCE_EXPORT_CAVEAT}`
          : "Converted the pane to .alab — nothing is lost in this direction.",
      );
    },
    [parsed, applyParse],
  );

  /* ---- opening a share link (`#m=…`) --------------------------------------
   * The fragment never reaches the server, so only the client can read it —
   * which is also why nothing here was ever uploaded. Read on mount AND on
   * `hashchange`, because a second link opened in the same tab does not
   * remount this component.
   *
   * The payload is the C4 codec's, deliberately (see share/share-button.tsx):
   * one compression path and one alphabet for both document kinds. What makes
   * it a SEQUENCE link is landing here, and `parseSequenceInput` already tells
   * a C4 document where it belongs — so a link opened on the wrong route
   * explains itself rather than failing.
   *
   * A decoded document replaces the pane exactly as pasting would. A link
   * that will NOT open takes over the whole page instead — the same shared
   * failure page the C4 playground shows (PR #19 gave C4 the takeover; this
   * route used to whisper the failure into the screen-reader-only live
   * region, which left a sighted reader looking at the seed example and
   * concluding it was the flow they were sent). One component for both
   * routes, so the two cannot drift apart again. */
  useEffect(() => {
    let cancelled = false;

    const openFromHash = async () => {
      const decoded = await decodeShareFragment(window.location.hash);
      if (cancelled) return;

      /* HAND BACK THE PRE-PAINT FLAG. `data-share-forward` is stamped on <html>
         by the root layout's script when the URL carries a payload, and
         `globals.css` uses it to show the holding state instead of the seeded
         example — the reason a share link no longer flashes the Checkout flow
         at whoever opened it. The script runs once per document load and cannot
         clear itself, so the page that resolved the payload has to; every
         outcome below is a resolution, "no payload after all" included. Left
         standing it would outlive the URL that set it and blank this route for
         the rest of the session (the bug documented on the chooser).

         Before the state writes, and in the same tick as them, so the next
         paint carries both the real document and the un-hidden page. */
      document.documentElement.removeAttribute(SHARE_FORWARD_ATTRIBUTE);

      // Clear any previous outcome first: `hashchange` fires for a second
      // link opened in the same tab, and a takeover left standing would hide
      // a GOOD link's flow behind a stale error page.
      setShareFailure(null);

      switch (decoded.status) {
        case "none":
          return;

        case "error":
          // Takes over the page. No `setAnnouncement`: the polite live region
          // below is not rendered on this path — the failure page carries its
          // own `role="alert"` instead.
          setShareFailure({ kind: "broken", reason: decoded.message });
          return;

        case "expired":
          // Same takeover; the page's `role="status"` announces it.
          setShareFailure({ kind: "expired", expiresAt: decoded.expiresAt });
          return;

        case "ok": {
          const result = parseSequenceInput(decoded.aftText);
          if (result.status === "error") {
            if (result.error.kind === "c4-detected") {
              // The payload is INTACT — it is a C4 model that landed on the
              // sequence route. Both routes read the same codec and the same
              // fragment format, so the very same fragment opens on the C4
              // playground: offer the door, carrying the payload along,
              // rather than reporting damage that did not happen.
              setShareFailure({
                kind: "wrong-document",
                heading: "This link carries a C4 model",
                description:
                  "The link opened fine, but what it carries is a C4 model, " +
                  "not a sequence diagram — the C4 playground renders those.",
                actionHref: `/view/c4${window.location.hash}`,
                actionLabel: "Open it in the C4 playground",
              });
              return;
            }
            // Decoding succeeded and the text still does not read as a
            // sequence diagram, which in practice means characters went
            // missing from the MIDDLE of the URL: a payload cut short at the
            // end fails earlier, inside `decodeShareFragment`.
            setShareFailure({
              kind: "broken",
              reason:
                "the flow inside it does not parse — characters appear to be " +
                "missing from the middle of the link, which happens when a long " +
                "URL is copied across a line wrap",
            });
            return;
          }

          setText(decoded.aftText);
          setPending(null);
          applyParse(decoded.aftText);
          setAnnouncement(
            "Opened a sequence diagram from a share link — nothing was uploaded; the pane holds its source.",
          );
          return;
        }

        default: {
          // A NEW codec status must never fall through to a page that quietly
          // shows the seed example instead of the shared flow: this
          // assignment fails `pnpm typecheck` the moment `DecodedShare` grows
          // a case this switch does not map to a full-page outcome.
          // `check:share-error-pages` asserts the guard stays here.
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
  }, [applyParse]);

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

  // A link that did not open takes over the page, returned BEFORE the
  // playground so the seed example is never on screen next to the message —
  // the whole point is that there is nothing here to mistake for what was
  // shared.
  const startFresh = () => {
    dropUrlFragment();
    setShareFailure(null);
  };

  if (shareFailure !== null) {
    return (
      <ShareLinkFailurePage
        failure={shareFailure}
        subject="sequence diagram"
        startFreshLabel="Write your own diagram"
        onStartFresh={startFresh}
      />
    );
  }

  return (
    <>
      {/* Swapped in for the block below, pre-paint, while a share link is being
          opened — so the seeded example is never mistaken for the shared flow.
          Costs a normal visit nothing: it is `display: none` unless the flag is
          set. */}
      <ShareOpening subject="sequence diagram" />

      <div
        className={cn(
          SHARE_PENDING_CLASS,
          "mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8",
        )}
      >
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
            {/* The caveat ends by telling the reader to save as .alab, which
                until `/convert` existed was advice with no button behind it:
                the pane holds Mermaid, and the .alab it became was never shown.
                The route that hands it over goes with the sentence that asks
                for it. */}
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-semibold">This pane holds Mermaid.</span>{" "}
              {MERMAID_SEQUENCE_CAVEAT}{" "}
              <span className="font-semibold">Going the other way:</span>{" "}
              {MERMAID_SEQUENCE_EXPORT_CAVEAT}
            </p>
          </div>
        ) : null}

        {/* ---- the diagram pane — it OWNS the screen ----
          Height is the viewport minus the chrome above (site header + page
          header + this page's padding ≈ 12rem), so the diagram section fills
          the first screenful and the whole flow FITS inside it (the viewer
          scales the SVG to this box — its fit mode needs a definite height,
          which is why this is a clamp and not flex-grown). The source pane
          sits below the fold in normal page flow: scrolling the PAGE is how
          you reach the text. */}
        <section
          ref={diagramPaneRef}
          aria-label="Rendered sequence diagram"
          className={cn(
            "flex min-w-0 flex-col overflow-hidden bg-background",
            isImmersive
              ? // Immersive: cover the viewport. Site chrome and the source
                // pane are BEHIND the fixed section, untouched — the same
                // "cover, never edit" rule as viewer-shell.tsx.
                "fixed inset-0 z-50"
              : // 10.5rem = the chrome above this section (site header + page
                // header + paddings, ~168px measured at desktop widths): the
                // section's bottom edge lands just inside the first viewport,
                // and the source section's first row starts just below it —
                // "scroll down to see the text", literally.
                "h-[calc(100svh-10.5rem)] min-h-[24rem] rounded-xl border border-border shadow-sm",
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
            <SequenceViewer
              file={parsed.file}
              onAnnounce={setAnnouncement}
              extraTourSteps={PLAYGROUND_TOUR_STEPS}
            />
          ) : (
            // Only reachable when the SEED itself failed to parse — a build
            // break, not a user state (the seed is parser-verified at module
            // load). Still: never a silently blank canvas.
            <p className="p-6 text-sm text-muted-foreground">
              Nothing to render yet — fix the error shown under the text pane.
            </p>
          )}
        </section>

        {/* ---- the source pane — BELOW THE FOLD, reached by page scroll ----
          The collapse toggle this section used to carry is GONE, on purpose:
          it existed to hand the source's rows to the diagram, but the
          diagram's height no longer depends on this section at all — it
          already owns the first screenful, and the source starts below the
          fold. Scrolling past something is the same gesture as folding it,
          minus a state to manage and a control to explain. `hidden` in
          immersive (never unmounted): the textarea keeps its DOM — and with
          it the browser's undo stack — and leaves the tab order while the
          fixed section covers the page. */}
        <section
          aria-label="Sequence source editor"
          className={cn("flex min-w-0 flex-col gap-2", isImmersive && "hidden")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={textareaId}
                className="text-sm font-medium text-foreground"
              >
                Sequence text
              </label>
              {/* A radiogroup, not two buttons: one choice with two values,
                  and a screen reader should hear it that way. It shows what
                  the pane IS (detected from the text) and switches by
                  rewriting it — see `convertPane`. Disabled while the text
                  does not parse, because there is no document to convert. */}
              <div
                role="radiogroup"
                aria-label="Source format"
                className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
              >
                {(["alab", "mermaid"] as const).map((format) => {
                  const current = parsed?.format === format;
                  return (
                    <button
                      key={format}
                      type="button"
                      role="radio"
                      aria-checked={current}
                      disabled={parsed === null}
                      onClick={() => convertPane(format)}
                      title={
                        current
                          ? `The pane is ${SEQUENCE_FORMAT_LABEL[format]}`
                          : `Rewrite the pane as ${SEQUENCE_FORMAT_LABEL[format]}`
                      }
                      className={cn(
                        "rounded-md px-2 py-0.5 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                        current
                          ? "bg-secondary font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {format === "alab" ? ".alab" : "Mermaid"}
                    </button>
                  );
                })}
              </div>
              {parsed !== null ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Repeat2 aria-hidden="true" className="size-3.5" />
                  switches by rewriting the text
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <SequenceShareButton
                text={text}
                title={parsed?.file.metadata.title ?? "sequence-diagram"}
                format={parsed?.format ?? null}
                onAnnounce={setAnnouncement}
              />
              <SequenceExportButton
                paneRef={diagramPaneRef}
                title={parsed?.file.metadata.title ?? "sequence-diagram"}
                onAnnounce={setAnnouncement}
              />
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
            rows={12}
            className={cn(
              "min-h-[14rem] w-full min-w-0 resize-y rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              error !== null ? "border-destructive/60" : "border-border",
            )}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            Tab inserts two spaces — press Escape, then Tab, to move focus out.
            The diagram re-renders as you type; while the text fails to parse it
            keeps showing the last good version. Keep message labels short and
            indent a <code className="font-mono">desc &quot;…&quot;</code> under
            one to hold the endpoint or payload — it shows as a code block when
            the message is clicked, never on the arrow. Use{" "}
            <code className="font-mono">\n</code> inside it for several lines.
          </p>

          {error !== null ? <SequenceErrorBox error={error} /> : null}
        </section>
      </div>
    </>
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
      {error.kind === "parse" ? (
        <CaretQuote
          line={error.line}
          column={error.column}
          lineText={error.lineText}
        />
      ) : null}
      <p className="mt-2.5 text-xs text-muted-foreground">
        Your work is safe — the diagram still shows the last good version and
        will catch up once this parses.
      </p>
    </div>
  );
}
