"use client";

/**
 * The editor shell. FINAL THIS SPRINT — every panel and
 * overlay the sprint needs is already mounted below as a props-free,
 * store-reading component. Later tickets replace their stub's body;
 * nobody reopens this file.
 *
 * Layout frames (rail widths, borders, header strip) are owned here so
 * replacing a stub never moves the chrome. The canvas renders behind a
 * mounted-guard: the shell itself server-renders fine, React Flow
 * mounts client-side only, with a token-styled placeholder to avoid a flash.
 */

import { useState, useSyncExternalStore } from "react";
import { Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { ModelTextPane } from "../text-pane";
import { Breadcrumb } from "./breadcrumb";
import { Canvas } from "./canvas";
import { DirtyIndicator } from "./dirty-indicator";
import { FileActions } from "./file-actions";
import { InspectorPanel } from "./inspector/inspector-panel";
import { ModelHandoff } from "./model-handoff";
import { OpenFileIndicator } from "./open-file-indicator";
import { Palette } from "./palette";
import { RecoveryPrompt } from "./recovery-prompt";
import { ViewModeLink } from "./view-mode-link";

const emptySubscribe = () => () => {};

export function EditorShell(): React.JSX.Element {
  // Hydration-safe mounted guard: false on the server and during
  // hydration, true on the client — with no setState-in-effect cascade.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // The text pane is opt-in rather than always mounted: it is a second way to
  // author the SAME model, not a permanent panel, and three rails at once
  // leaves the canvas too narrow to work in. Closed by default so the editor
  // still opens on a canvas; local state, because which panels you have open
  // is not part of the model and must never mark the document dirty.
  const [textPaneOpen, setTextPaneOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Renders nothing; opens the model in `#m=…` when arriving from view
          mode's "Edit this diagram". Mounted before RecoveryPrompt so the
          store already holds the handed-over model when recovery evaluates. */}
      <ModelHandoff />
      {/* The toolbar spans the whole app, not the canvas column.

          It used to live inside that column, which made its width a function
          of which rails happened to be open: opening the text pane took 384px
          off it, so the breadcrumb collapsed, controls slid under the panel,
          and at 768px the header was clipped to 24px with Save unreachable.
          Full width, none of that is expressible — the rails below can come
          and go and the toolbar never changes size. */}
      <header className="@container flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
        <Breadcrumb />
        <Button
          variant={textPaneOpen ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={textPaneOpen}
          /* Names the panel, not the verb: the pressed state already says
             whether it is open, and a label that flips between Show/Hide
             re-announces on every toggle. */
          aria-label="Model text"
          className="shrink-0"
          onClick={() => setTextPaneOpen((open) => !open)}
        >
          <Code2 aria-hidden="true" />
          <span className="hidden @[46rem]:inline">Model text</span>
        </Button>
        <OpenFileIndicator />
        <DirtyIndicator />
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-2">
          <ViewModeLink />
          <FileActions />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left rail — palette slot (fills the stub). */}
        <aside
          aria-label="Node palette"
          /* Stood down with the canvas: the palette exists to drag ONTO the
             canvas, so while the canvas is away it only spends width the text
             pane needs. */
          className={cn(
            "w-52 shrink-0 border-r border-border bg-background",
            textPaneOpen ? "hidden xl:block" : "hidden sm:block",
          )}
        >
          <Palette />
        </aside>

        {/* Canvas column. Hidden — not squeezed — while the text pane is open
          below `xl`: there is no width at which both are usable, and a canvas
          crushed to 0px with the page overflowing sideways is worse than one
          honestly put away. */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            textPaneOpen ? "hidden xl:flex" : "flex",
          )}
        >
          <div className="relative min-h-96 flex-1 bg-canvas">
            {mounted ? (
              <Canvas />
            ) : (
              <div
                aria-hidden="true"
                className="size-full animate-pulse bg-canvas"
              />
            )}
          </div>
        </div>

        {/* Model text rail — the same model as text, live and editable.

          Deliberately NOT hidden below a breakpoint, unlike the palette and
          inspector rails: on a narrow viewport those two disappear and the
          canvas becomes read-only in practice, so the text pane is the only
          way left to add a node or write a description. It is opt-in, so it
          costs nothing when closed. */}
        {textPaneOpen ? (
          <aside
            aria-label="Model text"
            /* Below `xl` it IS the workspace — full width, with the canvas and
             both rails stood down. From `xl` it is a rail beside the canvas,
             and
             narrower until there is room to spare: at 1280 the palette, the
             inspector and a 24rem pane left the centre column too little to
             hold its own toolbar. */
            className="flex min-w-0 flex-1 border-l border-border bg-background xl:w-80 xl:flex-none xl:shrink-0 2xl:w-96"
          >
            <ModelTextPane />
          </aside>
        ) : null}

        {/* Right rail — inspector slot (fills the stub). */}
        <aside
          aria-label="Inspector"
          /* Same reasoning as the palette: it edits the canvas selection, so
             it has nothing to act on while the canvas is stood down. */
          className={cn(
            "w-72 shrink-0 border-l border-border bg-background",
            textPaneOpen ? "hidden xl:block" : "hidden md:block",
          )}
        >
          <InspectorPanel />
        </aside>
      </div>

      {/* Global editor overlays. */}
      <RecoveryPrompt />
      <Toaster />
    </div>
  );
}
