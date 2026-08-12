"use client";

/**
 * The view-mode export control: a menu offering SVG (clean vector) or PNG
 * (rasterised at 2×), for either the diagram on screen or every diagram in the
 * model.
 *
 * The scope is a segmented choice ABOVE the two formats rather than four menu
 * items. Scope and format are independent questions — "which diagrams" and
 * "which file type" — and a flat list of four would have made them look like
 * one, so picking "All views" then "PNG" would read as two competing options
 * instead of two halves of one answer. It also keeps the menu the same height
 * as it was.
 *
 * Multi-diagram exports arrive as a single ZIP (`./zip.ts`). The obvious
 * alternative, N sequential downloads, is throttled or outright blocked by
 * every browser after the first file, and it drops five loose images into the
 * downloads folder with no indication they belong together.
 *
 * The image is generated from the MODEL (see `render-svg.ts`), with colours
 * resolved from the live theme tokens ONCE per export, so every diagram in a
 * multi-export shares one palette and light/dark both match the screen.
 *
 * Keyboard: the trigger is a normal button (`aria-expanded`/`aria-haspopup`),
 * the menu items are buttons, Escape closes and returns focus, and the
 * outcome ("Exported shopflow-diagrams.zip") is announced politely.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileImage,
  FileCode2,
  Film,
} from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { C4Diagram } from "@/types";

import {
  archiveEntryName,
  downloadBlob,
  downloadPng,
  downloadSvg,
  fileStem,
  renderPngBlob,
  PNG_SCALE,
} from "./download";
import {
  C4_SHARPNESS,
  C4_SMOOTHNESS,
  DEFAULT_C4_GIF_QUALITY,
  renderDiagramGif,
  type C4Sharpness,
  type C4Smoothness,
} from "./frames";
import { renderDiagramSvg } from "./render-svg";
import { resolveExportTheme, resolveTagPaint } from "./theme";
import { createZip, type ZipEntry } from "./zip";

const LEVEL_LABEL: Record<C4Diagram["level"], string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

/** Which diagrams an export covers. */
type ExportScope = "current" | "all";

/**
 * One half of the scope segment. Disabled when a single-diagram model makes
 * "all views" the same thing as "this view" — offered but inert reads more
 * honestly than an option that silently does nothing different.
 */
