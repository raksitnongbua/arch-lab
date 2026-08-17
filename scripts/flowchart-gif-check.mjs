#!/usr/bin/env node
/**
 * Flowchart GIF check — the exported replay of the trace, interrogated as
 * pure data.
 *
 * The encoder itself is NOT re-proven here: `check:sequence-gif` already
 * decodes `encodeGif`'s output pixel by pixel, and the flowchart exporter
 * calls that same function — one fact, one proof. What is unique to this
 * exporter is the SCHEDULE (`planFlowchartFrames`), and a schedule is the
 * kind of code whose failures all survive a thumbnail:
 *
 *   1. NON-DETERMINISM. The same document must byte-identically produce the
 *      same GIF on any machine — a clock read or randomness anywhere in the
 *      plan breaks that promise silently. Asserted by running the plan twice
 *      and comparing wholesale.
 *   2. ENDING MID-DRAW. A loop whose last frame is 97% revealed looks fine
 *      frame by frame and ships a chart that never finishes. The final frame
 *      must have EVERY element at exactly 1 — and elements at 1 are left
 *      untouched in the DOM pass, so the last frame is byte-for-byte the
 *      still export.
 *   3. ORDER VIOLATIONS. An arrow visible before the box it leaves, or a
 *      reveal that flickers backwards, contradicts the whole gesture.
 *      Asserted relationally per rank, not against literal times.
 *   4. A BLANK OPENING FRAME. Sampling from t = 0 puts every animated
 *      element at opacity 0; the first frame must sit past 0 and show
 *      something.
 *   5. DELAYS GIF CANNOT STORE. GIF keeps hundredths of a second and rounds
 *      silently, so a delay off the 10ms grid plays at a speed nobody chose.
 *      And the loop must play at the TRACE's own pace — the deliberate
 *      departure from the ~1.4s preset loops, argued in export/frames.ts —
 *      so the step delays are pinned to the trace's real duration.
 *   6. A BROKEN HOOK CONTRACT. frames.ts finds its elements by the
 *      `af-export-flow-*` classes render-svg.ts emits; rename either side
 *      alone and the exporter reports "nothing to animate" instead of
 *      failing. Both sides are read and compared here.
 *
 * Run with: pnpm check:flowchart-gif
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      if (!(existsSync(asPath) && statSync(asPath).isFile())) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const framesModule = await import(
  pathToFileURL(path.join(ROOT, "src/features/flowchart/export/frames.ts")).href
);
const {
  planFlowchartFrames,
  FLOWCHART_GIF_SHARPNESS,
  FLOW_GIF_HOLD_MS,
  GIF_SMOOTHNESS,
  DEFAULT_FLOWCHART_GIF_QUALITY,
} = framesModule;
const motion = await import(
  pathToFileURL(path.join(ROOT, "src/features/flowchart/lib/motion.ts")).href
);
const { flowTraceTotalMs } = motion;

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

/* A representative chart depth: deep enough to cross the rank-delay cap, so
 * the capped region's ordering is exercised too, not just the linear one. */
const MAX_RANK = 9;

/* ---- 1. determinism -------------------------------------------------------- */

check("the plan is deterministic — two runs agree wholesale", () => {
  for (const smoothness of Object.keys(GIF_SMOOTHNESS)) {
    assert.equal(
      JSON.stringify(planFlowchartFrames(MAX_RANK, smoothness)),
      JSON.stringify(planFlowchartFrames(MAX_RANK, smoothness)),
      `${smoothness}: two runs differ — the same document must produce the same GIF on any machine`,
    );
  }
});

/* ---- 2. the loop ends on the COMPLETE chart -------------------------------- */

check("the final frame has every element at exactly 1", () => {
  for (const smoothness of Object.keys(GIF_SMOOTHNESS)) {
    const plan = planFlowchartFrames(MAX_RANK, smoothness);
    const last = plan[plan.length - 1];
    for (const kind of ["node", "edge", "head"]) {
      for (const [rank, value] of last[kind].entries()) {
        assert.equal(
          value,
          1,
          `${smoothness}: ${kind}[${rank}] ends at ${value} — the loop would finish mid-draw`,
        );
      }
    }
  }
});

check(
  "elements at 1 are left untouched, so the last frame IS the still export",
  () => {
    const source = read("src/features/flowchart/export/frames.ts");
    // Every mutation in the DOM pass is guarded on p < 1 (or continues at
    // p >= 1); without the guard the final frame would carry redundant
    // attributes whose rendering could drift from the PNG's by a pixel.
    assert.match(source, /if \(p >= 1\) continue;/);
    assert.match(source, /if \(p < 1 && line !== null\)/);
    assert.match(source, /if \(headP < 1\)/);
  },
);

/* ---- 3. order --------------------------------------------------------------- */

const plan = planFlowchartFrames(MAX_RANK, "standard");
const firstVisible = (kind, rank) =>
  plan.findIndex((frame) => frame[kind][rank] > 0);

