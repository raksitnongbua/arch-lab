/**
 * `.alab` text → a standalone SVG document, with no browser anywhere.
 *
 * This is the half of `/api/render` that draws. It parses through
 * `parseViewSource` — the one entry point that already knows all nine
 * grammars and their Mermaid dialects, and whose header promises it stays
 * pure — then hands the parsed file to the SAME `render<Kind>Svg` builder the
 * download button uses. Nothing here draws a diagram of its own: a second
 * renderer would be a second answer to "what does this document look like",
 * and the whole argument for the route is that a reader gets the drawing the
 * author saw.
 *
 * WHAT THE BUILDERS NEED THAT A ROUTE HANDLER CANNOT GIVE THEM, and what is
 * done about each:
 *
 *   - **The palette.** `resolveExportTheme()` reads the live computed styles.
 *     The route passes `exportPaletteFor(theme)` instead — the same tokens,
 *     resolved from `globals.css` at build time (`palette.generated.ts`).
 *   - **Icons.** The registry's marks are React components and the server has
 *     no renderer for them, so `embeddedIconSvgServer` reads the artwork out
 *     of `icon-markup.generated.ts` — rendered from those same components at
 *     build time, and byte-compared to them by `check:icon-markup`.
 *   - **The ground.** `resolveExportGround()` returns its EMPTY pair away from
 *     a browser, so a server-drawn diagram has no ruling and no grain. That is
 *     a REAL loss on `blueprint`, `paper` and `eink`, whose own module argues
 *     that a blueprint without its ruling is not a blueprint. It is recorded
 *     here rather than glossed, and it is the next thing to fix — the palette
 *     generator is the shape the fix takes.
 *   - **Author tag colours.** `resolveTagPaint` has the browser evaluate a
 *     relative-colour expression. `lib/tag-paint.ts` does the same arithmetic
 *     in TypeScript, so a `tagcolor` the app itself can write survives; an
 *     exotic CSS colour the grammar also accepts degrades to the role palette
 *     rather than throwing.
 *
 * EVERY KIND DRAWS. There is no refusal list any more, and the two that
 * used to be on it are worth keeping written down, because both were about a
 * browser dependency rather than about the notation:
 *
 *   - **C4** took its connector geometry from `getBezierPath`, a client-only
 *     export of `@xyflow/react`, so `edge-geometry.ts` threw the moment it
 *     was reached from a route; the curve is now `lib/bezier-path.ts`, the
 *     same arithmetic pinned to React Flow's by `check:bezier-path`. Its
 *     icons needed a React renderer and now come from the generated table
 *     above.
 *   - **Sequence** had no model-to-string builder at all: `renderSequenceSvg`
 *     takes a live `SVGSVGElement` and clones the canvas, by explicit design
 *     in its own header. It still does, for the download. The route calls
 *     `renderSequenceFileSvg` instead — a second renderer this notation
 *     argued against having, whose whole cost is drift and whose drift is
 *     pinned by `check:sequence-render`. Its own header carries the trade.
 *
 * A notation added after this one is expected to arrive with a from-model
 * builder rather than a refusal; a refusal here is a diagram a reader cannot
 * put in a README, which is most of what the route is for.
 *
 * AND A BACKSTOP UNDER ALL OF THEM. Every builder runs inside a `try`, because
 * this route is reached by a URL a stranger composed and a 500 with an empty
 * body is the one answer an `<img>` cannot show anybody. A throw becomes the
 * same card a refusal does.
 */

import { parseViewSource } from "@/features/playground/input/parse";
import { exportPaletteFor } from "@/features/viewer/export/palette.generated";
import { embeddedIconSvgServer } from "@/features/viewer/export/icon-markup";
import { renderDiagramSvg } from "@/features/viewer/export/render-svg";
import { resolveExportGround } from "@/features/viewer/export/ground";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";
import { renderFlowchartSvg } from "@/features/flowchart/export/render-svg";
import { renderSequenceFileSvg } from "@/features/sequence/export/render-file-svg";
import { renderUseCaseSvg } from "@/features/usecase/export/render-svg";
import { renderErSvg } from "@/features/er/export/render-svg";
import { renderDictSvg } from "@/features/dict/export/render-svg";
import { renderGanttSvg } from "@/features/gantt/export/render-svg";
import { renderTimelineSvg } from "@/features/timeline/export/render-svg";
import { renderLifecycleSvg } from "@/features/lifecycle/export/render-svg";
import type { ViewDocument } from "@/features/playground/input/parse";
import type { ExportTheme } from "@/features/viewer/export/theme";
import { describeError } from "@/lib/errors";
import { tagPaint } from "@/lib/tag-paint";
import type { Theme } from "@/lib/constants";
import type { IconStyle } from "@/lib/icon-style";
import {
  framingPadding,
  reframeSvg,
  type DiagramFraming,
} from "@/lib/diagram-framing";

/**
 * Asked for a diagram this model does not hold. Thrown rather than returned
 * because it is discovered inside {@link draw}, three frames below the only
 * function that knows how to answer a request.
 */
class DiagramNotFound extends Error {
  constructor(wanted: string, available: readonly string[]) {
    super(
      `this model has no diagram called "${wanted}" — it holds ${available.join(", ")}`,
    );
    this.name = "DiagramNotFound";
  }
}

