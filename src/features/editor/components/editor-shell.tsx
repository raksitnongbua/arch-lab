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

import { useSyncExternalStore } from "react";

import { Toaster } from "@/components/ui/toast";

import { Breadcrumb } from "./breadcrumb";
import { Canvas } from "./canvas";
import { DirtyIndicator } from "./dirty-indicator";
import { FileActions } from "./file-actions";
import { InspectorPanel } from "./inspector/inspector-panel";
import { Palette } from "./palette";
import { RecoveryPrompt } from "./recovery-prompt";

const emptySubscribe = () => () => {};

export function EditorShell(): React.JSX.Element {
  // Hydration-safe mounted guard (D17): false on the server and during
  // hydration, true on the client — with no setState-in-effect cascade.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

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
          <Breadcrumb />
          <DirtyIndicator />
          <div className="flex-1" />
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