check("no arrow becomes visible before the node it leaves", () => {
  for (let rank = 0; rank <= MAX_RANK; rank += 1) {
    const node = firstVisible("node", rank);
    const edge = firstVisible("edge", rank);
    if (edge === -1) continue;
    assert.ok(
      node !== -1 && node <= edge,
      `rank ${rank}: edge appears at frame ${edge}, its source node at ${node}`,
    );
  }
});

check("no arrowhead becomes visible before its own line", () => {
  for (let rank = 0; rank <= MAX_RANK; rank += 1) {
    const edge = firstVisible("edge", rank);
    const head = firstVisible("head", rank);
    if (head === -1) continue;
    assert.ok(
      edge !== -1 && edge <= head,
      `rank ${rank}: head at frame ${head}, line at ${edge}`,
    );
  }
});

check("the reveal descends — deeper ranks never appear first", () => {
  let previous = -1;
  for (let rank = 0; rank <= MAX_RANK; rank += 1) {
    const at = firstVisible("node", rank);
    assert.ok(
      at !== -1 && at >= previous,
      `rank ${rank} first visible at frame ${at}, rank ${rank - 1} at ${previous}`,
    );
    previous = at;
  }
});

check("progress is monotone — a reveal never flickers backwards", () => {
  for (const kind of ["node", "edge", "head"]) {
    for (let rank = 0; rank <= MAX_RANK; rank += 1) {
      let previous = 0;
      for (const frame of plan) {
        assert.ok(
          frame[kind][rank] >= previous,
          `${kind}[${rank}] drops from ${previous} to ${frame[kind][rank]}`,
        );
        previous = frame[kind][rank];
      }
    }
  }
});

/* ---- 4. no blank frame ------------------------------------------------------- */

check("the first frame sits past t = 0 and already shows something", () => {
  // At t = 0 every animated element is at opacity 0; only the heading and
  // group frames (which carry no hook) would survive. The (index + 1)
  // sampling in the plan is what guarantees this.
  assert.ok(plan[0].timeMs > 0, "first frame sampled at t = 0");
  assert.ok(
    plan[0].node.some((value) => value > 0),
    "first frame has no visible node — the opening frame is an empty canvas",
  );
});

/* ---- 5. delays --------------------------------------------------------------- */

check(
  "every delay is a whole hundredth of a second — GIF rounds anything else silently",
  () => {
    for (const smoothness of Object.keys(GIF_SMOOTHNESS)) {
      for (const frame of planFlowchartFrames(MAX_RANK, smoothness)) {
        assert.equal(frame.delayMs % 10, 0, `${frame.delayMs}ms off the grid`);
      }
    }
    assert.equal(FLOW_GIF_HOLD_MS % 10, 0, "the hold itself is off the grid");
  },
);

check(
  "delays are uniform except the final hold, and the hold is the declared one",
  () => {
    const steps = new Set(plan.slice(0, -1).map((frame) => frame.delayMs));
    assert.equal(steps.size, 1, "mid-trace delays vary — playback would lurch");
    const step = [...steps][0];
    assert.equal(
      plan[plan.length - 1].delayMs,
      step + FLOW_GIF_HOLD_MS,
      "the finished chart does not rest before the replay — the loop reads as a stutter",
    );
  },
);

check("the loop plays at the TRACE's own pace, not the preset's 1.4s", () => {
  // The deliberate departure from GIF_SMOOTHNESS's delayMs, argued in
  // frames.ts: compressing a budgeted presentation gesture re-times the very
  // thing being exported. Within one 10ms grid step per frame of the real
  // duration.
  const total = flowTraceTotalMs(MAX_RANK);
  const played = plan.reduce((sum, frame) => sum + frame.delayMs, 0);
  const tolerance = plan.length * 10;
  assert.ok(
    Math.abs(played - FLOW_GIF_HOLD_MS - total) <= tolerance,
    `trace lasts ${total}ms but plays for ${played - FLOW_GIF_HOLD_MS}ms`,
  );
});

check("smoothness adds frames — finer sampling, same gesture", () => {
  const counts = ["simple", "standard", "smooth"].map(
    (smoothness) => planFlowchartFrames(MAX_RANK, smoothness).length,
  );
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
  for (const [index, smoothness] of [
    "simple",
    "standard",
    "smooth",
  ].entries()) {
    assert.equal(counts[index], GIF_SMOOTHNESS[smoothness].frames);
  }
});

check(
  "sharper means strictly more pixels, and the default is a real preset",
  () => {
    const { compact, standard, sharp } = FLOWCHART_GIF_SHARPNESS;
    assert.ok(compact < standard && standard < sharp);
    assert.ok(
      DEFAULT_FLOWCHART_GIF_QUALITY.sharpness in FLOWCHART_GIF_SHARPNESS,
    );
    assert.ok(DEFAULT_FLOWCHART_GIF_QUALITY.smoothness in GIF_SMOOTHNESS);
  },
);

/* ---- 6. the hook contract, both sides ---------------------------------------- */

const framesSource = read("src/features/flowchart/export/frames.ts");
const renderSource = read("src/features/flowchart/export/render-svg.ts");

