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

import { useCallback, useEffect, useRef, useState } from "react";
/* The SAME glyph per format the C4 exporter uses — a PNG row that is a
   picture in one menu and a camera in the other is the drift this pass is
   closing. */
import {
  ChevronDown,
  ClipboardCopy,
  Download,
  FileCode2,
  FileImage,
  Film,
  TriangleAlert,
} from "lucide-react";

import { PNG_SCALE_BY_SHARPNESS } from "@/features/viewer/export/sharpness";
import { useBrowserCapability } from "@/lib/browser-capability";
import { buttonClasses } from "@/components/ui/button";
import {
  MENU_ITEM_CLASSES,
  MENU_ITEM_HINT_CLASSES,
} from "@/components/ui/menu-item";
import { toast } from "@/components/ui/toast";
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
/**
 * What a row in the menu DOES — not a format the reader first selects and then
 * separately confirms. The C4 exporter has always been shaped this way and it
 * was noticed from outside that this one was not: same feature, two products.
 */
type ExportAction = "png" | "svg" | "gif" | "copy";

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
  const copyable = useBrowserCapability(canCopyPng);

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
    async (action: ExportAction): Promise<boolean> => {
      const svgNode =
        paneRef.current?.querySelector<SVGSVGElement>("svg.af-seq-svg") ?? null;
      if (svgNode === null) {
        const message = "Nothing to export — the diagram is not on screen.";
        setStatus({ kind: "error", message });
        onAnnounce(message);
        return false;
      }

      setStatus({ kind: "busy", label: "Preparing…" });
      try {
        const rendered = renderSequenceSvg(svgNode);
        if (rendered === null) {
          const message = "Nothing to export — the diagram has no size yet.";
          setStatus({ kind: "error", message });
          onAnnounce(message);
          return false;
        }
        const stem = fileStem(title);
        if (action === "svg") {
          downloadBlob(
            new Blob([rendered.svg], { type: "image/svg+xml;charset=utf-8" }),
            `${stem}.svg`,
          );
          onAnnounce("Downloaded the diagram as SVG.");
          return true;
        }
        if (action === "copy") {
          /* Same `rendered` the download path uses, so the clipboard and the
           file cannot disagree. The blob is handed over un-awaited on purpose
           — Safari spends the user gesture otherwise (see the helper). */
          await copyPngToClipboard(rendered, PNG_SCALE_BY_SHARPNESS[sharpness]);
          onAnnounce("Copied the diagram to the clipboard as a PNG.");
          /* The same toast the C4 exporter raises, wording included: one
             action should not report itself two ways. */
          toast({ message: "Copied as PNG — paste it anywhere." });
          setStatus({ kind: "idle" });
          return true;
        }
        if (action === "png") {
          downloadBlob(
            await renderPngBlob(rendered, PNG_SCALE_BY_SHARPNESS[sharpness]),
            `${stem}.png`,
          );
          onAnnounce(
            `Downloaded the diagram as PNG at ${PNG_SCALE_BY_SHARPNESS[sharpness]}× scale.`,
          );
          return true;
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
          return false;
        }
        const gif = encodeGif(built.frames, built.width, built.height);
        downloadBlob(
          new Blob([gif as BlobPart], { type: "image/gif" }),
          `${stem}.gif`,
        );
        onAnnounce(
          `Downloaded a looping GIF — ${built.frames.length} frames of the diagram's running lines.`,
        );
        return true;
      } catch (error) {
        // Named and SHOWN, not swallowed: rasterising can fail on a browser that
        // refuses to decode the SVG, and a button that silently does nothing is
        // worse than one that says why.
        const message = describeError(error);
        setStatus({ kind: "error", message });
        onAnnounce(`Export failed: ${message}.`);
        /* Toasted as well as shown in the panel, because the C4 exporter has
           no panel to show it in — one action reporting itself two different
           ways depending on which diagram you are looking at is the mismatch,
           not the extra line. */
        toast({ message: `Export failed: ${message}`, tone: "error" });
        return false;
      } finally {
        // Only clear a BUSY state; an error must survive to stay on screen.
        setStatus((current) =>
          current.kind === "busy" ? { kind: "idle" } : current,
        );
      }
    },
    [paneRef, title, onAnnounce, sharpness, smoothness],
  );

  /**
   * A row that succeeded has nothing left to say, so the menu gets out of the
   * way. It was worst on Copy: the clipboard already had the image and the
   * panel was still sitting over the diagram it had just copied, waiting to be
   * dismissed by hand. Success is reported by the toast and the live region —
   * neither of which needs this panel open.
   *
   * A FAILURE KEEPS IT OPEN, deliberately: the error renders inside here, and
   * closing on the way out would take the explanation with it.
   */
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
      {/* ONE button at rest. It used to be three verbs and a gear, which is four
          controls for an action most readers take once — and it made SVG, the
          rarest format, as loud as PNG. Everything now lives behind a single
          disclosure: pick the outcome you want, adjust it if you care.

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
        {/* UPWARD (`bottom-full`), because this toolbar sits UNDER the
            canvas — a downward panel would open off the bottom of the pane.
            The C4 exporter has anchored this way from its own footer all
            along. */}
        <div className="absolute right-0 bottom-full z-20 mb-1 flex max-h-[min(32rem,70svh)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-lg">
          {/* A ROW PER OUTCOME, each naming what you get — the shape the C4
              exporter has and this panel did not. It used to ask for a format
              in a <select> and then offer a generic "Download", so the reader
              had to assemble the choice and could not see the results side by
              side. Order carries what the old three-verb toolbar could not:
              the commonest outcome is first and SVG sits below it, without
              hiding either behind a select. A menu should say what you GET,
              not make you build it. The row style is
              shared (`ui/menu-item.ts`) so the two cannot drift apart again.

              Each row is also the action: there is no chooser state left to
              disagree with what the button finally does. */}
          <div className="flex flex-col">
            {copyable ? (
              /* First, because it is the one most readers want and the only one
                 that does not leave a file behind. Always a PNG whatever else
                 the menu offers: a clipboard takes an image, and "copy SVG"
                 would put markup on it that most apps paste as text. Hidden
                 where the browser cannot do it rather than shown and refused. */
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
                  A still at {PNG_SCALE_BY_SHARPNESS[sharpness]}× — folds
                  included
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
                  One loop of the running lines,{" "}
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
              /* Never disabled any more. It used to grey out whenever the
                 format select said SVG; with a row per outcome there is no
                 "current format" to grey it against — it modifies the PNG and
                 GIF rows above, and the SVG row simply has no use for it. Each
                 label says which rows it changes. */
              disabled={busy}
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
            Smoothness · GIF only
            <select
              value={smoothness}
              /* Frames only exist in the animation, so this says which row it
                 belongs to rather than waiting to be greyed in or out. */
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
