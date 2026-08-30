#!/usr/bin/env node
/**
 * Flowchart trace check — the rules that keep the rank-by-rank reveal
 * honest, in both directions of its one hard constraint: the trace plays at
 * FIRST PAINT, before hydration, so nothing about it may depend on JS.
 *
 * What this asserts, and the failure each rule prevents:
 *
 *   1. The stylesheet's `var()` FALLBACKS equal `FLOWCHART_DURATIONS`.
 *      Nothing stamps the `--flow-*` properties at runtime, so the fallback
 *      is what ALWAYS runs — a retune of lib/motion.ts that forgot the CSS
 *      would silently keep the old timing forever (the dry.md rule; same
 *      pin `check:sequence-motion` holds for the opening settle).
 *   2. Reduced motion is handled BY MEDIA QUERY, wholly: every trace
 *      animation — and the draw's `stroke-dasharray: 1`, which without its
 *      animation parks every solid arrow invisible at offset 1 or restyles
 *      it as dashed — lives inside `prefers-reduced-motion: no-preference`.
 *      A reader who declined motion must get the complete, static chart on
 *      the very first frame; a JS gate cannot promise that before hydration.
 *   3. The choreography's ORDER is structural: an edge starts after the node
 *      it leaves, before the rank it points at, while its source is still
 *      landing — asserted as relations on the constants, because the literal
 *      numbers can be retuned freely so long as the relations hold.
 *   4. The whole trace fits a presentation budget even on a bottomless
 *      chart, because the rank delay is capped IDENTICALLY in TS and CSS —
 *      a chart that trickles in for ten seconds is a loading screen, not a
 *      reveal.
 *   5. The trace can never strand an element mid-animation: from-only
 *      keyframes (the end state is the element's own resting state), only
 *      compositor/paint properties, and the animation on an INNER group so
 *      its `both` fill cannot hold opacity against the focus dim's
 *      transition on the outer one.
 *   6. IDLE MOTION (the pulse) is the opposite contract to the trace's, and
 *      both directions are pinned: the pulse is gated by the app-wide
 *      preference AND by reduced motion (absent, not parked, when either
 *      says no), while the trace is gated by NEITHER toggle — an entrance is
 *      motion the reader asked for (lib/idle-motion.ts, "WHAT IT DOES NOT
 *      COVER"). The pulse begins only after the worst-case trace has
 *      settled, and its cycle travels exactly one dash period, so the loop
 *      can neither jerk at the wrap nor accumulate drift. An EXPLICIT toggle
 *      ON is the exception to the settle: re-applying the gated animation
 *      restarts it from zero, so without the resume override the button's
 *      effect stays invisible for idleStart-plus — the shipped "idle motion
 *      toggle broken" report — and the resume wiring is pinned here too.
 *   7. A HIDDEN MOUNT must not burn the trace: CSS animation clocks are
 *      wall time and tick while a tab is hidden, so a share link opened in
 *      a background tab used to play the whole entrance to nobody — the
 *      viewer's remount-at-first-visibility wiring is pinned here. The
 *      clock behaviour itself is only observable in a real browser; see
 *      that section's comment for what these assertions honestly cover.
 *
 * Run with: pnpm check:flowchart-motion
 */

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

const motion = await import(
  pathToFileURL(path.join(ROOT, "src/features/flowchart/lib/motion.ts")).href
);
const { FLOWCHART_DURATIONS, flowRankDelay, flowTraceTotalMs } = motion;

const css = read("src/features/flowchart/styles/flowchart-motion.css");
const diagram = read("src/features/flowchart/components/flowchart-diagram.tsx");
const viewer = read("src/features/flowchart/components/flowchart-viewer.tsx");
const globals = read("src/app/globals.css");
const motionSource = read("src/features/flowchart/lib/motion.ts");

let assertions = 0;
let failures = 0;
const check = (label, ok) => {
  assertions += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
};

/* ---- 0. the stylesheet is actually loaded -------------------------------- */

check(
  "globals.css imports flowchart-motion.css — an unimported stylesheet is a trace that silently never plays",
  /@import "\.\.\/features\/flowchart\/styles\/flowchart-motion\.css";/.test(
    globals,
  ),
);

/* ---- 1. the fallbacks ARE the durations ----------------------------------- */

/*
 * CSS cannot import TypeScript, so these numbers are genuinely duplicated;
 * this asserts the duplication agrees. The fallback side matters more here
 * than in the sequence viewer: there the custom properties are stamped on
 * mount and the fallback only covers first paint — here nothing ever stamps
 * them, so a drifted fallback is not a first-paint glitch but the shipped
 * behaviour.
 */
const fallback = (name) => {
  const match = css.match(new RegExp(`var\\(--flow-${name},\\s*(\\d+)ms\\)`));
  return match === null ? null : Number(match[1]);
};

