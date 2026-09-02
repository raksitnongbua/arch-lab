/**
 * The frames of the animated flowchart GIF: THE TRACE, replayed.
 *
 * WHAT IT SHOWS. Exactly the choreography the viewer plays on first paint —
 * ranks rising in, arrows drawing into the boxes they point at, loops fading
 * in whole — then the finished chart, held, before the loop replays. Unlike
 * the sequence GIF (a seamless cycle of idle motion that never stops), a
 * trace is a ONE-SHOT gesture, so this loop is a replay with a rest at the
 * end rather than a cycle: without the hold, the completed chart would
 * vanish the instant it finished and the loop would read as a stutter.
 *
 * IT DOES NOT RECORD THE SCREEN, for the reasons `sequence/export/frames.ts`
 * lays out (compositor sampling, tab throttling, non-determinism). Each
 * frame is SYNTHESISED: the model-rendered SVG from `./render-svg.ts` is
 * re-parsed per frame and every node/edge is set to the opacity, offset and
 * rise it would hold at that instant — phases computed by the SAME pure
 * timing functions in `../lib/motion.ts` that the stylesheet's numbers are
 * pinned to, so the exported trace and the on-screen trace share one clock.
 *
 * THE CLOCK IS THE TRACE'S OWN, which is this exporter's one deliberate
 * departure from the shared `GIF_SMOOTHNESS` presets: they fix frame count
 * AND delay to hold every loop at ~1.4s, which is right for an idle cycle
 * whose pitch is arbitrary, and wrong here — the trace's length was budgeted
 * as a presentation gesture (see FLOWCHART_DURATIONS), and compressing a
 * 2.2s reveal into 1.4s re-times exactly the thing being exported. So the
 * presets supply the FRAME COUNT (how finely the motion is sampled — what
 * "smoothness" means everywhere) and the delay is derived from the trace's
 * real duration, rounded to the hundredths of a second GIF can store.
 */

import { GIF_SMOOTHNESS, rasterise, type GifSmoothness } from "@/lib/gif";

import {
  FLOWCHART_DURATIONS,
  flowEdgeDelay,
  flowProgressAt,
  flowRankDelay,
  flowTraceTotalMs,
} from "../lib/motion";
import type { RenderedFlowchartSvg } from "./render-svg";

/**
 * Target LONGEST-EDGE PIXELS per sharpness — the sequence exporter's
 * construction (`GIF_SHARPNESS` there), not the C4 multiplier, because a
 * flowchart's own size varies as freely as a sequence diagram's: a fixed
 * pixel target is what keeps "Sharp" meaning "small guard labels survive"
 * on a tiny chart and a huge one alike. The values match the sequence
 * exporter's on purpose — same job, same legibility thresholds — but stay
 * declared per feature, per the deliberate non-sharing `@/lib/gif` documents
 * for the sharpness axis.
 */
export const FLOWCHART_GIF_SHARPNESS = {
  standard: 720,
  sharp: 1080,
  compact: 540,
} as const;

export type FlowchartGifSharpness = keyof typeof FLOWCHART_GIF_SHARPNESS;

/** Re-exported so the export button and the check script read GIF settings
 * from this one module; the presets themselves are shared app-wide. */
export { GIF_SMOOTHNESS };
export type { GifSmoothness };

/**
 * How long the finished chart HOLDS before the loop replays. Long enough to
 * actually read the completed chart (it is the payload — the trace is only
 * how it arrives); a whole multiple of 10ms because GIF stores hundredths
 * of a second and silently rounds anything else.
 */
export const FLOW_GIF_HOLD_MS = 1200;

/** The entrance rise in SVG user units — the CSS `translateY(4px)` twin.
 * CSS cannot be imported here any more than it can import us;
 * `check:flowchart-motion` pins the keyframe, `check:flowchart-gif` pins
 * this, and both against the same number. */
const ENTER_RISE = 4;

