"use client";

/**
 * The view-mode page body: the view-only canvas, with a slim strip under it
 * naming the model (title, read-only badge, and — on a host that cannot edit
 * in place — the way into the playground) — plus the two ways the canvas can
 * take the whole screen:
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
import {
  Download,
  Expand,
  HelpCircle,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Shrink,
  Waves,
  ZoomIn,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Tour, useTour, type TourStep } from "@/components/ui/tour";
import { CANVAS_EDIT_ENABLED } from "@/lib/constants";
import { cn } from "@/lib/utils";

import {
  idleMotionState,
  readIdleMotion,
  useIdleMotion,
  useReducedMotion,
  writeIdleMotion,
} from "@/lib/idle-motion";

import { ViewerExportButton } from "../export/export-button";
import { EditModeLink } from "./edit-mode-link";
import { ShareButton, type ShareSource } from "../share/share-button";
import {
  deepFreeze,
  diagramsInDrillOrder,
  getDiagram,
  type ViewerModel,
} from "../lib/model";
import { ViewerCanvas, type CanvasEditHandlers } from "./viewer-canvas";

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

/* ---- the tour --------------------------------------------------------------- */

/**
 * Versioned so a rewritten tour can re-show itself: bump `v1` and every
 * browser that dismissed the old one sees the new one once.
 */
const C4_TOUR_KEY = "arch-lab:tour:c4:v1";

/*
 * The canvas's controls that its chrome does not explain, one step each.
 * These strings are user-facing contracts: each names a control by what is
 * actually rendered (the zoom chip, the readout menu, the Export control in
 * this shell's strip), so a change to a control means rewording its step.
 * The zoom presets stop at 200% because this canvas clamps at 250%
 * (`lib/canvas-constants.ts`) and the menu drops what it cannot honour.
 */
const C4_TOUR_STEPS: readonly TourStep[] = [
  {
    title: "Select for details",
    body:
      "Click any element or connector to open its detail panel — the rest " +
      "of the diagram dims around it. Escape deselects.",
    icon: MousePointerClick,
  },
  {
    title: "Drill into a level",
    body:
      "Double-click an element — or press its zoom chip — to open the view " +
      "inside it. Escape, or the breadcrumb top-left, climbs back out.",
    icon: Layers,
  },
  {
    title: "Zoom the canvas",
    body:
      "In the bottom-left pill, − and + step the zoom and the readout opens " +
      "presets (Fit, 50–200%). Pinch, or hold ⌘/Ctrl and scroll, zooms at " +
      "the pointer; dragging empty canvas pans.",
    icon: ZoomIn,
  },
  {
    title: "The minimap",
    body:
      "Bottom-right, on screens wide enough to spare it: the whole diagram " +
      "in thumbnail, with your viewport marked. Drag it to pan; scroll it " +
      "to zoom.",
    icon: MapIcon,
  },
  {
    title: "Take it with you",
    body:
      "Export, in the strip under the diagram, saves this view — or every " +
      "view at once — as SVG, PNG, or an animated GIF.",
    icon: Download,
  },
];

