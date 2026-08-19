"use client";

/**
 * "Export" — the diagram as a file, for a canvas that renders FROM THE MODEL.
 *
 * ONE COMPONENT FOR TWO KINDS, where the four older exporters are four
 * near-identical files. It is shared rather than copied because everything
 * that differs between ER and a dictionary is already a parameter: the render
 * function, the noun and the file stem. Nothing else about "turn this drawing
 * into a PNG" is kind-specific, and `dry.md` names a fifth copy of a block
 * that already exists four times as the expensive kind of duplication.
 *
 * NO GIF ROW, deliberately, and not as an omission to "complete" later.
 * Neither of these canvases has a loop worth encoding — the dictionary's only
 * motion is its first-paint reveal, and ER's ambient pulse and focus current
 * are reading aids for someone watching the page. A GIF of either would be a
 * heavier copy of the PNG.
 *
 * THE THEME IS RESOLVED AT CLICK TIME, not at mount: a reader who switches
 * theme and then exports must get the diagram they are looking at, and a
 * palette captured on mount would hand them the previous one.
 *
 * OUTCOMES ARE VISIBLE as well as announced, for the reason the sequence
 * exporter documents: for a sighted user, a slow export, a refusal and a crash
 * must not all look like the button doing nothing.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileCode2, FileImage } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { MENU_ITEM_CLASSES } from "@/components/ui/menu-item";
import { resolveExportTheme } from "@/features/viewer/export/theme";
import type { ExportTheme } from "@/features/viewer/export/theme";
import { downloadBlob, svgToPngBlob } from "@/lib/svg-export";
import type { RenderedSvg } from "@/lib/svg-export";
import { slugify } from "@/lib/slug";

export interface SvgExportButtonProps {
  /** Renders the document with a palette resolved at click time. */
  render: (theme: ExportTheme) => RenderedSvg;
  /** Names the downloaded file. */
  title: string;
  /** "ER diagram", "data dictionary" — for the announcements. */
  noun: string;
  onAnnounce: (message: string) => void;
}

/** PNG scales offered. 2x is the default because a diagram dropped into a
 * deck is almost always viewed denser than the display it was exported from;
 * 1x exists for someone placing it at a known size, 3x for print. */
const SCALES = [1, 2, 3] as const;

export function SvgExportButton({
  render,
  title,
  noun,
  onAnnounce,
}: SvgExportButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

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

  const stem = slugify(title, "diagram");

  const run = async (
    label: string,
    work: () => Promise<void>,
  ): Promise<void> => {
    setBusy(label);
    setError(null);
    try {
      await work();
      onAnnounce(`${noun} exported as ${label}.`);
      setOpen(false);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "The export failed.";
      setError(message);
      onAnnounce(`Export failed: ${message}`);
    } finally {
      setBusy(null);
    }
  };

  const exportSvg = (): Promise<void> =>
    run("SVG", async () => {
      const rendered = render(resolveExportTheme());
      downloadBlob(
        new Blob([rendered.svg], { type: "image/svg+xml" }),
        `${stem}.svg`,
      );
    });

  const exportPng = (scale: number): Promise<void> =>
    run(`PNG ${scale}x`, async () => {
      const rendered = render(resolveExportTheme());
      const blob = await svgToPngBlob(rendered, scale);
      downloadBlob(blob, `${stem}${scale === 1 ? "" : `@${scale}x`}.png`);
    });

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
          className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-border bg-background p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASSES}
            disabled={busy !== null}
            onClick={() => void exportSvg()}
          >
            <FileCode2 aria-hidden="true" className="size-4 opacity-70" />
            SVG — sharp at any size
          </button>
          {SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASSES}
              disabled={busy !== null}
              onClick={() => void exportPng(scale)}
            >
              <FileImage aria-hidden="true" className="size-4 opacity-70" />
              PNG {scale}×{scale === 2 ? " — for a deck or a doc" : ""}
            </button>
          ))}
          {busy !== null || error !== null ? (
            <p
              className={`mt-1 px-2.5 py-1.5 text-xs ${error === null ? "text-muted-foreground" : "text-destructive"}`}
            >
              {error ?? `Rendering ${busy}…`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
