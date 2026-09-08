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
 *   - **The ground.** `resolveExportGround()` returns its EMPTY pair away from
 *     a browser, so a server-drawn diagram has no ruling and no grain. That is
 *     a REAL loss on `blueprint`, `paper` and `eink`, whose own module argues
 *     that a blueprint without its ruling is not a blueprint. It is recorded
 *     here rather than glossed, and it is the next thing to fix — the palette
 *     generator is the shape the fix takes.
 *   - **Author tag colours.** `resolveTagPaint` rebuilds the fill with a
 *     relative-colour expression the browser evaluates, so `tagColors` is
 *     dropped here and the role palette draws instead. Same reason, same fix.
 *
 * TWO KINDS THIS CANNOT DRAW YET, each refused by name rather than allowed to
 * fail somewhere deeper. Both refusals are in {@link SERVER_REFUSALS}, and
 * both are about a dependency that only exists in a browser — not about the
 * notation:
 *
 *   - **sequence** — `renderSequenceSvg` takes a live `SVGSVGElement` and
 *     clones the canvas, by explicit design in its own header. There is no
 *     model-to-string builder for it in the repo.
 *   - **c4** — its connector geometry comes from `getBezierPath`, a
 *     client-only export of `@xyflow/react`, so `edge-geometry.ts` throws the
 *     moment it is reached from a route ("Attempted to call getBezierPath()
 *     from the server"). Its icons are a second, separate wall: the registry's
 *     marks are React components and neither React renderer is usable here.
 *     Both are why the `embedIcon` seam and `omitIcon` exist — the wiring is
 *     ready and the geometry is not.
 *
 * AND A BACKSTOP UNDER ALL OF THEM. Every builder runs inside a `try`, because
 * this route is reached by a URL a stranger composed and a 500 with an empty
 * body is the one answer an `<img>` cannot show anybody. A throw becomes the
 * same card a refusal does.
 */

import { parseViewSource } from "@/features/playground/input/parse";
import { exportPaletteFor } from "@/features/viewer/export/palette.generated";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";
import { renderFlowchartSvg } from "@/features/flowchart/export/render-svg";
import { renderUseCaseSvg } from "@/features/usecase/export/render-svg";
import { renderErSvg } from "@/features/er/export/render-svg";
import { renderDictSvg } from "@/features/dict/export/render-svg";
import { renderGanttSvg } from "@/features/gantt/export/render-svg";
import { renderTimelineSvg } from "@/features/timeline/export/render-svg";
import { renderLifecycleSvg } from "@/features/lifecycle/export/render-svg";
import type { ViewDocument } from "@/features/playground/input/parse";
import type { ExportTheme } from "@/features/viewer/export/theme";
import { describeError } from "@/lib/errors";
import type { Theme } from "@/lib/constants";

/**
 * The kinds a route handler cannot draw, and why — in the reader's terms, not
 * the dependency's. Each sentence has to survive being read by someone who
 * pasted a link into a README and got a card back, so it says what they can do
 * instead rather than naming a module.
 */
const SERVER_REFUSALS: Partial<Record<ViewDocument["kind"], string>> = {
  sequence:
    "sequence diagrams cannot be drawn as an image yet — their renderer reads the live canvas rather than the model. The share link opens this one in full, with its motion.",
  c4: "C4 models cannot be drawn as an image yet — their connector curves and their icons both come from the canvas's own renderer, which needs a browser. The share link opens this one in full. Every other notation renders here.",
};

export type RenderOutcome =
  | { status: "ok"; rendered: RenderedSvg }
  | { status: "error"; message: string };

export interface RenderRequest {
  /** Canonical `.alab` text (or a dialect `parseViewSource` accepts). */
  source: string;
  /** Which diagram of a C4 model to draw; the root when absent. */
  diagramId: string | null;
  theme: Theme;
}

/**
 * Strips the author's `tagColors` from a file's metadata.
 *
 * The flowchart and use-case builders read them off the file and paint them
 * through `resolveTagPaint`, which needs a document; removing them here makes
 * those builders take their own role palette instead. Degrading the colour is
 * the honest failure — calling a DOM function on the server would be a 500 for
 * every document that happens to tint a node.
 */
function withoutTagColors<T extends { metadata: { tagColors?: unknown } }>(
  file: T,
): T {
  if (file.metadata.tagColors === undefined) return file;
  const metadata = { ...file.metadata };
  delete metadata.tagColors;
  return { ...file, metadata };
}

/** Draws one document, or says why it cannot. Never throws for bad input. */
export function renderDocument(request: RenderRequest): RenderOutcome {
  const parsed = parseViewSource(request.source);
  if (parsed.status === "error") {
    return { status: "error", message: parsed.error.message };
  }

  const document_ = parsed.value;
  const refusal = SERVER_REFUSALS[document_.kind];
  if (refusal !== undefined) return { status: "error", message: refusal };

  const theme = exportPaletteFor(request.theme);

  try {
    return { status: "ok", rendered: draw(document_, theme) };
  } catch (error) {
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
function draw(document_: ViewDocument, theme: ExportTheme): RenderedSvg {
  switch (document_.kind) {
    case "c4":
    case "sequence":
      /* Refused above, by name. Reaching here means SERVER_REFUSALS and this
         switch disagree, which is a defect rather than a bad request. */
      throw new Error(`${document_.kind} is refused, not drawn`);
    case "flowchart":
      return renderFlowchartSvg(withoutTagColors(document_.file), theme);
    case "usecase":
      return renderUseCaseSvg(withoutTagColors(document_.file), theme);
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
