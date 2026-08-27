"use client";

/**
 * "Export" for a flowchart: the chart as a file, rendered FROM THE MODEL —
 * `renderFlowchartSvg` shares its whole geometry with the screen renderer
 * (see `./render-svg.ts` for why this canvas needs no live-DOM clone), so
 * unlike the sequence exporter no `paneRef` is threaded in: the button takes
 * the parsed file and can export it even mid-focus, folds and dims excluded
 * by construction because the export renderer never had them.
 *
 * The MENU is the sequence exporter's shape on purpose — one disclosure, a
 * row per outcome, the shared `MENU_ITEM_CLASSES`, the same two quality
 * axes. GIF here is one replay of the TRACE (the rank-by-rank reveal the
 * viewer plays on first paint — see `./frames.ts`), synthesised from the
 * same model render as the still exports, so the loop and the PNG can never
 * disagree about what the chart looks like. Sharpness means the same thing
 * on every row: whether small guard labels survive the raster; smoothness
 * belongs to the GIF alone, because only the GIF has frames.
 *
 * Outcomes are VISIBLE as well as announced (the busy/error block at the
 * foot of the panel), for the reason the sequence exporter documents: for a
 * sighted user, a slow export, a refusal and a crash must not all look like
 * the button doing nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardCopy,
  Download,
  FileCode2,
  FileImage,
  Film,
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
import { toast } from "@/components/ui/toast";
import type { FlowchartLabFile } from "@/types";
/* Cross-feature on purpose, the same imports the sequence exporter leans on:
   one file-naming rule, one download helper, one clipboard path (whose
   Safari-gesture handling must not be re-derived), one theme resolution. */
import {
  canCopyPng,
  copyPngToClipboard,
  downloadBlob,
  fileStem,
} from "@/features/viewer/export/download";
import { resolveExportTheme } from "@/features/viewer/export/theme";
/* The one GIF encoder in the app — the same deep import the sequence
   exporter takes, so a flowchart GIF and a sequence GIF are encoded by
   byte-identical code and checked by one decoder (`check:sequence-gif`). */
import { encodeGif } from "@/features/viewer/export/gif";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";

import {
  buildFlowchartFrames,
  DEFAULT_FLOWCHART_GIF_QUALITY,
  FLOWCHART_GIF_SHARPNESS,
  GIF_SMOOTHNESS,
  type GifSmoothness,
} from "./frames";
import { renderFlowchartPngBlob, renderFlowchartSvg } from "./render-svg";

type ExportAction = "png" | "svg" | "gif" | "copy";

