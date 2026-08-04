"use client";

/**
 * The view-mode export control: a small menu button offering the current
 * diagram as SVG (clean vector) or PNG (rasterised at 2×). The menu names
 * exactly what will be exported — the diagram being viewed, at its level —
 * so multi-level models never surprise anyone with a partial file.
 *
 * The image is generated from the MODEL (see `render-svg.ts`), with colours
 * resolved from the live theme tokens at click time, so light and dark
 * exports both match what is on screen.
 *
 * Keyboard: the trigger is a normal button (`aria-expanded`/`aria-haspopup`),
 * the menu items are buttons, Escape closes and returns focus, and the
 * outcome ("Exported shopflow-container.png") is announced politely.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download, FileImage, FileCode2 } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { C4Diagram } from "@/types";

import { downloadPng, downloadSvg, fileStem, PNG_SCALE } from "./download";
import { renderDiagramSvg } from "./render-svg";
import { resolveExportTheme, resolveTagPaint } from "./theme";

const LEVEL_LABEL: Record<C4Diagram["level"], string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

export interface ViewerExportButtonProps {
  modelTitle: string;
  /** The diagram currently on screen — exactly what gets exported. */
  diagram: C4Diagram;
  /** The model's `metadata.tagColors`, so exports keep author overrides. */
  tagColors?: Readonly<Record<string, string>>;
}

export function ViewerExportButton({
  modelTitle,
  diagram,
  tagColors,
}: ViewerExportButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on click-away and on Escape (returning focus to the trigger).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root !== null &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    // Capture phase: this Escape must never reach the canvas's climb ladder.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const runExport = useCallback(
    async (kind: "svg" | "png") => {
      setOpen(false);
      const filename = `${fileStem(modelTitle)}-${diagram.level}.${kind}`;
      try {
        const theme = resolveExportTheme();
        const rendered = renderDiagramSvg(diagram, modelTitle, theme, {
          tagColors,
          paintForTagColor: (tagColor) => resolveTagPaint(tagColor, theme),
        });
        if (kind === "svg") downloadSvg(rendered, filename);
        else await downloadPng(rendered, filename);
        setAnnouncement(`Exported ${filename}.`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setAnnouncement(`Export failed: ${detail}`);
      }
    },
    [diagram, modelTitle, tagColors],
  );

  const itemClasses =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        <Download aria-hidden="true" />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("!size-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Export the current diagram"
          /* Opens UPWARD. Its host strip sits at the BOTTOM of the shell, so a
             menu hanging below the trigger lands past the bottom of the
             viewport — and in immersive mode the page cannot scroll, which
             made Export unusable rather than merely awkward.

             Right-aligned only from `sm` up. On a phone this trigger sits near
             the LEFT of the strip, and a 16rem menu aligned to its right edge
             started at -126px — off the screen. Same left/right flip the Share
             panel uses, and the width is clamped to the viewport for the same
             reason. */
          className="absolute bottom-full left-0 z-50 mb-1.5 w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-1.5 shadow-lg sm:right-0 sm:left-auto"
        >
          <p className="px-2.5 pt-1 pb-2 text-xs leading-snug text-muted-foreground">
            Exports the diagram you are viewing:{" "}
            <span className="font-medium text-foreground">{diagram.title}</span>{" "}
            ({LEVEL_LABEL[diagram.level]} view).
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => void runExport("svg")}
            className={itemClasses}
          >
            <FileCode2 aria-hidden="true" className="size-4 text-primary" />
            <span>
              Download SVG
              <span className="block text-xs text-muted-foreground">
                Vector — crisp at any size
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void runExport("png")}
            className={itemClasses}
          >
            <FileImage aria-hidden="true" className="size-4 text-primary" />
            <span>
              Download PNG
              <span className="block text-xs text-muted-foreground">
                Raster at {PNG_SCALE}× resolution
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
