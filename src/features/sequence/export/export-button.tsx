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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ChevronDown,
  ClipboardCopy,
  Download,
  TriangleAlert,
} from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import {
  canCopyPng,
  copyPngToClipboard,
  downloadBlob,
  fileStem,
  renderPngBlob,
} from "@/features/viewer/export/download";
import { encodeGif } from "@/features/viewer/export/gif";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/errors";

import {
  buildSequenceFrames,
  DEFAULT_GIF_QUALITY,
  GIF_SHARPNESS,
  GIF_SMOOTHNESS,
  type GifSharpness,
  type GifSmoothness,
} from "./frames";

import { renderSequenceSvg } from "./render-svg";

/** What the one download button can produce. */
type ExportFormat = "png" | "svg" | "gif";

/**
 * PNG scale per sharpness — 1× is the diagram's own pixel size. Module scope, so
 * it is one object rather than a new one per render that every callback
 * depending on it would have to churn for.
 *
 * A MULTIPLIER, unlike `GIF_SHARPNESS` in `./frames`, which is a pixel width
 * for the same three keys — hence the name.
 */
const PNG_SCALE_BY_SHARPNESS: Record<GifSharpness, number> = {
  compact: 1,
  standard: 2,
  sharp: 3,
};

/* Same shape the C4 exporter uses for its capability read. */
const subscribeToNothing = (): (() => void) => () => {};
const readFalse = (): boolean => false;

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
  /* A browser capability: false on the server, real after hydration, read
     without a setState cascade. */
  const copyable = useSyncExternalStore(
    subscribeToNothing,
    canCopyPng,
    readFalse,
  );

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

  /**
   * ONE format choice rather than one button per format. PNG and SVG are the
   * same act — "give me a picture of this" — differing only in what the picture
   * is made of, and GIF differs only in having time in it. Three buttons made
   * that look like three features and put the rarest one (SVG) at the same
   * weight as the common one.
   */
  const [format, setFormat] = useState<ExportFormat>("png");

  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  /**
   * Dismiss the panel on a click outside it, and on Escape.
   *
   * The one thing a native `<details>` does NOT give: it stays open until its
   * own summary is clicked again, so the panel sat over the diagram while the
   * reader carried on clicking messages. Every other menu in the app — the C4
   * export menu, the share panel — implements exactly this contract, and it is
   * the behaviour a dropdown is expected to have.
   *
   * The open state stays the ELEMENT's (`node.open`), read at event time, rather
   * than being mirrored into React: duplicating it here would mean fighting the
   * native toggle for ownership of the same boolean.
   *
   * NOT while an export is running. The progress label and any failure render
   * inside this panel, so closing it mid-export would restore the exact
   * complaint the visible status was added to fix — "I click download GIF and
   * nothing happens".
   */
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
      // Only once this menu has actually consumed the key: the sequence viewer
      // runs its own Escape ladder (clear focus, leave immersive), and an
      // Escape that closed this panel must not also climb that.
      event.preventDefault();
      event.stopPropagation();
      summaryRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    // Capture phase, for the same reason the ladder is guarded above.
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [busy]);

  const run = useCallback(
    async (mode: "download" | "copy" = "download") => {
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
        if (mode === "copy") {
          /* Same `rendered` the download path uses, so the clipboard and the
           file cannot disagree. The blob is handed over un-awaited on purpose
           — Safari spends the user gesture otherwise (see the helper). */
          await copyPngToClipboard(rendered, PNG_SCALE_BY_SHARPNESS[sharpness]);
          onAnnounce("Copied the diagram to the clipboard as a PNG.");
          setStatus({ kind: "idle" });
          return;
        }
        if (format === "png") {
          downloadBlob(
            await renderPngBlob(rendered, PNG_SCALE_BY_SHARPNESS[sharpness]),
            `${stem}.png`,
          );
          onAnnounce(
            `Downloaded the diagram as PNG at ${PNG_SCALE_BY_SHARPNESS[sharpness]}× scale.`,
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
        const message = describeError(error);
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
    [paneRef, title, onAnnounce, sharpness, smoothness, format],
  );

  return (
    <div className={cn("relative", className)}>
      {/* ONE button at rest. It used to be three verbs and a gear, which is four
          controls for an action most readers take once — and it made SVG, the
          rarest format, as loud as PNG. Everything now lives behind a single
          disclosure: pick a format, adjust it if you care, download.

          A native <details> rather than a hand-built menu: the toggle, the
          keyboard behaviour and the expanded/collapsed state come free and
          correct, where a custom popover would be re-earning all of it. The
          marker is hidden because the summary is styled as a button; it is still
          a real disclosure. */}
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

        {/* `max-w` and an internal scroll, not just a fixed width: this panel
            opens inside whatever column its button was placed in, and a menu
            that is wider or taller than that column gets CLIPPED rather than
            overflowing — which cost this one the left half of every label
            when the button briefly sat in the 30% source rail. Capping both
            axes means the worst case is a panel that scrolls, which is a menu
            you can still read and use. */}
        <div className="absolute right-0 z-20 mt-1 flex max-h-[min(32rem,70svh)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Format
            <select
              value={format}
              disabled={busy}
              onChange={(event) =>
                setFormat(event.target.value as ExportFormat)
              }
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="png">PNG · a picture, for pasting anywhere</option>
              <option value="svg">SVG · vector, sharp at any size</option>
              <option value="gif">GIF · one loop of the running lines</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sharpness
            <select
              value={sharpness}
              /* SVG is vector: already sharp at every size, so the control has
                 nothing to do and says so by being unavailable rather than by
                 quietly doing nothing. */
              disabled={busy || format === "svg"}
              onChange={(event) =>
                setSharpness(event.target.value as GifSharpness)
              }
              className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50"
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
              /* Frames only exist in the animation. */
              disabled={busy || format !== "gif"}
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

          <p className="text-[11px] leading-4 text-muted-foreground">
            {format === "gif"
              ? "The loop stays the same length whatever the smoothness, so more frames means finer motion rather than slower."
              : format === "svg"
                ? "Vector, so it stays sharp at any size and carries no animation."
                : "A still of the diagram exactly as it is on screen, folds included."}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run()}
              className={buttonClasses({ size: "sm" })}
            >
              <Download aria-hidden="true" />
              {busy ? "Working…" : `Download ${format.toUpperCase()}`}
            </button>
            {/* Copy is always a PNG, whatever the format select says: a
                clipboard takes an image, and offering "copy SVG" would put
                markup on it that most apps paste as text. Hidden where the
                browser cannot do it rather than shown and refused. */}
            {copyable ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run("copy")}
                className={buttonClasses({ variant: "outline", size: "sm" })}
              >
                <ClipboardCopy aria-hidden="true" />
                Copy PNG
              </button>
            ) : null}
          </div>

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
