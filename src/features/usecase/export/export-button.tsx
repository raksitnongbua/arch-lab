"use client";

/**
 * "Export" for a use-case diagram: the diagram as a file, rendered FROM THE
 * MODEL — `renderUseCaseSvg` shares its whole geometry with the screen
 * renderer (see `./render-svg.ts` for why this canvas needs no live-DOM
 * clone), so like the flowchart exporter no `paneRef` is threaded in: the
 * button takes the parsed file and can export it even mid-focus, dims
 * excluded by construction because the export renderer never had them.
 *
 * The MENU is the flowchart exporter's shape on purpose — one disclosure, a
 * row per outcome, the shared `MENU_ITEM_CLASSES`, the same sharpness axis —
 * MINUS the GIF row and its smoothness axis, deliberately: the one animation
 * a use-case diagram has is the first-paint reveal, after which it holds
 * still by design (`../lib/motion.ts` and the render-svg header carry the
 * argument), so there is no loop worth encoding and a GIF row would download
 * copies of the PNG. Do not "complete" the parity by adding one.
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
import type { UseCaseLabFile } from "@/types";
/* Cross-feature on purpose, the same imports the flowchart exporter leans
   on: one file-naming rule, one download helper, one clipboard path (whose
   Safari-gesture handling must not be re-derived), one theme resolution. */
import {
  canCopyPng,
  copyPngToClipboard,
  downloadBlob,
  fileStem,
} from "@/features/viewer/export/download";
import { resolveExportTheme } from "@/features/viewer/export/theme";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";

import { renderUseCasePngBlob, renderUseCaseSvg } from "./render-svg";

type ExportAction = "png" | "svg" | "copy";

export function UseCaseExportButton({
  /** The parsed document — the export renders from this, not from the DOM. */
  file,
  title,
  onAnnounce,
  className,
}: {
  file: UseCaseLabFile;
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
        const rendered = renderUseCaseSvg(file, resolveExportTheme());
        const stem = fileStem(title);
        if (action === "svg") {
          downloadBlob(
            new Blob([rendered.svg], { type: "image/svg+xml;charset=utf-8" }),
            `${stem}.svg`,
          );
          onAnnounce("Downloaded the use-case diagram as SVG.");
          return true;
        }
        if (action === "copy") {
          /* The shared clipboard path, unresolved-blob form included —
             Safari's gesture rules live there, not here. */
          await copyPngToClipboard(rendered, PNG_SCALE_BY_SHARPNESS[sharpness]);
          onAnnounce("Copied the use-case diagram to the clipboard as a PNG.");
          toast({ message: "Copied as PNG — paste it anywhere." });
          setStatus({ kind: "idle" });
          return true;
        }
        downloadBlob(
          await renderUseCasePngBlob(
            rendered,
            PNG_SCALE_BY_SHARPNESS[sharpness],
          ),
          `${stem}.png`,
        );
        onAnnounce(
          `Downloaded the use-case diagram as PNG at ${PNG_SCALE_BY_SHARPNESS[sharpness]}× scale.`,
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
    [file, title, onAnnounce, sharpness],
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
        <div className="absolute right-0 z-20 mt-1 flex max-h-[min(32rem,70svh)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg">
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
                  diagram, no focus dimming
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
                  Vector — sharp at any size
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
              <option value="compact">Compact · PNG 1×</option>
              <option value="standard">Standard · PNG 2×</option>
              <option value="sharp">Sharp · PNG 3×</option>
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