check("render-svg emits every hook frames.ts selects on", () => {
  for (const hook of [
    "af-export-flow-node",
    "af-export-flow-edge",
    "af-export-flow-line",
    "af-export-flow-head",
    "af-export-flow-elabel",
    "data-flow-rank",
    "data-flow-kind",
  ]) {
    assert.ok(framesSource.includes(hook), `frames.ts never uses ${hook}`);
    assert.ok(renderSource.includes(hook), `render-svg.ts never emits ${hook}`);
  }
});

check(
  "edges carry their SOURCE's rank and back edges are marked to fade",
  () => {
    assert.match(
      renderSource,
      /data-flow-rank="\$\{rankOf\.get\(edge\.from\) \?\? 0\}"/,
    );
    assert.match(
      renderSource,
      /data-flow-kind="\$\{edge\.back \? "fade" : "draw"\}"/,
    );
  },
);

check(
  "the heading and groups carry no hook — context stays put, so no frame is blank",
  () => {
    const headingAt = renderSource.indexOf("---- heading");
    assert.ok(headingAt > 0, "heading section not found");
    assert.ok(
      !renderSource.slice(headingAt).includes("af-export-flow"),
      "the heading joined the animation",
    );
    const groupsAt = renderSource.indexOf("---- groups");
    const edgesAt = renderSource.indexOf("---- edges");
    assert.ok(groupsAt > 0 && edgesAt > groupsAt, "sections not found");
    assert.ok(
      !renderSource.slice(groupsAt, edgesAt).includes("af-export-flow"),
      "group frames joined the animation",
    );
  },
);

check(
  "a back edge is faded whole and NEVER re-dashed — its 6 4 dash is its meaning",
  () => {
    // The fade branch touches opacity only; the pathLength/dasharray rewrite
    // lives in the draw branch. Losing this ships a GIF in which every loop
    // spends its draw window disguised as a forward arrow.
    const fadeBranch = framesSource.match(
      /data-flow-kind"\) === "fade"\) \{([\s\S]*?)\} else/,
    );
    assert.ok(fadeBranch !== null, "no fade branch found");
    assert.ok(
      !fadeBranch[1].includes("stroke-dasharray"),
      "fade branch re-dashes",
    );
    assert.ok(fadeBranch[1].includes("opacity"), "fade branch does not fade");
  },
);

check(
  "the draw counts the offset DOWN from 100(1-p) — the line grows source → target",
  () => {
    assert.match(framesSource, /String\(100 \* \(1 - p\)\)/);
  },
);

check(
  "the GIF's entrance rise equals the CSS keyframe's translateY — the exported frames and the on-screen trace must land nodes from the same height",
  () => {
    // CSS cannot import TypeScript and frames.ts cannot import CSS, so the
    // 4px exists twice; this is the pin frames.ts's ENTER_RISE comment
    // promises. Unpinned, a retuned keyframe would leave the GIF rising a
    // different distance than the screen — invisible in any one artifact,
    // obvious the first time both are shown side by side in a review.
    const css = read("src/features/flowchart/styles/flowchart-motion.css");
    const keyframe = css.match(
      /@keyframes af-flow-enter[\s\S]*?translateY\((\d+)px\)/,
    );
    const rise = framesSource.match(/const ENTER_RISE = (\d+);/);
    assert.ok(keyframe !== null, "af-flow-enter has no translateY");
    assert.ok(rise !== null, "ENTER_RISE not declared");
    assert.equal(Number(rise[1]), Number(keyframe[1]));
  },
);

check(
  "the export button actually offers the GIF and encodes through the shared encoder",
  () => {
    const button = read("src/features/flowchart/export/export-button.tsx");
    assert.match(button, /runAndClose\("gif"\)/);
    assert.match(button, /buildFlowchartFrames\(/);
    assert.match(
      button,
      /import \{ encodeGif \} from "@\/features\/viewer\/export\/gif"/,
    );
  },
);

/*
 * IDLE MOTION STAYS OUT OF THE EXPORTS — a decision, not an omission. The
 * sequence GIF loops its idle motion because idle motion is that diagram's
 * only continuous story (its entrance is a 260ms settle, not worth a file);
 * the flowchart's story IS the trace, and this GIF is one closed loop of it.
 * The idle pulse cannot join that loop: its period (FLOWCHART_DURATIONS.
 * idlePeriod) shares no common cycle with the trace's total, so any window
 * holding both would cut a pulse mid-flight at the wrap — the exact
 * fractional-period jerk check:sequence-gif exists to forbid. And the still
 * SVG/PNG exports must never carry a parked band, which is not a resting
 * state on screen and is a smudge on paper.
 */
check(
  "no idle-motion hook reaches the exporter — the GIF replays the TRACE only, and the stills stay still",
  () => {
    for (const [name, source] of [
      ["frames.ts", framesSource],
      ["render-svg.ts", renderSource],
    ]) {
      assert.ok(
        !/pulse|data-af-idle|idleStart|idlePeriod/.test(source),
        `${name} references idle motion — the export loop would cut a pulse mid-flight at the wrap`,
      );
    }
  },
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} flowchart-gif assertions passed.`);
