"use client";

/**
 * "Export" — the diagram as a file, for a canvas that renders FROM THE MODEL.
 *
 * ONE COMPONENT FOR TWO KINDS, where the four older exporters are four
 * near-identical files. It is shared rather than copied because everything
 * that differs between ER and a dictionary is already a parameter: the render
 * function, the noun and the file stem.
 *
 * ITS MENU IS THE ESTABLISHED ONE, not a new one. The first cut of this button
 * invented its own shape — three separate PNG rows, no clipboard, its own
 * labels — so the two new kinds exported differently from the four old ones
 * for no reason a reader could see. The rows, the hints, the sharpness axis
 * and its three keys are now the same as `usecase/export/export-button.tsx`:
 * Copy PNG, Download PNG, Download SVG, with one sharpness selector governing
 * both PNG rows so "Sharp" means one thing across the product.
 *
 * The one deliberate difference is the MISSING GIF ROW, and it is the same
 * omission the use-case exporter documents: neither of these canvases has a
 * loop worth encoding — the dictionary's only motion is its first-paint
 * reveal, and ER's pulse and focus current are reading aids for someone
 * watching the page — so a GIF would be a heavier copy of the PNG.
 *
 * THE THEME IS RESOLVED AT CLICK TIME, not at mount: a reader who switches
 * theme and then exports must get the diagram they are looking at.
 *
 * OUTCOMES ARE VISIBLE as well as announced, for the reason the sequence
 * exporter documents: for a sighted user a slow export, a refusal and a crash
 * must not all look like the button doing nothing.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardCopy,
  Download,
  FileCode2,
  FileImage,
  TriangleAlert,
} from "lucide-react";

import {
  PNG_SCALE_BY_SHARPNESS,
  type Sharpness,
} from "@/features/viewer/export/sharpness";
import { useBrowserCapability } from "@/lib/browser-capability";
import { buttonClasses } from "@/components/ui/button";
import {
  MENU_ITEM_CLASSES,
  MENU_ITEM_HINT_CLASSES,
} from "@/components/ui/menu-item";
/* Cross-feature on purpose, the same imports the flowchart and sequence
   exporters lean on: one file-naming rule, one download helper, one clipboard
   path (whose Safari-gesture handling must not be re-derived), one theme
   resolution. */
import {
  canCopyPng,
  copyPngToClipboard,
  downloadBlob,
  fileStem,
} from "@/features/viewer/export/download";
import { resolveExportTheme } from "@/features/viewer/export/theme";
import type { ExportTheme } from "@/features/viewer/export/theme";
import { downloadSvg, renderPngBlob } from "@/features/viewer/export/download";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";

export interface SvgExportButtonProps {
  /** Renders the document with a palette resolved at click time. */
  render: (theme: ExportTheme) => RenderedSvg;
  title: string;
  /** "ER diagram", "data dictionary" — for the announcements. */
  noun: string;
  onAnnounce: (message: string) => void;
}

export function SvgExportButton({
  render,
  title,
  noun,
  onAnnounce,
}: SvgExportButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharpness, setSharpness] = useState<Sharpness>("standard");
  const root = useRef<HTMLDivElement>(null);

  const canCopy = useBrowserCapability(canCopyPng);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const scale = PNG_SCALE_BY_SHARPNESS[sharpness];

  const run = async (work: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onAnnounce(await work());
      setOpen(false);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "The export failed.";
      setError(message);
      onAnnounce(`Export failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const stem = fileStem(title);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        <Download aria-hidden="true" />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </button>

      {open ? (
        <div
          role="menu"
          /* Downward, like the Share panel beside it: this toolbar sits above
             the canvas mid-page, and opening upward would cover the diagram. */
          className="absolute right-0 z-30 mt-1.5 w-72 rounded-xl border border-border bg-background p-1.5 shadow-lg"
        >
          {canCopy ? (
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASSES}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await copyPngToClipboard(render(resolveExportTheme()), scale);
                  return "Copied as PNG — paste it anywhere.";
                })
              }
            >
              <ClipboardCopy aria-hidden="true" className="size-4 shrink-0" />
              <span>
                Copy PNG
                <span className={MENU_ITEM_HINT_CLASSES}>
                  Paste it straight into a doc or a chat
                </span>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const blob = await renderPngBlob(
                  render(resolveExportTheme()),
                  scale,
                );
                downloadBlob(blob, `${stem}.png`);
                return `Downloaded the ${noun} as PNG at ${scale}× scale.`;
              })
            }
          >
            <FileImage aria-hidden="true" className="size-4 shrink-0" />
            <span>
              Download PNG
              <span className={MENU_ITEM_HINT_CLASSES}>
                Raster — {scale}× the diagram&apos;s own size
              </span>
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                downloadSvg(render(resolveExportTheme()), `${stem}.svg`);
                return `Downloaded the ${noun} as SVG.`;
              })
            }
          >
            <FileCode2 aria-hidden="true" className="size-4 shrink-0" />
            <span>
              Download SVG
              <span className={MENU_ITEM_HINT_CLASSES}>
                Vector — sharp at any size
              </span>
            </span>
          </button>

          {/* One sharpness axis governing both PNG rows, not a row per scale:
              the scale is a property of the export, not a different export. */}
          <div className="mt-1 border-t border-border/60 px-2.5 pt-2 pb-1">
            <p className="text-xs text-muted-foreground">PNG sharpness</p>
            {/* A SEGMENTED CONTROL, not three `buttonClasses` buttons. Those
                carry the toolbar's own padding and a minimum height, so three
                of them overflowed a 16rem panel and clipped "Sharp" off its
                right edge — a control sized for a toolbar does not fit inside
                a menu. These are sized for the row they sit in: `min-w-0` and
                `flex-1` so they share the width evenly and shrink rather than
                spill, which is the same automatic-minimum rule that bit the
                home page's MCP section. */}
            <div
              role="group"
              aria-label="PNG sharpness"
              className="mt-1.5 flex gap-1 rounded-lg border border-border/70 p-0.5"
            >
              {(Object.keys(PNG_SCALE_BY_SHARPNESS) as Sharpness[]).map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={sharpness === key}
                    onClick={() => setSharpness(key)}
                    className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-xs capitalize transition-colors ${
                      sharpness === key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {key}
                  </button>
                ),
              )}
            </div>
          </div>

          {busy || error !== null ? (
            <p
              className={`mt-1 flex items-start gap-1.5 px-2.5 py-1.5 text-xs ${error === null ? "text-muted-foreground" : "text-destructive"}`}
            >
              {error !== null ? (
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5" />
              ) : null}
              {error ?? "Preparing…"}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
