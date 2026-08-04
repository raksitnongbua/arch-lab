"use client";

/**
 * The view-mode page body: the view-only canvas, with a slim strip under it
 * naming the model (title, read-only badge, and — while EDITOR_ENABLED — the
 * way into the editor) — plus the two ways the canvas can take the whole
 * screen:
 *
 *  1. Native fullscreen — the Fullscreen API on this shell's root element,
 *     feature-detected, state tracked through `fullscreenchange` so the
 *     button stays honest however fullscreen ends (our button, Escape, F11).
 *  2. Immersive mode — an in-page fallback that fixes the shell over the
 *     viewport (the site header/footer are simply covered, never edited),
 *     for embedding contexts where the Fullscreen API is blocked. The shell
 *     strip stays visible in both, so the exit is always one click away.
 *
 * Escape precedence, one ladder, one step per press:
 *   1. native fullscreen active → the BROWSER exits fullscreen; the viewer
 *      deliberately ignores the key (see viewer-canvas.tsx) so one press
 *      never does two things;
 *   2. an element or relationship is selected (never both — they are
 *      mutually exclusive) → deselect it (canvas);
 *   3. below Context → climb one C4 level (canvas);
 *   4. at the root with nothing selected and immersive mode on → leave
 *      immersive mode (here — the canvas leaves the event unconsumed, and
 *      this parent's listener registers after the child's, so it runs last).
 *
 * The model is deep-frozen on mount: view-only stays structurally true on
 * the client no matter where the parsed JSON came from.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Expand, Maximize2, Minimize2, Shrink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EDITOR_ENABLED } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { ViewerExportButton } from "../export/export-button";
import { EditModeLink } from "./edit-mode-link";
import { ViewerShareButton, type ShareSource } from "../share/share-button";
import { deepFreeze, getDiagram, type ViewerModel } from "../lib/model";
import { ViewerCanvas } from "./viewer-canvas";

/* ---- fullscreen state, as an external store ------------------------------- */
/* The DOM is the single source of truth (never our last button press), which
 * is what keeps the toggle correct when Escape or F11 ends fullscreen.
 * Server snapshots are `false`, so SSR markup never claims fullscreen. */

function subscribeToFullscreen(callback: () => void): () => void {
  document.addEventListener("fullscreenchange", callback);
  return () => document.removeEventListener("fullscreenchange", callback);
}

const subscribeToNothing = (): (() => void) => () => {};

function readIsFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/** Feature detection — client-only, constant for the page's lifetime. */
function readFullscreenSupported(): boolean {
  return (
    typeof document.documentElement.requestFullscreen === "function" &&
    document.fullscreenEnabled === true
  );
}

const readFalse = (): boolean => false;