export type RenderOutcome =
  | { status: "ok"; rendered: RenderedSvg }
  | { status: "error"; message: string };

export interface RenderRequest {
  /** Canonical `.alab` text (or a dialect `parseViewSource` accepts). */
  source: string;
  /** Which diagram of a C4 model to draw; the root when absent. */
  diagramId: string | null;
  theme: Theme;
  /** One ink or two. C4 nodes and sequence participants carry stack icons. */
  iconStyle: IconStyle;
  /**
   * How much sheet around the drawing — the ordinary margin, a hairline, or
   * a fixed rectangle. See `lib/diagram-framing.ts`, including why `trim`
   * reaches C4 only.
   */
  framing: DiagramFraming;
}

/**
 * The author's `tagcolor`, computed rather than asked of a browser.
 *
 * Every renderer that paints tag colours takes this as a seam, defaulting to
 * the browser's own evaluation. `lib/tag-paint.ts` carries the argument for
 * why the arithmetic lives beside that rather than replacing it, and what it
 * degrades to for a colour it cannot canonicalise.
 */
function paintForTagColor(theme: ExportTheme) {
  return (tagColor: string) =>
    tagPaint(tagColor, theme.tagFill, {
      fill: theme.node,
      stroke: theme.nodeBorder,
    });
}

/** Draws one document, or says why it cannot. Never throws for bad input. */
export function renderDocument(request: RenderRequest): RenderOutcome {
  const parsed = parseViewSource(request.source);
  if (parsed.status === "error") {
    return { status: "error", message: parsed.error.message };
  }

  const document_ = parsed.value;
  const theme = exportPaletteFor(request.theme);

  try {
    /* THE ASPECT PRESETS ARE APPLIED HERE, once, rather than in nine
       builders: expanding a finished viewBox to a ratio needs to know
       nothing about the notation. `trim` is the half that cannot work this
       way and is threaded into the builder that has a margin to drop. */
    return {
      status: "ok",
      rendered: reframeSvg(
        draw(document_, theme, request),
        request.framing,
        theme.canvas,
        /* The same empty pair every builder here already gets — there is no
           document to read a sheet from. Passed rather than omitted so a
           server that one day HAS a ground relays it over the band too,
           instead of quietly leaving the letterbox unruled. */
        resolveExportGround(),
      ),
    };
  } catch (error) {
    /* A diagram id the reader asked for and this model does not have is a BAD
       REQUEST, not a defect, so it carries its own error rather than arriving
       as "could not be drawn". */
    if (error instanceof DiagramNotFound) {
      return { status: "error", message: error.message };
    }
    /* A builder threw on a document the parser accepted — a shape nobody
       anticipated, or a browser-only dependency reached down a path this
       module does not know about. `describeError` keeps the wording the rest
       of the app uses for the same class of surprise. */
    return {
      status: "error",
      message: `this diagram could not be drawn: ${describeError(error)}`,
    };
  }
}

/** Dispatches to the notation's own builder. Throws only on a real defect. */
function draw(
  document_: ViewDocument,
  theme: ExportTheme,
  request: RenderRequest,
): RenderedSvg {
  switch (document_.kind) {
    case "sequence":
      /* Icons go through the same seam C4 uses. A participant and a container
         are usually the same system drawn twice, so they share one registry
         and one embedder rather than growing a second vocabulary. */
      return renderSequenceFileSvg(document_.file, theme, {
        embedIcon: embeddedIconSvgServer,
        iconStyle: request.iconStyle,
      });
    case "c4": {
      const file = document_.synced.file;
      const wanted = request.diagramId ?? file.rootDiagramId;
      const diagram = file.diagrams.find((d) => d.id === wanted);
      if (diagram === undefined) {
        throw new DiagramNotFound(
          wanted,
          file.diagrams.map((d) => d.id),
        );
      }
      return renderDiagramSvg(diagram, file.metadata.title, theme, {
        embedIcon: embeddedIconSvgServer,
        iconStyle: request.iconStyle,
        tagColors: file.metadata.tagColors,
        paintForTagColor: paintForTagColor(theme),
        /* THE ONLY BUILDER THAT TAKES A MARGIN, because it is the only one
           whose margin is a margin: the other eight bake theirs into layout,
           where removing it would move every coordinate rather than crop the
           sheet. `f=trim` on one of those therefore draws the ordinary frame
           — stated on the parameter rather than left to be discovered. */
        padding: framingPadding(request.framing),
      });
    }
    case "flowchart":
      return renderFlowchartSvg(document_.file, theme, {
        paintForTagColor: paintForTagColor(theme),
      });
    case "usecase":
      return renderUseCaseSvg(document_.file, theme, {
        paintForTagColor: paintForTagColor(theme),
      });
    case "er":
      return renderErSvg(document_.file, theme);
    case "dict":
      return renderDictSvg(document_.file, theme);
    case "gantt":
      return renderGanttSvg(document_.file, theme);
    case "timeline":
      return renderTimelineSvg(document_.file, theme);
    case "lifecycle":
      return renderLifecycleSvg(document_.file, theme);
  }
}
