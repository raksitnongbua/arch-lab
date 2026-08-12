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
import {
  Download,
  Film,
  ImageDown,
  Settings2,
  TriangleAlert,
} from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import {
  downloadBlob,
  fileStem,
  renderPngBlob,
} from "@/features/viewer/export/download";
import { cn } from "@/lib/utils";

import {
  buildSequenceFrames,
  DEFAULT_GIF_QUALITY,
  GIF_SHARPNESS,
  GIF_SMOOTHNESS,
  type GifSharpness,
  type GifSmoothness,
} from "./frames";
import { encodeGif } from "./gif";
import { renderSequenceSvg } from "./render-svg";

/**
 * PNG scale per sharpness — 1× is the diagram's own pixel size. Module scope, so
 * it is one object rather than a new one per render that every callback
 * depending on it would have to churn for.
 */
const PNG_SCALE: Record<GifSharpness, number> = {
  compact: 1,
  standard: 2,
  sharp: 3,
};

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
  /*
   * VISIBLE state, not only announced. Every outcome here used to travel through
   * `onAnnounce` alone, which reaches the page's sr-only live region — so for a
   * sighted user a slow export, a refusal and a crash were all indistinguishable
   * from the button doing nothing at all. That is what "I click download GIF and
   * nothing happens" was: no feedback, for any outcome.
   */
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "busy"; label: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const busy = status.kind === "busy";

  /*
   * TWO AXES, not one "quality" slider. Sharpness is pixels — whether small
   * labels survive. Smoothness is frames per loop — how finely the motion is
   * sampled. A big jerky GIF and a small fluid one are both reasonable things to
   * want, so collapsing them would force a choice nobody asked for.
   *
   * Sharpness also drives the PNG's scale factor, because "sharper" means the
   * same thing there. SVG ignores both: it is vector, so it is already sharp at
   * every size and has no frames — the UI says so rather than showing controls
   * that do nothing to it.
   */
  const [sharpness, setSharpness] = useState<GifSharpness>(
    DEFAULT_GIF_QUALITY.sharpness,
  );
  const [smoothness, setSmoothness] = useState<GifSmoothness>(
    DEFAULT_GIF_QUALITY.smoothness,
  );

  const run = useCallback(
    async (format: "svg" | "png" | "gif") => {
      const svgNode =
        paneRef.current?.querySelector<SVGSVGElement>("svg.af-seq-svg") ?? null;
      if (svgNode === null) {
        const message = "Nothing to export — the diagram is not on screen.";
        setStatus({ kind: "error", message });
        onAnnounce(message);
        return;
      }

      setStatus({ kind: "busy", label: "Preparing…" });
      try {
        const rendered = renderSequenceSvg(svgNode);
        if (rendered === null) {
          const message = "Nothing to export — the diagram has no size yet.";
          setStatus({ kind: "error", message });
          onAnnounce(message);
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
        if (format === "png") {
          downloadBlob(
            await renderPngBlob(rendered, PNG_SCALE[sharpness]),
            `${stem}.png`,
          );
          onAnnounce(
            `Downloaded the diagram as PNG at ${PNG_SCALE[sharpness]}× scale.`,
          );
          return;
        }

        // GIF: one loop of the diagram's own idle motion. Synthesised rather
        // than screen-recorded, so the file is the same on any machine — see
        // export/frames.ts.
        onAnnounce("Building the animation — this takes a moment.");
        const built = await buildSequenceFrames(
          svgNode,
          { sharpness, smoothness },
          (done, total) => {
            setStatus({ kind: "busy", label: `Frame ${done} of ${total}…` });
          },
        );
        setStatus({ kind: "busy", label: "Encoding…" });
        if (built === null) {
          const message =
            "Nothing to animate — this diagram has no moving lines, so a GIF would be copies of the PNG.";
          setStatus({ kind: "error", message });
          onAnnounce(message);
          return;
        }
        const gif = encodeGif(built.frames, built.width, built.height);
        downloadBlob(
          new Blob([gif as BlobPart], { type: "image/gif" }),
          `${stem}.gif`,
        );
        onAnnounce(
          `Downloaded a looping GIF — ${built.frames.length} frames of the diagram's running lines.`,
        );
      } catch (error) {
        // Named and SHOWN, not swallowed: rasterising can fail on a browser that
        // refuses to decode the SVG, and a button that silently does nothing is
        // worse than one that says why.
        const message =
          error instanceof Error ? error.message : "unknown error";
        setStatus({ kind: "error", message });
        onAnnounce(`Export failed: ${message}.`);
        return;
      } finally {
        // Only clear a BUSY state; an error must survive to stay on screen.
        setStatus((current) =>
          current.kind === "busy" ? { kind: "idle" } : current,
        );
      }
    },
    [paneRef, title, onAnnounce, sharpness, smoothness],
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
        onClick={() => void run("gif")}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        <Film aria-hidden="true" />
        GIF
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

      {/* THE OPTIONS, behind one small button. They were two labelled selects
          sitting open in the toolbar, which put four words and two dropdowns
          permanently in front of a reader who mostly just wants to click PNG.
          Folded away, the row is three verbs and a gear.

          A native <details> rather than a hand-built popover: it gives the
          toggle, the keyboard behaviour and the expanded/collapsed state to
          assistive technology for free, and a custom listbox would be re-earning
          all of that in exchange for nothing. The marker is hidden because the
          summary is styled as a button; it is still a real disclosure. */}
      <details className="relative">
        <summary
          aria-label="Export options"
          title="Export options"
          className={cn(
            buttonClasses({ variant: "ghost", size: "sm" }),
            "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          )}
        >
          <Settings2 aria-hidden="true" />
        </summary>

        <div className="absolute right-0 z-20 mt-1 flex w-72 flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sharpness
            <select
              value={sharpness}
              disabled={busy}
              onChange={(event) =>
                setSharpness(event.target.value as GifSharpness)
              }
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="compact">
                Compact · PNG 1× · GIF {GIF_SHARPNESS.compact}px
              </option>
              <option value="standard">
                Standard · PNG 2× · GIF {GIF_SHARPNESS.standard}px
              </option>
              <option value="sharp">
                Sharp · PNG 3× · GIF {GIF_SHARPNESS.sharp}px
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Smoothness
            <select
              value={smoothness}
              disabled={busy}
              onChange={(event) =>
                setSmoothness(event.target.value as GifSmoothness)
              }
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
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

          {/* Which control reaches which format. Sharpness is not GIF-only even
              though it sits beside the GIF button, and SVG answers to neither —
              saying so here costs a line and saves a wrong expectation. */}
          <p className="text-[11px] leading-4 text-muted-foreground">
            Sharpness applies to PNG and GIF. Smoothness is frames per animation
            loop, so it reaches the GIF only — the loop stays the same length,
            so more frames means finer motion rather than slower. SVG is vector
            and ignores both.
          </p>
        </div>
      </details>

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
  );
}