export function ViewerShell({
  model,
  initialDiagramId,
  share,
  onDiagramChange,
  defaultImmersive = false,
}: {
  model: ViewerModel;
  /** Open on this diagram (share deep links); unknown ids fall back to root. */
  initialDiagramId?: string;
  /** Where the model came from — enables the Share control when provided. */
  share?: ShareSource;
  /** Reports which diagram is on screen (initial diagram included). */
  onDiagramChange?: (diagramId: string) => void;
  /**
   * Start in immersive mode. For a page that exists only to show one model
   * (`/view/[modelId]`) — where the diagram IS the page, so the site chrome is
   * a frame around nothing else. Left off when the shell is embedded in a
   * larger page: fixing it over the viewport would cover its own host.
   */
  defaultImmersive?: boolean;
}): React.JSX.Element {
  // Structural read-only-ness: freeze once, before the canvas ever sees it.
  const frozenModel = useMemo(() => deepFreeze(model), [model]);

  const rootRef = useRef<HTMLDivElement>(null);

  // Initialised, not toggled: no announcement fires for the starting state
  // (nothing changed yet), and the ref has to agree from the first render or
  // Escape would not know it is immersive until the first manual toggle.
  const [isImmersive, setIsImmersive] = useState(defaultImmersive);
  const immersiveRef = useRef(defaultImmersive);
  const [announcement, setAnnouncement] = useState("");

  // The diagram on screen — drives the export and share controls (and is
  // forwarded to any interested parent, e.g. the paste page). Starts at the
  // deep-linked diagram when one is named and exists, else at the root —
  // the same resolution the canvas applies.
  const [currentDiagramId, setCurrentDiagramId] = useState(() =>
    initialDiagramId !== undefined &&
    frozenModel.diagrams[initialDiagramId] !== undefined
      ? initialDiagramId
      : frozenModel.rootDiagramId,
  );
  const handleDiagramChange = useCallback(
    (diagramId: string) => {
      setCurrentDiagramId(diagramId);
      onDiagramChange?.(diagramId);
    },
    [onDiagramChange],
  );
  const currentDiagram = getDiagram(frozenModel, currentDiagramId);

  /* ---- native fullscreen ---------------------------------------------------- */

  const fullscreenSupported = useSyncExternalStore(
    subscribeToNothing,
    readFullscreenSupported,
    readFalse,
  );
  const isFullscreen = useSyncExternalStore(
    subscribeToFullscreen,
    readIsFullscreen,
    readFalse,
  );

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (root === null) return;
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => {
        /* Nothing to recover — fullscreenchange keeps the state honest. */
      });
      return;
    }
    root.requestFullscreen().catch(() => {
      // Blocked (permissions policy, missing gesture, …): fall back to the
      // in-page immersive mode so "make it big" still succeeds.
      immersiveRef.current = true;
      setIsImmersive(true);
      setAnnouncement(
        "Fullscreen was blocked by the browser — switched to immersive mode instead. Press Escape to exit.",
      );
    });
  }, []);

  /* ---- immersive mode --------------------------------------------------------- */

  const setImmersive = useCallback((next: boolean) => {
    immersiveRef.current = next;
    setIsImmersive(next);
    setAnnouncement(
      next
        ? "Immersive mode on — the diagram fills the window. Press Escape at the top level to exit."
        : "Immersive mode off.",
    );
  }, []);

  useEffect(() => {
    if (!isImmersive) return;
    // The fixed shell covers the page; stop the page behind it scrolling.
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [isImmersive]);

  // Escape rung 4 — leave immersive mode, only once the canvas has passed on
  // the event (it preventDefaults deselection and climbs; see the ladder in
  // the header comment). Registered once, after the child canvas's listener
  // (parent effects run after children's), so it always runs last.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.fullscreenElement !== null) return; // browser's turn
      if (!immersiveRef.current) return;
      event.preventDefault();
      setImmersive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setImmersive]);

  /* ---- render ------------------------------------------------------------------ */

  const controlClasses = buttonClasses({
    variant: "outline",
    size: "sm",
    className: "shrink-0",
  });

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-background",
        // Immersive: cover the viewport (site chrome is behind, untouched).
        isImmersive && "fixed inset-0 z-50",
      )}
    >
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* The diagram comes FIRST, above the strip that names it. This is a
          diagram viewer: the diagram is what you came for, so it gets the top
          of the viewport and the identifying detail reads as its caption. It
          matters most on a phone, where the title, description and five
          controls used to wrap into ~370px of chrome and push the canvas
          below the fold — you arrived at a diagram tool and saw no diagram. */}
      {/* `flex-1` does the real work — on a standalone view page this takes
          every pixel the site chrome leaves. The floor is only a guard against
          a collapsed canvas, and is deliberately modest: the shell is also
          embedded in the playground inside a clamped-height section, where a
          tall floor would push itself past the bottom of its own frame. */}
      <div className="relative min-h-56 flex-1 sm:min-h-80">
        <ViewerCanvas
          model={frozenModel}
          initialDiagramId={initialDiagramId}
          onDiagramChange={handleDiagramChange}
        />
      </div>

      <header className="border-t border-border/60 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {frozenModel.title}
              </h1>
              <Badge variant="accent">
                <span className="size-1.5 rounded-full bg-accent" />
                View mode · read-only
              </Badge>
            </div>
            <p className="mt-0.5 max-w-2xl truncate text-sm leading-relaxed text-muted-foreground">
              {frozenModel.description}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {share !== undefined ? (
              <ViewerShareButton
                share={share}
                modelTitle={frozenModel.title}
                diagram={currentDiagram}
                rootDiagramId={frozenModel.rootDiagramId}
                onAnnounce={setAnnouncement}
              />
            ) : null}
            <ViewerExportButton
              modelTitle={frozenModel.title}
              diagram={currentDiagram}
              tagColors={frozenModel.file.metadata.tagColors}
            />
            <button
              type="button"
              onClick={() => setImmersive(!isImmersive)}
              aria-pressed={isImmersive}
              aria-label={
                isImmersive
                  ? "Exit immersive mode (Escape at the top level)"
                  : "Enter immersive mode — hide the site chrome"
              }
              title={isImmersive ? "Exit immersive mode" : "Immersive mode"}
              className={controlClasses}
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
            {fullscreenSupported ? (
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-pressed={isFullscreen}
                aria-label={
                  isFullscreen ? "Exit full screen" : "Enter full screen"
                }
                title={isFullscreen ? "Exit full screen" : "Full screen"}
                className={controlClasses}
              >
                {isFullscreen ? (
                  <Minimize2 aria-hidden="true" />
                ) : (
                  <Maximize2 aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                  {isFullscreen ? "Exit full screen" : "Full screen"}
                </span>
              </button>
            ) : null}
            {EDITOR_ENABLED ? (
              <EditModeLink model={frozenModel} diagramId={currentDiagramId} />
            ) : (
              <Badge variant="outline" className="shrink-0">
                Editor — coming soon
              </Badge>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
