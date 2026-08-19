"use client";

/**
 * The mounted dictionary canvas.
 *
 * NO FOCUS MODE, and that is a decision rather than an omission. Focus exists
 * on the other canvases to answer "what is this connected to" — a question a
 * dictionary cannot ask, because it has no connections. Every fact a
 * dictionary holds is already ON the row: the name, the type, the flags, the
 * meaning, the provenance, the legal values, an example. There is nothing left
 * for a panel to reveal, so a panel would be a second copy of the row.
 *
 * A client component only for the live region; `DictDiagram` is pure and
 * server-renderable, which is what lets the crawlable pages ship the whole
 * table in their HTML. That matters more for this kind than any other — a
 * reference document a search engine cannot read is a reference nobody finds.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { DictLabFile } from "@/types";

import { Scan, ZoomIn, ZoomOut } from "lucide-react";

import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
} from "@/components/ui/zoom-pill";
import { useCanvasZoom, ZOOM_MAX } from "@/components/ui/use-canvas-zoom";
import { layoutDict } from "../lib/layout";
import { DictDiagram } from "./dict-diagram";

export interface DictViewerProps {
  file: DictLabFile;
  onAnnounce?: (message: string) => void;
}

export function DictViewer({
  file,
  onAnnounce,
}: DictViewerProps): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => file.sections ?? [], [file]);
  const fields = useMemo(
    () => sections.reduce((sum, section) => sum + section.fields.length, 0),
    [sections],
  );

  useEffect(() => {
    onAnnounce?.(
      `Data dictionary rendered: ${sections.length} ${sections.length === 1 ? "section" : "sections"}, ${fields} ${fields === 1 ? "field" : "fields"}.`,
    );
  }, [sections.length, fields, onAnnounce]);

  /* The pane's width, so the table can use the room it has rather than
     leaving gutters on a wide screen. Measured here — the layout stays pure
     and is simply told the number. */
  const [paneWidth, setPaneWidth] = useState(0);
  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) return;
    const update = (): void => {
      setPaneWidth(pane.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    return () => {
      observer.disconnect();
    };
  }, []);

  const size = useMemo(
    () => layoutDict(file, { availableWidth: paneWidth - 32 }),
    [file, paneWidth],
  );
  const camera = useCanvasZoom({
    paneRef,
    contentWidth: size.width,
    contentHeight: size.height,
    onAnnounce,
  });

  return (
    <div className="relative h-full w-full">
      {/* See `er-viewer.tsx` for why the pane uses `safe center` and the
          wrapper is sized in pixels on both axes. */}
      <div
        ref={paneRef}
        className="flex h-full w-full cursor-grab [align-items:safe_center] [justify-content:safe_center] overflow-auto p-4"
      >
        <div
          className="shrink-0"
          style={{
            width: size.width * camera.scale,
            height: size.height * camera.scale,
          }}
        >
          <DictDiagram
            file={file}
            availableWidth={paneWidth - 32}
            className="block"
          />
        </div>
      </div>
      {/* The house zoom pill — the same control, classes and gesture hints
          every other canvas mounts, so 400% and the pinch behave identically
          across the product. */}
      <div className="pointer-events-auto absolute right-3 bottom-3 z-20">
        <div className={ZOOM_PILL_CLASSES}>
          <button
            type="button"
            onClick={camera.zoomOut}
            title={ZOOM_OUT_TITLE}
            aria-label="Zoom out"
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <ZoomMenu
            percent={camera.percent}
            isFit={camera.isFit}
            maxZoom={ZOOM_MAX}
            onFit={camera.fit}
            onZoomTo={camera.zoomTo}
            title="Zoom level"
            keyboardHint=""
          />
          <button
            type="button"
            onClick={camera.zoomIn}
            title={ZOOM_IN_TITLE}
            aria-label="Zoom in"
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={camera.fit}
            title="Fit the whole diagram"
            aria-label="Fit to view"
            className={ZOOM_BUTTON_CLASSES}
          >
            <Scan aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