export interface FlowchartGifQuality {
  sharpness: FlowchartGifSharpness;
  smoothness: GifSmoothness;
}

export const DEFAULT_FLOWCHART_GIF_QUALITY: FlowchartGifQuality = {
  sharpness: "standard",
  smoothness: "standard",
};

/** One frame's schedule: per-rank progress (0..1, eased) for each element
 * kind. Index = rank. Pure data, so the check script can interrogate the
 * whole choreography without a DOM. */
export interface FlowchartFrameSpec {
  timeMs: number;
  delayMs: number;
  /** Rank r's nodes: entrance progress. */
  node: number[];
  /** Edges LEAVING rank r: line draw (or loop fade) progress. */
  edge: number[];
  /** Those edges' arrowheads and labels: fade progress. */
  head: number[];
}

/**
 * The whole GIF's schedule, as pure data — every number the DOM pass below
 * applies. Deterministic by construction (no clock reads, no randomness), so
 * the same document always produces the same GIF, which `check:flowchart-gif`
 * asserts by running it twice.
 *
 * Frames sample `t = (i + 1) / frameCount × total`: the +1 is load-bearing
 * twice over. It puts the LAST frame exactly at the trace's end, so the loop
 * finishes on the complete chart (never mid-draw); and it keeps the FIRST
 * frame off t = 0, where every animated element would be at opacity 0 and
 * the opening frame would be the heading alone on an empty canvas.
 */
export function planFlowchartFrames(
  maxRank: number,
  smoothness: GifSmoothness,
): FlowchartFrameSpec[] {
  const { frames: frameCount } = GIF_SMOOTHNESS[smoothness];
  const totalMs = flowTraceTotalMs(maxRank);
  // The trace's real pace, to GIF's 10ms grid; floored at 20ms because many
  // decoders quietly clamp shorter delays to their own default, which would
  // hand the loop's speed to the viewer application instead of this file.
  const stepMs = Math.max(20, Math.round(totalMs / frameCount / 10) * 10);
  const d = FLOWCHART_DURATIONS;

  const frames: FlowchartFrameSpec[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = ((index + 1) / frameCount) * totalMs;
    const node: number[] = [];
    const edge: number[] = [];
    const head: number[] = [];
    for (let rank = 0; rank <= maxRank; rank += 1) {
      node.push(flowProgressAt(flowRankDelay(rank), d.nodeEnter, timeMs));
      edge.push(flowProgressAt(flowEdgeDelay(rank), d.edgeDraw, timeMs));
      head.push(
        flowProgressAt(flowEdgeDelay(rank) + d.headDelay, d.headFade, timeMs),
      );
    }
    frames.push({
      timeMs,
      // The hold lives on the final frame's delay: the cheapest way to rest
      // on the finished chart without encoding duplicate frames.
      delayMs: index === frameCount - 1 ? stepMs + FLOW_GIF_HOLD_MS : stepMs,
      node,
      edge,
      head,
    });
  }
  return frames;
}

export interface FlowchartFrames {
  frames: { rgba: Uint8ClampedArray; delayMs: number }[];
  width: number;
  height: number;
}

/**
 * Builds one replay of the trace from the model-rendered SVG.
 *
 * Returns null when the document has nothing the trace animates — no nodes
 * means no ranks means every frame identical, and a GIF of a still is worse
 * than declining to make one (the sequence exporter's rule).
 */
