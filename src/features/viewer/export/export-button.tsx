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

import { useCallback, useId, useRef, useState } from "react";
import {
  ClipboardCopy,
  ChevronDown,
  Download,
  FileImage,
  FileCode2,
  Film,
} from "lucide-react";

import { useBrowserCapability } from "@/lib/browser-capability";
import { buttonClasses } from "@/components/ui/button";
import { useMenuDismissal } from "@/components/ui/menu-dismissal";
import {
  MENU_ITEM_CLASSES,
  MENU_ITEM_HINT_CLASSES,
} from "@/components/ui/menu-item";
import { toast } from "@/components/ui/toast";
import { LEVEL_LABEL } from "@/lib/constants";
import {
  DEFAULT_DIAGRAM_FRAMING,
  DIAGRAM_FRAMINGS,
  DIAGRAM_FRAMING_LABEL,
  framingPadding,
  reframeSvg,
  type DiagramFraming,
} from "@/lib/diagram-framing";
import { cn } from "@/lib/utils";
import type { C4Diagram } from "@/types";
import { describeError } from "@/lib/errors";

import { resolveExportGround } from "./ground";
import {
  archiveEntryName,
  canCopyPng,
  copyPngToClipboard,
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
import { embeddedIconSvg } from "./icon-markup-client";
import { renderDiagramSvg } from "./render-svg";
import { resolveExportTheme, resolveTagPaint } from "./theme";
import { createZip, type ZipEntry } from "./zip";

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
  /* THE FRAME, alongside Sharpness rather than remembered: it is a property
     of the file you are making now (this one goes in a deck, that one in a
     README), not a way you like to see diagrams. Icon style is the opposite
     case and is a stored preference for exactly that reason. */
  const [framing, setFraming] = useState<DiagramFraming>(
    DEFAULT_DIAGRAM_FRAMING,
  );
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /* The menu is shut until someone opens it, so the Copy row never appears
     late in front of a reader. */
  const copyable = useBrowserCapability(canCopyPng);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  /* THE DISMISSAL CONTRACT, from the shared hook rather than a fourth copy
     of it. This panel hand-rolled the pair for a release and carried the bug
     the hook's header now records: its outside-`pointerdown` was on the
     BUBBLE phase, and the C4 canvas stops propagation on the press that
     begins a pan — so clicking the empty canvas, which is what anyone does
     to dismiss a panel, panned the diagram and left the panel open. The
     close callback also returns focus to the trigger, which is the one thing
     this panel needs beyond the contract. */
  const dismiss = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useMenuDismissal(open, dismiss, rootRef);

  const runExport = useCallback(
    async (kind: "svg" | "png" | "gif" | "copy") => {
      setOpen(false);
      setBusy(true);
      const stem = fileStem(modelTitle);
      try {
        // Resolved ONCE, outside the loop: reading the live tokens per diagram
        // would let a theme switch mid-export produce a half-light archive.
        const theme = resolveExportTheme();
        /* Read ONCE beside the theme, and for the same reason: the sheet has
           to be the one the reader is looking at, and a letterboxed frame
           needs it painted over the band as well as under the drawing —
           `reframeSvg` relays it rather than leaving the margin unruled. */
        const ground = resolveExportGround();
        /* THE FRAME IS TWO STEPS, and they are not interchangeable. The
           margin goes INTO the renderer, because only it knows what its
           margin is and what hangs inside it; the aspect ratio is applied to
           the finished file, because expanding a viewBox is pure geometry.
           `lib/diagram-framing.ts` carries the argument. */
        const render = (target: C4Diagram) =>
          reframeSvg(
            renderDiagramSvg(target, modelTitle, theme, {
              embedIcon: embeddedIconSvg,
              tagColors,
              paintForTagColor: (tagColor) => resolveTagPaint(tagColor, theme),
              padding: framingPadding(framing),
            }),
            framing,
            theme.canvas,
            ground,
          );

        if (scope === "current") {
          const filename = `${stem}-${diagram.level}.${kind}`;
          const rendered = render(diagram);
          if (kind === "copy") {
            /* Rendered from the same `render()` as every other kind, so what
               lands on the clipboard is the file the download would have been.
               `copyPngToClipboard` is handed the un-awaited blob on purpose —
               Safari spends the user gesture otherwise. */
            await copyPngToClipboard(rendered, C4_SHARPNESS[sharpness] * 2);
            /* A TOAST, not only the live region. The announcement below is
               `sr-only`, so a sighted reader got no signal at all — success
               and failure looked identical, which is exactly how a working
               copy reads as broken. */
            setAnnouncement("Copied the diagram to the clipboard as a PNG.");
            toast({ message: "Copied as PNG — paste it anywhere." });
            return;
          }
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
        const detail = describeError(error);
        setAnnouncement(`Export failed: ${detail}`);
        /* Failures were sr-only too, so an export that could not happen said
           nothing to most people. */
        toast({ message: `Export failed: ${detail}`, tone: "error" });
      } finally {
        setBusy(false);
      }
    },
    [
      allDiagrams,
      diagram,
      modelTitle,
      scope,
      tagColors,
      framing,
      sharpness,
      smoothness,
    ],
  );

  /* Shared with the sequence exporter — see `ui/menu-item.ts` for why. */
  const itemClasses = MENU_ITEM_CLASSES;

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

          {/* WHAT THE SCOPE MEANS, in one line under the control that sets
              it. It was three lines of prose repeating the words already on
              the segmented control above ("Exports the diagram you are
              viewing…"); what a reader cannot see for themselves is WHICH
              diagram, and for the archive, that it arrives as one file. */}
          <p className="truncate px-2.5 pb-2 text-xs text-muted-foreground">
            {scope === "current" ? (
              <>
                <span className="font-medium text-foreground">
                  {diagram.title}
                </span>{" "}
                · {LEVEL_LABEL[diagram.level]} view
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {allDiagrams.length} diagrams
                </span>{" "}
                · every level, in drill order, as one{" "}
                <span className="font-mono">.zip</span>
              </>
            )}
          </p>
          {/* COPY comes first, and only for the diagram on screen: an archive
              has nothing to put on a clipboard. It is the shortest path from
              "I am looking at this" to "it is in the document I am writing",
              which is more often what a reader wants than a file in Downloads
              they then have to find and attach. Hidden, not disabled, where
              the browser cannot do it — see `canCopyPng`. */}
          {scope === "current" && copyable ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void runExport("copy")}
              className={itemClasses}
            >
              <ClipboardCopy
                aria-hidden="true"
                className="size-4 text-primary"
              />
              <span>
                Copy PNG
                <span className={MENU_ITEM_HINT_CLASSES}>
                  To the clipboard at {PNG_SCALE * C4_SHARPNESS[sharpness]}×
                  resolution
                </span>
              </span>
            </button>
          ) : null}
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
              <span className={MENU_ITEM_HINT_CLASSES}>
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
              <span className={MENU_ITEM_HINT_CLASSES}>
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
                <span className={MENU_ITEM_HINT_CLASSES}>
                  One loop of the connectors drifting
                </span>
              </span>
            </button>
          ) : null}

          {/* THE THREE AXES, AS A LIST RATHER THAN A FORM. Each was a
              stacked label-above-select, which is three rows tall apiece and
              pushed the sentence explaining them off the bottom of a menu
              that already opens upward — and the Framing select, given the
              full width, still truncated its own longest option to "Fit ·
              The drawing with its usual ma". Label left, value right, one
              bordered group: the same shape the Share panel's settings take,
              and short names that fit.

              Inline rather than behind a second disclosure — this menu is
              already a disclosure, and nesting one inside another buys
              tidiness at the cost of a reader finding the setting at all.
              The SENTENCE about what they do is a different matter and is
              the disclosure below: it is read once, not on every export. */}
          <div className="mt-1 border-t border-border pt-1.5">
            <div className="divide-y divide-border/60 rounded-md border border-border/60">
              <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                <span>Framing</span>
                <select
                  value={framing}
                  disabled={busy}
                  onChange={(event) =>
                    setFraming(event.target.value as DiagramFraming)
                  }
                  className="-mr-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-foreground hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  {DIAGRAM_FRAMINGS.map((option) => (
                    <option key={option} value={option}>
                      {DIAGRAM_FRAMING_LABEL[option].name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                <span>Sharpness</span>
                <select
                  value={sharpness}
                  disabled={busy}
                  onChange={(event) =>
                    setSharpness(event.target.value as C4Sharpness)
                  }
                  className="-mr-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-foreground hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <option value="compact">Compact · 2×</option>
                  <option value="standard">Standard · 3×</option>
                  <option value="sharp">Sharp · 4×</option>
                </select>
              </label>
              {/* SMOOTHNESS REACHES THE GIF ONLY, and the GIF is offered for
                  one diagram only — so on the archive scope this row is a
                  control for a format that is not in the menu. Disabled
                  rather than hidden: the reader who set it a moment ago
                  should see it is still set, not wonder where it went. */}
              <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                <span>Smoothness</span>
                <select
                  value={smoothness}
                  disabled={busy || scope !== "current"}
                  onChange={(event) =>
                    setSmoothness(event.target.value as C4Smoothness)
                  }
                  className="-mr-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-foreground hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <option value="simple">
                    Simple · {C4_SMOOTHNESS.simple.frames}
                  </option>
                  <option value="standard">
                    Standard · {C4_SMOOTHNESS.standard.frames}
                  </option>
                  <option value="smooth">
                    Smooth · {C4_SMOOTHNESS.smooth.frames}
                  </option>
                </select>
              </label>
            </div>

            {/* WHICH AXIS TOUCHES WHICH FORMAT — six lines of standing text
                until now, above nothing, read once by anyone who reads it at
                all. It is not droppable: a reader who sets Sharpness and
                exports an SVG has to be able to find out why nothing
                changed. So it folds. */}
            <details className="group mt-1.5">
              <summary className="cursor-pointer px-2.5 text-[11px] text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline">
                What these change
              </summary>
              <p className="px-2.5 pt-1.5 text-[11px] leading-4 text-muted-foreground">
                Framing applies to every format — a ratio letterboxes the
                drawing onto the theme&rsquo;s own sheet, so a slide does not
                put a white band around a dark diagram. Sharpness applies to PNG
                and GIF; SVG is vector and ignores it. Smoothness is frames per
                loop, so it reaches the GIF only — the loop stays the same
                length, so more frames means finer motion rather than slower.
              </p>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}