function ScopeOption({
  scope,
  current,
  onSelect,
  label,
  disabled = false,
}: {
  scope: ExportScope;
  current: ExportScope;
  onSelect: (scope: ExportScope) => void;
  label: string;
  disabled?: boolean;
}): React.JSX.Element {
  const selected = current === scope;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onSelect(scope)}
      className={cn(
        "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

export interface ViewerExportButtonProps {
  modelTitle: string;
  /** The diagram currently on screen — what the "This view" scope exports. */
  diagram: C4Diagram;
  /**
   * Every diagram in the model, in drill order
   * (`viewer/lib/model.ts: diagramsInDrillOrder`) — what the "All views" scope
   * exports, and the order the archive lists them in.
   *
   * Passed in rather than derived here so this component stays a pure function
   * of its props and never needs the model or the service.
   */
  allDiagrams: readonly C4Diagram[];
  /** The model's `metadata.tagColors`, so exports keep author overrides. */
  tagColors?: Readonly<Record<string, string>>;
}

export function ViewerExportButton({
  modelTitle,
  diagram,
  allDiagrams,
  tagColors,
}: ViewerExportButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("current");
  /*
   * The same two axes the sequence exporter offers, and the same reasoning:
   * sharpness is pixels (whether small labels survive), smoothness is frames
   * per loop (how finely the drift is sampled). Kept separate because a big
   * jerky GIF and a small fluid one are both reasonable things to want.
   */
  const [sharpness, setSharpness] = useState<C4Sharpness>(
    DEFAULT_C4_GIF_QUALITY.sharpness,
  );
  const [smoothness, setSmoothness] = useState<C4Smoothness>(
    DEFAULT_C4_GIF_QUALITY.smoothness,
  );
  const [busy, setBusy] = useState(false);
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
    async (kind: "svg" | "png" | "gif") => {
      setOpen(false);
      setBusy(true);
      const stem = fileStem(modelTitle);
      try {
        // Resolved ONCE, outside the loop: reading the live tokens per diagram
        // would let a theme switch mid-export produce a half-light archive.
        const theme = resolveExportTheme();
        const render = (target: C4Diagram) =>
          renderDiagramSvg(target, modelTitle, theme, {
            tagColors,
            paintForTagColor: (tagColor) => resolveTagPaint(tagColor, theme),
          });

        if (scope === "current") {
          const filename = `${stem}-${diagram.level}.${kind}`;
          const rendered = render(diagram);
          if (kind === "svg") {
            downloadSvg(rendered, filename);
          } else if (kind === "png") {
            await downloadPng(rendered, filename, C4_SHARPNESS[sharpness] * 2);
          } else {
            /*
             * GIF: one loop of the connectors drifting, which is the thing a
             * still of a C4 diagram cannot say. Single diagram only — an
             * archive of animations would multiply an already slow encode by
             * the whole drill-down tree, so the option is offered where it is
             * cheap and withheld where it is not.
             */
            setAnnouncement("Building the animation — this takes a moment.");
            const gif = await renderDiagramGif(
              rendered,
              { sharpness, smoothness },
              undefined,
              // The canvas's own drift colour, from the same theme read that
              // painted the frame — so the loop cannot drift away from the page.
              theme.edgeDrift,
              theme.primary,
            );
            if (gif === null) {
              setAnnouncement(
                "Nothing to animate — this diagram has no connectors, so every frame would be identical.",
              );
              return;
            }
            downloadBlob(
              new Blob([gif as BlobPart], { type: "image/gif" }),
              filename,
            );
          }
          setAnnouncement(`Exported ${filename}.`);
          return;
        }

        const entries: ZipEntry[] = [];
        const used = new Set<string>();
        for (const [index, target] of allDiagrams.entries()) {
          const rendered = render(target);
          entries.push({
            name: archiveEntryName(target, index, kind, used),
            data:
              kind === "svg"
                ? new TextEncoder().encode(rendered.svg)
                : new Uint8Array(
                    await (await renderPngBlob(rendered)).arrayBuffer(),
                  ),
          });
        }
        const filename = `${stem}-diagrams-${kind}.zip`;
        downloadBlob(createZip(entries, new Date()), filename);
        setAnnouncement(
          `Exported ${filename} — ${entries.length} diagram${entries.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setAnnouncement(`Export failed: ${detail}`);
      } finally {
        setBusy(false);
      }
    },
    [allDiagrams, diagram, modelTitle, scope, tagColors, sharpness, smoothness],
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
          {/* Scope. A radiogroup rather than two menuitems: these are two
              states of one setting, and a screen reader should hear "1 of 2
              selected", not two independent commands. */}
          <div
            role="radiogroup"
            aria-label="How much to export"
            className="mb-1.5 flex gap-1 rounded-md bg-secondary/60 p-1"
          >
            <ScopeOption
              scope="current"
              current={scope}
              onSelect={setScope}
              label="This view"
            />
            <ScopeOption
              scope="all"
              current={scope}
              onSelect={setScope}
              label={`All ${allDiagrams.length} views`}
              disabled={allDiagrams.length < 2}
            />
          </div>

          <p className="px-2.5 pb-2 text-xs leading-snug text-muted-foreground">
            {scope === "current" ? (
              <>
                Exports the diagram you are viewing:{" "}
                <span className="font-medium text-foreground">
                  {diagram.title}
                </span>{" "}
                ({LEVEL_LABEL[diagram.level]} view).
              </>
            ) : (
              <>
                Exports all{" "}
                <span className="font-medium text-foreground">
                  {allDiagrams.length} diagrams
                </span>{" "}
                — every level, in drill order — as one{" "}
                <span className="font-mono">.zip</span>.
              </>
            )}
          </p>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void runExport("svg")}
            className={itemClasses}
          >
            <FileCode2 aria-hidden="true" className="size-4 text-primary" />
            <span>
              {scope === "all" ? "Download SVG archive" : "Download SVG"}
              <span className="block text-xs text-muted-foreground">
                Vector — crisp at any size
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void runExport("png")}
            className={itemClasses}
          >
            <FileImage aria-hidden="true" className="size-4 text-primary" />
            <span>
              {scope === "all" ? "Download PNG archive" : "Download PNG"}
              <span className="block text-xs text-muted-foreground">
                Raster at {PNG_SCALE * C4_SHARPNESS[sharpness]}× resolution
              </span>
            </span>
          </button>
          {/* GIF is offered for ONE diagram only. An archive of animations
              would multiply an already slow encode by the whole drill-down
              tree, so the item is withheld rather than shown and refused —
              a menu entry that exists to say no is worse than one that is not
              there. */}
          {scope === "current" ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void runExport("gif")}
              className={itemClasses}
            >
              <Film aria-hidden="true" className="size-4 text-primary" />
              <span>
                Download GIF
                <span className="block text-xs text-muted-foreground">
                  One loop of the connectors drifting
                </span>
              </span>
            </button>
          ) : null}

          {/* The two axes, under the formats they modify. Inline rather than
              behind a second disclosure: this menu is already a disclosure, and
              nesting one inside another buys tidiness at the cost of a reader
              finding the setting at all. */}
          <div className="mt-1 flex flex-col gap-2 border-t border-border pt-2">
            <label className="flex flex-col gap-1 px-2.5 text-xs text-muted-foreground">
              Sharpness
              <select
                value={sharpness}
                disabled={busy}
                onChange={(event) =>
                  setSharpness(event.target.value as C4Sharpness)
                }
                className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="compact">
                  Compact · PNG 2× · smallest file
                </option>
                <option value="standard">Standard · PNG 3×</option>
                <option value="sharp">Sharp · PNG 4× · slowest</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 px-2.5 text-xs text-muted-foreground">
              Smoothness
              <select
                value={smoothness}
                disabled={busy || scope !== "current"}
                onChange={(event) =>
                  setSmoothness(event.target.value as C4Smoothness)
                }
                className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
              >
                <option value="simple">
                  Simple · {C4_SMOOTHNESS.simple.frames} frames
                </option>
                <option value="standard">
                  Standard · {C4_SMOOTHNESS.standard.frames} frames
                </option>
                <option value="smooth">
                  Smooth · {C4_SMOOTHNESS.smooth.frames} frames
                </option>
              </select>
            </label>
            <p className="px-2.5 text-[11px] leading-4 text-muted-foreground">
              Sharpness applies to PNG and GIF; SVG is vector and ignores it.
              Smoothness is frames per loop, so it reaches the GIF only — the
              loop stays the same length, so more frames means finer motion
              rather than slower.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