export async function buildFlowchartFrames(
  rendered: RenderedFlowchartSvg,
  quality: FlowchartGifQuality = DEFAULT_FLOWCHART_GIF_QUALITY,
  /** Called after each frame, so a caller can show progress. */
  onProgress?: (done: number, total: number) => void,
): Promise<FlowchartFrames | null> {
  const maxEdge = FLOWCHART_GIF_SHARPNESS[quality.sharpness];
  const scale = Math.min(
    1,
    maxEdge / Math.max(rendered.width, rendered.height),
  );
  const width = Math.max(1, Math.round(rendered.width * scale));
  const height = Math.max(1, Math.round(rendered.height * scale));

  /*
   * Phases are applied to a PARSED copy per frame, never to a shared
   * document: each frame starts from the pristine render, so a frame can
   * never inherit a stale attribute from the frame before it.
   */
  const parser = new DOMParser();
  const probe = parser.parseFromString(rendered.svg, "image/svg+xml");
  // A <parsererror> document answers every query with nothing, which would
  // surface as "nothing to animate" — a lie about a real failure. Name it.
  if (probe.querySelector("parsererror") !== null) {
    throw new Error(
      "the flowchart could not be re-parsed for export (malformed SVG)",
    );
  }
  const ranks = [
    ...probe.documentElement.querySelectorAll("[data-flow-rank]"),
  ].map((element) => Number(element.getAttribute("data-flow-rank")));
  if (ranks.length === 0) return null;
  const maxRank = Math.max(...ranks);

  const plan = planFlowchartFrames(maxRank, quality.smoothness);
  const frames: FlowchartFrames["frames"] = [];

  for (const [index, spec] of plan.entries()) {
    const document_ = parser.parseFromString(rendered.svg, "image/svg+xml");
    const root = document_.documentElement;

    for (const group of root.querySelectorAll(".af-export-flow-node")) {
      const p = spec.node[Number(group.getAttribute("data-flow-rank"))] ?? 1;
      // p === 1 leaves the markup untouched, so the final frame is byte-for-
      // byte the still export — the strongest form of "ends complete".
      if (p >= 1) continue;
      group.setAttribute("opacity", String(p));
      // The CSS entrance's translateY twin, as an attribute: CSS transforms
      // on SVG children are unreliable in strict rasterisers.
      group.setAttribute("transform", `translate(0 ${(1 - p) * ENTER_RISE})`);
    }

    for (const group of root.querySelectorAll(".af-export-flow-edge")) {
      const rank = Number(group.getAttribute("data-flow-rank"));
      const p = spec.edge[rank] ?? 1;
      const headP = spec.head[rank] ?? 1;
      const line = group.querySelector(".af-export-flow-line");
      if (group.getAttribute("data-flow-kind") === "fade") {
        // A LOOP fades in whole, its 6 4 dash untouched from its first
        // visible frame — the same rule as on screen: a dashoffset draw
        // would re-dash it into a forward arrow for the length of the draw.
        if (p < 1 && line !== null) line.setAttribute("opacity", String(p));
      } else if (p < 1 && line !== null) {
        // The draw: pathLength 100 normalises the dash maths to percentages
        // of any polyline; a 100-unit dash offset by 100(1-p) shows exactly
        // the first p of the path, growing source → target.
        line.setAttribute("pathLength", "100");
        line.setAttribute("stroke-dasharray", "100 100");
        line.setAttribute("stroke-dashoffset", String(100 * (1 - p)));
      }
      if (headP < 1) {
        group
          .querySelector(".af-export-flow-head")
          ?.setAttribute("opacity", String(headP));
      }
    }

    /* EDGE LABELS ARE A TOP-LEVEL LAYER, not children of their edge's group —
       render-svg.ts paints them after the nodes so a guard can never end up
       under a box. They carry their edge's own `data-flow-rank`, so the head's
       window still governs them: a guard belongs to the finished arrow. */
    for (const label of root.querySelectorAll(".af-export-flow-elabel")) {
      const headP =
        spec.head[Number(label.getAttribute("data-flow-rank"))] ?? 1;
      if (headP < 1) label.setAttribute("opacity", String(headP));
    }

    frames.push({
      rgba: await rasterise(
        new XMLSerializer().serializeToString(root),
        width,
        height,
      ),
      delayMs: spec.delayMs,
    });
    onProgress?.(index + 1, plan.length);
    // Yield between frames, or the rasterises run back to back with no paint
    // and the tab looks frozen while progress goes unreported.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  return { frames, width, height };
}