export function FlowchartExportButton({
  /** The parsed document — the export renders from this, not from the DOM. */
  file,
  title,
  onAnnounce,
  className,
}: {
  file: FlowchartLabFile;
  title: string;
  onAnnounce: (message: string) => void;
  className?: string;
}): React.JSX.Element {
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "busy"; label: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const busy = status.kind === "busy";
  const [sharpness, setSharpness] = useState<Sharpness>("standard");
  /* GIF-only axis, same two-axis reasoning as the sequence exporter:
     sharpness is pixels, smoothness is frames per replay — a big jerky GIF
     and a small fluid one are both reasonable things to want. */
  const [smoothness, setSmoothness] = useState<GifSmoothness>(
    DEFAULT_FLOWCHART_GIF_QUALITY.smoothness,
  );
  const copyable = useBrowserCapability(canCopyPng);

  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  /* Dismiss on outside click and Escape — the dropdown contract every other
     menu in the app keeps (the sequence exporter documents it). Not while
     busy: the progress label and any failure render inside this panel. */
  useEffect(() => {
    const closeIfOpen = (): boolean => {
      const node = detailsRef.current;
      if (node === null || !node.open || busy) return false;
      node.open = false;
      return true;
    };
    const onPointerDown = (event: PointerEvent) => {
      const node = detailsRef.current;
      if (node === null || !node.open) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        closeIfOpen();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!closeIfOpen()) return;
      // Consumed here — it must not also climb the viewer's Escape ladder.
      event.preventDefault();
      event.stopPropagation();
      summaryRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [busy]);

  const run = useCallback(
    async (action: ExportAction): Promise<boolean> => {
      setStatus({ kind: "busy", label: "Preparing…" });
      try {
        // Resolved at export time so the file matches the theme on screen.
        const rendered = renderFlowchartSvg(file, resolveExportTheme());
        const stem = fileStem(title);
        if (action === "svg") {
          downloadBlob(
            new Blob([rendered.svg], { type: "image/svg+xml;charset=utf-8" }),
            `${stem}.svg`,
          );
          onAnnounce("Downloaded the flowchart as SVG.");
          return true;
        }
        if (action === "copy") {
          /* The shared clipboard path, unresolved-blob form included —
             Safari's gesture rules live there, not here. */
          await copyPngToClipboard(rendered, PNG_SCALE_BY_SHARPNESS[sharpness]);
          onAnnounce("Copied the flowchart to the clipboard as a PNG.");
          toast({ message: "Copied as PNG — paste it anywhere." });
          setStatus({ kind: "idle" });
          return true;
        }
        if (action === "gif") {
          // One replay of the trace, synthesised from the same `rendered`
          // string as the stills — deterministic on any machine, see frames.ts.
          onAnnounce("Building the animation — this takes a moment.");
          const built = await buildFlowchartFrames(
            rendered,
            { sharpness, smoothness },
            (done, total) => {
              setStatus({ kind: "busy", label: `Frame ${done} of ${total}…` });
            },
          );
          setStatus({ kind: "busy", label: "Encoding…" });
          if (built === null) {
            const message =
              "Nothing to animate — this flowchart has no nodes, so a GIF would be copies of the PNG.";
            setStatus({ kind: "error", message });
            onAnnounce(message);
            return false;
          }
          const gif = encodeGif(built.frames, built.width, built.height);
          downloadBlob(
            new Blob([gif as BlobPart], { type: "image/gif" }),
            `${stem}.gif`,
          );
          onAnnounce(
            `Downloaded a looping GIF — ${built.frames.length} frames tracing the flow, then the finished chart.`,
          );
          return true;
        }
        downloadBlob(
          await renderFlowchartPngBlob(
            rendered,
            PNG_SCALE_BY_SHARPNESS[sharpness],
          ),
          `${stem}.png`,
        );
        onAnnounce(
          `Downloaded the flowchart as PNG at ${PNG_SCALE_BY_SHARPNESS[sharpness]}× scale.`,
        );
        return true;
      } catch (error) {
        const message = describeError(error);
        setStatus({ kind: "error", message });
        onAnnounce(`Export failed: ${message}.`);
        toast({ message: `Export failed: ${message}`, tone: "error" });
        return false;
      } finally {
        // Only clear a BUSY state; an error must survive to stay on screen.
        setStatus((current) =>
          current.kind === "busy" ? { kind: "idle" } : current,
        );
      }
    },
    [file, title, onAnnounce, sharpness, smoothness],
  );

  /* Success closes the panel (the toast and live region carry the outcome);
     a failure keeps it open, because the error renders inside it. */
  const runAndClose = useCallback(
    async (action: ExportAction): Promise<void> => {
      const succeeded = await run(action);
      const node = detailsRef.current;
      if (succeeded && node !== null) node.open = false;
    },
    [run],
  );

  return (
    <div className={cn("relative", className)}>
      <details ref={detailsRef} className="relative">
        <summary
          ref={summaryRef}
          className={cn(
            buttonClasses({ variant: "ghost", size: "sm" }),
            "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          )}
        >
          <Download aria-hidden="true" />
          Export
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-60" />
        </summary>

        {/* Capped on both axes for the reason the sequence panel states: a
            menu wider or taller than its column is clipped, not scrolled,
            unless it caps itself. */}
        <div className="absolute right-0 bottom-full z-20 mb-1 flex max-h-[min(32rem,70svh)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg">
          <div className="flex flex-col">
            {copyable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAndClose("copy")}
                className={MENU_ITEM_CLASSES}
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
              disabled={busy}
              onClick={() => void runAndClose("png")}
              className={MENU_ITEM_CLASSES}
            >
              <FileImage aria-hidden="true" className="size-4 shrink-0" />
              <span>
                Download PNG
                <span className={MENU_ITEM_HINT_CLASSES}>
                  A still at {PNG_SCALE_BY_SHARPNESS[sharpness]}× — the whole
                  chart, no focus dimming
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAndClose("svg")}
              className={MENU_ITEM_CLASSES}
            >
              <FileCode2 aria-hidden="true" className="size-4 shrink-0" />
              <span>
                Download SVG
                <span className={MENU_ITEM_HINT_CLASSES}>
                  Vector — sharp at any size, no animation
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAndClose("gif")}
              className={MENU_ITEM_CLASSES}
            >
              <Film aria-hidden="true" className="size-4 shrink-0" />
              <span>
                Download GIF
                <span className={MENU_ITEM_HINT_CLASSES}>
                  Traces the flow rank by rank,{" "}
                  {GIF_SMOOTHNESS[smoothness].frames} frames
                </span>
              </span>
            </button>
          </div>

          <div className="h-px bg-border" />

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sharpness
            <select
              value={sharpness}
              disabled={busy}
              onChange={(event) =>
                setSharpness(event.target.value as Sharpness)
              }
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
            >
              <option value="compact">
                Compact · PNG 1× · GIF {FLOWCHART_GIF_SHARPNESS.compact}px
              </option>
              <option value="standard">
                Standard · PNG 2× · GIF {FLOWCHART_GIF_SHARPNESS.standard}px
              </option>
              <option value="sharp">
                Sharp · PNG 3× · GIF {FLOWCHART_GIF_SHARPNESS.sharp}px
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Smoothness · GIF only
            <select
              value={smoothness}
              disabled={busy}
              onChange={(event) =>
                setSmoothness(event.target.value as GifSmoothness)
              }
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
            >
              <option value="simple">
                Simple · {GIF_SMOOTHNESS.simple.frames} frames
              </option>
              <option value="standard">
                Standard · {GIF_SMOOTHNESS.standard.frames} frames
              </option>
              <option value="smooth">
                Smooth · {GIF_SMOOTHNESS.smooth.frames} frames
              </option>
            </select>
          </label>

          {status.kind === "busy" ? (
            <p className="text-xs text-muted-foreground">{status.label}</p>
          ) : null}
          {status.kind === "error" ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              {status.message}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