export function ViewerShell({
  model,
  initialDiagramId,
  share,
  onDiagramChange,
  edit,
  canEdit,
  defaultImmersive = false,
  tour: tourEnabled = true,
  titleAs: TitleTag = "h1",
}: {
  model: ViewerModel;
  /** Open on this diagram (share deep links); unknown ids fall back to root. */
  initialDiagramId?: string;
  /** Where the model came from — enables the Share control when provided. */
  share?: ShareSource;
  /** Reports which diagram is on screen (initial diagram included). */
  onDiagramChange?: (diagramId: string) => void;
  /**
   * Makes the canvas editable and reports each finished node move. Absent —
   * every host but the playground — and the canvas stays read-only.
   *
   * The shell only forwards it. It deliberately holds no edit state of its
   * own: the position a node lands at has to become TEXT to survive, and the
   * only thing that owns the text is the page above this one.
   */
  edit?: CanvasEditHandlers;
  /**
   * True when the HOST can edit this diagram, whether or not editing is
   * switched on right now.
   *
   * SEPARATE FROM `edit` BECAUSE THE TWO ANSWER DIFFERENT QUESTIONS, and
   * conflating them shipped a bug: "Edit this diagram" was hidden whenever
   * `edit` was passed, which is right for an unlocked playground — but locking
   * the canvas withdraws the handlers, so `edit` went undefined and the link
   * came back. Locking a diagram made a button appear offering to open it
   * somewhere you already were.
   *
   * `edit` is "editing is on"; this is "editing is possible here". The link is
   * for hosts where it is not.
   */
  canEdit?: boolean;
  /**
   * Start in immersive mode. For a page that exists only to show one model
   * (`/view/[modelId]`) — where the diagram IS the page, so the site chrome is
   * a frame around nothing else. Left off when the shell is embedded in a
   * larger page: fixing it over the viewport would cover its own host.
   */
  defaultImmersive?: boolean;
  /**
   * Whether this shell offers the tour at all. On by default — a page that
   * exists to show a model wants it.
   *
   * `false` is for a host that embeds the shell as EVIDENCE rather than as
   * the destination — a preview beside something else. A card opening itself
   * over a preview teaches the wrong page's controls, and spends the reader's
   * one first visit somewhere it does not apply.
   */
  tour?: boolean;
  /**
   * Heading level for the model's title.
   *
   * `h1` is right where this shell IS the page — `/view/[modelId]`, whose
   * only heading is the model's name. It is wrong inside the playground,
   * which has its own `h1` above it: two `h1`s on one document leaves both
   * a screen reader's heading list and a crawler's topic signal with no
   * primary, and `/view` and `/view/c4` were shipping exactly that.
   */
  titleAs?: "h1" | "h2";
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
  // Drill order for the export-all archive. Memoised on the model, not the
  // current diagram: navigating levels must not re-walk the hierarchy.
  const allDiagrams = useMemo(
    () => diagramsInDrillOrder(frozenModel),
    [frozenModel],
  );

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

  /*
   * Idle motion: the reader's toggle, their OS preference, and the attribute
   * the canvas CSS gates on. Shared with the sequence viewer — one preference
   * for "should diagrams keep moving", not one per route.
   */
  const reducedMotion = useReducedMotion();
  const idleMotion = useIdleMotion();
  const idleState = idleMotionState(reducedMotion, idleMotion);

  // The tour card only mounts once opened, so its Escape listener always
  // registers AFTER this shell's rung-4 listener above — making "close the
  // tour" the ladder's last rung, per the design in components/ui/tour.tsx.
  const tour = useTour(C4_TOUR_KEY);

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-background",
        // Immersive: cover the viewport (site chrome is behind, untouched).
        isImmersive && "fixed inset-0 z-50",
      )}
      /* Carries the reader's idle-motion choice AND their reduced-motion
         preference down to the canvas CSS. An attribute, not a custom property:
         switching this off has to withdraw the drift overlay entirely, and only
         a selector can retract a rule. See lib/idle-motion.ts. */
      data-af-idle={idleState}
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
          edit={edit}
        />
        {/* First visit it opens itself (remembered per browser — see
            components/ui/tour.tsx for the persistence verdicts); the strip's
            Tour button replays it. Anchored above the canvas's bottom-left
            zoom pill — the corner its first steps point at — and clear of
            the top-right detail panel and bottom-right minimap. */}
        {tourEnabled ? (
          <Tour
            steps={C4_TOUR_STEPS}
            handle={tour}
            label="C4 viewer tour"
            className="absolute bottom-14 left-3 z-20"
          />
        ) : null}
      </div>

      <header className="border-t border-border/60 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <TitleTag className="truncate text-lg font-semibold tracking-tight text-foreground">
                {frozenModel.title}
              </TitleTag>
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
              <ShareButton
                share={share}
                documentTitle={frozenModel.title}
                route="/view"
                noun="model"
                diagram={currentDiagram}
                rootDiagramId={frozenModel.rootDiagramId}
                onAnnounce={setAnnouncement}
              />
            ) : null}
            <ViewerExportButton
              modelTitle={frozenModel.title}
              diagram={currentDiagram}
              allDiagrams={allDiagrams}
              tagColors={frozenModel.file.metadata.tagColors}
            />
            {/* The tour's replay button. In this strip rather than on the
                canvas: the canvas corners are all taken (breadcrumb, detail
                panel, zoom pill, minimap), and the strip is already where
                this view's mode-level controls live. Gone entirely when the
                host opted out — a button that teaches this view's controls
                has no business on a page that embeds the view as a preview of
                something else. */}
            {tourEnabled ? (
              <button
                type="button"
                onClick={tour.start}
                aria-label="Show the feature tour"
                title="Tour the controls"
                className={controlClasses}
              >
                <HelpCircle aria-hidden="true" />
                <span className="hidden sm:inline">Tour</span>
              </button>
            ) : null}
            {/* Idle motion, matching the sequence viewer's control down to the
                behaviour: a real button with aria-pressed, announced through
                the shell's existing live region, persisted, and DISABLED under
                reduced motion rather than pretending — the OS preference wins
                outright, and a toggle claiming to enable motion it will not run
                would be lying. The preference is shared with the sequence
                viewer, because "stop the diagrams moving" is a statement about
                diagrams, not about a route. */}
            <button
              type="button"
              onClick={() => {
                const next = !readIdleMotion();
                writeIdleMotion(next);
                setAnnouncement(
                  next
                    ? "Idle motion on — connectors drift to show their direction."
                    : "Idle motion off — the diagram holds still until you touch it.",
                );
              }}
              disabled={reducedMotion}
              aria-pressed={!reducedMotion && idleMotion}
              aria-label={
                reducedMotion
                  ? "Idle motion unavailable — your system prefers reduced motion"
                  : idleMotion
                    ? "Turn idle motion off"
                    : "Turn idle motion on"
              }
              title={
                reducedMotion
                  ? "Reduced motion is on"
                  : idleMotion
                    ? "Idle motion: on"
                    : "Idle motion: off"
              }
              className={cn(
                controlClasses,
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <Waves aria-hidden="true" />
            </button>
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
            {/* THE LINK IS FOR HOSTS THAT CANNOT EDIT. Its job is to hand the
                model to a page that can, so on a host that could edit it in
                place the link would point at where the reader already is.
                Gated on `canEdit` — the host's CAPABILITY — not on `edit`,
                which is only whether editing is on this instant: locking the
                canvas withdraws the handlers, and gating on those alone made
                the link reappear the moment a reader locked the diagram to
                present it. */}
            {edit !== undefined ||
            canEdit === true ? null : CANVAS_EDIT_ENABLED ? (
              <EditModeLink model={frozenModel} diagramId={currentDiagramId} />
            ) : (
              <Badge variant="outline" className="shrink-0">
                Editing — coming soon
              </Badge>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
