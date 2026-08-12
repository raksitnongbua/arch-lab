"use client";

/**
 * "Export" for a sequence diagram: the drawing on screen, as a file.
 *
 * SVG and PNG from the same source. `renderSequenceSvg` clones the live node
 * and inlines its computed presentation (see that file for why it reads the DOM
 * rather than re-rendering from the model), and PNG is that same string
 * rasterised through the C4 exporter's `renderPngBlob` — one rasteriser for the
 * whole app, so a sequence PNG and a C4 PNG can never disagree about scale or
 * encoding.
 *
 * It exports what is ON SCREEN, including a fold: if a reader has collapsed a
 * service's dependencies, the file matches what they are looking at. That is
 * the useful behaviour for "send me that diagram", and the alternative —
 * silently exporting participants the reader had folded away — would be a file
 * they did not ask for.
 *
 * FINDS THE SVG BY CLASS rather than by a ref threaded down through the viewer.
 * The node belongs to `SequenceDiagram`, three components below this button, and
 * a ref for it would have to be plumbed through the viewer's whole prop surface
 * for one consumer. The lookup is scoped to the pane the button belongs to, so
 * it cannot pick up a second diagram elsewhere on the page.
 */

import { useCallback, useState } from "react";
import { Download, ImageDown } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import {
  downloadBlob,
  fileStem,
  renderPngBlob,
} from "@/features/viewer/export/download";
import { cn } from "@/lib/utils";

import { renderSequenceSvg } from "./render-svg";

export function SequenceExportButton({
  /** Scopes the lookup: the element containing the diagram to export. */
  paneRef,
  title,
  onAnnounce,
  className,
}: {
  paneRef: React.RefObject<HTMLElement | null>;
  title: string;
  onAnnounce: (message: string) => void;
  className?: string;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (format: "svg" | "png") => {
      const svgNode =
        paneRef.current?.querySelector<SVGSVGElement>("svg.af-seq-svg") ?? null;
      if (svgNode === null) {
        onAnnounce("Nothing to export — the diagram is not on screen.");
        return;
      }

      setBusy(true);
      try {
        const rendered = renderSequenceSvg(svgNode);
        if (rendered === null) {
          onAnnounce("Nothing to export — the diagram has no size yet.");
          return;
        }
        const stem = fileStem(title);
        if (format === "svg") {
          downloadBlob(
            new Blob([rendered.svg], { type: "image/svg+xml;charset=utf-8" }),
            `${stem}.svg`,
          );
          onAnnounce("Downloaded the diagram as SVG.");
          return;
        }
        downloadBlob(await renderPngBlob(rendered), `${stem}.png`);
        onAnnounce("Downloaded the diagram as PNG.");
      } catch (error) {
        // Named, not swallowed: rasterising can fail on a browser that refuses
        // to decode the SVG, and a button that silently does nothing is worse
        // than one that says why.
        onAnnounce(
          `Export failed: ${error instanceof Error ? error.message : "unknown error"}.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [paneRef, title, onAnnounce],
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("png")}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        <ImageDown aria-hidden="true" />
        PNG
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("svg")}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        <Download aria-hidden="true" />
        SVG
      </button>
    </div>
  );
}
