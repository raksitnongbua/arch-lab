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
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
          {/* FIRST in the row, before the breadcrumb. Opening the pane takes
              width off this column, and flexbox settles that against whatever
              can shrink — so anything after a flexible sibling moves, and the
              button you just pressed slid out from under the cursor. Pinned
              to the header's leading edge it has nothing to its left that can
              resize, so its position is fixed whatever the panel does. */}
          <Button
            variant={textPaneOpen ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={textPaneOpen}
            /* Names the panel, not the verb: the pressed state already says
               whether it is open, and a label that flips between Show/Hide
               re-announces on every toggle. */
            aria-label="Model text"
            onClick={() => setTextPaneOpen((open) => !open)}
          >
            <Code2 aria-hidden="true" />
            <span className="hidden lg:inline">Model text</span>
          </Button>
          <Breadcrumb />
          <DirtyIndicator />
          <div className="flex-1" />
          <ViewModeLink />
          <FileActions />
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
          className="flex w-full max-w-[28rem] shrink-0 border-l border-border bg-background sm:w-96"
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