for (const [cssName, key] of [
  ["enter", "nodeEnter"],
  ["stagger", "rankStagger"],
  ["cap", "maxDelay"],
  ["edge-delay", "edgeDelay"],
  ["draw", "edgeDraw"],
  ["head", "headFade"],
  ["head-delay", "headDelay"],
  ["idle-start", "idleStart"],
  ["idle-period", "idlePeriod"],
]) {
  check(
    `the --flow-${cssName} fallback equals FLOWCHART_DURATIONS.${key} (${FLOWCHART_DURATIONS[key]}ms) — the fallback is what always runs`,
    fallback(cssName) === FLOWCHART_DURATIONS[key],
  );
}

check(
  "every use of a --flow-* duration carries the same fallback value (two different fallbacks for one property is two clocks)",
  (() => {
    for (const name of [
      "enter",
      "stagger",
      "cap",
      "edge-delay",
      "draw",
      "head",
      "head-delay",
      "idle-start",
      "idle-period",
    ]) {
      const values = [
        ...css.matchAll(
          new RegExp(`var\\(--flow-${name},\\s*(\\d+)ms\\)`, "g"),
        ),
      ].map((m) => m[1]);
      if (values.length === 0) return false;
      if (new Set(values).size !== 1) return false;
    }
    return true;
  })(),
);

/* ---- 2. reduced motion, by media query, completely ------------------------ */

/*
 * Split the file at the no-preference block and demand that nothing animated
 * survives outside it. Keyframes may sit outside (they are inert without an
 * `animation` declaration); `animation:` shorthands and the draw's dasharray
 * may not.
 */
const gate = css.match(
  /@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*?)\n\}/,
);
check(
  "the trace lives in a prefers-reduced-motion: no-preference block",
  gate !== null,
);

const outsideGate = gate === null ? css : css.replace(gate[0], "");
check(
  "no animation declaration exists outside the gate — a first-paint animation cannot be suppressed by JS for a reader who declined motion",
  !/animation:/.test(outsideGate),
);
check(
  "the draw's stroke-dasharray: 1 is inside the gate — applied without its animation it strands every solid arrow mid-draw",
  gate !== null &&
    /stroke-dasharray:\s*1\s*;/.test(gate[1]) &&
    !/stroke-dasharray:\s*1\s*;/.test(outsideGate),
);

