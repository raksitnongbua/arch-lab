/**
 * Turning the LIVE sequence diagram into a standalone SVG string.
 *
 * WHY FROM THE DOM, where the C4 exporter builds its SVG from the model
 * (`viewer/export/render-svg.ts`). C4 has one renderer for the screen and a
 * second for export, and keeping two in step is a permanent tax it pays for a
 * reason: its export adds a legend and re-pages the drawing. The sequence
 * export adds nothing — it is the diagram, exactly as rendered — so a second
 * renderer would be a copy of `sequence-diagram.tsx` that silently drifts from
 * it. Cloning the real node cannot drift, because there is only one renderer.
 *
 * THE HARD PART IS THAT A CLONE LOSES EVERYTHING. Detached from the document,
 * an SVG has no stylesheet and no custom properties: every `var(--edge)`,
 * `color-mix(…)` and `oklch(from …)` resolves to nothing, every class-supplied
 * stroke width is gone, and the file paints as black shapes on nothing. So each
 * element's COMPUTED presentation is copied from its live twin onto the clone.
 * Computed values are already concrete — `var()` chains, colour mixes and
 * relative colours are all resolved by the engine before we read them — which
 * is what makes this drift-proof: whatever the stylesheet says today is what
 * the export gets, with no list of rules to maintain here.
 *
 * THREE THINGS ARE DROPPED, and each would be a defect in a still image:
 *   - hit regions, which are invisible controls and mean nothing in a file;
 *   - the fold pill, which is an affordance for a reader who can click;
 *   - the idle comet bands, which are motion and nothing else. Frozen, they are
 *     three bright stripes across every message — the same reason reduced
 *     motion removes them rather than parking them.
 */

/** What `viewer/export/download.ts` rasterises. */
export interface RenderedSequenceSvg {
  svg: string;
  width: number;
  height: number;
}

/**
 * The presentation properties worth copying. A deliberate list rather than the
 * whole computed style: `getComputedStyle` exposes hundreds of properties, and
 * serialising all of them onto every node produces a file many times larger
 * than the drawing, slow enough to stall the tab on a long flow.
 */
const CARRIED = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
] as const;

/** Controls that mean nothing in a file, whatever the export is for. */
const DROPPED_ALWAYS = [".af-seq-hit", ".af-seq-fold"].join(",");

/**
 * The idle comet bands. Dropped from a STILL — frozen, they are three bright
 * stripes across every message, the same reason reduced motion removes them
 * rather than parking them — but KEPT for the animated export, where they are
 * the thing being animated.
 */
const MOTION = ".af-seq-flow";

export function renderSequenceSvg(
  source: SVGSVGElement,
  options: { keepMotion?: boolean } = {},
): RenderedSequenceSvg | null {
  const viewBox = source.viewBox.baseVal;
  const width = viewBox.width;
  const height = viewBox.height;
  if (width <= 0 || height <= 0) return null;

  const clone = source.cloneNode(true) as SVGSVGElement;

  /*
   * Walk BOTH trees together. cloneNode(true) preserves document order, so the
   * two element lists line up index for index — and reading the live element is
   * the only way to get a computed style at all, since the clone is not in any
   * document. Styles are copied BEFORE anything is removed, so the two walks
   * stay aligned.
   */
  const live = [source, ...source.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  for (let index = 0; index < live.length; index += 1) {
    const from = live[index];
    const to = copies[index];
    if (from === undefined || to === undefined) break;
    const computed = window.getComputedStyle(from);
    const declarations: string[] = [];
    for (const property of CARRIED) {
      const value = computed.getPropertyValue(property);
      if (value === "" || value === "none" || value === "normal") {
        // `none` and `normal` are the initial values for everything in the
        // list that can produce them, so writing them costs bytes and says
        // nothing — except for stroke/fill, where `none` is meaningful.
        if (!(
          value === "none" &&
          (property === "fill" || property === "stroke")
        )) {
          continue;
        }
      }
      declarations.push(`${property}:${value}`);
    }
    if (declarations.length > 0) {
      to.setAttribute("style", declarations.join(";"));
    }
  }

  for (const node of clone.querySelectorAll(DROPPED_ALWAYS)) node.remove();
  if (options.keepMotion === true) {
    // The bands are display:none while the reader has idle motion switched off,
    // and the inlined styles do not carry `display`. Force them on: the toggle
    // governs the resting page, not what an animation someone asked for
    // contains.
    for (const node of clone.querySelectorAll(MOTION)) {
      node.setAttribute("style", "display:inline");
    }
  } else {
    for (const node of clone.querySelectorAll(MOTION)) node.remove();
  }

  // A standalone file needs intrinsic dimensions; on screen these are set by
  // the pane (100%/100% in fit mode), which means nothing in a file.
  clone.setAttribute("width", String(Math.round(width)));
  clone.setAttribute("height", String(Math.round(height)));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // The page's background is not part of the SVG, so an exported diagram would
  // land on whatever the viewer composites it over — black in most image
  // viewers, which loses every dark-theme stroke. An explicit backdrop is what
  // makes the file readable on its own.
  const backdrop = clone.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  backdrop.setAttribute("x", String(viewBox.x));
  backdrop.setAttribute("y", String(viewBox.y));
  backdrop.setAttribute("width", String(width));
  backdrop.setAttribute("height", String(height));
  backdrop.setAttribute(
    "fill",
    window.getComputedStyle(source).getPropertyValue("--canvas").trim() ||
      window.getComputedStyle(document.body).backgroundColor,
  );
  clone.insertBefore(backdrop, clone.firstChild);

  return {
    svg: new XMLSerializer().serializeToString(clone),
    width,
    height,
  };
}
