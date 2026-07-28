"use client";

/**
 * The editor shell. FINAL THIS SPRINT (dev-handoff D9) — every panel and
 * overlay the sprint needs is already mounted below as a props-free,
 * store-reading component (§4.4). Later tickets replace their stub's body;
 * nobody reopens this file.
 *
 * Layout frames (rail widths, borders, header strip) are owned here so
 * replacing a stub never moves the chrome. The canvas renders behind a
 * mounted-guard (D17): the shell itself server-renders fine, React Flow
 * mounts client-side only, with a token-styled placeholder to avoid a flash.
 */

import { useState, useSyncExternalStore } from "react";
import { Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";

import { ModelTextPane } from "../text-pane";
import { Breadcrumb } from "./breadcrumb";
import { Canvas } from "./canvas";
import { DirtyIndicator } from "./dirty-indicator";
import { FileActions } from "./file-actions";
import { InspectorPanel } from "./inspector/inspector-panel";
import { OpenFileIndicator } from "./open-file-indicator";
import { Palette } from "./palette";
import { RecoveryPrompt } from "./recovery-prompt";
import { ViewModeLink } from "./view-mode-link";

const emptySubscribe = () => () => {};

export function EditorShell(): React.JSX.Element {
  // Hydration-safe mounted guard (D17): false on the server and during
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
    <div className="flex min-h-0 flex-1">
      {/* Left rail — palette slot (T2-B fills the stub). */}
      <aside
        aria-label="Node palette"
        className="hidden w-52 shrink-0 border-r border-border bg-background sm:block"
      >
        <Palette />
      </aside>

      {/* Centre column — header strip + canvas. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* `@container`: the labels below hide on the width of THIS COLUMN, not the
            viewport. A viewport breakpoint cannot see that opening a rail just
            took 384px off the row — at 1440px wide the window is "large" while
            the column is cramped, which is exactly how Save ended up
            underneath the panel. */}
        <header className="@container flex h-12 min-w-0 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
          <Breadcrumb />
          {/* Sits after the title, by request. The breadcrumb before it is
              the row's one shrinkable item, so this button's position is only
              as stable as that element's width — see the note on the nav's
              min-width floor in breadcrumb.tsx. Measured at 1280/1440/1680
              with the panel opening: the title holds its width at all three,
              so the button does not move under the cursor. It would begin to
              again if the title grew long enough to be squeezed. */}
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
          {/* One shrink-0 group: the row gives up space at the breadcrumb
              and the spacer, never by clipping the controls at its end. */}
          <div className="flex shrink-0 items-center gap-2">
            <ViewModeLink />
            <FileActions />
          </div>
        </header>
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
          /* Narrower until there is room to spare. At 1280 the palette, the
             inspector and a 24rem pane leave the centre column too little to
             hold its own toolbar, which is how Save ended up under the panel
             edge. */
          className="flex w-full max-w-[28rem] shrink-0 border-l border-border bg-background sm:w-80 2xl:w-96"
        >
          <ModelTextPane />
        </aside>
      ) : null}

      {/* Right rail — inspector slot (T2-D fills the stub). */}
      <aside
        aria-label="Inspector"
        className="hidden w-72 shrink-0 border-l border-border bg-background md:block"
      >
        <InspectorPanel />
      </aside>

      {/* Global editor overlays. */}
      <RecoveryPrompt />
      <Toaster />
    </div>
  );
}