check(
  "the entrance and fade keyframes are from-only, so their end state is the element's own complete state — `both` fill can never park anything mid-way",
  (() => {
    for (const name of ["af-flow-enter", "af-flow-fade-in"]) {
      const block = css.match(
        new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
      );
      if (block === null || /to\s*\{/.test(block[1])) return false;
    }
    return true;
  })(),
);

check(
  "keyframes animate only opacity, transform and stroke-dashoffset — never a layout property",
  (() => {
    const blocks = [...css.matchAll(/@keyframes [\w-]+\s*\{([\s\S]*?)\n\}/g)];
    if (blocks.length === 0) return false;
    for (const block of blocks) {
      const properties = [...block[1].matchAll(/^\s+([a-z-]+):/gm)].map(
        (m) => m[1],
      );
      if (properties.length === 0) return false;
      if (
        !properties.every((p) =>
          ["opacity", "transform", "stroke-dashoffset"].includes(p),
        )
      ) {
        return false;
      }
    }
    return true;
  })(),
);

/* ---- 3. the choreography's order, as relations ---------------------------- */

const d = FLOWCHART_DURATIONS;
check(
  "an edge starts strictly AFTER its source rank's beat (edgeDelay > 0) — an arrow must never leave a box that has not begun arriving",
  d.edgeDelay > 0,
);
check(
  "an edge starts before its source finishes landing (edgeDelay < nodeEnter) — box and arrow read as one gesture, not two beats",
  d.edgeDelay < d.nodeEnter,
);
check(
  "an edge starts before the rank it points at (edgeDelay < rankStagger) — the line leads the eye to the box, never the box to the line",
  d.edgeDelay < d.rankStagger,
);
check(
  "consecutive ranks overlap mid-flight (rankStagger < edgeDelay + edgeDraw) — a stagger past one hop's length turns the sweep into a slideshow of ranks",
  d.rankStagger < d.edgeDelay + d.edgeDraw,
);
check(
  "the arrowhead lands as its line completes (headDelay + headFade within 80ms of edgeDraw) — a head that beats its own line, or trails it by a beat, breaks the hop's full stop",
  Math.abs(d.headDelay + d.headFade - d.edgeDraw) <= 80,
);
check(
  "the rank delay is monotone non-decreasing through the cap — the property 'nothing starts before what it flows from' rests on",
  (() => {
    let previous = -1;
    for (let rank = 0; rank <= 40; rank += 1) {
      const delay = flowRankDelay(rank);
      if (delay < previous) return false;
      previous = delay;
    }
    return true;
  })(),
);

/* ---- 4. the budget --------------------------------------------------------- */

check(
  // Tightened from 2.5s after the reveal was reported as TOO SLOW at a 2180ms
  // total: the budget now sits just above the shipped 1310ms, so restoring any
  // of the old durations fails here instead of quietly making the entrance a
  // loading screen again.
  "a bottomless chart still finishes inside 1.5s (flowTraceTotalMs is capped) — past that a reveal stops feeling instant, which is what got the first clock rejected",
  flowTraceTotalMs(1000) <= 1500,
);
check(
  "the CSS delay applies the SAME cap via min() — without it CSS and TS would disagree exactly and only on deep charts",
  gate !== null &&
    /min\(\s*calc\(var\(--flow-rank, 0\) \* var\(--flow-stagger, \d+ms\)\),\s*var\(--flow-cap, \d+ms\)\s*\)/.test(
      gate[1],
    ),
);

/* ---- 5. the renderer's side of the contract -------------------------------- */

check(
  "nodes stamp --flow-rank from the LAYOUT's rank, never a render index — a barycentre re-order must not re-time the reveal",
  /"--flow-rank": node\.rank/.test(diagram),
);
check(
  "edges stamp --flow-rank from their SOURCE node's rank — an edge's clock starts when the box it leaves does",
  /"--flow-rank": sourceRank/.test(diagram) &&
    /sourceRank=\{nodeById\.get\(edge\.from\)\?\.rank \?\? 0\}/.test(diagram),
);
check(
  "back edges FADE, never draw — a dashoffset draw would re-dash the 6 4 loop into a forward arrow for the length of the draw",
  /edge\.back \? "af-flow-fade" : "af-flow-draw"/.test(diagram),
);
check(
  "pathLength 1 goes only on DRAWN lines — normalising a back edge's dash would stretch its 6 4 out of proportion",
  /\{\.\.\.\(edge\.back \? \{ strokeDasharray: "6 4" \} : \{ pathLength: 1 \}\)\}/.test(
    diagram,
  ),
);
check(
  "the node entrance animates an INNER af-flow-body group, not the dimmable outer one — an animation's `both` fill on the same element would hold opacity against the focus dim's transition",
  /<g className="af-flow-body">/.test(diagram) &&
    gate !== null &&
    /\.af-flow-node \.af-flow-body\s*\{/.test(gate[1]) &&
    !/\.af-flow-node\s*\{[^}]*animation/.test(gate[1]),
);
check(
  "the heading and group frames carry no trace hook — they are the map, not the journey, and their stillness is what keeps the first frame from being blank",
  (() => {
    const groupsAt = diagram.indexOf("layout.groups.map");
    const edgesAt = diagram.indexOf("layout.edges.map");
    const headingAt = diagram.indexOf("---- the heading");
    const svgEndAt = diagram.indexOf("</svg>");
    if (groupsAt < 0 || edgesAt < 0 || headingAt < 0 || svgEndAt < 0) {
      return false;
    }
    return (
      !/af-flow-(body|draw|fade|head|elabel)/.test(
        diagram.slice(groupsAt, edgesAt),
      ) &&
      !/af-flow-(body|draw|fade|head|elabel)/.test(
        diagram.slice(headingAt, svgEndAt),
      )
    );
  })(),
);

/* ---- 6. idle motion: the pulse ----------------------------------------------
 *
 * The trace and the pulse sit on OPPOSITE sides of the idle-motion contract
 * (lib/idle-motion.ts, "WHAT IT DOES NOT COVER"): the entrance is motion the
 * reader asked for by opening the page and must ignore the toggle; the pulse
 * is ambient and must obey both the toggle and the OS. Every rule below pins
 * one direction of that split, or the loop arithmetic that keeps a forever-
 * running animation from jerking or drifting.
 */

check(
  "the trace is NOT gated by the idle-motion toggle — a reader who turned idle motion off must still get the entrance",
  (() => {
    if (gate === null) return false;
    // Every rule animating a TRACE keyframe must have a toggle-free selector.
    const rules = [...gate[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const traceRules = rules.filter((r) =>
      /animation:\s*af-flow-(enter|draw-line|fade-in)/.test(r[2]),
    );
    return (
      traceRules.length > 0 &&
      traceRules.every((r) => !r[1].includes("data-af-idle"))
    );
  })(),
);

check(
  'every pulse animation is gated on [data-af-idle="on"] — an ungated pulse would run for a reader who said stop',
  (() => {
    if (gate === null) return false;
    const rules = [...gate[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const pulseRules = rules.filter((r) =>
      /animation:\s*af-flow-pulse-/.test(r[2]),
    );
    return (
      pulseRules.length >= 2 &&
      pulseRules.every((r) => r[1].includes('[data-af-idle="on"]'))
    );
  })(),
);

check(
  "the pulse is WITHDRAWN when off, not parked — display: none by default, display: inline only under the gate attribute; a frozen band is a bright stripe parked on every arrow",
  /\.af-flow-pulse\s*\{\s*display: none;\s*\}/.test(css) &&
    gate !== null &&
    /\[data-af-idle="on"\] \.af-flow-edge \.af-flow-pulse\s*\{\s*display: inline;\s*\}/.test(
      gate[1],
    ),
);

check(
  "reduced motion suppresses the pulse regardless of the toggle — the display: inline that reveals it lives INSIDE the no-preference gate, so the OS setting wins even while the server-rendered attribute says on",
  gate !== null &&
    /\.af-flow-pulse\s*\{\s*display: inline/.test(gate[1]) &&
    !/\{[^}]*display:\s*inline/.test(outsideGate),
);

check(
  "the viewer reads the SHARED idle-motion module and stamps its verdict as data-af-idle — a private preference would fork the one app-wide switch the module's header promises",
  /from "@\/lib\/idle-motion"/.test(viewer) &&
    /const idleState = idleMotionState\(reduced, idleMotion\)/.test(viewer) &&
    /data-af-idle=\{idleState\}/.test(viewer),
);

check(
  "the toggle disables under reduced motion and aria-pressed stays honest — a control claiming to enable motion it will not run would be lying",
  /disabled=\{reduced\}/.test(viewer) &&
    /aria-pressed=\{!reduced && idleMotion\}/.test(viewer),
);

check(
  "the first pulse anywhere starts at or after the WORST-CASE trace end (edgeDelay + idleStart >= flowTraceTotalMs of a bottomless chart) — a pulse over a still-drawing trace is two stories told at once",
  d.edgeDelay + d.idleStart >= flowTraceTotalMs(1000),
);

/* Tail, glow and head — widest/faintest to narrowest/brightest. The TAIL was
   added after the pulse was reported as reading like a bead rather than a
   graded light; the falloff assertion further down keeps the three a comet
   instead of three unrelated dashes.
   Every count below is derived from THIS list, never written as a literal:
   the three band counts were hardcoded `=== 2`, and adding the tail left one
   of them passing while silently no longer covering every band. */
const PULSE_BANDS = ["tail", "glow", "head"];

/* The pulse's delay is the trace beat PLUS the settle PLUS the per-edge
   scatter. The scatter was added after the ordered cascade was reported as
   looking mechanical — a resting chart replaying its own tutorial on a timer —
   so the idle echo deliberately NO LONGER keeps strict rank order. That
   guarantee belongs to the TRACE, which is a narration of causality and is
   asserted monotone separately; ambient motion narrates nothing and is free to
   scatter. The scatter can only ever ADD delay, so the "first pulse starts
   after the worst-case trace end" pin above still holds. */
check(
  "every pulse band's delay is trace beat + settle + the per-edge scatter (--flow-edge-at + --flow-idle-start + --flow-jitter) — drop the scatter and the resting chart marches in lockstep again; drop the beat and light can precede the line it rides",
  gate !== null &&
    (
      gate[1].match(
        /animation-delay: calc\(\s*var\(--flow-edge-at\) \+ var\(--flow-idle-start, \d+ms\) \+\s*var\(--flow-jitter, 0ms\)\s*\);/g,
      ) ?? []
    ).length === PULSE_BANDS.length,
);

/*
 * THE RESUME OVERRIDE. Because the pulse's animation is retracted by the
 * `[data-af-idle="on"]` selector (the withdrawn-not-parked rule above), a
 * toggle flipped back ON starts the animation over from zero — INCLUDING the
 * `--flow-idle-start` settle, which exists only to let the first-paint
 * entrance finish. Re-serving that settle to a click shipped as the
 * user-reported "idle motion toggle broken": the state, the attribute and
 * aria-pressed all flipped correctly, but nothing on screen moved for
 * 3.1–4.3 seconds, which from the reader's side is a dead button. The viewer
 * therefore stamps `data-af-idle-resume` once the reader has toggled idle
 * motion ON themselves, and the stylesheet answers that state on the draw's
 * clock instead.
 *
 * HONESTY NOTE (the section-7 pattern): the restart itself — a CSS animation
 * beginning again from time zero when its rule re-applies — is only
 * observable in a real browser; no Node assertion can execute it. These pins
 * cover the CSS shape and the viewer wiring; the browser-level proof is the
 * recorded animation state (delay 3140→480ms on toggle) in the change's
 * review, not here.
 */

check(
  'a resume rule overrides the pulse delay under [data-af-idle="on"][data-af-idle-resume] for EVERY band — without it an explicit ON re-serves the entrance settle and the toggle reads as a dead button for 3+ seconds. Checked per band rather than as one fixed selector pair: the pair form kept PASSING when the tail was added and stopped covering it, which is the failure this wording now prevents',
  gate !== null &&
    (() => {
      const resume = gate[1].match(
        /((?:\[data-af-idle="on"\]\[data-af-idle-resume\] \.af-flow-edge \.af-flow-pulse-\w+,?\s*)+)\{[^}]*animation-delay: calc\(var\(--flow-edge-at\) \+ var\(--flow-draw, \d+ms\)\);/,
      );
      return (
        resume !== null &&
        PULSE_BANDS.every((name) =>
          resume[1].includes(`.af-flow-pulse-${name}`),
        )
      );
    })(),
);

check(
  "the resume delay carries NO --flow-jitter — the scatter runs to a full idle period, so adding it to a resume would leave a reader waiting seconds after their own click, which is the 'toggle broken' report this override exists to fix",
  gate !== null &&
    (() => {
      const resume = gate[1].match(/\[data-af-idle-resume\][^{]*\{([^}]*)\}/);
      /* Comments stripped first: the rule EXPLAINS why the scatter is absent,
         so a naive substring test finds `--flow-jitter` in the prose and fails
         on the very comment documenting its absence. Declarations only. */
      const declarations =
        resume === null ? null : resume[1].replace(/\/\*[\s\S]*?\*\//g, "");
      return declarations !== null && !declarations.includes("--flow-jitter");
    })(),
);

check(
  "the resume delay still rides --flow-edge-at and rests each edge for the DRAW's length, not zero — a toggle flipped during the entrance must never float idle light over a still-drawing line, and rank order must survive the resume",
  gate !== null &&
    /data-af-idle-resume[^{]*\{[^}]*animation-delay: calc\(var\(--flow-edge-at\) \+ var\(--flow-draw, \d+ms\)\);/.test(
      gate[1],
    ) &&
    // The same-fallback-everywhere loop in section 1 already pins the ms
    // value to FLOWCHART_DURATIONS.edgeDraw; this asserts the relation the
    // value exists for.
    d.edgeDraw > 0,
);

check(
  "the resume state appears in the stylesheet ONLY inside the reduced-motion gate — a resume rule outside it would hand a reduced-motion reader a delay override for an animation the gate rightly never declares",
  gate !== null &&
    gate[1].includes("data-af-idle-resume") &&
    !outsideGate.includes("data-af-idle-resume"),
);

check(
  "the viewer arms the resume ONLY from the toggle's own handler, on the ON edge — an initial load must keep the settle (its reason to wait is the entrance), so the attribute is absent until the reader asks",
  /if \(next\) setIdleResumed\(true\);/.test(viewer) &&
    /data-af-idle-resume=\{idleResumed \? "" : undefined\}/.test(viewer) &&
    /const \[idleResumed, setIdleResumed\] = useState\(false\)/.test(viewer),
);

check(
  "the pulse loops linearly and indefinitely — an eased infinite loop reads as slipping, and a finite one leaves the chart dead after N cycles nobody counted",
  gate !== null &&
    (
      gate[1].match(/animation:\s*af-flow-pulse-\w+[^;]*linear\s+infinite/g) ??
      []
    ).length === PULSE_BANDS.length,
);

/* THE STICK. A band is display:inline for its whole delay, so with no fill mode
   it paints its own static dashoffset 0 — the lit run at [0, lit], a frozen
   stub on the line at the source. Shipped, and reported as a gradient "stick"
   on refresh; the scatter had stretched the exposure to a settle plus a full
   period. `backwards` applies `from` during the delay instead, and `from` is
   the band's lit length, parking the run at [-lit, 0]: before the path, hence
   invisible. Both halves are pinned — the fill mode here, and `from === lit`
   by the one-dash-period assertion below — because either alone lets the stub
   back. */
check(
  "every pulse band declares the `backwards` fill — without it the band paints a frozen stub at the source for its whole delay, which is the gradient 'stick on refresh' report verbatim",
  gate !== null &&
    (
      gate[1].match(
        /animation:\s*af-flow-pulse-\w+[^;]*linear\s+infinite\s+backwards/g,
      ) ?? []
    ).length === PULSE_BANDS.length,
);

/* ---- the loop march, and the scatter -------------------------------------- */

/* A back edge is dashed, and the canvas-wide rule beside `@keyframes
   af-frame-march` in globals.css permits exactly that kind to walk: "only the
   kind that is already dashed may march", because a march on a solid arrow
   reads as async or a reply. These pins hold the REUSE, which is the point —
   a fourth private copy of a six-plus-four walk is how four canvases end up
   marching at three different speeds. */
{
  check(
    "the loop march REUSES the shared af-frame-march keyframes rather than declaring its own — four canvases walking one dash pattern at one speed is the reason that keyframe is global",
    /animation:\s*af-frame-march\s/.test(css) &&
      /@keyframes af-frame-march/.test(globals) &&
      !/@keyframes af-flow-(loop|march)/.test(css),
  );
  check(
    "only BACK edges carry the march class — a march on a solid forward arrow makes it read as async or a reply, the rule stated with the shared keyframe",
    /edge\.back && "af-flow-loop-march"/.test(diagram),
  );
  check(
    "the march is gated on data-af-idle like the pulse — it is ambient perpetual motion, unlike the frame ring where the same walk is a selection the reader asked for",
    /\[data-af-idle="on"\][^{]*\.af-flow-loop-march\s*\{/.test(css),
  );
  check(
    "the march sits inside the reduced-motion gate — ambient motion must not run for a reader who asked for none",
    (() => {
      const gated = css.match(
        /@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*)\n\}/,
      );
      return gated !== null && gated[1].includes(".af-flow-loop-march");
    })(),
  );
}

/* The scatter must be DERIVED, never random: Math.random() would reshuffle a
   resting chart on every re-render and would break the GIF exporter's
   frame-for-frame determinism, which check:flowchart-gif pins. */
{
  const phases = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => motion.flowPulsePhase(i));
  /* The stylesheet reads `var(--flow-jitter, 0ms)`, so if the COMPONENT ever
     stops stamping it the scatter degrades silently to a lockstep cascade with
     every CSS assertion still green — verified by deleting the stamp, which
     failed nothing until this pin existed. The fallback is deliberate (SSR and
     the exporter both render without it); the pin is what makes its absence
     loud. */
  check(
    "the diagram STAMPS --flow-jitter from flowPulsePhase — the CSS fallback is 0ms, so a missing stamp silently restores the lockstep cascade the scatter was added to break",
    /"--flow-jitter":\s*`\$\{flowPulsePhase\(edge\.index\)\}ms`/.test(diagram),
  );
  check(
    "the pulse scatter is deterministic (same index, same phase, twice) — a re-render must not visibly reshuffle a chart at rest, and the GIF exporter samples the same clock",
    phases.every((p, i) => p === motion.flowPulsePhase(i)),
  );
  check(
    "every scatter lands inside one idle period — a phase past the period is just a later cycle, which would silently delay an edge's first pulse by a whole loop",
    phases.every((p) => p >= 0 && p < d.idlePeriod),
  );
  check(
    "the scatter actually scatters (8 consecutive edges land on 8 distinct phases, spread over more than half the period) — a hash that clumps leaves the lockstep cascade the scatter was added to break",
    new Set(phases).size === phases.length &&
      Math.max(...phases) - Math.min(...phases) > d.idlePeriod / 2,
  );
  /* Comments stripped first — both files EXPLAIN why they avoid Math.random,
     so a raw substring test fails on the prose documenting its absence. This
     is the third assertion in this file to need it; the helper is shared. */
  const codeOnly = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(
    "no source file reaches for Math.random() — the scatter is a hash for a reason, and a random one would break export determinism",
    !/Math\.random\(/.test(codeOnly(diagram)) &&
      !/Math\.random\(/.test(codeOnly(motionSource)),
  );
}

/*
 * The loop arithmetic, read from the stylesheet: dasharray `lit gap`, and
 * keyframes travelling from `lit` to `lit - (lit + gap)`. Starting at its own
 * dash length aligns every band's front at the source (the C4/sequence comet
 * trick); travelling exactly one period makes the wrap invisible, which is
 * what "no drift, no jerk" means mechanically.
 */
const pulseBand = (name) => {
  const dash = css.match(
    new RegExp(
      `\\.af-flow-pulse-${name}\\s*\\{[^}]*stroke-dasharray:\\s*([\\d.]+)\\s+([\\d.]+)\\s*;`,
    ),
  );
  const frames = css.match(
    new RegExp(
      `@keyframes af-flow-pulse-${name}\\s*\\{\\s*from\\s*\\{\\s*stroke-dashoffset:\\s*(-?[\\d.]+)\\s*;\\s*\\}\\s*to\\s*\\{\\s*stroke-dashoffset:\\s*(-?[\\d.]+)\\s*;`,
    ),
  );
  if (dash === null || frames === null) return null;
  /* Anchored at line start: the same class also appears in the GATE block's
     compound selector (`[data-af-idle="on"] … .af-flow-pulse-tail`), which
     carries the animation and no paint, so an unanchored match read the wrong
     rule and reported every opacity as absent. */
  const rule = css.match(
    new RegExp(`\n\\.af-flow-pulse-${name}\\s*\\{([^}]*)\\}`),
  );
  const prop = (key) => {
    const hit =
      rule === null ? null : rule[1].match(new RegExp(`${key}:\\s*([\\d.]+)`));
    return hit === null ? null : Number(hit[1]);
  };
  return {
    lit: Number(dash[1]),
    gap: Number(dash[2]),
    from: Number(frames[1]),
    to: Number(frames[2]),
    opacity: prop("opacity"),
    width: prop("stroke-width"),
  };
};

for (const name of PULSE_BANDS) {
  const band = pulseBand(name);
  check(
    `the ${name} band travels exactly ONE dash period per cycle (from = lit, to = lit − period) — any other span parks the band somewhere new at each wrap, a jerk nobody files a bug for and everybody notices`,
    band !== null &&
      band.from === band.lit &&
      band.to === band.lit - (band.lit + band.gap),
  );
  /* Weighted by OPACITY, not raw dash length. The rule's own words are
     "never a second line's worth of stroke" — that is a budget on INK, and a
     0.16-opacity tail spends almost none of it however long it is. Measuring
     raw length instead would have forbidden the graded tail that fixed the
     bead complaint, which is the same mistake the back-edge corridor
     assertion made: pinning the implementation the first fix happened to
     have, rather than the property that matters. */
  check(
    `the ${name} band's INK (lit x opacity) stays under a tenth of its period — the sequence comet's "never a second line's worth of stroke" rule; spend more and the doubled-fuzzy-line bug returns wearing new clothes`,
    band !== null &&
      band.opacity !== null &&
      (band.lit * band.opacity) / (band.lit + band.gap) <= 0.1,
  );
  check(
    `the ${name} band's gap exceeds the whole path (gap >= 1 at pathLength 1) — every cycle has a dark beat, so the gesture stays a pulse, never a belt`,
    band !== null && band.gap >= 1,
  );
}

check(
  "each band's `from` offset equals its own lit length — that is what parks the run entirely before the path during the delay, so `backwards` hides it rather than freezing it somewhere visible",
  PULSE_BANDS.every((name) => {
    const band = pulseBand(name);
    return band !== null && band.from === band.lit;
  }),
);

{
  const bands = PULSE_BANDS.map(pulseBand);
  const ok = bands.every(
    (b) => b !== null && b.opacity !== null && b.width !== null,
  );

  /* THE GRADIENT, as a measured property rather than a description: light
     falls off monotonically from the head outwards — each band wider than the
     one in front of it and fainter than it. Break the monotonicity and the
     three stop reading as one comet and start reading as three dashes racing,
     which is the defect the tail was added to fix, inverted. */
  check(
    "the three pulse bands form a monotone falloff (each outer band wider AND fainter than the one inside it) — that graded edge is what reads as light rather than as a bead sliding along the line",
    ok &&
      bands.every((b, i) =>
        i === 0
          ? true
          : b.width < bands[i - 1].width && b.opacity > bands[i - 1].opacity,
      ),
  );

  /* The per-band budget above cannot see the SUM: three bands each just under
     a tenth would together paint a belt. Pinned on the total for the same
     reason the per-band rule exists. */
  check(
    "the pulse's TOTAL ink across all three bands stays under a tenth of the period — a budget met three times over is still a belt",
    ok &&
      bands.reduce(
        (sum, b) => sum + (b.lit * b.opacity) / (b.lit + b.gap),
        0,
      ) <= 0.1,
  );

  /* All three must share ONE dash period, or they drift apart cycle by cycle
     and the comet smears into unrelated dashes — the wrap-jerk rule applied
     across bands rather than within one. */
  check(
    "all three bands share one dash period — different periods drift apart every cycle and the comet comes apart",
    ok && new Set(bands.map((b) => b.lit + b.gap)).size === 1,
  );
}

/*
 * PERCEPTIBILITY. The pulse shipped once in the line's own `--edge` colour,
 * half a stroke unit wider than the 1.5 line it rides — mechanically perfect
 * (getAnimations() reported `running` with a sane currentTime) and visually
 * NOTHING: a frame-to-frame screenshot diff measured zero changed pixels,
 * and the user filed it as "idle animation does not run". A gesture nobody
 * can see is not motion (purpose.md makes presentation the product), so the
 * band contrast is pinned here the way the timing already is.
 *
 * HONESTY NOTE (the section-7 pattern): how bright the band LOOKS — blur,
 * opacity over a given theme, fit-zoom scaling — is only observable in a
 * real browser; the browser-level proof is the measured frame diff in the
 * change's review. These pins hold the two failure modes Node can see: a
 * band painted in the line's own colour (identical pixels by construction),
 * and a head no wider than the line under it.
 */

check(
  "the pulse bands are NOT painted in the line's own --edge — a band the same colour as the line it rides changes zero pixels and ships the 'idle motion does not run' report verbatim",
  (() => {
    const band = css.match(/\.af-flow-pulse-band\s*\{([^}]*)\}/);
    return (
      band !== null &&
      /stroke:\s*var\(--foreground\)/.test(band[1]) &&
      !/var\(--edge\)/.test(band[1])
    );
  })(),
);

check(
  "the pulse bands are not --primary either — primary is this view's focus colour, and resting light wearing it says 'selected' on every arrow at once",
  (() => {
    const band = css.match(/\.af-flow-pulse-band\s*\{([^}]*)\}/);
    return band !== null && !/var\(--primary\)/.test(band[1]);
  })(),
);

check(
  "the pulse head is at least a full stroke unit wider than the 1.5 line it rides — the sequence comet's floor ('still wider than the line, or the head would not read as a head'), which the invisible first cut undercut at 2",
  (() => {
    const head = css.match(
      /\.af-flow-pulse-head\s*\{[^}]*stroke-width:\s*([\d.]+)/,
    );
    return head !== null && Number(head[1]) >= 2.5;
  })(),
);

check(
  "the glow stays a HALO, not a second line: wider than the head but translucent (opacity <= 0.5) and blurred — full-opacity width here recreates the doubled-fuzzy-line bug",
  (() => {
    // Anchored to line start: the gated animation rules also END in this
    // class name, and matching one of those would read an empty block.
    const glow = css.match(/^\.af-flow-pulse-glow\s*\{([^}]*)\}/m);
    const head = css.match(
      /\.af-flow-pulse-head\s*\{[^}]*stroke-width:\s*([\d.]+)/,
    );
    if (glow === null || head === null) return false;
    const width = glow[1].match(/stroke-width:\s*([\d.]+)/);
    const opacity = glow[1].match(/opacity:\s*([\d.]+)/);
    return (
      width !== null &&
      opacity !== null &&
      Number(width[1]) > Number(head[1]) &&
      Number(opacity[1]) <= 0.5 &&
      /filter:\s*blur\(/.test(glow[1])
    );
  })(),
);

check(
  "pulse tracks exist only on forward and self edges, never back edges — a perpetually circling loop says 'stuck' about a system the document never called stuck",
  /\{!edge\.back \? \(\s*<g aria-hidden="true" className="af-flow-pulse pointer-events-none">/.test(
    diagram,
  ),
);

check(
  "pulse band paths carry pathLength=1 — without it the dash fractions above would be user units, a sliver on a long edge and a blanket on a short one",
  (
    diagram.match(
      /className="af-flow-pulse-band[^"]*"\s+d=\{d\}\s+pathLength=\{1\}/g,
    ) ?? []
  ).length === PULSE_BANDS.length,
);

check(
  "the pulse renders BEFORE the edge label group — a guard must stay legible over passing light, not under it",
  (() => {
    const pulseAt = diagram.indexOf('className="af-flow-pulse ');
    const labelAt = diagram.indexOf('className="af-flow-elabel');
    return pulseAt >= 0 && labelAt >= 0 && pulseAt < labelAt;
  })(),
);

/* ---- 7. a hidden mount must not burn the trace ------------------------------
 *
 * CSS animations start when their style first applies and advance on the
 * document's WALL CLOCK even while the page is hidden. A flowchart mounted in
 * a background tab (a share link opened from chat or mail) therefore played
 * the whole entrance — and the pulse's opening cycles — to nobody, and `both`
 * fill left a finished, motionless chart for the reader's first actual look:
 * the user-reported "no animation runs at all", with reduced motion off. The
 * fix is the viewer's ONE JS touch on the trace: mounted hidden → remount the
 * diagram subtree at the first return to visibility.
 *
 * HONESTY NOTE: the root cause — the animation clock ticking while hidden —
 * is only observable in a real browser; no Node assertion can execute it.
 * These pins therefore cover the WIRING (the hidden-at-mount guard, the epoch
 * key, the one-shot listener), not the animation behaviour itself; the
 * browser-level proof is a screenshot of the trace mid-draw after a hidden
 * open, and lives in the change's review, not here.
 */

check(
  "the restart is armed ONLY when the viewer mounted hidden — a visible load must never remount, or the trace replays mid-session (the accidental-replay bug the camera-work rule exists to prevent)",
  /if \(document\.visibilityState !== "hidden"\) return;/.test(viewer),
);
check(
  "the first return to visibility bumps an epoch that KEYS the diagram — a keyed remount is the only way to restart a both-filled CSS animation without taking over its timing in JS",
  /setTraceEpoch\(\(epoch\) => epoch \+ 1\)/.test(viewer) &&
    /key=\{traceEpoch\}/.test(viewer),
);
check(
  "the restart listener detaches after firing once — the trace replays for the reader's FIRST look, not on every later tab switch",
  /document\.removeEventListener\("visibilitychange", onVisible\);\s*\n\s*setTraceEpoch/.test(
    viewer,
  ),
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} flowchart-motion assertions passed.`);
